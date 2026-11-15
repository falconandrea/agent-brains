/**
 * Post-stop plan revision (tasks T3–T5, spec.md §5/§6/§9/§10/§11/§16):
 * eligibility, lifecycle, successor id, launch completeness, the Pi-free
 * revision session core, and the ordinary-resume interplay refusals.
 * Run: `node --test tests/revise.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  capPartialPatch,
  chainRootOf,
  launchIncomplete,
  nextPlannerRound,
  nextRevisionNumber,
  plannerRoundsUsed,
  resumeRevisionRefusal,
  revisionEligibility,
  revisionLifecycle,
  revisionSidecarDir,
  runRevisionSessionCore,
  successorRunId,
  type RevisionSessionDeps,
} from "../src/workflows/revise.ts";
import { descriptionMarker } from "../src/workflows/feature.ts";
import { replayRunLog } from "../src/workflows/resume.ts";
import { CriticalAppendError, RunLog, readRunLog, runsDir, withEventId } from "../src/run-log.ts";
import { acquireRunLock } from "../src/run-lock.ts";
import type {
  GitBaseline,
  GitService,
  HumanInput,
  SelectQuestion,
  WorkflowEvent,
} from "../src/ports.ts";
import { UserDismissedError } from "../src/ports.ts";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../src/agent.ts";

// --- fixtures ---------------------------------------------------------------

const sha = (content: string): string => createHash("sha256").update(content).digest("hex");

const fixture = (): string => mkdtempSync(join(tmpdir(), "pi-brain-revise-"));

const DESCRIPTION = "add user auth";
const SLUG = "add-user-auth";
const MARKER = descriptionMarker(DESCRIPTION);
const PRD_BODY = "Build the thing.";
const TASKS_BODY = "## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";

const VALID_PLAN_A =
  "## TITLE\nAdd Invitations\n\n## PRD\nRevised body one.\n\n## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const VALID_PLAN_B =
  "## TITLE\nAdd Invitations\n\n## PRD\nRevised body two.\n\n## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const INVALID_PLAN = "a conversational reply with no plan structure at all";

/** Writes the approved artifacts exactly as the gate would, returns their hashes. */
function writeArtifacts(root: string, prdBody = PRD_BODY, tasksBody = TASKS_BODY) {
  const dir = join(root, ".ai", "features", SLUG);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `prd-${SLUG}.md`), `${MARKER}\n${prdBody}`, "utf8");
  writeFileSync(join(dir, `tasks-${SLUG}.md`), `${MARKER}\n${tasksBody}`, "utf8");
  return { prdSha: sha(`${MARKER}\n${prdBody}`), tasksSha: sha(`${MARKER}\n${tasksBody}`) };
}

interface PredecessorOptions {
  /** Terminal outcome status; omit for interrupted/failed/decided shapes. */
  status?: "cancelled" | "needs_human" | "completed" | "escalated_unknown";
  /** Interrupted mid-loop (no outcome, replayable). */
  interrupted?: boolean;
  /** workflow.failed after provider death (no outcome, replayable). */
  failed?: boolean;
  /** Last completed review already decided the run (already_decided heal). */
  decided?: "completed" | "needs_human";
  /** Legacy minimum-evidence omissions. */
  omit?: Array<"description" | "baseline" | "spec">;
  verifyFreezeCorrupt?: boolean;
  repoStateDigest?: string;
}

function predecessorEvents(root: string, runId: string, opts: PredecessorOptions = {}): WorkflowEvent[] {
  const spec = writeArtifacts(root);
  const events: WorkflowEvent[] = [
    {
      type: "workflow.started",
      runId,
      workflow: "feature",
      ...(opts.omit?.includes("description") ? {} : { description: DESCRIPTION }),
      ...(opts.omit?.includes("baseline") ? {} : { baseline: "snap-base" }),
      stack: { primary: "nodejs", frameworks: ["express"] },
      ...(opts.repoStateDigest !== undefined ? { repoStateDigest: opts.repoStateDigest } : {}),
      ...(opts.verifyFreezeCorrupt ? { verify: { commands: [], scripts: {}, scriptsDigest: "bad" } as never } : {}),
    },
    { type: "phase.started", runId, phase: "discover" },
    { type: "phase.started", runId, phase: "spec" },
    { type: "agent.completed", runId, role: "planner", usage: { input: 100, output: 50 } },
  ];
  if (!opts.omit?.includes("spec")) events.push({ type: "spec.approved", runId, ...spec });
  if (opts.interrupted || opts.failed || opts.decided) {
    events.push({ type: "phase.started", runId, phase: "develop" });
    events.push({ type: "agent.completed", runId, role: "developer", usage: { input: 200, output: 100 } });
  }
  if (opts.decided) {
    events.push({
      type: "review.completed",
      runId,
      verdict: opts.decided === "completed" ? "approved" : "needs_human",
      round: 1,
      issues: [],
    });
  }
  if (opts.failed) events.push({ type: "workflow.failed", runId, error: "provider died" });
  if (opts.status === "escalated_unknown") {
    events.push({ type: "workflow.outcome", runId, status: "mysterious" });
  } else if (opts.status) {
    events.push({
      type: "workflow.outcome",
      runId,
      status: opts.status,
      ...(opts.status === "completed" ? { summary: "done" } : {}),
    });
  }
  return events;
}

function writePredecessorLog(root: string, runId: string, events: WorkflowEvent[]): void {
  const log = RunLog.open(root, runId);
  for (const event of events) log.append(event);
}

const appendRevisionEvent = (root: string, runId: string, event: object): void => {
  const log = new RunLog(runLogPathOf(root, runId));
  log.appendCritical(event as Parameters<RunLog["appendCritical"]>[0]);
};

const runLogPathOf = (root: string, runId: string): string => join(root, ".pi", "pi-brain", "runs", `${runId}.jsonl`);

const revisionTypes = (root: string, runId: string): string[] =>
  readRunLog(root, runId)
    .map((event) => event.type)
    .filter((type) => type.startsWith("revision."));

// --- fakes ------------------------------------------------------------------

class FakeGit implements GitService {
  patches: string[] = ["diff --git a/src/a.ts\n@@ -1 +1 @@\n+oldest\n@@ -2 +2 @@\n+newest"];
  digest = "stable-digest";
  diffCalls = 0;
  failDiff = false;
  async baseline(cwd: string): Promise<GitBaseline> {
    return { repoRoot: cwd, branch: "main", headSha: "h", baseCommit: "snap-base" };
  }
  async repoStateDigest(): Promise<string> {
    return this.digest;
  }
  async diffSince(): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    this.diffCalls += 1;
    if (this.failDiff) throw new Error("baseline commit vanished");
    const patch = this.patches.length > 1 ? this.patches.shift()! : (this.patches[0] ?? "");
    return { patch, files: ["src/a.ts"], dirtySubmodules: [] };
  }
}

class ScriptedHuman implements HumanInput {
  inputs: string[] = [];
  selects: string[] = [];
  readonly selectQuestions: Array<{ message: string; options: Array<{ value: string }> }> = [];
  readonly notices: string[] = [];
  async confirm(): Promise<boolean> {
    return true;
  }
  async select(q: SelectQuestion): Promise<string> {
    this.selectQuestions.push(q);
    const value = this.selects.shift();
    if (value === undefined || value === "dismiss") throw new UserDismissedError("select");
    if (!q.options.some((option) => option.value === value)) {
      throw new Error(`scripted select "${value}" is not offered: [${q.options.map((o) => o.value).join(", ")}]`);
    }
    return value;
  }
  async input(): Promise<string> {
    const value = this.inputs.shift();
    if (value === undefined || value === "dismiss") throw new UserDismissedError("input");
    return value;
  }
  async editor(q: { content: string }): Promise<string> {
    return q.content;
  }
  notify(message: string): void {
    this.notices.push(message);
  }
}

/** Queue-based planner: one response per call, the last one repeats. */
class ScriptedPlanner implements AgentRunner {
  calls: AgentRunRequest[] = [];
  readonly #responses: Array<{ text: string; aborted?: boolean }>;
  constructor(...responses: Array<{ text: string; aborted?: boolean }>) {
    if (responses.length === 0) throw new Error("scripted planner needs at least one response");
    this.#responses = responses;
  }
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.calls.push(request);
    const next = this.#responses.length > 1 ? this.#responses.shift()! : this.#responses[0]!;
    return { role: "planner", text: next.text, aborted: next.aborted ?? false };
  }
}

/** Fault-injects appendCritical per event type (once per type). */
class FaultedLog extends RunLog {
  failOnce: string[] = [];
  readonly #failed = new Set<string>();
  override appendCritical(
    event: Parameters<RunLog["appendCritical"]>[0],
    options?: Parameters<RunLog["appendCritical"]>[1],
  ): void {
    if (this.failOnce.includes(event.type) && !this.#failed.has(event.type)) {
      this.#failed.add(event.type);
      throw new CriticalAppendError(`injected persistence failure for ${event.type}`);
    }
    super.appendCritical(event, options);
  }
}

const sessionDeps = (
  root: string,
  runId: string,
  agents: AgentRunner,
  human: HumanInput,
  git: GitService,
  events?: RunLog,
): RevisionSessionDeps => ({
  cwd: root,
  runId,
  agents,
  human,
  git,
  events: events ?? RunLog.open(root, runId),
});

// ---------------------------------------------------------------------------
// Eligibility — every §5 row (tasks T3a)
// ---------------------------------------------------------------------------

import type { RevisionEligibility } from "../src/workflows/revise.ts";

function expectEligible(verdict: RevisionEligibility): Extract<RevisionEligibility, { eligible: true }> {
  if ("healFirst" in verdict) throw new Error("expected an eligible verdict, got healFirst");
  if (!verdict.eligible) throw new Error(`expected an eligible verdict, got refusal ${verdict.reason}`);
  return verdict;
}

function expectRefused(verdict: RevisionEligibility): { reason: string; message: string } {
  if ("healFirst" in verdict) throw new Error("expected a refusal, got healFirst");
  if (verdict.eligible) throw new Error("expected a refusal, got an eligible verdict");
  return verdict;
}

test("eligibility: a cancelled run is the primary eligible predecessor, with full evidence", () => {
  const root = fixture();
  const events = predecessorEvents(root, "run-e1", { status: "cancelled" });
  const verdict = expectEligible(revisionEligibility(events));
  assert.equal(verdict.status, "cancelled");
  assert.equal(verdict.description, DESCRIPTION);
  assert.equal(verdict.baselineCommit, "snap-base");
  assert.deepEqual(verdict.stack, { primary: "nodejs", frameworks: ["express"] });
  assert.equal(verdict.spec.prdSha, sha(`${MARKER}\n${PRD_BODY}`));
  assert.equal(verdict.usage.planner?.input, 100, "usage folds from agent.completed");
  assert.equal(verdict.degradedGuards, true, "no freeze/digest in this log → degraded guards");
  rmSync(root, { recursive: true, force: true });
});

test("eligibility: needs_human is eligible; completed refuses; unknown status refuses", () => {
  const needsHuman = expectEligible(revisionEligibility(predecessorEvents(fixture(), "r", { status: "needs_human" })));
  assert.equal(needsHuman.status, "needs_human");

  const completed = expectRefused(revisionEligibility(predecessorEvents(fixture(), "r", { status: "completed" })));
  assert.equal(completed.reason, "terminal_completed");
  assert.match(completed.message, /new \/feature/);

  const unknown = expectRefused(revisionEligibility(predecessorEvents(fixture(), "r", { status: "escalated_unknown" })));
  assert.equal(unknown.reason, "unknown_terminal_status");
});

test("eligibility: interrupted and provider-failed runs are eligible (no outcome, replay succeeds)", () => {
  const interrupted = expectEligible(revisionEligibility(predecessorEvents(fixture(), "r", { interrupted: true })));
  assert.equal(interrupted.status, "interrupted");

  const failed = expectEligible(revisionEligibility(predecessorEvents(fixture(), "r", { failed: true })));
  assert.equal(failed.status, "failed");
});

test("eligibility: already_decided forwards to the healer instead of deciding", () => {
  const completed = revisionEligibility(predecessorEvents(fixture(), "r", { decided: "completed" }));
  assert.equal((completed as { healFirst?: boolean }).healFirst, true);
  if ("healFirst" in completed) {
    assert.equal(completed.status, "completed");
    assert.equal(completed.usage.developer?.input, 200);
  }
  const escalated = revisionEligibility(predecessorEvents(fixture(), "r", { decided: "needs_human" }));
  assert.equal((escalated as { healFirst?: boolean }).healFirst, true);
  if ("healFirst" in escalated) assert.equal(escalated.status, "needs_human");
});

test("eligibility: pre-gate, missing evidence and corrupt freeze refuse", () => {
  const preGate = expectRefused(revisionEligibility([
    { type: "workflow.started", runId: "r", workflow: "feature", description: DESCRIPTION, baseline: "snap" },
    { type: "phase.started", runId: "r", phase: "discover" },
  ]));
  assert.equal(preGate.reason, "gate_not_approved");

  const legacy = expectRefused(revisionEligibility(predecessorEvents(fixture(), "r", { omit: ["description"] })));
  assert.equal(legacy.reason, "missing_evidence");

  const noBaseline = expectRefused(revisionEligibility(predecessorEvents(fixture(), "r", { omit: ["baseline"] })));
  assert.equal(noBaseline.reason, "missing_evidence");

  const corruptFreeze = expectRefused(revisionEligibility(predecessorEvents(fixture(), "r", { verifyFreezeCorrupt: true })));
  assert.equal(corruptFreeze.reason, "corrupt_verify_freeze");
});

test("eligibility: no spec.approved refuses — no verifiable baseContract, no revision", () => {
  const events = predecessorEvents(fixture(), "r", { interrupted: true, omit: ["spec"] });
  const verdict = expectRefused(revisionEligibility(events));
  assert.equal(verdict.reason, "missing_spec_approval");
});

// ---------------------------------------------------------------------------
// Lifecycle — orderings, duplicates, truncation (tasks T3b)
// ---------------------------------------------------------------------------

const revisionEventFixtures = (runId = "r") => ({
  started: (revision = 1) =>
    withEventId({
      type: "revision.started" as const,
      runId,
      revision,
      correction: "make auth optional",
      correctionSha: sha("make auth optional"),
      baseContract: { prdSha: "a".repeat(64), tasksSha: "b".repeat(64) },
      at: "2026-01-01T00:00:00.000Z",
    }),
  candidate: (round = 1, revision = 1) =>
    withEventId({
      type: "revision.candidate" as const,
      runId,
      revision,
      round,
      prdSha: "c".repeat(64),
      tasksSha: "d".repeat(64),
      at: "2026-01-01T00:01:00.000Z",
    }),
  rejected: (round = 1, revision = 1, notes?: string) =>
    withEventId({
      type: "revision.candidate.rejected" as const,
      runId,
      revision,
      round,
      reason: notes === undefined ? "planner TASKS section is missing" : "rejected by user",
      artifactPath: "/runs/r.planner-rejected.md",
      ...(notes !== undefined ? { notes } : {}),
      at: "2026-01-01T00:02:00.000Z",
    }),
  approved: (revision = 1) =>
    withEventId({
      type: "revision.approved" as const,
      runId,
      revision,
      round: 1,
      correction: "make auth optional",
      correctionSha: sha("make auth optional"),
      candidate: { prdSha: "c".repeat(64), tasksSha: "d".repeat(64) },
      contract: { prdSha: "e".repeat(64), tasksSha: "f".repeat(64) },
      predecessorStatus: "cancelled",
      approvedBy: { via: "/flow revise", pid: 1, at: "2026-01-01T00:03:00.000Z" },
    }),
  abandoned: (revision = 1) =>
    withEventId({
      type: "revision.abandoned" as const,
      runId,
      revision,
      reason: "user choice",
      at: "2026-01-01T00:04:00.000Z",
    }),
  launched: (revision = 1) =>
    withEventId({
      type: "revision.launched" as const,
      runId,
      revision,
      successorRunId: `${runId}-r1`,
      at: "2026-01-01T00:05:00.000Z",
    }),
});

const asWorkflowEvents = (events: object[]): WorkflowEvent[] => events as unknown as WorkflowEvent[];

test("lifecycle: ordinary logs are none; the happy chain walks every active state", () => {
  assert.equal(revisionLifecycle([]).state, "none");
  assert.equal(revisionLifecycle(predecessorEvents(fixture(), "r", { status: "cancelled" })).state, "none");

  const events = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().candidate(),
    revisionEventFixtures().approved(),
    revisionEventFixtures().launched(),
  ]);
  assert.equal(revisionLifecycle(events.slice(0, 1)).state, "open");
  const pending = revisionLifecycle(events.slice(0, 2));
  assert.equal(pending.state, "candidate-pending");
  if (pending.state === "candidate-pending") {
    assert.equal(pending.round, 1);
    assert.equal(pending.correction, "make auth optional");
  }
  assert.equal(revisionLifecycle(events.slice(0, 3)).state, "approved-pending-launch");
  const launched = revisionLifecycle(events);
  assert.equal(launched.state, "launched");
  if (launched.state === "launched") assert.equal(launched.successorRunId, "r-r1");
});

test("lifecycle: user rejection returns to open with the replacement correction; invalid output keeps it", () => {
  const userRejected = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().candidate(),
    revisionEventFixtures().rejected(1, 1, "actually keep auth mandatory"),
  ]);
  const state = revisionLifecycle(userRejected);
  assert.equal(state.state, "open");
  if (state.state === "open") assert.equal(state.correction, "actually keep auth mandatory");

  const invalidOnly = asWorkflowEvents([revisionEventFixtures().started(), revisionEventFixtures().rejected()]);
  const invalidState = revisionLifecycle(invalidOnly);
  assert.equal(invalidState.state, "open");
  if (invalidState.state === "open") assert.equal(invalidState.correction, "make auth optional");
});

test("lifecycle: abandoned closes the revision and a re-open gets a fresh number", () => {
  const events = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().abandoned(),
    revisionEventFixtures().started(2),
  ]);
  assert.equal(revisionLifecycle(events.slice(0, 2)).state, "abandoned");
  assert.equal(revisionLifecycle(events).state, "open");
  assert.equal(nextRevisionNumber(events), 3, "abandoned revisions still count (§11)");
  assert.equal(nextRevisionNumber([]), 1);
});

test("lifecycle: out-of-order sequences fail closed as invalid", () => {
  const cases: object[][] = [
    [revisionEventFixtures().candidate()], // candidate without started
    [revisionEventFixtures().started(), revisionEventFixtures().approved()], // approved from open
    [revisionEventFixtures().started(), revisionEventFixtures().launched()], // launched from open
    [revisionEventFixtures().abandoned()], // abandon without an open revision
    [revisionEventFixtures().started(), revisionEventFixtures().candidate(), revisionEventFixtures().candidate(2)], // candidate twice
    [revisionEventFixtures().started(), revisionEventFixtures().started(2)], // second concurrent revision
    [revisionEventFixtures().started(), revisionEventFixtures().candidate(), revisionEventFixtures().approved(), revisionEventFixtures().abandoned(1), revisionEventFixtures().abandoned(2)], // double abandon (distinct ids)
  ];
  for (const events of cases) {
    const state = revisionLifecycle(asWorkflowEvents(events));
    assert.equal(state.state, "invalid", `expected invalid for ${events.length} events`);
  }
});

test("lifecycle: exact duplicates collapse; same id with a different projection refuses", () => {
  const started = revisionEventFixtures().started();
  const retried = revisionEventFixtures().started(); // same evidence, fresh derivation → same id
  assert.equal(retried.eventId, started.eventId);
  const collapsed = revisionLifecycle(asWorkflowEvents([started, retried]));
  assert.equal(collapsed.state, "open", "duplicates collapse under canonical equality");

  const forged = { ...started, correction: "tampered", correctionSha: sha("tampered") };
  const conflict = revisionLifecycle(asWorkflowEvents([started, forged]));
  assert.equal(conflict.state, "invalid");
});

test("lifecycle: malformed known revision events refuse (§16 rule 5)", () => {
  const malformed: object[] = [
    { type: "revision.started", runId: "r", revision: 1, correction: "x", correctionSha: sha("different"), baseContract: { prdSha: "a".repeat(64), tasksSha: "b".repeat(64) }, at: "t" },
    { type: "revision.started", runId: "r", revision: 0, correction: "x", correctionSha: sha("x"), baseContract: { prdSha: "a".repeat(64), tasksSha: "b".repeat(64) }, at: "t" },
    { type: "revision.started", runId: "r", revision: 1, correction: "x", correctionSha: sha("x"), baseContract: { prdSha: "not-a-sha" }, at: "t" },
    { type: "revision.candidate", runId: "r", revision: 1, round: 1, at: "t" }, // missing shas
    { type: "revision.approved", runId: "r", revision: 1, round: 1, correction: "x", correctionSha: sha("x"), candidate: { prdSha: "c".repeat(64), tasksSha: "d".repeat(64) }, contract: { prdSha: "e".repeat(64), tasksSha: "f".repeat(64) }, predecessorStatus: "cancelled", approvedBy: { via: "v" }, at: "t" },
  ];
  for (const event of malformed) {
    assert.equal(revisionLifecycle(asWorkflowEvents([event])).state, "invalid");
  }
  // An unknown future revision.* type is skipped, not fatal (§16 rule 1).
  const future = revisionLifecycle(asWorkflowEvents([
    { type: "revision.something-new", runId: "r", at: "t" },
    revisionEventFixtures().started(),
  ]));
  assert.equal(future.state, "open");
});

// ---------------------------------------------------------------------------
// Round budget recount (§11) — crash-safe, no double consumption
// ---------------------------------------------------------------------------

test("budget: rounds recount from events — invalid output never consumed, retries reuse the round", () => {
  const revision = 1;
  assert.equal(plannerRoundsUsed([], revision), 0);
  assert.equal(nextPlannerRound([], revision), 1);

  const invalidOnly = asWorkflowEvents([revisionEventFixtures().started(), revisionEventFixtures().rejected(1, revision)]);
  assert.equal(plannerRoundsUsed(invalidOnly, revision), 0, "invalid output consumed nothing");
  assert.equal(nextPlannerRound(invalidOnly, revision), 1, "the unconsumed round is retried at the SAME number");

  const afterInvalidRetry = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().rejected(1, revision),
    revisionEventFixtures().candidate(1, revision),
  ]);
  assert.equal(plannerRoundsUsed(afterInvalidRetry, revision), 1);
  assert.equal(nextPlannerRound(afterInvalidRetry, revision), 2);
});

test("budget: user rejection moves to round+1; a crashed candidate is never double-counted", () => {
  const revision = 1;
  const userRejected = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().candidate(1, revision),
    revisionEventFixtures().rejected(1, revision, "new notes"),
  ]);
  assert.equal(plannerRoundsUsed(userRejected, revision), 1);
  assert.equal(nextPlannerRound(userRejected, revision), 2, "§6 T6: open (round+1)");

  const twoRounds = asWorkflowEvents([
    ...userRejected,
    revisionEventFixtures().candidate(2, revision),
  ]);
  assert.equal(plannerRoundsUsed(twoRounds, revision), 2);
  assert.equal(nextPlannerRound(twoRounds, revision), 3, "past the budget of 2 — only approve/abandon remain");
});

// ---------------------------------------------------------------------------
// Successor id rule and launch completeness (tasks T3c/T3d)
// ---------------------------------------------------------------------------

test("successor ids: <chainRoot>-r<N+1> from the run's own suffix", () => {
  assert.equal(chainRootOf("abc"), "abc");
  assert.equal(chainRootOf("abc-r3"), "abc");
  assert.equal(successorRunId("abc"), "abc-r1");
  assert.equal(successorRunId("abc-r1"), "abc-r2");
  assert.equal(successorRunId("abc-r12"), "abc-r13");
  assert.equal(successorRunId(successorRunId(successorRunId("abc"))), "abc-r3");
});

test("launchIncomplete: absent log, seeded stubs without phase.started are incomplete; a real phase is complete", () => {
  const root = fixture();
  assert.equal(launchIncomplete(root, "abc-r1"), true, "absent successor log");

  const stub = RunLog.open(root, "abc-r1");
  stub.append({ type: "workflow.started", runId: "abc-r1", workflow: "feature", baseline: "snap" });
  stub.append({ type: "spec.approved", runId: "abc-r1", prdSha: "a".repeat(64), tasksSha: "b".repeat(64) });
  assert.equal(launchIncomplete(root, "abc-r1"), true, "seeded stub without workflow.resumed");

  stub.append({ type: "workflow.resumed", runId: "abc-r1", phase: "develop" });
  assert.equal(launchIncomplete(root, "abc-r1"), true, "stub with workflow.resumed but no phase.started");

  stub.append({ type: "phase.started", runId: "abc-r1", phase: "develop" });
  assert.equal(launchIncomplete(root, "abc-r1"), false, "the first phase.started completes the launch");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Ordinary-resume interplay refusals (tasks T5, §16 rule 3)
// ---------------------------------------------------------------------------

test("resume refusals fire with their guidance for every active lifecycle state", () => {
  const root = fixture();
  const runId = "run-resume";
  const fx = revisionEventFixtures(runId);
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { interrupted: true }));

  const base = readRunLog(root, runId);
  const withOpen = [...base, fx.started()];
  const open = resumeRevisionRefusal(withOpen, root);
  assert.equal(open?.type, "revision_in_progress");
  if (open?.type === "revision_in_progress") {
    assert.equal(open.runId, runId);
    assert.match(open.message, new RegExp(`continue or abandon it with /flow revise ${runId}`));
  }

  const withCandidate = [...withOpen, fx.candidate()];
  assert.equal(resumeRevisionRefusal(withCandidate, root)?.type, "revision_in_progress", "candidate-pending refuses too");

  const withApproval = [...withCandidate, fx.approved()];
  const approved = resumeRevisionRefusal(withApproval, root);
  assert.equal(approved?.type, "revision_approved_pending_launch");
  if (approved?.type === "revision_approved_pending_launch") {
    assert.match(approved.message, /complete the launch with \/flow revise/);
  }

  const launched = appendRevisionEventTo(withApproval, fx.launched());
  const incomplete = resumeRevisionRefusal(launched, root);
  assert.equal(incomplete?.type, "revision_launch_incomplete", "pointer without a running successor is repairable");
  if (incomplete?.type === "revision_launch_incomplete") {
    assert.equal(incomplete.successorRunId, `${runId}-r1`);
    assert.match(incomplete.message, /revision launch is incomplete/);
  }

  // The successor log with a phase.started makes `launched` terminal for P.
  const successor = RunLog.open(root, `${runId}-r1`);
  successor.append({ type: "workflow.started", runId: `${runId}-r1`, workflow: "feature", baseline: "snap" });
  successor.append({ type: "phase.started", runId: `${runId}-r1`, phase: "develop" });
  const terminal = resumeRevisionRefusal(launched, root);
  assert.equal(terminal?.type, "revised_by_successor");
  if (terminal?.type === "revised_by_successor") {
    assert.equal(terminal.successorRunId, `${runId}-r1`);
    assert.match(terminal.message, new RegExp(`revised by ${runId}-r1 — revise the successor run instead`));
  }

  // Corrupt revision evidence refuses P's resume too (§16 rule 5): a
  // correctionSha that does not bind the correction is malformed evidence.
  const forged = { ...fx.started(), correction: "tampered" };
  const corrupt = resumeRevisionRefusal([...base, forged as unknown as WorkflowEvent], root);
  assert.equal(corrupt?.type, "revision_evidence_corrupt");
  // An event copied from ANOTHER run is incoherent evidence as well:
  const foreign = resumeRevisionRefusal([...base, revisionEventFixtures().started()], root);
  assert.equal(foreign?.type, "revision_evidence_corrupt");
  rmSync(root, { recursive: true, force: true });
});

function appendRevisionEventTo(events: WorkflowEvent[], event: object): WorkflowEvent[] {
  return [...events, event as unknown as WorkflowEvent];
}

test("abandonment restores the honest pre-revision behavior, per predecessor status", () => {
  // interrupted/failed predecessors become ordinarily resumable again:
  const rootA = fixture();
  const runA = "run-int";
  const fxA = revisionEventFixtures(runA);
  writePredecessorLog(rootA, runA, predecessorEvents(rootA, runA, { interrupted: true }));
  let withRevision = appendRevisionEventTo(readRunLog(rootA, runA), fxA.started());
  withRevision = appendRevisionEventTo(withRevision, fxA.candidate());
  withRevision = appendRevisionEventTo(withRevision, fxA.abandoned());
  assert.equal(resumeRevisionRefusal(withRevision, rootA), undefined, "the lifecycle block is lifted");
  const replayA = replayRunLog(withRevision);
  assert.equal(replayA.ok, true, "an interrupted predecessor resumes again under the old contract");
  if (replayA.ok) assert.equal(replayA.state.phase, "develop");

  // cancelled/needs_human predecessors still refuse terminal_outcome — exactly
  // as before the revision (the assertion is the refusal, not a resume promise).
  const rootB = fixture();
  const runB = "run-cancelled";
  const fxB = revisionEventFixtures(runB);
  writePredecessorLog(rootB, runB, predecessorEvents(rootB, runB, { status: "cancelled" }));
  let cancelledWithAbandoned = appendRevisionEventTo(readRunLog(rootB, runB), fxB.started());
  cancelledWithAbandoned = appendRevisionEventTo(cancelledWithAbandoned, fxB.abandoned());
  assert.equal(resumeRevisionRefusal(cancelledWithAbandoned, rootB), undefined);
  const replayB = replayRunLog(cancelledWithAbandoned);
  assert.equal(replayB.ok, false);
  if (!replayB.ok) assert.equal(replayB.refusal.type, "terminal_outcome");

  const rootC = fixture();
  const runC = "run-escalated";
  writePredecessorLog(rootC, runC, predecessorEvents(rootC, runC, { status: "needs_human" }));
  const needsHumanReplay = replayRunLog(readRunLog(rootC, runC));
  assert.equal(needsHumanReplay.ok, false);
  if (!needsHumanReplay.ok) assert.equal(needsHumanReplay.refusal.type, "terminal_outcome");
  rmSync(rootA, { recursive: true, force: true });
  rmSync(rootB, { recursive: true, force: true });
  rmSync(rootC, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Session core (tasks T4, spec.md §6 rows T2–T5, §10, §11)
// ---------------------------------------------------------------------------

test("session: the happy path opens, plans once, and persists the hash-bound approval", async () => {
  const root = fixture();
  const runId = "run-happy";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const git = new FakeGit();
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, git));
  assert.equal(outcome.kind, "approved");

  // Exactly the three lifecycle events, in order, appended to P's log — and
  // nothing else: the session never appends execution events (§6).
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.approved"]);

  const approved = outcome.approval;
  assert.equal(approved.revision, 1);
  assert.equal(approved.round, 1);
  assert.equal(approved.correction, "make auth optional");
  assert.equal(approved.correctionSha, sha("make auth optional"));
  assert.equal(approved.candidate.prdSha, sha("Revised body one."));
  assert.equal(approved.predecessorStatus, "cancelled");
  assert.equal(approved.approvedBy.via, "/flow revise");
  assert.equal(approved.contract.prdSha, sha(`${MARKER}\nRevised body one.`), "the contract binds the promoted artifact contents (marker included)");
  assert.ok(approved.contract.tasksSha.length === 64);
  assert.equal(approved.eventId, withEventId({ ...approved }).eventId, "the eventId re-derives from the persisted evidence");

  // Sidecars hold the candidate bodies; session.json is the cache:
  const sidecar = revisionSidecarDir(root, runId);
  assert.equal(readFileSync(join(sidecar, "candidate-prd.md"), "utf8"), "Revised body one.");
  assert.match(readFileSync(join(sidecar, "candidate-tasks.md"), "utf8"), /T1 — do it/);
  const cache = JSON.parse(readFileSync(join(sidecar, "session.json"), "utf8")) as { round: number; correction: string };
  assert.equal(cache.round, 1);
  assert.equal(cache.correction, "make auth optional");

  // The planner prompt carried the correction verbatim, the partial evidence and the retention instructions:
  const prompt = planner.calls[0]!.prompt;
  assert.match(prompt, /make auth optional/);
  assert.match(prompt, /- src\/a\.ts/);
  assert.match(prompt, /\+oldest/);
  assert.match(prompt, /Keep\/Change\/Remove|KEEP|Keep/);
  // The evidence in revision.started binds the patch at open:
  const started = readRunLog(root, runId).find((e) => e.type === "revision.started") as { partialPatchSha?: string; partialFiles?: string[] };
  assert.equal(started.partialPatchSha, sha(git.patches[0] ?? "diff --git a/src/a.ts\n@@ -1 +1 @@\n+oldest\n@@ -2 +2 @@\n+newest"));
  assert.deepEqual(started.partialFiles, ["src/a.ts"]);

  // Approved artifacts were NOT touched before promotion (T5: nothing else changed):
  assert.equal(readFileSync(join(root, ".ai", "features", SLUG, `prd-${SLUG}.md`), "utf8"), `${MARKER}\n${PRD_BODY}`);

  // The lock was released exactly once — the repo is free again:
  const lock = acquireRunLock(root, { runId: "check", workflow: "check" });
  assert.equal(lock.ok, true);
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("session: empty notes consume no planner call, no round and no event", async () => {
  const root = fixture();
  const runId = "run-empty";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["", "dismiss"]; // empty → re-ask → dismissed
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, gitStub()));
  assert.equal(outcome.kind, "not-opened");
  assert.deepEqual(revisionTypes(root, runId), [], "no event before a non-empty correction");
  assert.equal(existsSync(revisionSidecarDir(root, runId)), false);
  assert.equal(planner.calls.length, 0);
  assert.ok(human.notices.some((n) => n.includes("empty revision notes")));
  rmSync(root, { recursive: true, force: true });
});

function gitStub(): GitService {
  return new FakeGit();
}

test("session: invalid planner output persists the rejected artifact, consumes no round, retries the SAME round", async () => {
  const root = fixture();
  const runId = "run-invalid";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["retry", "approve"];
  const planner = new ScriptedPlanner({ text: INVALID_PLAN }, { text: VALID_PLAN_A });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(outcome.kind, "approved");
  if (outcome.kind !== "approved") throw new Error("expected approval after retry");

  const events = readRunLog(root, runId).filter((e) => e.type === "revision.candidate" || e.type === "revision.candidate.rejected");
  assert.equal(events.length, 2);
  const rejected = events[0] as unknown as { round: number; artifactPath: string; reason: string };
  const candidate = events[1] as unknown as { round: number };
  assert.equal(rejected.round, 1);
  assert.match(rejected.reason, /planner/);
  assert.ok(existsSync(rejected.artifactPath), "rejected raw output persisted beside the run log");
  assert.equal(candidate.round, 1, "the retry reuses the unconsumed round — never a double charge");
  assert.equal(outcome.approval.round, 1);
  rmSync(root, { recursive: true, force: true });
});

test("session: user rejection records the notes, moves to round+1, and the approval binds the NEW correction", async () => {
  const root = fixture();
  const runId = "run-reject";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional", "actually also add rate limiting"];
  human.selects = ["reject", "approve"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A }, { text: VALID_PLAN_B });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(outcome.kind, "approved");
  if (outcome.kind !== "approved") throw new Error("expected approval");

  const events = readRunLog(root, runId);
  const rejected = events.find((e) => e.type === "revision.candidate.rejected") as { round: number; reason: string; notes?: string };
  assert.equal(rejected.round, 1);
  assert.equal(rejected.reason, "rejected by user");
  assert.equal(rejected.notes, "actually also add rate limiting");
  const secondCandidate = events.filter((e) => e.type === "revision.candidate").at(-1) as { round: number };
  assert.equal(secondCandidate.round, 2, "§6 T6: open (round+1)");
  assert.equal(outcome.approval.round, 2);
  assert.equal(outcome.approval.correction, "actually also add rate limiting", "the approval binds the replacement correction");
  assert.match(planner.calls[1]!.prompt, /actually also add rate limiting/, "the replacement notes drive the next planner call");
  rmSync(root, { recursive: true, force: true });
});

test("session: a provider abort consumes no round and preserves the open state", async () => {
  const root = fixture();
  const runId = "run-abort";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A, aborted: true });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(outcome.kind, "open");
  if (outcome.kind === "open") assert.equal(outcome.revision, 1);
  assert.deepEqual(revisionTypes(root, runId), ["revision.started"]);
  assert.equal(planner.calls.length, 1, "the planner was called exactly once — no retry loop");
  // The open revision blocks ordinary resume until resolved:
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root)?.type, "revision_in_progress");
  rmSync(root, { recursive: true, force: true });
});

test("session: abandon removes the sidecar and restores the pre-revision refusal behavior", async () => {
  const root = fixture();
  const runId = "run-abandon";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["abandon"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(outcome.kind, "abandoned");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.abandoned"]);
  assert.equal(existsSync(revisionSidecarDir(root, runId)), false, "the sidecar directory is removed");
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root), undefined, "the block is lifted");
  const replay = replayRunLog(readRunLog(root, runId));
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.refusal.type, "terminal_outcome", "a cancelled predecessor stays terminal after abandon — as before the revision");
  rmSync(root, { recursive: true, force: true });
});

test("session: the round budget is enforced from events — at the limit only approve/abandon remain", async () => {
  const root = fixture();
  const runId = "run-budget";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["correction one", "correction two"];
  human.selects = ["reject", "abandon"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A }, { text: VALID_PLAN_B });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(outcome.kind, "abandoned");
  assert.deepEqual(revisionTypes(root, runId), [
    "revision.started",
    "revision.candidate",
    "revision.candidate.rejected",
    "revision.candidate",
    "revision.abandoned",
  ]);
  assert.equal(planner.calls.length, 2, "a third planner round never runs");

  // The second decide dialog must NOT offer reject (§11: only Approve/Abandon remain).
  const decideDialogs = human.selectQuestions.filter((q) => q.message.includes("candidate ready"));
  assert.equal(decideDialogs.length, 2);
  assert.ok(decideDialogs[0]!.options.some((o) => o.value === "reject"), "round 1 still offers reject");
  assert.ok(!decideDialogs[1]!.options.some((o) => o.value === "reject"), "the limit hides reject");
  rmSync(root, { recursive: true, force: true });
});

test("session: an appendCritical failure at the candidate aborts before anything irreversible", async () => {
  const root = fixture();
  const runId = "run-appendfail";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });
  const events = new FaultedLog(runLogPathOf(root, runId));
  events.failOnce = ["revision.candidate"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit(), events));
  assert.equal(outcome.kind, "failed");
  if (outcome.kind === "failed") assert.match(outcome.error, /revision\.candidate/);
  assert.deepEqual(revisionTypes(root, runId), ["revision.started"], "the candidate never landed");
  assert.ok(existsSync(revisionSidecarDir(root, runId)), "the sidecar remains recoverable evidence");
  // The session aborted BEFORE approval; the lifecycle stays open; resume refuses with guidance:
  const refusal = resumeRevisionRefusal(readRunLog(root, runId), root);
  assert.equal(refusal?.type, "revision_in_progress");
  const lock = acquireRunLock(root, { runId: "check", workflow: "check" });
  assert.equal(lock.ok, true, "the lock was released by the finally discipline");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("session: an appendCritical failure at the approval leaves candidate-pending, never a half approval", async () => {
  const root = fixture();
  const runId = "run-approvalfail";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });
  const events = new FaultedLog(runLogPathOf(root, runId));
  events.failOnce = ["revision.approved"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit(), events));
  assert.equal(outcome.kind, "failed");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"]);
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root)?.type, "revision_in_progress");
  assert.ok(!existsSync(join(root, ".pi", "pi-brain", "runs", `${runId}.jsonl`)) === false);
  const raw = readFileSync(runLogPathOf(root, runId), "utf8");
  assert.ok(!raw.includes("revision.approved"), "no half-recorded approval on disk");
  rmSync(root, { recursive: true, force: true });
});

test("session: a dismissed dialog mid-session preserves the candidate for a later decision", async () => {
  const root = fixture();
  const runId = "run-dismiss";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["dismiss"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(outcome.kind, "candidate-pending");
  if (outcome.kind === "candidate-pending") {
    assert.equal(outcome.revision, 1);
    assert.equal(outcome.candidate.prdSha, sha("Revised body one."));
  }
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"]);
  // A second fresh session refuses — no second concurrent revision (§6 redirect):
  const second = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, new FakeGit()));
  assert.equal(second.kind, "refused");
  if (second.kind === "refused") assert.match(second.reason, /candidate-pending/);
  rmSync(root, { recursive: true, force: true });
});

test("session: tampered approved artifacts refuse the revision (tamper guard)", async () => {
  const root = fixture();
  const runId = "run-tamper";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  writeFileSync(join(root, ".ai", "features", SLUG, `prd-${SLUG}.md`), `${MARKER}\nTAMPERED`, "utf8");
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, new FakeGit()));
  assert.equal(outcome.kind, "refused");
  if (outcome.kind === "refused") assert.match(outcome.reason, /tamper|hash/);
  assert.deepEqual(revisionTypes(root, runId), [], "nothing was appended on a tamper refusal");
  rmSync(root, { recursive: true, force: true });
});

test("session: changed frozen repository state refuses at entry (§13)", async () => {
  const root = fixture();
  const runId = "run-repostate";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled", repoStateDigest: "digest-at-start" }));
  const git = new FakeGit();
  git.digest = "digest-now";
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, git));
  assert.equal(outcome.kind, "refused");
  if (outcome.kind === "refused") assert.match(outcome.reason, /repository state changed/);
  rmSync(root, { recursive: true, force: true });
});

test("session: an unresolvable baseline refuses at evidence capture (§13)", async () => {
  const root = fixture();
  const runId = "run-baseline";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const git = new FakeGit();
  git.failDiff = true;
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, git));
  assert.equal(outcome.kind, "refused");
  if (outcome.kind === "refused") assert.match(outcome.reason, /baseline/);
  rmSync(root, { recursive: true, force: true });
});

test("session: a held lock refuses without touching state", async () => {
  const root = fixture();
  const runId = "run-lock";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const held = acquireRunLock(root, { runId: "other", workflow: "feature" });
  assert.equal(held.ok, true);
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, new FakeGit()));
  assert.equal(outcome.kind, "refused");
  if (outcome.kind === "refused") assert.match(outcome.reason, /lock/);
  assert.deepEqual(revisionTypes(root, runId), []);
  if (held.ok) held.release();
  rmSync(root, { recursive: true, force: true });
});

test("session: a completed predecessor refuses outright", async () => {
  const root = fixture();
  const runId = "run-completed";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "completed" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, new FakeGit()));
  assert.equal(outcome.kind, "refused");
  if (outcome.kind === "refused") assert.match(outcome.reason, /completed|new \/feature/);
  rmSync(root, { recursive: true, force: true });
});

test("session: changed partial work at approval discloses and still binds the candidate content", async () => {
  const root = fixture();
  const runId = "run-changed";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const git = new FakeGit();
  const patchAtOpen = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+at open";
  const patchLater = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+changed later";
  git.patches = [patchAtOpen, patchLater]; // second diffSince (approval time) returns the changed patch
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve", "approve"]; // decide → approve; change dialog → approve anyway
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, git));
  assert.equal(outcome.kind, "approved");
  const started = readRunLog(root, runId).find((e) => e.type === "revision.started") as { partialPatchSha?: string };
  assert.equal(started.partialPatchSha, sha(patchAtOpen));
  assert.match(human.selectQuestions[1]!.message, /partial work changed/, "§10: the dialog says the tree moved");
  assert.equal(planner.calls.length, 1, "approve-anyway does not re-run the planner");
  rmSync(root, { recursive: true, force: true });
});

test("session: regenerate after changed partial work records the superseded candidate and plans the next round", async () => {
  const root = fixture();
  const runId = "run-regen";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const git = new FakeGit();
  const patchAtOpen = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+at open";
  const patchLater = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+changed later";
  git.patches = [patchAtOpen, patchLater, patchLater];
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve", "regenerate", "approve", "approve"];
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A }, { text: VALID_PLAN_B });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, git));
  assert.equal(outcome.kind, "approved");
  if (outcome.kind === "approved") assert.equal(outcome.approval.round, 2);
  assert.deepEqual(revisionTypes(root, runId), [
    "revision.started",
    "revision.candidate",
    "revision.candidate.rejected",
    "revision.candidate",
    "revision.approved",
  ]);
  const rejected = readRunLog(root, runId).find((e) => e.type === "revision.candidate.rejected") as { reason: string };
  assert.match(rejected.reason, /regenerated|changed/);
  assert.equal(planner.calls.length, 2);
  rmSync(root, { recursive: true, force: true });
});

/** FakeGit that damages the candidate sidecar when the approval-time diff runs. */
class DamageOnApprovalDiff extends FakeGit {
  #damage: () => void;
  constructor(damage: () => void) {
    super();
    this.#damage = damage;
  }
  override async diffSince(): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    if (this.diffCalls === 1) this.#damage(); // the approval-time recompute runs after the open capture
    return super.diffSince();
  }
}

test("session: damaged candidate sidecars refuse approval fail-closed (§16 rule 5)", async () => {
  const root = fixture();
  const runId = "run-damaged";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve", "leave"]; // decide → approve → damaged → leave pending
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A });
  // The approval path re-diffs BEFORE verifying the sidecars: damage the
  // candidate file in that window, simulating a post-write mutation.
  const git = new DamageOnApprovalDiff(() => {
    writeFileSync(join(revisionSidecarDir(root, runId), "candidate-prd.md"), "DAMAGED", "utf8");
  });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, git));
  assert.equal(outcome.kind, "candidate-pending", "unverifiable contents are never approved");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"], "no approval event landed");
  assert.ok(
    human.notices.some((n) => n.includes("no longer match the persisted candidate event")),
    "the dialog reports the mismatch",
  );
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root)?.type, "revision_in_progress");
  rmSync(root, { recursive: true, force: true });
});

test("lifecycle: an approval must bind the pending candidate it completes (round + contents)", () => {
  const fx = revisionEventFixtures();
  const coherent = asWorkflowEvents([
    fx.started(),
    fx.candidate(),
    fx.approved(),
  ]);
  assert.equal(revisionLifecycle(coherent).state, "approved-pending-launch");

  const wrongContents = asWorkflowEvents([
    fx.started(),
    fx.candidate(),
    withEventId({ ...fx.approved(), candidate: { prdSha: "9".repeat(64), tasksSha: "d".repeat(64) } }),
  ]);
  const contentsState = revisionLifecycle(wrongContents);
  assert.equal(contentsState.state, "invalid");
  if (contentsState.state === "invalid") assert.match(contentsState.reason, /does not bind the pending candidate/);

  const wrongRound = asWorkflowEvents([
    fx.started(),
    fx.candidate(),
    withEventId({ ...fx.approved(), round: 2 }),
  ]);
  assert.equal(revisionLifecycle(wrongRound).state, "invalid");
});

test("lifecycle: chain numbering must be contiguous — started always carries count+1", () => {
  const first = revisionLifecycle(asWorkflowEvents([revisionEventFixtures().started(2)]));
  assert.equal(first.state, "invalid", "the first started revision is 1");

  const gap = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().abandoned(),
    revisionEventFixtures().started(3),
  ]);
  const gapState = revisionLifecycle(gap);
  assert.equal(gapState.state, "invalid", "abandoned revisions still count toward the numbering");
  if (gapState.state === "invalid") assert.match(gapState.reason, /3 earlier started|earlier started/);

  const contiguous = asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().abandoned(),
    revisionEventFixtures().started(2),
  ]);
  assert.equal(revisionLifecycle(contiguous).state, "open");

  const collapsedDuplicate = revisionLifecycle(asWorkflowEvents([
    revisionEventFixtures().started(),
    revisionEventFixtures().started(), // exact duplicate: collapsed, does not advance the count
    revisionEventFixtures().abandoned(),
    revisionEventFixtures().started(2),
  ]));
  assert.equal(collapsedDuplicate.state, "open", "duplicates never double-count the chain numbering");
});

test("lifecycle: dedup scans every duplicate — an equal copy does not hide a later conflicting one", () => {
  const started = revisionEventFixtures().started();
  const retried = revisionEventFixtures().started(); // equal canonical
  const forged = { ...started, correction: "tampered", correctionSha: sha("tampered") };
  const state = revisionLifecycle(asWorkflowEvents([started, retried, forged]));
  assert.equal(state.state, "invalid", "the conflicting duplicate is found beyond the equal one");
});

test("lifecycle: a known revision event whose eventId does not BIND its content refuses", () => {
  const fx = revisionEventFixtures();
  // An arbitrary (non-sha) id:
  const arbitrary = asWorkflowEvents([{ ...fx.started(), eventId: "not-a-hash" }]);
  const arbitraryState = revisionLifecycle(arbitrary);
  assert.equal(arbitraryState.state, "invalid");
  if (arbitraryState.state === "invalid") {
    assert.match(arbitraryState.reason, /eventId does not bind its canonical content/);
  }

  // A formally valid sha256 that belongs to DIFFERENT content:
  const mismatched = asWorkflowEvents([{ ...fx.started(), eventId: "b".repeat(64) }]);
  const mismatchedState = revisionLifecycle(mismatched);
  assert.equal(mismatchedState.state, "invalid");
  if (mismatchedState.state === "invalid") {
    assert.match(mismatchedState.reason, /eventId does not bind its canonical content/);
  }

  // A re-signed event keeps validating: the id must derive, not merely exist.
  const resigned = asWorkflowEvents([
    withEventId({
      ...fx.started(),
      correction: "a different correction",
      correctionSha: sha("a different correction"),
    }),
  ]);
  assert.equal(revisionLifecycle(resigned).state, "open");
});

test("lifecycle: the eventId binding check applies to every KNOWN revision event type", () => {
  const fx = revisionEventFixtures();
  // Position 0 of each chain is the pristine started; the event at the given
  // slot carries a well-formed but non-derived id.
  const cases: Array<{ slot: number; events: object[] }> = [
    { slot: 1, events: [fx.started(), fx.candidate()] },
    { slot: 2, events: [fx.started(), fx.candidate(), fx.rejected()] },
    { slot: 2, events: [fx.started(), fx.candidate(), fx.approved()] },
    { slot: 1, events: [fx.started(), fx.abandoned()] },
    { slot: 3, events: [fx.started(), fx.candidate(), fx.approved(), fx.launched()] },
    { slot: 0, events: [fx.started()] },
  ];
  for (const { slot, events } of cases) {
    const tampered = events.map((event, index) =>
      index === slot ? { ...event, eventId: "c".repeat(64) } : event,
    );
    const state = revisionLifecycle(asWorkflowEvents(tampered));
    assert.equal(
      state.state,
      "invalid",
      `the event at slot ${slot} of [${events.map((e) => (e as { type: string }).type).join(", ")}] must refuse a non-binding eventId`,
    );
    if (state.state === "invalid") {
      assert.match(state.reason, /eventId does not bind its canonical content/);
    }
  }
});

// --- Coherence: every known event must refer to the ACTIVE run and revision ---
// (separate regression per event type, each with an incoherent runId AND an
// incoherent revision)

test("lifecycle: revision.candidate with an incoherent runId or revision refuses", () => {
  const started = revisionEventFixtures().started();
  const foreignRun = asWorkflowEvents([started, revisionEventFixtures("other-run").candidate()]);
  const foreignState = revisionLifecycle(foreignRun);
  assert.equal(foreignState.state, "invalid");
  if (foreignState.state === "invalid") assert.match(foreignState.reason, /refers to run "other-run"/);

  const foreignRevision = asWorkflowEvents([started, revisionEventFixtures().candidate(1, 7)]);
  const revisionState = revisionLifecycle(foreignRevision);
  assert.equal(revisionState.state, "invalid");
  if (revisionState.state === "invalid") {
    assert.match(revisionState.reason, /refers to revision 7 while the active revision is 1/);
  }
});

test("lifecycle: revision.candidate.rejected with an incoherent runId or revision refuses", () => {
  const started = revisionEventFixtures().started();
  const foreignRun = asWorkflowEvents([started, revisionEventFixtures().candidate(), revisionEventFixtures("other-run").rejected()]);
  const foreignState = revisionLifecycle(foreignRun);
  assert.equal(foreignState.state, "invalid");
  if (foreignState.state === "invalid") assert.match(foreignState.reason, /refers to run "other-run"/);

  const foreignRevision = asWorkflowEvents([started, revisionEventFixtures().candidate(), revisionEventFixtures().rejected(1, 7)]);
  const revisionState = revisionLifecycle(foreignRevision);
  assert.equal(revisionState.state, "invalid");
  if (revisionState.state === "invalid") {
    assert.match(revisionState.reason, /refers to revision 7 while the active revision is 1/);
  }
});

test("lifecycle: revision.approved with an incoherent runId or revision refuses", () => {
  const started = revisionEventFixtures().started();
  const foreignRun = asWorkflowEvents([started, revisionEventFixtures().candidate(), revisionEventFixtures("other-run").approved()]);
  const foreignState = revisionLifecycle(foreignRun);
  assert.equal(foreignState.state, "invalid");
  if (foreignState.state === "invalid") assert.match(foreignState.reason, /refers to run "other-run"/);

  const foreignRevision = asWorkflowEvents([started, revisionEventFixtures().candidate(), revisionEventFixtures().approved(7)]);
  const revisionState = revisionLifecycle(foreignRevision);
  assert.equal(revisionState.state, "invalid");
  if (revisionState.state === "invalid") {
    assert.match(revisionState.reason, /refers to revision 7 while the active revision is 1/);
  }
});

test("lifecycle: revision.abandoned with an incoherent runId or revision refuses", () => {
  const started = revisionEventFixtures().started();
  const foreignRun = asWorkflowEvents([started, revisionEventFixtures().candidate(), revisionEventFixtures("other-run").abandoned()]);
  const foreignState = revisionLifecycle(foreignRun);
  assert.equal(foreignState.state, "invalid");
  if (foreignState.state === "invalid") assert.match(foreignState.reason, /refers to run "other-run"/);

  const foreignRevision = asWorkflowEvents([started, revisionEventFixtures().candidate(), revisionEventFixtures().abandoned(7)]);
  const revisionState = revisionLifecycle(foreignRevision);
  assert.equal(revisionState.state, "invalid");
  if (revisionState.state === "invalid") {
    assert.match(revisionState.reason, /refers to revision 7 while the active revision is 1/);
  }
});

test("lifecycle: revision.launched with an incoherent runId or revision refuses", () => {
  const started = revisionEventFixtures().started();
  const foreignRun = asWorkflowEvents([
    started,
    revisionEventFixtures().candidate(),
    revisionEventFixtures().approved(),
    revisionEventFixtures("other-run").launched(),
  ]);
  const foreignState = revisionLifecycle(foreignRun);
  assert.equal(foreignState.state, "invalid");
  if (foreignState.state === "invalid") assert.match(foreignState.reason, /refers to run "other-run"/);

  const foreignRevision = asWorkflowEvents([
    started,
    revisionEventFixtures().candidate(),
    revisionEventFixtures().approved(),
    revisionEventFixtures().launched(7),
  ]);
  const revisionState = revisionLifecycle(foreignRevision);
  assert.equal(revisionState.state, "invalid");
  if (revisionState.state === "invalid") {
    assert.match(revisionState.reason, /refers to revision 7 while the approved revision is 1/);
  }
});

test("lifecycle: candidate and rejected rounds must progress exactly — no gaps, repeats or budget overrun", () => {
  const fx = revisionEventFixtures();
  // A gap: the first candidate skips round 1.
  const gap = revisionLifecycle(asWorkflowEvents([fx.started(), fx.candidate(2)]));
  assert.equal(gap.state, "invalid");
  if (gap.state === "invalid") assert.match(gap.reason, /round 2 breaks the round progression \(expected 1\)/);

  // A repeat: round 1 is already consumed; a user rejection moves to round 2.
  // The second candidate is a DISTINCT logical event (different contents, so a
  // fresh eventId) that still claims the consumed round.
  const repeat = revisionLifecycle(asWorkflowEvents([
    fx.started(),
    fx.candidate(1),
    fx.rejected(1, 1, "new notes"),
    { ...withEventId({ ...fx.candidate(1), prdSha: "9".repeat(64) }) }, // distinct event, must be round 2
  ]));
  assert.equal(repeat.state, "invalid");
  if (repeat.state === "invalid") assert.match(repeat.reason, /round 1 breaks the round progression \(expected 2\)/);

  // A rejection from candidate-pending must name the PENDING candidate's round.
  const wrongPendingRound = revisionLifecycle(asWorkflowEvents([
    fx.started(),
    fx.candidate(1),
    fx.rejected(2), // pending round is 1
  ]));
  assert.equal(wrongPendingRound.state, "invalid");
  if (wrongPendingRound.state === "invalid") {
    assert.match(wrongPendingRound.reason, /round 2 does not match the pending candidate round 1/);
  }

  // A rejection from open must name the unconsumed round (invalid output retries it).
  const wrongOpenRound = revisionLifecycle(asWorkflowEvents([fx.started(), fx.rejected(2)]));
  assert.equal(wrongOpenRound.state, "invalid");
  if (wrongOpenRound.state === "invalid") {
    assert.match(wrongOpenRound.reason, /round 2 breaks the round progression \(expected 1\)/);
  }

  // The budget is part of progression: round 3 can never exist with a budget of 2.
  const overrun = revisionLifecycle(asWorkflowEvents([
    fx.started(),
    fx.candidate(1),
    fx.rejected(1, 1, "new notes"),
    fx.candidate(2),
    fx.rejected(2, 1, "more notes"),
    fx.candidate(3),
  ]));
  assert.equal(overrun.state, "invalid");
  if (overrun.state === "invalid") assert.match(overrun.reason, /beyond the revision budget \(2\)/);
});

test("the revision gate precedes replay: an open revision refuses even a terminal predecessor", () => {
  const root = fixture();
  const runId = "run-order";
  const fx = revisionEventFixtures(runId);
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const events = appendRevisionEventTo(readRunLog(root, runId), fx.started());
  const refusal = resumeRevisionRefusal(events, root);
  assert.equal(refusal?.type, "revision_in_progress", "the lifecycle block wins over terminal_outcome");
  assert.match(refusal?.message ?? "", new RegExp(`/flow revise ${runId}`));
  rmSync(root, { recursive: true, force: true });
});

test("the REAL resume path enforces the revision gate before replay and lock acquisition", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "extensions", "pi-brain.ts"),
    "utf8",
  );
  const gate = source.indexOf("resumeRevisionRefusal(events, cwd)");
  assert.ok(gate >= 0, "handleResume wires the revision lifecycle gate");
  const replayCall = source.indexOf("replayRunLog(events", gate);
  assert.ok(replayCall > gate, "the gate precedes replay — a blocked run never reaches replay");
  const resumeLock = source.indexOf("acquireRunLock(cwd", gate);
  assert.ok(resumeLock > gate, "the gate precedes the resume lock acquisition");
});

test("session: planner rounds after the first carry refreshed partial-work evidence", async () => {
  const root = fixture();
  const runId = "run-fresh-evidence";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const git = new FakeGit();
  const patchAtOpen = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+at open";
  const patchLater = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+changed later";
  git.patches = [patchAtOpen, patchLater]; // open capture → p1; later diffs → p2 (repeat-last)
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional", "also add rate limiting"];
  human.selects = ["reject", "approve", "approve"]; // decide → reject → plan → decide → approve → changed → approve anyway
  const planner = new ScriptedPlanner({ text: VALID_PLAN_A }, { text: VALID_PLAN_B });

  const outcome = await runRevisionSessionCore(sessionDeps(root, runId, planner, human, git));
  assert.equal(outcome.kind, "approved");

  assert.match(planner.calls[0]!.prompt, /\+at open/, "the first prompt carries the open-time evidence");
  assert.ok(!planner.calls[0]!.prompt.includes("+changed later"), "round one never sees later evidence");
  assert.match(planner.calls[1]!.prompt, /\+changed later/, "the second prompt carries REFRESHED evidence");
  assert.ok(!planner.calls[1]!.prompt.includes("+at open"), "stale evidence does not linger in the second prompt");
  assert.equal(git.diffCalls, 3, "open capture + refresh before round two + approval-time check");
  rmSync(root, { recursive: true, force: true });
});

test("capPartialPatch: the cap holds without hunk boundaries (no @@ lines)", () => {
  const patch = "unified context line without any hunk header\n".repeat(30);
  assert.ok(patch.length > 300);
  const capped = capPartialPatch(patch, 150);
  assert.match(capped, /\[truncated\]/, "the marker explains the truncation");
  assert.ok(capped.length <= 150, `hard-tailed length ${capped.length} exceeds the cap`);
  const lastLine = patch.trimEnd().split("\n").at(-1)!;
  assert.ok(capped.includes(lastLine), "the newest content survives the hard tail");
});

test("capPartialPatch: an oversized header alone cannot bust the cap", () => {
  const header = "very long header line without a hunk marker\n".repeat(20); // ~900 chars
  const patch = `${header}@@ -1 +1 @@\n+tail content\n`;
  const capped = capPartialPatch(patch, 200);
  assert.match(capped, /\[truncated\]/);
  assert.ok(capped.length <= 200, `length ${capped.length} exceeds the cap`);
  assert.match(capped, /\+tail content/, "the newest hunk content survives the hard tail");
  assert.ok(capped.length < patch.length, "the bulk of the oversized header is dropped");
});

// ---------------------------------------------------------------------------
// Evidence cap (§10)
// ---------------------------------------------------------------------------

test("capPartialPatch: below the cap the patch passes through verbatim", () => {
  const patch = "diff --git a/f b/f\n@@ -1 +1 @@\n+line";
  assert.equal(capPartialPatch(patch, 48_000), patch);
});

test("capPartialPatch: truncation drops the OLDEST hunks first and marks it", () => {
  const header = "diff --git a/f b/f\n";
  const oldest = "@@ -1 +1 @@\n+old line\n".repeat(10);
  const newest = "@@ -9 +9 @@\n+new line\n".repeat(10);
  const patch = `${header}${oldest}${newest}`;
  const capped = capPartialPatch(patch, 200);
  assert.match(capped, /\[truncated\]/);
  assert.match(capped, /new line/, "the newest work survives");
  assert.ok(!capped.includes("old line"), "the oldest hunks are cut first");
  assert.match(capped, /^diff --git a\/f b\/f/, "the header is kept");
  assert.ok(capped.length <= 200, `capped length ${capped.length} exceeds 200`);
});

test("capPartialPatch: a single oversized hunk is hard-tailed, never empty", () => {
  const header = "diff --git a/f b/f\n";
  const huge = `@@ -1 +1 @@\n${"+x\n".repeat(500)}`;
  const capped = capPartialPatch(`${header}${huge}`, 120);
  assert.match(capped, /\[truncated\]/);
  assert.ok(capped.includes("+x"), "some evidence survives");
  assert.ok(capped.length > 0);
});
