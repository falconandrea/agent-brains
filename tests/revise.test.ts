/**
 * Post-stop plan revision (tasks T3–T6, spec.md §5/§6/§7/§9/§10/§11/§16):
 * eligibility, lifecycle, successor id, launch completeness, the Pi-free
 * revision session core, the ordinary-resume interplay refusals, and the
 * promotion/seed/repair sequence behind an injected launch port.
 * Run: `node --test tests/revise.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSuccessorSeed,
  capPartialPatch,
  chainRootOf,
  initialSuccessorResumeState,
  launchIncomplete,
  launchSuccessorRun,
  nextPlannerRound,
  nextRevisionNumber,
  persistedApproval,
  plannerRoundsUsed,
  repairRevisionLaunch,
  resumeRevisionRefusal,
  revisionEligibility,
  revisionLifecycle,
  revisionSidecarDir,
  runRevisionSessionCore,
  successorRunId,
  successorSeedCorruption,
  verifySuccessorSeed,
  type RepairLaunchDeps,
  type RepairLaunchOutcome,
  type RevisionSessionDeps,
  type SuccessorLaunchContext,
  type SuccessorLaunchDeps,
  type SuccessorLaunchRequest,
  type SuccessorLauncher,
} from "../src/workflows/revise.ts";
import { descriptionMarker, splitPlannerOutput, validatePlannerOutput } from "../src/workflows/feature.ts";
import { replayRunLog } from "../src/workflows/resume.ts";
import { CriticalAppendError, RunLog, readRunLog, runsDir, stableJson, withEventId } from "../src/run-log.ts";
import { acquireRunLock } from "../src/run-lock.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { digestScripts, type VerifyFreeze } from "../src/verify.ts";
import type {
  GitBaseline,
  GitService,
  HumanInput,
  SelectQuestion,
  VerifyRunner,
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

// ---------------------------------------------------------------------------
// T6 — promotion, successor seed and launch repair (spec.md §7/§9/§14)
// ---------------------------------------------------------------------------

const planValidation = validatePlannerOutput(VALID_PLAN_A);
if (!planValidation.valid) throw new Error("fixture plan must validate");
const CANDIDATE_PRD = planValidation.value.prd;
const CANDIDATE_TASKS = planValidation.value.tasks;
const CANDIDATE_PAIR = { prdSha: sha(CANDIDATE_PRD), tasksSha: sha(CANDIDATE_TASKS) };
/** The promoted artifact contents (marker included) the approval binds. */
const CONTRACT = {
  prdSha: sha(`${MARKER}\n${CANDIDATE_PRD}`),
  tasksSha: sha(`${MARKER}\n${CANDIDATE_TASKS}`),
};
/** The still-approved artifacts at revision open (the baseContract). */
const BASE_CONTRACT = {
  prdSha: sha(`${MARKER}\n${PRD_BODY}`),
  tasksSha: sha(`${MARKER}\n${TASKS_BODY}`),
};

const fileBytes = (path: string): string => readFileSync(path, "utf8");
const fileSha = (path: string): string => sha(fileBytes(path));
const fileMtime = (path: string): number => statSync(path).mtimeMs;

function t6RevisionStarted(runId: string, correction = "make auth optional") {
  return withEventId({
    type: "revision.started" as const,
    runId,
    revision: 1,
    correction,
    correctionSha: sha(correction),
    baseContract: BASE_CONTRACT,
    at: "2026-01-01T00:00:00.000Z",
  });
}

function t6RevisionCandidate(runId: string) {
  return withEventId({
    type: "revision.candidate" as const,
    runId,
    revision: 1,
    round: 1,
    prdSha: CANDIDATE_PAIR.prdSha,
    tasksSha: CANDIDATE_PAIR.tasksSha,
    at: "2026-01-01T00:01:00.000Z",
  });
}

function t6RevisionApproval(runId: string, candidate = CANDIDATE_PAIR, correction = "make auth optional") {
  return withEventId({
    type: "revision.approved" as const,
    runId,
    revision: 1,
    round: 1,
    correction,
    correctionSha: sha(correction),
    candidate,
    contract: CONTRACT,
    predecessorStatus: "cancelled",
    approvedBy: { via: "/flow revise", pid: 4321, at: "2026-01-01T00:03:00.000Z" },
  });
}

interface ApprovedStateOptions {
  /** Sidecar candidate files: "valid" (default) | "damaged" | "absent". */
  sidecar?: "valid" | "damaged" | "absent";
  /** On-disk approved artifacts: "original" (default) | "promoted" | "mixed-prd-promoted" | "foreign". */
  artifacts?: "original" | "promoted" | "mixed-prd-promoted" | "foreign";
  /** previous-* archive: "none" (default) | "valid" | "damaged" | "only-prd". */
  archive?: "none" | "valid" | "damaged" | "only-prd";
  /** Append revision.launched to P's log (B7 entry states). */
  pointer?: boolean;
  /** Successor log: "absent" (default) | "empty-file" | "started-only" | "full" | "full+resumed" | "spec-first". */
  successor?: "absent" | "empty-file" | "started-only" | "full" | "full+resumed" | "spec-first";
}

interface ApprovedState {
  approval: ReturnType<typeof t6RevisionApproval>;
  sidecarDir: string;
  paths: { prd: string; tasks: string; archivePrd: string; archiveTasks: string };
}

/**
 * A predecessor frozen at `approved-pending-launch` (or further, per opts):
 * P's log carries started/candidate/approved (+ pointer), the sidecar holds
 * the candidate files, and the artifacts/archive/successor are laid out per
 * opts to stage each crash boundary.
 */
function approvedState(root: string, runId: string, opts: ApprovedStateOptions = {}): ApprovedState {
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const correction = "make auth optional";
  appendRevisionEvent(root, runId, t6RevisionStarted(runId, correction));
  appendRevisionEvent(root, runId, t6RevisionCandidate(runId));
  const approval = t6RevisionApproval(runId, CANDIDATE_PAIR, correction);
  appendRevisionEvent(root, runId, approval);

  const sidecarDir = revisionSidecarDir(root, runId);
  mkdirSync(sidecarDir, { recursive: true });
  if ((opts.sidecar ?? "valid") !== "absent") {
    writeFileSync(join(sidecarDir, "candidate-prd.md"), opts.sidecar === "damaged" ? "corrupted-prd" : CANDIDATE_PRD, "utf8");
    writeFileSync(join(sidecarDir, "candidate-tasks.md"), opts.sidecar === "damaged" ? "corrupted-tasks" : CANDIDATE_TASKS, "utf8");
  }

  const featureDir = join(root, ".ai", "features", SLUG);
  const paths = {
    prd: join(featureDir, `prd-${SLUG}.md`),
    tasks: join(featureDir, `tasks-${SLUG}.md`),
    archivePrd: join(sidecarDir, "previous-prd.md"),
    archiveTasks: join(sidecarDir, "previous-tasks.md"),
  };
  switch (opts.artifacts ?? "original") {
    case "promoted":
      writeFileSync(paths.prd, `${MARKER}\n${CANDIDATE_PRD}`, "utf8");
      writeFileSync(paths.tasks, `${MARKER}\n${CANDIDATE_TASKS}`, "utf8");
      break;
    case "mixed-prd-promoted":
      writeFileSync(paths.prd, `${MARKER}\n${CANDIDATE_PRD}`, "utf8"); // tasks stays original
      break;
    case "foreign":
      writeFileSync(paths.prd, `${MARKER}\nsomeone edited this`, "utf8");
      writeFileSync(paths.tasks, `${MARKER}\nsomeone edited the tasks`, "utf8");
      break;
    default:
      break; // original, as writeArtifacts wrote them
  }

  switch (opts.archive ?? "none") {
    case "valid":
      writeFileSync(paths.archivePrd, `${MARKER}\n${PRD_BODY}`, "utf8");
      writeFileSync(paths.archiveTasks, `${MARKER}\n${TASKS_BODY}`, "utf8");
      break;
    case "damaged":
      writeFileSync(paths.archivePrd, `${MARKER}\ndamaged archive body`, "utf8");
      writeFileSync(paths.archiveTasks, `${MARKER}\ndamaged archive tasks`, "utf8");
      break;
    case "only-prd":
      writeFileSync(paths.archivePrd, `${MARKER}\n${PRD_BODY}`, "utf8");
      break;
    default:
      break;
  }

  if (opts.pointer) {
    appendRevisionEvent(
      root,
      runId,
      withEventId({
        type: "revision.launched" as const,
        runId,
        revision: 1,
        successorRunId: successorRunId(runId),
        at: "2026-01-01T00:04:00.000Z",
      }),
    );
  }

  const successorId = successorRunId(runId);
  switch (opts.successor ?? "absent") {
    case "empty-file":
      RunLog.open(root, successorId);
      break;
    case "started-only":
    case "full":
    case "full+resumed": {
      // The canonical seed, derived exactly as the repair derives it.
      const events = readRunLog(root, runId);
      const predStarted = events.find(
        (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> => event.type === "workflow.started",
      )!;
      const verdict = expectEligible(revisionEligibility(events));
      const seed = canonicalSuccessorSeed(predStarted, approval, verdict.usage);
      const log = RunLog.open(root, successorId);
      log.append(seed.started);
      if (opts.successor !== "started-only") log.append(seed.spec);
      if (opts.successor === "full+resumed") {
        log.append({ type: "workflow.resumed", runId: successorId, phase: "develop" } as WorkflowEvent);
      }
      break;
    }
    case "spec-first": {
      const log = RunLog.open(root, successorId);
      log.append({ type: "spec.approved", runId: successorId, ...CONTRACT } as WorkflowEvent);
      break;
    }
    default:
      break;
  }

  return { approval, sidecarDir, paths };
}

function repairDeps(
  root: string,
  runId: string,
  human: HumanInput,
  launch: SuccessorLauncher,
): RepairLaunchDeps {
  return { cwd: root, runId, human, events: new RunLog(runLogPathOf(root, runId)), launch };
}

function expectRepairRefusal(outcome: RepairLaunchOutcome): string {
  if (outcome.kind !== "refused") throw new Error(`expected a refusal, got ${outcome.kind}`);
  return outcome.reason;
}

/**
 * Mirrors `launchRun`'s documented synchronous behavior — a provided
 * `resumedPhase` emits `workflow.resumed` before the workflow body runs —
 * and records every request so the repair's `resumedPhase` decision
 * ("develop" vs omitted, B7c) is observable. The real launchRun integration
 * is T7; nothing here launches a real run.
 */
class RecordingLauncher {
  readonly requests: SuccessorLaunchRequest[] = [];
  readonly #root: string;
  readonly #emitPhaseStarted: boolean;
  readonly #fail: boolean;
  constructor(root: string, opts: { emitPhaseStarted?: boolean; fail?: boolean } = {}) {
    this.#root = root;
    this.#emitPhaseStarted = opts.emitPhaseStarted ?? false;
    this.#fail = opts.fail ?? false;
  }
  async run(request: SuccessorLaunchRequest): Promise<void> {
    this.requests.push(request);
    if (request.resumedPhase !== undefined) {
      RunLog.open(this.#root, request.successorRunId).append({
        type: "workflow.resumed",
        runId: request.successorRunId,
        phase: request.resumedPhase,
      } as WorkflowEvent);
    }
    if (this.#emitPhaseStarted) {
      RunLog.open(this.#root, request.successorRunId).append({
        type: "phase.started",
        runId: request.successorRunId,
        phase: request.resumedPhase ?? "develop",
      } as WorkflowEvent);
    }
    if (this.#fail) throw new Error("injected launcher failure");
  }
}

test("repair: B2b — an approval append failure aborts before promotion; repair refuses and nothing changes", async () => {
  const root = fixture();
  const runId = "run-b2b-fail";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const events = new FaultedLog(runLogPathOf(root, runId));
  events.failOnce = ["revision.approved"];
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve"];
  const outcome = await runRevisionSessionCore(
    sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, new FakeGit(), events),
  );
  assert.equal(outcome.kind, "failed");
  assert.equal(revisionLifecycle(readRunLog(root, runId)).state, "candidate-pending", "provably absent: the approval never persisted");

  const prdPath = join(root, ".ai", "features", SLUG, `prd-${SLUG}.md`);
  const prdBefore = fileBytes(prdPath);
  const repair = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(repair), /no persisted approval/);
  assert.equal(fileBytes(prdPath), prdBefore, "zero promotion without a persisted approval");
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), []);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "no successor seed");
  rmSync(root, { recursive: true, force: true });
});

test("repair: step 0 — the approval is located in the re-read log FILE, absent or malformed refuses", () => {
  const root = fixture();
  const runId = "run-step0";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const absent = persistedApproval(readRunLog(root, runId), 1);
  assert.equal(absent.ok, false, "no approval in the file → no promotion authority");
  if (!absent.ok) assert.match(absent.reason, /persisted approval/);

  approvedState(root, runId, {});
  const onDisk = persistedApproval(readRunLog(root, runId), 1);
  assert.equal(onDisk.ok, true, "the verified-persisted approval is the authority");
  rmSync(root, { recursive: true, force: true });
});

test("repair: an approval that does not bind the pending candidate is corrupt evidence — refuse, zero promotion", async () => {
  const root = fixture();
  const runId = "run-incoherent";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  appendRevisionEvent(root, runId, t6RevisionStarted(runId));
  appendRevisionEvent(root, runId, t6RevisionCandidate(runId));
  appendRevisionEvent(
    root,
    runId,
    t6RevisionApproval(runId, { prdSha: "e".repeat(64), tasksSha: "f".repeat(64) }),
  );
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /does not bind the pending candidate/);
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), []);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B2b — a landed-but-unverified approval reconciles to ONE copy; the fresh-timestamp retry never duplicates", async () => {
  const root = fixture();
  const runId = "run-b2b-reconcile";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  appendRevisionEvent(root, runId, t6RevisionStarted(runId));
  appendRevisionEvent(root, runId, t6RevisionCandidate(runId));
  const sidecarDir = revisionSidecarDir(root, runId);
  mkdirSync(sidecarDir, { recursive: true });
  writeFileSync(join(sidecarDir, "candidate-prd.md"), CANDIDATE_PRD, "utf8");
  writeFileSync(join(sidecarDir, "candidate-tasks.md"), CANDIDATE_TASKS, "utf8");

  // The approval write LANDS, but strict verification fails (a concurrent
  // foreign line follows). Reconciliation finds the event canonically intact.
  const log = new RunLog(runLogPathOf(root, runId));
  const approval = t6RevisionApproval(runId);
  log.appendCritical(approval, {
    injectFaultAfterAppend: () => {
      appendFileSync(
        runLogPathOf(root, runId),
        `${JSON.stringify({ type: "phase.started", runId, phase: "foreign" })}\n`,
        "utf8",
      );
    },
  });
  const approvals = () => readRunLog(root, runId).filter((e) => e.type === "revision.approved");
  assert.equal(approvals().length, 1, "reconciliation leaves exactly one copy");

  // The same logical event retried with a REGENERATED timestamp: idempotent no-op.
  log.appendCritical({ ...approval, approvedBy: { ...approval.approvedBy, at: "2030-01-01T00:00:00.000Z" } });
  assert.equal(approvals().length, 1, "the fresh-timestamp retry does not duplicate");

  // The reconciled approval authorizes promotion — the repair completes.
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  assert.equal(approvals().length, 1, "still exactly one approval after the repair");
  rmSync(root, { recursive: true, force: true });
});

test("repair: an unreadable predecessor log fails before any promotion", async () => {
  const root = fixture();
  const runId = "run-unreadable-repair";
  mkdirSync(dirname(runLogPathOf(root, runId)), { recursive: true });
  mkdirSync(runLogPathOf(root, runId)); // the log path IS a directory
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "failed");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "no promotion, no seed");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B3 — completes the approved launch: archives the original, promotes with the marker, seeds, points, launches", async () => {
  const root = fixture();
  const runId = "run-b3";
  const state = approvedState(root, runId, {});
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched");
  if (outcome.kind !== "launched") throw new Error("expected launch");
  assert.deepEqual(outcome.archiveLosses, []);
  assert.equal(outcome.resumedPhase, "develop");
  assert.equal(outcome.successorRunId, successorRunId(runId));

  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
    "the pointer lands last, nothing else appended to P",
  );

  // The archive holds the EXACT original artifacts, written once.
  assert.equal(fileBytes(state.paths.archivePrd), `${MARKER}\n${PRD_BODY}`);
  assert.equal(fileBytes(state.paths.archiveTasks), `${MARKER}\n${TASKS_BODY}`);

  // Promotion uses the description marker rule; both hashes bind the contract.
  assert.equal(fileBytes(state.paths.prd), `${MARKER}\n${CANDIDATE_PRD}`);
  assert.equal(fileBytes(state.paths.tasks), `${MARKER}\n${CANDIDATE_TASKS}`);
  assert.equal(fileSha(state.paths.prd), CONTRACT.prdSha);
  assert.equal(fileSha(state.paths.tasks), CONTRACT.tasksSha);

  // The successor seed: exactly two deterministic events inheriting the originals
  // (the launcher's synchronous workflow.resumed marker follows them).
  const successorId = successorRunId(runId);
  const successorEvents = readRunLog(root, successorId);
  assert.deepEqual(successorEvents.map((e) => e.type), ["workflow.started", "spec.approved", "workflow.resumed"]);
  const sStarted = successorEvents[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  assert.equal(sStarted.runId, successorId);
  assert.equal(sStarted.workflow, "feature");
  assert.equal(sStarted.description, DESCRIPTION, "the ORIGINAL description");
  assert.equal(sStarted.baseline, "snap-base", "the ORIGINAL baseline — never re-snapshotted");
  assert.deepEqual(sStarted.stack, { primary: "nodejs", frameworks: ["express"] });
  assert.deepEqual(sStarted.revision, {
    predecessorRunId: runId,
    revision: 1,
    correction: "make auth optional",
  });
  assert.equal(sStarted.carriedUsage?.planner?.input, 100, "carriedUsage seeds from the predecessor replayed totals");
  assert.equal(sStarted.carriedUsage?.planner?.calls, 1);
  assert.equal("verify" in sStarted, false, "legacy absence is inherited, never invented");
  assert.equal("repoStateDigest" in sStarted, false);
  assert.equal("ignoreRulesDigest" in sStarted, false);
  const sSpec = successorEvents[1] as Extract<WorkflowEvent, { type: "spec.approved" }>;
  assert.equal(sSpec.prdSha, CONTRACT.prdSha);
  assert.equal(sSpec.tasksSha, CONTRACT.tasksSha);

  // The predecessor's own workflow.started gained nothing.
  const pStarted = readRunLog(root, runId)[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  assert.equal("carriedUsage" in pStarted, false);
  assert.equal("revision" in pStarted, false);

  // The launch request carried resumedPhase develop.
  assert.deepEqual(launcher.requests, [{ successorRunId: successorId, resumedPhase: "develop" }]);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4 — a crash with one artifact already promoted rewrites BOTH deterministically", async () => {
  const root = fixture();
  const runId = "run-b4";
  const state = approvedState(root, runId, { artifacts: "mixed-prd-promoted", archive: "valid" });
  assert.equal(fileSha(state.paths.tasks), BASE_CONTRACT.tasksSha, "staged: tasks not yet promoted");
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  assert.equal(fileSha(state.paths.prd), CONTRACT.prdSha);
  assert.equal(fileSha(state.paths.tasks), CONTRACT.tasksSha, "the transient mixture never executes");
  assert.equal(fileBytes(state.paths.archivePrd), `${MARKER}\n${PRD_BODY}`, "the verified archive copy survived");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4a — a verified archive is skipped, never rewritten (hash and mtime unchanged)", async () => {
  const root = fixture();
  const runId = "run-b4a-valid";
  const state = approvedState(root, runId, { archive: "valid" });
  const prdShaBefore = fileSha(state.paths.archivePrd);
  const tasksShaBefore = fileSha(state.paths.archiveTasks);
  const prdMtimeBefore = fileMtime(state.paths.archivePrd);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  assert.equal(fileSha(state.paths.archivePrd), prdShaBefore);
  assert.equal(fileSha(state.paths.archiveTasks), tasksShaBefore);
  assert.equal(fileMtime(state.paths.archivePrd), prdMtimeBefore, "not even touched");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4a — a damaged archive refuses repair byte-identically on the normal path", async () => {
  const root = fixture();
  const runId = "run-b4a-damaged";
  const state = approvedState(root, runId, { archive: "damaged" });
  const prdBytes = fileBytes(state.paths.archivePrd);
  const tasksBytes = fileBytes(state.paths.archiveTasks);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /does not hash to revision\.started\.baseContract/);
  assert.equal(fileBytes(state.paths.archivePrd), prdBytes, "never overwritten");
  assert.equal(fileBytes(state.paths.archiveTasks), tasksBytes);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "no seed after refusal");
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), []);
  assert.equal(fileSha(state.paths.prd), BASE_CONTRACT.prdSha, "artifacts untouched");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4a — a damaged archive refuses byte-identically on the step-1→5 skip path too", async () => {
  const root = fixture();
  const runId = "run-b4a-damaged-skip";
  const state = approvedState(root, runId, { archive: "damaged", artifacts: "promoted", sidecar: "damaged" });
  const prdBytes = fileBytes(state.paths.archivePrd);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /does not hash to revision\.started\.baseContract/);
  assert.equal(fileBytes(state.paths.archivePrd), prdBytes, "the skip path never overwrites either");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4a — a partial archive gains only the missing copy; the surviving copy is untouched", async () => {
  const root = fixture();
  const runId = "run-b4a-partial";
  const state = approvedState(root, runId, { archive: "only-prd" });
  const prdBytes = fileBytes(state.paths.archivePrd);
  const prdMtime = fileMtime(state.paths.archivePrd);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  assert.equal(fileBytes(state.paths.archivePrd), prdBytes, "the surviving copy is not rewritten");
  assert.equal(fileMtime(state.paths.archivePrd), prdMtime);
  assert.equal(
    fileBytes(state.paths.archiveTasks),
    `${MARKER}\n${TASKS_BODY}`,
    "only the missing copy was written, from the original artifact",
  );
  rmSync(root, { recursive: true, force: true });
});

test("repair: an absent archive with already-promoted artifacts reports the loss and proceeds — never archiving promoted contents as the original", async () => {
  const root = fixture();
  const runId = "run-loss-normal";
  const state = approvedState(root, runId, { artifacts: "promoted", archive: "none" });
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  if (outcome.kind !== "launched") throw new Error("expected launch");
  assert.equal(outcome.archiveLosses.length, 2);
  assert.match(outcome.archiveLosses[0]!, /previous-prd\.md/);
  assert.match(outcome.archiveLosses[0]!, /unrecoverable/);
  assert.match(outcome.archiveLosses[1]!, /previous-tasks\.md/);
  assert.equal(existsSync(state.paths.archivePrd), false, "promoted contents are NOT archived as the original contract");
  assert.equal(existsSync(state.paths.archiveTasks), false);
  rmSync(root, { recursive: true, force: true });
});

test("repair: the step-1→5 skip path with an absent archive reports the loss and completes (candidate lost, promoted artifacts valid)", async () => {
  const root = fixture();
  const runId = "run-loss-skip";
  const state = approvedState(root, runId, { artifacts: "promoted", archive: "none", sidecar: "damaged" });
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  if (outcome.kind !== "launched") throw new Error("expected launch");
  assert.equal(outcome.archiveLosses.length, 2, "the loss is reported explicitly even on the skip path");
  assert.equal(existsSync(state.paths.archivePrd), false);
  assert.deepEqual(
    readRunLog(root, successorRunId(runId)).map((e) => e.type),
    ["workflow.started", "spec.approved"],
    "the approved launch proceeds from the verified contract",
  );
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5 — promoted artifacts with no successor log gain the exact canonical seed", async () => {
  const root = fixture();
  const runId = "run-b5";
  const state = approvedState(root, runId, { artifacts: "promoted", archive: "valid" });
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  const successorId = successorRunId(runId);
  const successorEvents = readRunLog(root, successorId);
  assert.deepEqual(successorEvents.map((e) => e.type), ["workflow.started", "spec.approved"]);
  const sStarted = successorEvents[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  assert.equal(sStarted.baseline, "snap-base");
  assert.equal((successorEvents[1] as Extract<WorkflowEvent, { type: "spec.approved" }>).prdSha, CONTRACT.prdSha);
  assert.equal(fileSha(state.paths.prd), CONTRACT.prdSha);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — a started-only seed gains ONLY spec.approved; the verified prefix is never rewritten", async () => {
  const root = fixture();
  const runId = "run-b5a-partial";
  approvedState(root, runId, { archive: "valid", successor: "started-only" });
  const successorId = successorRunId(runId);
  const before = readRunLog(root, successorId);
  assert.deepEqual(before.map((e) => e.type), ["workflow.started"]);
  const startedJson = stableJson(before[0]!);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  const after = readRunLog(root, successorId);
  assert.deepEqual(after.map((e) => e.type), ["workflow.started", "spec.approved"], "only the missing event was appended");
  assert.equal(stableJson(after[0]!), startedJson, "the prefix byte-stable");
  assert.equal((after[1] as Extract<WorkflowEvent, { type: "spec.approved" }>).prdSha, CONTRACT.prdSha);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — an empty successor log file gains both seed events", async () => {
  const root = fixture();
  const runId = "run-b5a-empty";
  approvedState(root, runId, { archive: "valid", successor: "empty-file" });
  const successorId = successorRunId(runId);
  assert.equal(existsSync(runLogPathOf(root, successorId)), true);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched");
  assert.deepEqual(readRunLog(root, successorId).map((e) => e.type), ["workflow.started", "spec.approved"]);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — spec.approved without a preceding workflow.started is an impossible order — refuse byte-identically", async () => {
  const root = fixture();
  const runId = "run-b5a-spec-first";
  approvedState(root, runId, { archive: "valid", successor: "spec-first" });
  const successorPath = runLogPathOf(root, successorRunId(runId));
  const bytesBefore = fileBytes(successorPath);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /impossible order/);
  assert.equal(fileBytes(successorPath), bytesBefore, "never rewritten");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — ANY seed divergence refuses field-by-field without rewriting the log", async () => {
  const root = fixture();
  const runId = "run-b5a-divergent";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const events = readRunLog(root, runId);
  const predStarted = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> => event.type === "workflow.started",
  )!;
  const verdict = expectEligible(revisionEligibility(events));
  const seed = canonicalSuccessorSeed(predStarted, state.approval, verdict.usage);

  const divergences: Array<[string, WorkflowEvent[]]> = [
    ["workflow.started.description", [{ ...seed.started, description: "another feature" } as WorkflowEvent, seed.spec]],
    ["workflow.started.baseline", [{ ...seed.started, baseline: "fresh-snap" } as WorkflowEvent, seed.spec]],
    ["workflow.started.stack", [{ ...seed.started, stack: { primary: "python", frameworks: [] } } as WorkflowEvent, seed.spec]],
    ["workflow.started.carriedUsage (absent)", [{ ...seed.started, carriedUsage: {} } as WorkflowEvent, seed.spec]],
    [
      "workflow.started.carriedUsage.planner.input",
      [
        {
          ...seed.started,
          carriedUsage: { planner: { ...seed.started.carriedUsage!.planner!, input: 999 } },
        } as WorkflowEvent,
        seed.spec,
      ],
    ],
    [
      "workflow.started.revision.correction",
      [{ ...seed.started, revision: { ...seed.started.revision!, correction: "other" } } as WorkflowEvent, seed.spec],
    ],
    [
      "workflow.started.revision.revision",
      [{ ...seed.started, revision: { ...seed.started.revision!, revision: 2 } } as WorkflowEvent, seed.spec],
    ],
    [
      "workflow.started.verify (optional present unexpectedly)",
      [
        { ...seed.started, verify: { commands: [], scripts: {}, scriptsDigest: "x" } } as WorkflowEvent,
        seed.spec,
      ],
    ],
    ["spec.approved.prdSha (contract)", [seed.started, { ...seed.spec, prdSha: "a".repeat(64) } as WorkflowEvent]],
    [
      "unrelated log",
      [{ type: "workflow.started", runId: successorId, workflow: "feature", description: "unrelated", baseline: "x" } as WorkflowEvent],
    ],
    [
      "non-seed event before spec.approved",
      [seed.started, { type: "phase.started", runId: successorId, phase: "develop" } as WorkflowEvent],
    ],
  ];
  for (const [label, logEvents] of divergences) {
    writeFileSync(runLogPathOf(root, successorId), `${logEvents.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
    const bytesBefore = fileBytes(runLogPathOf(root, successorId));
    const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
    if (outcome.kind !== "refused") throw new Error(`${label}: expected a refusal, got ${outcome.kind}`);
    assert.match(outcome.reason, /diverges|impossible order/, `${label}: divergence named`);
    assert.equal(fileBytes(runLogPathOf(root, successorId)), bytesBefore, `${label}: the log was never rewritten`);
  }
  // The lifecycle never advanced: still approved-pending-launch after every refusal.
  assert.equal(revisionLifecycle(readRunLog(root, runId)).state, "approved-pending-launch");
  rmSync(root, { recursive: true, force: true });
});

test("seed verification: trailing legitimate markers (workflow.resumed, phase.started) are not a collision", () => {
  const predStarted = {
    type: "workflow.started",
    runId: "run-x",
    workflow: "feature",
    description: DESCRIPTION,
    baseline: "snap-base",
  } as Extract<WorkflowEvent, { type: "workflow.started" }>;
  const seed = canonicalSuccessorSeed(predStarted, t6RevisionApproval("run-x"), {});
  const successorId = seed.started.runId;
  const events: WorkflowEvent[] = [
    seed.started,
    seed.spec,
    { type: "workflow.resumed", runId: successorId, phase: "develop" },
    { type: "phase.started", runId: successorId, phase: "develop" },
  ];
  assert.equal(verifySuccessorSeed(events, seed).status, "complete", "the prefix matches; trailing B7c markers are legitimate");
  const partial = verifySuccessorSeed(events.slice(0, 1), seed);
  assert.equal(partial.status, "missing-spec");
});

test("repair: B6 — the pointer is appended idempotently once the seed exists, then launch proceeds", async () => {
  const root = fixture();
  const runId = "run-b6";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid", successor: "full" });
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched");
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
    "exactly one pointer",
  );
  assert.deepEqual(launcher.requests, [{ successorRunId: successorRunId(runId), resumedPhase: "develop" }]);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B7a — reachable from launched via launchIncomplete; the seed is created once, never duplicated", async () => {
  const root = fixture();
  const runId = "run-b7a";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid", pointer: true });
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched", "the pointer proves intent, not a run — repair completes it");
  const successorId = successorRunId(runId);
  const successorEvents = readRunLog(root, successorId);
  assert.deepEqual(successorEvents.map((e) => e.type), ["workflow.started", "spec.approved", "workflow.resumed"]);
  assert.equal(successorEvents.filter((e) => e.type === "workflow.started").length, 1, "never a second workflow.started");
  assert.equal(readRunLog(root, runId).filter((e) => e.type === "revision.launched").length, 1, "the pointer is not duplicated");
  assert.deepEqual(launcher.requests, [{ successorRunId: successorId, resumedPhase: "develop" }]);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B7b — the seeded stub without workflow.resumed launches with resumedPhase develop; exactly one marker lands", async () => {
  const root = fixture();
  const runId = "run-b7b";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid", pointer: true, successor: "full" });
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched");
  if (outcome.kind !== "launched") throw new Error("expected launch");
  assert.equal(outcome.resumedPhase, "develop");
  assert.deepEqual(launcher.requests, [{ successorRunId: successorRunId(runId), resumedPhase: "develop" }]);
  const markers = readRunLog(root, successorRunId(runId)).filter((e) => e.type === "workflow.resumed");
  assert.equal(markers.length, 1);
  assert.equal((markers[0] as Extract<WorkflowEvent, { type: "workflow.resumed" }>).phase, "develop");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B7c — an existing workflow.resumed omits resumedPhase; at most one marker ever", async () => {
  const root = fixture();
  const runId = "run-b7c";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid", pointer: true, successor: "full+resumed" });
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched");
  if (outcome.kind !== "launched") throw new Error("expected launch");
  assert.equal(outcome.resumedPhase, undefined, "B7c: the request OMITS resumedPhase");
  assert.deepEqual(launcher.requests, [{ successorRunId: successorRunId(runId) }], "no resumedPhase key at all");
  assert.equal(
    readRunLog(root, successorRunId(runId)).filter((e) => e.type === "workflow.resumed").length,
    1,
    "no second marker",
  );
  rmSync(root, { recursive: true, force: true });
});

test("repair: run twice — stable state, no duplicated events (idempotence)", async () => {
  const root = fixture();
  const runId = "run-twice";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid", pointer: true, successor: "full" });
  const launcher = new RecordingLauncher(root); // never emits phase.started: the launch stays incomplete
  const first = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(first.kind, "launched");
  const successorPath = runLogPathOf(root, successorRunId(runId));
  const successorBytes = fileBytes(successorPath);
  const predecessorBytes = fileBytes(runLogPathOf(root, runId));
  const second = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(second.kind, "launched");
  assert.equal(fileBytes(successorPath), successorBytes, "the successor log is stable");
  assert.equal(fileBytes(runLogPathOf(root, runId)), predecessorBytes, "the predecessor log is stable");
  assert.equal(readRunLog(root, runId).filter((e) => e.type === "revision.launched").length, 1);
  assert.equal(readRunLog(root, successorRunId(runId)).filter((e) => e.type === "workflow.started").length, 1);
  assert.equal(readRunLog(root, successorRunId(runId)).filter((e) => e.type === "workflow.resumed").length, 1);
  assert.equal(launcher.requests.length, 2);
  rmSync(root, { recursive: true, force: true });
});

test("repair: a successor that already recorded phase.started refuses and points at the successor", async () => {
  const root = fixture();
  const runId = "run-complete";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid", pointer: true, successor: "full" });
  const successorId = successorRunId(runId);
  RunLog.open(root, successorId).append({ type: "phase.started", runId: successorId, phase: "develop" } as WorkflowEvent);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /already recorded its first phase/);
  assert.match(reason, new RegExp(successorId), "the refusal names the successor");
  rmSync(root, { recursive: true, force: true });
});

test("repair: a launch-port failure keeps the state repairable (pointer precedes launch-completion)", async () => {
  const root = fixture();
  const runId = "run-launch-fail";
  approvedState(root, runId, { artifacts: "promoted", archive: "valid" });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), async () => {
      throw new Error("injected launcher failure");
    }),
  );
  assert.equal(outcome.kind, "failed");
  // The pointer persisted; the lifecycle is launched-with-incomplete-launch → repairable again.
  assert.equal(revisionLifecycle(readRunLog(root, runId)).state, "launched");
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root)?.type, "revision_launch_incomplete");
  const retry = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(retry.kind, "launched", "the retry completes the launch");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B8 — candidate and promoted artifacts both invalid refuse execution; declining keeps the block", async () => {
  const root = fixture();
  const runId = "run-b8-decline";
  const state = approvedState(root, runId, { sidecar: "damaged", artifacts: "foreign", archive: "none" });
  const human = new ScriptedHuman();
  human.selects = ["leave"];
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, human, async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /neither the candidate sidecar nor the promoted artifacts verify/);
  assert.match(reason, /found prd/, "the refusal reports the actual hashes");
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), [], "no execution");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  assert.equal(fileBytes(state.paths.prd), `${MARKER}\nsomeone edited this`, "no implicit restore");
  assert.equal(revisionLifecycle(readRunLog(root, runId)).state, "approved-pending-launch", "declining keeps the block");

  // A dismissed decision also refuses without touching anything.
  const dismissed = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(dismissed), /decision dismissed/);
  assert.equal(revisionLifecycle(readRunLog(root, runId)).state, "approved-pending-launch");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B8 — forced abandonment reports untouched artifacts, lifts the block, keeps the sidecar archive", async () => {
  const root = fixture();
  const runId = "run-b8-untouched";
  const state = approvedState(root, runId, { sidecar: "damaged", artifacts: "original", archive: "valid" });
  const human = new ScriptedHuman();
  human.selects = ["force"];
  const prdBytes = fileBytes(state.paths.prd);
  const tasksBytes = fileBytes(state.paths.tasks);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, human, async () => {}));
  assert.equal(outcome.kind, "abandoned-forced");
  if (outcome.kind !== "abandoned-forced") throw new Error("expected forced abandonment");
  assert.equal(outcome.revision, 1);
  assert.equal(outcome.artifactState, "untouched");
  assert.match(outcome.report, /still hash to the predecessor's old contract/);
  assert.match(outcome.report, /depends on the predecessor's own status/, "never promises resume");
  assert.equal(fileBytes(state.paths.prd), prdBytes, "no rollback");
  assert.equal(fileBytes(state.paths.tasks), tasksBytes);
  const abandoned = readRunLog(root, runId).find((e) => e.type === "revision.abandoned") as
    | { reason?: string }
    | undefined;
  assert.equal(abandoned?.reason, "approval contents unrecoverable");
  assert.equal(existsSync(state.paths.archivePrd), true, "the sidecar archive is kept for manual restoration");
  assert.equal(existsSync(state.paths.archiveTasks), true);
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root), undefined, "the lifecycle block is lifted");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "nothing launched");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B8 — forced abandonment reports indeterminate state with both sha sets; no rollback, no partial-code changes", async () => {
  const root = fixture();
  const runId = "run-b8-indeterminate";
  const state = approvedState(root, runId, { sidecar: "damaged", artifacts: "foreign", archive: "none" });
  const human = new ScriptedHuman();
  human.selects = ["force"];
  const prdBytes = fileBytes(state.paths.prd);
  const tasksBytes = fileBytes(state.paths.tasks);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, human, async () => {}));
  assert.equal(outcome.kind, "abandoned-forced");
  if (outcome.kind !== "abandoned-forced") throw new Error("expected forced abandonment");
  assert.equal(outcome.artifactState, "indeterminate");
  assert.match(outcome.report, /NOT known-good/);
  assert.match(outcome.report, new RegExp(`${BASE_CONTRACT.prdSha.slice(0, 12)}`), "the expected sha is printed");
  assert.match(outcome.report, new RegExp(`${sha(`${MARKER}\nsomeone edited this`).slice(0, 12)}`), "the actual sha is printed");
  assert.match(outcome.report, /No rollback was attempted/);
  assert.equal(fileBytes(state.paths.prd), prdBytes, "no implicit restore");
  assert.equal(fileBytes(state.paths.tasks), tasksBytes);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "nothing launched");
  rmSync(root, { recursive: true, force: true });
});

test("promotion: the session approval authorizes the launch repair end-to-end (T5 → T6 handoff)", async () => {
  const root = fixture();
  const runId = "run-e2e";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  human.selects = ["approve"];
  const session = await runRevisionSessionCore(
    sessionDeps(root, runId, new ScriptedPlanner({ text: VALID_PLAN_A }), human, new FakeGit()),
  );
  assert.equal(session.kind, "approved");
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, human, (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched");
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
  );
  assert.deepEqual(
    readRunLog(root, successorRunId(runId)).map((e) => e.type),
    ["workflow.started", "spec.approved", "workflow.resumed"],
  );
  const featureDir = join(root, ".ai", "features", SLUG);
  assert.equal(fileSha(join(featureDir, `prd-${SLUG}.md`)), CONTRACT.prdSha);
  assert.equal(fileSha(join(featureDir, `tasks-${SLUG}.md`)), CONTRACT.tasksSha);
  assert.equal(fileBytes(join(revisionSidecarDir(root, runId), "previous-prd.md")), `${MARKER}\n${PRD_BODY}`);
  rmSync(root, { recursive: true, force: true });
});

test("repair: a held lock refuses without promotion", async () => {
  const root = fixture();
  const runId = "run-lock-repair";
  approvedState(root, runId, {});
  const lock = acquireRunLock(root, { runId: "other", workflow: "other" });
  assert.equal(lock.ok, true);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /held by/);
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// T6 review fixes — B4 slug recovery, B5a internal corruption, B4a unreadable
// archive (each regression mirrors a reproduced review defect)
// ---------------------------------------------------------------------------

/** The canonical successor seed derived exactly as the repair derives it. */
function canonicalSeedOf(root: string, runId: string, approval: ApprovedState["approval"]) {
  const events = readRunLog(root, runId);
  const predStarted = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> => event.type === "workflow.started",
  )!;
  const verdict = expectEligible(revisionEligibility(events));
  return canonicalSuccessorSeed(predStarted, approval, verdict.usage);
}

test("repair: B4 — a PRD truncated mid-marker still recovers (candidate and archive valid)", async () => {
  const root = fixture();
  const runId = "run-b4-truncated-prd";
  const state = approvedState(root, runId, { archive: "valid" });
  // A real truncation: the crash cut the file INSIDE the description marker,
  // so the gate-time marker lookup cannot recognize the directory anymore.
  writeFileSync(state.paths.prd, MARKER.slice(0, 12), "utf8");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  const launcher = new RecordingLauncher(root);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(outcome.kind, "launched", "B4 recovery must not depend on an intact PRD marker");
  assert.equal(fileSha(state.paths.prd), CONTRACT.prdSha, "the truncated PRD was rewritten from the candidate");
  assert.equal(fileSha(state.paths.tasks), CONTRACT.tasksSha);
  assert.equal(fileBytes(state.paths.archivePrd), `${MARKER}\n${PRD_BODY}`, "the verified archive survived");
  assert.deepEqual(
    readRunLog(root, successorRunId(runId)).map((e) => e.type),
    ["workflow.started", "spec.approved", "workflow.resumed"],
  );
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4 — an empty PRD and a marker-less tasks file refuse: no verifiable directory identity, no writes", async () => {
  const root = fixture();
  const runId = "run-b4-both-markerless";
  const state = approvedState(root, runId, { archive: "valid" });
  // Both artifacts lost their markers. This state is unreachable from the
  // promotion sequence (every crash point leaves one artifact intact under
  // our marker), so it is external damage: no directory identity is
  // provable, and the repair must not guess by name.
  writeFileSync(state.paths.prd, "", "utf8");
  writeFileSync(state.paths.tasks, "truncated garbage without any marker", "utf8");
  const prdBytes = fileBytes(state.paths.prd);
  const tasksBytes = fileBytes(state.paths.tasks);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /cannot locate/);
  assert.match(reason, /never guesses a directory by its name/);
  assert.equal(fileBytes(state.paths.prd), prdBytes, "refusing writes nothing");
  assert.equal(fileBytes(state.paths.tasks), tasksBytes);
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), []);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4 — a directory that merely matches the description's slug shape is never adopted (another feature's artifacts stay byte-identical)", async () => {
  const root = fixture();
  const runId = "run-b4-foreign-slug-dir";
  const state = approvedState(root, runId, { archive: "valid" });
  // The REAL artifacts live in a title-named directory (the gate can name
  // directories from the planner TITLE), both truncated past their marker.
  const featureRoot = join(root, ".ai", "features");
  const actualDir = join(featureRoot, "planner-chosen-title");
  mkdirSync(actualDir, { recursive: true });
  writeFileSync(join(actualDir, "prd-planner-chosen-title.md"), MARKER.slice(0, 12), "utf8");
  writeFileSync(join(actualDir, "tasks-planner-chosen-title.md"), MARKER.slice(0, 12), "utf8");
  // An UNRELATED feature happens to own the description-shaped directory
  // (add-user-auth), with ITS OWN intact markers — the tempting wrong target.
  const foreignMarker = descriptionMarker("add user auth for a different feature");
  const foreignPrd = `${foreignMarker}\nforeign PRD`;
  const foreignTasks = `${foreignMarker}\nforeign tasks`;
  writeFileSync(state.paths.prd, foreignPrd, "utf8");
  writeFileSync(state.paths.tasks, foreignTasks, "utf8");
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /cannot locate/);
  assert.match(reason, /never guesses a directory by its name/);
  assert.equal(fileBytes(state.paths.prd), foreignPrd, "the other feature's PRD is never overwritten");
  assert.equal(fileBytes(state.paths.tasks), foreignTasks, "the other feature's TASKS are never overwritten");
  assert.equal(existsSync(join(actualDir, "prd-planner-chosen-title.md")), true);
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), [], "no launch over a guessed directory");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  rmSync(root, { recursive: true, force: true });
});

test("repair: two directories with the same PRD description marker refuse as ambiguous — identity is never 'first match'", async () => {
  const root = fixture();
  const runId = "run-b4-prd-ambiguous";
  const state = approvedState(root, runId, {});
  // A twin directory whose PRD verifies the SAME description marker: the
  // gate-time lookup would silently promote into the first match.
  const twin = join(root, ".ai", "features", `${SLUG}-2`);
  mkdirSync(twin, { recursive: true });
  writeFileSync(join(twin, `prd-${SLUG}-2.md`), `${MARKER}\nTwin PRD.`, "utf8");
  writeFileSync(join(twin, `tasks-${SLUG}-2.md`), `${MARKER}\nTwin tasks.`, "utf8");
  const ourPrd = fileBytes(state.paths.prd);
  const ourTasks = fileBytes(state.paths.tasks);
  const twinPrd = fileBytes(join(twin, `prd-${SLUG}-2.md`));
  const twinTasks = fileBytes(join(twin, `tasks-${SLUG}-2.md`));
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /ambiguous/);
  assert.match(reason, /description marker/);
  assert.equal(fileBytes(state.paths.prd), ourPrd, "the first-match directory is never written");
  assert.equal(fileBytes(state.paths.tasks), ourTasks);
  assert.equal(fileBytes(join(twin, `prd-${SLUG}-2.md`)), twinPrd, "the twin is never written either");
  assert.equal(fileBytes(join(twin, `tasks-${SLUG}-2.md`)), twinTasks);
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), [], "no pointer");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "no seed");
  rmSync(root, { recursive: true, force: true });
});

test("repair: several directories verifying the tasks marker refuse as ambiguous", async () => {
  const root = fixture();
  const runId = "run-b4-ambiguous";
  const state = approvedState(root, runId, {});
  // Damage the PRD so the primary lookup fails; two directories then verify
  // the tasks marker — identity is ambiguous, fail-closed.
  writeFileSync(state.paths.prd, MARKER.slice(0, 12), "utf8");
  const twin = join(root, ".ai", "features", `${SLUG}-2`);
  mkdirSync(twin, { recursive: true });
  writeFileSync(join(twin, `prd-${SLUG}-2.md`), "no marker", "utf8");
  writeFileSync(join(twin, `tasks-${SLUG}-2.md`), `${MARKER}\nTwin.`, "utf8");
  const tasksBytes = fileBytes(state.paths.tasks);
  const twinBytes = fileBytes(join(twin, `tasks-${SLUG}-2.md`));
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /ambiguous/);
  assert.equal(fileBytes(state.paths.tasks), tasksBytes);
  assert.equal(fileBytes(join(twin, `tasks-${SLUG}-2.md`)), twinBytes);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a/AC-13 — internal corruption inside the seed refuses without rewriting the log", async () => {
  const root = fixture();
  const runId = "run-b5a-corrupt";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  writeFileSync(
    runLogPathOf(root, successorId),
    `${JSON.stringify(seed.started)}\n{broken interior\n${JSON.stringify(seed.spec)}\n`,
    "utf8",
  );
  const bytesBefore = fileBytes(runLogPathOf(root, successorId));
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /is corrupt/);
  assert.match(reason, /line 2/, "the refusal names the offending line");
  assert.equal(fileBytes(runLogPathOf(root, successorId)), bytesBefore, "never rewritten");
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), [], "no launch over corruption");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — a torn append of a canonical seed line is completed, and its healed shape never bricks re-entry", async () => {
  const root = fixture();
  const runId = "run-b5a-torn-tail";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  // Crash mid-append: the spec.approved line is a strict PREFIX, no newline.
  writeFileSync(runLogPathOf(root, successorId), `${JSON.stringify(seed.started)}\n${JSON.stringify(seed.spec).slice(0, 24)}`, "utf8");
  const launcher = new RecordingLauncher(root); // never emits phase.started → launch stays incomplete
  const first = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(first.kind, "launched", "the allowed torn tail is completed, not refused");
  assert.deepEqual(
    readRunLog(root, successorId).map((e) => e.type),
    ["workflow.started", "spec.approved", "workflow.resumed"],
    "only spec.approved was appended to the torn prefix (the resumed marker comes from the launcher)",
  );
  // The healed shape (torn prefix line BEFORE the completed event) must not
  // brick a re-entry: it is exactly what the healing discipline leaves.
  const second = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), (req) => launcher.run(req)));
  assert.equal(second.kind, "launched", "the healed torn line is tolerated as a canonical-line prefix");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — a healed torn seed line inside a complete seed is tolerated without rewriting", async () => {
  const root = fixture();
  const runId = "run-b5a-healed";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  writeFileSync(
    runLogPathOf(root, successorId),
    `${JSON.stringify(seed.started)}\n${JSON.stringify(seed.spec).slice(0, 24)}\n${JSON.stringify(seed.spec)}\n`,
    "utf8",
  );
  const bytesBefore = fileBytes(runLogPathOf(root, successorId));
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched", "the torn prefix is inert: the canonical spec.approved is present and verified");
  assert.equal(fileBytes(runLogPathOf(root, successorId)), bytesBefore, "the complete seed is reused, never rewritten (no launcher append)");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — a torn spec.approved append BEFORE workflow.started is an impossible order — refuse byte-identically", async () => {
  const root = fixture();
  const runId = "run-b5a-order";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  writeFileSync(
    runLogPathOf(root, successorId),
    `${JSON.stringify(seed.spec).slice(0, 30)}\n${JSON.stringify(seed.started)}\n${JSON.stringify(seed.spec)}\n`,
    "utf8",
  );
  const bytesBefore = fileBytes(runLogPathOf(root, successorId));
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /impossible seed order/);
  assert.match(reason, /torn append of the canonical spec\.approved line/);
  assert.equal(fileBytes(runLogPathOf(root, successorId)), bytesBefore, "never rewritten");
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), [], "no launch over an impossible order");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — a SHORT shared-prefix torn tail is completed (the prefix names no event; the open window decides)", async () => {
  const root = fixture();
  const runId = "run-b5a-shared-tail";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  // `{"type":"` — shorter than the canonical lines' common head: a prefix of
  // BOTH seed lines, so it names no event by itself.
  const shared = JSON.stringify(seed.spec).slice(0, 9);
  assert.equal(shared, `{"type":"`);
  assert.equal(JSON.stringify(seed.started).startsWith(shared), true, "fixture: genuinely shared");
  writeFileSync(runLogPathOf(root, successorId), `${JSON.stringify(seed.started)}\n${shared}`, "utf8");
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(
    outcome.kind,
    "launched",
    "the ambiguous tail sits between the two lines: the only possible append there is spec.approved",
  );
  assert.deepEqual(readRunLog(root, successorId).map((e) => e.type), ["workflow.started", "spec.approved"]);
  rmSync(root, { recursive: true, force: true });
});

test("repair: B5a — a healed SHORT shared-prefix line inside the seed is tolerated without rewriting", async () => {
  const root = fixture();
  const runId = "run-b5a-shared-healed";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  const shared = JSON.stringify(seed.started).slice(0, 9); // `{"type":"`
  writeFileSync(
    runLogPathOf(root, successorId),
    `${JSON.stringify(seed.started)}\n${shared}\n${JSON.stringify(seed.spec)}\n`,
    "utf8",
  );
  const bytesBefore = fileBytes(runLogPathOf(root, successorId));
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched", "the healed shared prefix is inert: the canonical seed is present and verified");
  assert.equal(fileBytes(runLogPathOf(root, successorId)), bytesBefore, "the complete seed is reused, never rewritten");
  rmSync(root, { recursive: true, force: true });
});

test("repair: malformed lines after the verified seed are the successor's ordinary execution tail", async () => {
  const root = fixture();
  const runId = "run-b5a-post-seed";
  const state = approvedState(root, runId, { archive: "valid" });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId, state.approval);
  writeFileSync(
    runLogPathOf(root, successorId),
    `${JSON.stringify(seed.started)}\n${JSON.stringify(seed.spec)}\n{"type":"phase.star`,
    "utf8",
  );
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(outcome.kind, "launched", "post-seed torn tails keep the existing crash tolerance");
  rmSync(root, { recursive: true, force: true });
});

test("seed corruption: classification distinguishes torn appends, internal garbage and the post-seed tail", () => {
  const predStarted = {
    type: "workflow.started",
    runId: "run-x",
    workflow: "feature",
    description: DESCRIPTION,
    baseline: "snap-base",
  } as Extract<WorkflowEvent, { type: "workflow.started" }>;
  const seed = canonicalSuccessorSeed(predStarted, t6RevisionApproval("run-x"), {});
  const startedLine = JSON.stringify(seed.started);
  const specLine = JSON.stringify(seed.spec);

  // Internal garbage inside the seed → corruption.
  assert.match(successorSeedCorruption(`${startedLine}\ngarbage\n${specLine}\n`, seed)!, /line 2 is corrupt/);
  // Garbage-only log → corruption (an empty-seed append must never sit on garbage).
  assert.match(successorSeedCorruption(`garbage\n`, seed)!, /line 1 is corrupt/);
  // A divergent-but-parseable line is NOT this scanner's concern (seed divergence does that).
  assert.equal(successorSeedCorruption(`${startedLine}\n${specLine}\n{"type":"phase.started","runId":"x"}\n`, seed), undefined);
  // Torn appends in their OWN append window → tolerated.
  assert.equal(successorSeedCorruption(`${startedLine}\n${specLine.slice(0, 20)}\n${specLine}\n`, seed), undefined);
  assert.equal(successorSeedCorruption(`${startedLine.slice(0, 30)}\n${specLine}\n`, seed), undefined);
  // A SHORT prefix below the common head (`{"type":"`) is shared by BOTH
  // canonical lines and names no event by itself: the open window classifies
  // it — before started → a torn started append; between the lines → a torn
  // spec append; after the seed → the ordinary execution tail.
  const shared = specLine.slice(0, 9);
  assert.equal(shared, `{"type":"`, "fixture: the prefix really is the common head");
  assert.equal(startedLine.startsWith(shared), true);
  assert.equal(successorSeedCorruption(`${startedLine}\n${shared}`, seed), undefined, "shared torn tail in the spec window");
  assert.equal(
    successorSeedCorruption(`${startedLine}\n${shared}\n${specLine}\n`, seed),
    undefined,
    "healed shared prefix in the spec window",
  );
  assert.equal(successorSeedCorruption(`${shared}\n${startedLine}\n${specLine}\n`, seed), undefined, "shared torn head in the started window");
  assert.equal(successorSeedCorruption(`{\n${startedLine}\n${specLine}\n`, seed), undefined, "a one-character shared prefix too");
  // A torn prefix OUTSIDE its window is an impossible seed order → refuse
  // (unambiguous prefixes only: a shared prefix always has an open window).
  assert.match(
    successorSeedCorruption(`${specLine.slice(0, 20)}\n${startedLine}\n${specLine}\n`, seed)!,
    /impossible seed order/,
    "a spec.approved append cannot precede workflow.started",
  );
  assert.match(
    successorSeedCorruption(`${startedLine}\n${startedLine.slice(0, 30)}\n${specLine}\n`, seed)!,
    /impossible seed order/,
    "workflow.started is never appended twice",
  );
  // Malformed lines after the completed seed → the ordinary execution tail.
  assert.equal(successorSeedCorruption(`${startedLine}\n${specLine}\ngarbage\n`, seed), undefined);
  // Truncated multi-byte garbage that matches no canonical prefix → corruption.
  assert.match(successorSeedCorruption(`${startedLine}\n${specLine.slice(0, 20)}???\n${specLine}\n`, seed)!, /corrupt/);
});

test("repair: B4a — an archive that exists but cannot be read refuses on the normal path", async () => {
  const root = fixture();
  const runId = "run-b4a-archive-eisdir";
  const state = approvedState(root, runId, { artifacts: "promoted", archive: "none" });
  mkdirSync(state.paths.archivePrd); // previous-prd.md present AS a directory
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  const reason = expectRepairRefusal(outcome);
  assert.match(reason, /exists but cannot be read/);
  assert.match(reason, /never bypassed as absent/);
  assert.deepEqual(revisionTypes(root, runId).filter((t) => t === "revision.launched"), [], "no launch, no false loss report");
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  assert.equal(existsSync(state.paths.archiveTasks), false, "nothing archived from promoted contents");
  rmSync(root, { recursive: true, force: true });
});

test("repair: B4a — an unreadable archive refuses on the step-1→5 skip path too", async () => {
  const root = fixture();
  const runId = "run-b4a-archive-eisdir-skip";
  const state = approvedState(root, runId, { artifacts: "promoted", sidecar: "damaged", archive: "none" });
  mkdirSync(state.paths.archivePrd);
  const outcome = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.match(expectRepairRefusal(outcome), /exists but cannot be read/);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// T7 — successor construction and the real launch (spec.md §7 step 7, §10, §13)
// ---------------------------------------------------------------------------

const REVISION_CORRECTION = "make auth optional";
/** The patch the launch-time git reports (stable across the launch checks). */
const LAUNCH_PATCH = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+work";

/** Valid freeze over an empty manifest: changedScriptKeys finds nothing to compare. */
const EMPTY_FREEZE: VerifyFreeze = {
  commands: [],
  scripts: {},
  scriptsDigest: digestScripts({}),
  perimeter: "root",
};

const carriedTotals = (input: number, output: number) => ({
  input,
  output,
  models: [],
  calls: 1,
  coverage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0, elapsedMs: 0 },
});

/**
 * The successor's git: `baseline` THROWS, because the successor must never
 * re-snapshot — the original baseline is rebuilt from the seeded stub.
 */
class NoRebaselineGit implements GitService {
  digest = "stable-digest";
  patch = LAUNCH_PATCH;
  baselineCalls = 0;
  failDiff = false;
  readStateFails = false;
  async baseline(): Promise<GitBaseline> {
    this.baselineCalls += 1;
    throw new Error("git.baseline MUST NOT be called on a successor — the original baseline is persisted");
  }
  async repoStateDigest(): Promise<string> {
    if (this.readStateFails) throw new Error("git for-each-ref failed (128): fatal: not a git repository");
    return this.digest;
  }
  async diffSince(): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    if (this.failDiff) throw new Error("baseline commit vanished");
    return { patch: this.patch, files: ["src/a.ts"], dirtySubmodules: [] };
  }
}

/**
 * Fake successor agents: prompts are recorded; the developer pass can be
 * held mid-run (the lock-handoff observation) or made to fail after its
 * phase.started. The reviewer approves with nothing blocking, so a healthy
 * successor runs to completion.
 */
class SuccessorAgents implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  #releaseDeveloper?: () => void;
  #resolveDeveloperStarted?: () => void;
  #failDeveloper = false;
  /** Gate the developer pass: call BEFORE the launch so the pass waits. */
  holdDeveloper(): Promise<void> {
    return new Promise((resolve) => {
      this.#releaseDeveloper = resolve;
    });
  }
  get developerStarted(): Promise<void> {
    return new Promise((resolve) => {
      this.#resolveDeveloperStarted = resolve;
    });
  }
  releaseDeveloper(): void {
    this.#releaseDeveloper?.();
  }
  failDeveloper(): void {
    this.#failDeveloper = true;
  }
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    if (request.role === "developer") {
      this.#resolveDeveloperStarted?.();
      if (this.#failDeveloper) throw new Error("provider died mid-pass");
      await this.#releaseDeveloper;
      return { role: "developer", text: "work done", aborted: false, usage: { input: 50, output: 25 } };
    }
    return {
      role: "reviewer",
      text: "",
      aborted: false,
      structured: { verdict: "approved", summary: "ok", issues: [] },
      usage: { input: 30, output: 15 },
    };
  }
}

const PROFILES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");

/**
 * A ScriptedHuman that runs a hook every time a dialog opens — the hook is
 * where a test mutates the tree (or the git state) to model work moving
 * WHILE the user is looking at the dialog.
 */
class DialogMutationHuman extends ScriptedHuman {
  #onSelect: () => void;
  constructor(onSelect: () => void) {
    super();
    this.#onSelect = onSelect;
  }
  async select(q: SelectQuestion): Promise<string> {
    this.#onSelect();
    return super.select(q);
  }
}

function successorDeps(
  root: string,
  opts: { git?: GitService; human?: HumanInput; agents?: SuccessorAgents; stackOverride?: boolean } = {},
): { deps: SuccessorLaunchDeps; agents: SuccessorAgents; git: NoRebaselineGit; detached: Array<Promise<void>> } {
  const agents = opts.agents ?? new SuccessorAgents();
  const git = opts.git instanceof NoRebaselineGit ? opts.git : new NoRebaselineGit();
  const human = opts.human ?? new ScriptedHuman();
  const detached: Array<Promise<void>> = [];
  const deps: SuccessorLaunchDeps = {
    cwd: root,
    config: { ...DEFAULT_CONFIG, ...(opts.stackOverride === false ? {} : { stack: "nodejs" }) },
    profilesDir: PROFILES_DIR,
    availableSkills: new Set<string>(),
    agents,
    human,
    verifier: { run: async () => [] } satisfies VerifyRunner,
    git,
    history: () => {},
    setStatus: () => {},
    notify: () => {},
    bell: () => {},
    onDetached: (run) => detached.push(run),
  };
  return { deps, agents, git, detached };
}

/** Records the launch requests the repair issues, then runs the REAL launcher. */
function realLaunch(
  deps: SuccessorLaunchDeps,
  requests: SuccessorLaunchRequest[],
): (request: SuccessorLaunchRequest, context: SuccessorLaunchContext) => Promise<void> {
  return async (request, context) => {
    requests.push(request);
    await launchSuccessorRun(deps, request, context);
  };
}

/**
 * A cancelled predecessor with FULL guards (ignore-rules digest, repository
 * state digest, verify freeze), carried usage on two roles, and revision 1
 * approved against CANDIDATE/CONTRACT with candidate sidecar files present.
 * `partialPatchSha` optionally binds the launch-time git's patch (§10).
 */
function approvedSuccessorChain(
  root: string,
  runId: string,
  opts: { partialPatchSha?: string; freeze?: VerifyFreeze } = {},
): void {
  const spec = writeArtifacts(root);
  writePredecessorLog(root, runId, [
    {
      type: "workflow.started",
      runId,
      workflow: "feature",
      description: DESCRIPTION,
      baseline: "snap-base",
      stack: { primary: "nodejs", frameworks: ["express"] },
      ignoreRulesDigest: "rules-1",
      repoStateDigest: "stable-digest",
      verify: opts.freeze ?? EMPTY_FREEZE,
    },
    { type: "phase.started", runId, phase: "discover" },
    { type: "phase.started", runId, phase: "spec" },
    { type: "agent.completed", runId, role: "planner", usage: { input: 100, output: 50 } },
    { type: "spec.approved", runId, ...spec },
    { type: "phase.started", runId, phase: "develop" },
    { type: "agent.completed", runId, role: "developer", usage: { input: 200, output: 100 } },
    { type: "workflow.outcome", runId, status: "cancelled" },
  ]);
  appendRevisionEvent(
    root,
    runId,
    withEventId({
      type: "revision.started" as const,
      runId,
      revision: 1,
      correction: REVISION_CORRECTION,
      correctionSha: sha(REVISION_CORRECTION),
      baseContract: BASE_CONTRACT,
      ...(opts.partialPatchSha !== undefined ? { partialPatchSha: opts.partialPatchSha } : {}),
      at: "2026-01-01T00:00:00.000Z",
    }),
  );
  appendRevisionEvent(root, runId, t6RevisionCandidate(runId));
  appendRevisionEvent(root, runId, t6RevisionApproval(runId));
  const sidecarDir = revisionSidecarDir(root, runId);
  mkdirSync(sidecarDir, { recursive: true });
  writeFileSync(join(sidecarDir, "candidate-prd.md"), CANDIDATE_PRD, "utf8");
  writeFileSync(join(sidecarDir, "candidate-tasks.md"), CANDIDATE_TASKS, "utf8");
}

const eventsOf = (root: string, runId: string): WorkflowEvent[] => readRunLog(root, runId);
const countType = (events: WorkflowEvent[], type: string): number =>
  events.filter((event) => event.type === type).length;
const outcomeOf = (events: WorkflowEvent[]): Extract<WorkflowEvent, { type: "workflow.outcome" }> | undefined =>
  events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.outcome" }> => event.type === "workflow.outcome",
  );

test("T7 initial state: fresh counters, inherited originals, copied carried usage", () => {
  const root = fixture();
  const runId = "run-t7-state";
  const spec = writeArtifacts(root);
  const started = {
    type: "workflow.started",
    runId: `${runId}-r1`,
    workflow: "feature",
    description: DESCRIPTION,
    baseline: "snap-base",
    stack: { primary: "nodejs", frameworks: ["express"] },
    ignoreRulesDigest: "rules-1",
    repoStateDigest: "stable-digest",
    verify: EMPTY_FREEZE,
    carriedUsage: { planner: carriedTotals(100, 50) },
    revision: { predecessorRunId: runId, revision: 1, correction: REVISION_CORRECTION },
  } as Extract<WorkflowEvent, { type: "workflow.started" }>;
  const specEvent = { type: "spec.approved", runId: `${runId}-r1`, ...spec } as Extract<
    WorkflowEvent,
    { type: "spec.approved" }
  >;

  const built = initialSuccessorResumeState(root, started, specEvent);
  assert.ok(built.ok, "a complete stub builds");
  if (!built.ok) return;
  const state = built.state;
  assert.equal(state.phase, "develop", "resume entry is always develop (§7 step 7, §11)");
  assert.equal(state.reviewRound, 0);
  assert.equal(state.verifyRetries, 0);
  assert.equal(state.developerRuns, 0);
  assert.deepEqual(state.fixes, []);
  assert.equal(state.previousBlockingIds.size, 0);
  assert.equal(state.lastReview, undefined, "stale review verdicts are never carried");
  assert.equal(state.interruptedPatchSha, undefined, "no interrupted patch hash is carried");
  assert.equal(state.usage.planner?.input, 100, "carried usage seeds the state");
  // Defensive copy: folding into the state must never alias the seed.
  state.usage.planner!.input = 999;
  assert.equal(started.carriedUsage?.planner?.input, 100);
  // The rebuilt ORIGINAL baseline — the handleResume construction.
  assert.deepEqual(state.baseline, {
    repoRoot: root,
    branch: "resumed",
    headSha: "unknown",
    baseCommit: "snap-base",
    ignoreRulesDigest: "rules-1",
    repoStateDigest: "stable-digest",
  });
  assert.deepEqual(state.verify, EMPTY_FREEZE, "the freeze is preserved verbatim");
  assert.deepEqual(state.spec, spec, "the approved contract hashes are the tamper guard");
  assert.deepEqual(state.revision, { predecessorRunId: runId, revision: 1, correction: REVISION_CORRECTION });
  rmSync(root, { recursive: true, force: true });
});

test("T7 initial state: legacy absence of freeze/digest is preserved, never synthesized", () => {
  const root = fixture();
  writeArtifacts(root);
  const started = {
    type: "workflow.started",
    runId: "run-legacy-s-r1",
    workflow: "feature",
    description: DESCRIPTION,
    baseline: "snap-base",
    revision: { predecessorRunId: "run-legacy-s", revision: 1, correction: REVISION_CORRECTION },
  } as Extract<WorkflowEvent, { type: "workflow.started" }>;
  const specEvent = {
    type: "spec.approved",
    runId: "run-legacy-s-r1",
    prdSha: "a".repeat(64),
    tasksSha: "b".repeat(64),
  } as Extract<WorkflowEvent, { type: "spec.approved" }>;
  const built = initialSuccessorResumeState(root, started, specEvent);
  assert.ok(built.ok);
  if (!built.ok) return;
  assert.equal(built.state.verify, undefined, "absent freeze stays absent");
  assert.equal(built.state.baseline?.repoStateDigest, undefined);
  assert.equal(built.state.baseline?.ignoreRulesDigest, undefined);
  rmSync(root, { recursive: true, force: true });
});

test("T7 initial state: corrupt freeze, missing baseline and missing revision linkage refuse", () => {
  const root = fixture();
  writeArtifacts(root);
  const specEvent = {
    type: "spec.approved",
    runId: "run-x-r1",
    prdSha: "a".repeat(64),
    tasksSha: "b".repeat(64),
  } as Extract<WorkflowEvent, { type: "spec.approved" }>;
  const corruptFreeze = initialSuccessorResumeState(
    root,
    {
      type: "workflow.started",
      runId: "run-x-r1",
      workflow: "feature",
      description: DESCRIPTION,
      baseline: "snap",
      verify: { commands: [], scripts: {}, scriptsDigest: "bad" },
      revision: { predecessorRunId: "run-x", revision: 1, correction: REVISION_CORRECTION },
    } as unknown as Extract<WorkflowEvent, { type: "workflow.started" }>,
    specEvent,
  );
  assert.ok(!corruptFreeze.ok, "§13: a corrupt freeze refuses outright");
  if (!corruptFreeze.ok) assert.match(corruptFreeze.reason, /corrupt/);

  const noBaseline = initialSuccessorResumeState(
    root,
    {
      type: "workflow.started",
      runId: "run-x-r1",
      workflow: "feature",
      description: DESCRIPTION,
      revision: { predecessorRunId: "run-x", revision: 1, correction: REVISION_CORRECTION },
    } as unknown as Extract<WorkflowEvent, { type: "workflow.started" }>,
    specEvent,
  );
  assert.ok(!noBaseline.ok, "no baseline → no original diff base → refuse");
  if (!noBaseline.ok) assert.match(noBaseline.reason, /baseline/);

  const noRevision = initialSuccessorResumeState(
    root,
    {
      type: "workflow.started",
      runId: "run-x-r1",
      workflow: "feature",
      description: DESCRIPTION,
      baseline: "snap",
    } as unknown as Extract<WorkflowEvent, { type: "workflow.started" }>,
    specEvent,
  );
  assert.ok(!noRevision.ok, "an ordinary-looking log is never launched as a successor");
  if (!noRevision.ok) assert.match(noRevision.reason, /revision linkage/);
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: the real launcher runs the successor from develop on the ORIGINAL baseline", async () => {
  const root = fixture();
  const runId = "run-t7-main";
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];

  const { deps, agents, git, detached } = successorDeps(root);
  // Gate the developer pass and arm the started promise BEFORE the launch:
  // the detached run must find the gate closed when it reaches the pass.
  const hold = agents.holdDeveloper();
  const developerStarted = agents.developerStarted;
  const repair = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(deps, requests)),
  );
  assert.equal(repair.kind, "launched");
  if (repair.kind !== "launched") return;
  assert.equal(repair.archiveLosses.length, 0);
  assert.equal(repair.resumedPhase, "develop", "B7b: the stub had no marker, the request carried resumedPhase");
  assert.equal(requests[0]?.successorRunId, successorId);
  assert.equal(detached.length, 1, "the run detached; the repair returned while it runs");

  // Hold the successor at its developer pass and observe the lock handoff.
  await developerStarted;
  const midRun = acquireRunLock(root, { runId: successorId, workflow: "feature" });
  assert.equal(midRun.ok, false, "the successor owns the repository lock while it runs");
  if (!midRun.ok) assert.equal(midRun.reason, "held");
  agents.releaseDeveloper();
  await hold;
  await detached[0];

  const events = eventsOf(root, successorId);
  assert.equal(events[0]?.type, "workflow.started");
  assert.equal(countType(events, "workflow.started"), 1, "no duplicate workflow.started — the seed, never a second one");
  assert.equal(countType(events, "workflow.resumed"), 1, "at most one workflow.resumed");
  const firstPhase = events.find(
    (event): event is Extract<WorkflowEvent, { type: "phase.started" }> => event.type === "phase.started",
  );
  assert.equal(firstPhase?.phase, "develop", "the successor enters at develop");
  const outcome = outcomeOf(events);
  assert.equal(outcome?.status, "completed", "the successor ran to completion");

  assert.equal(git.baselineCalls, 0, "git.baseline is never called: the original baseline was rebuilt");

  // The seed inherited the ORIGINAL inputs and the chain accounting.
  const seed = events[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  assert.equal(seed.baseline, "snap-base", "the ORIGINAL baseline commit");
  assert.equal(seed.repoStateDigest, "stable-digest");
  assert.deepEqual(seed.verify, EMPTY_FREEZE, "the frozen verify inputs are preserved");
  assert.deepEqual(seed.revision, { predecessorRunId: runId, revision: 1, correction: REVISION_CORRECTION });
  assert.equal(seed.carriedUsage?.planner?.input, 100, "predecessor usage is carried");
  assert.equal(seed.carriedUsage?.developer?.input, 200);

  // Developer/reviewer delivery (§15): correction verbatim, fresh counters.
  const devRequest = agents.requests.find((request) => request.role === "developer");
  assert.ok(devRequest?.prompt.includes("PLAN REVISION CONTEXT"));
  assert.ok(devRequest?.prompt.includes(REVISION_CORRECTION), "the correction is passed verbatim");
  assert.ok(devRequest?.prompt.includes(`revision 1 of run ${runId}`));
  assert.ok(!devRequest?.prompt.includes("BLOCKING"), "fresh state: no stale fix items");
  const reviewRequest = agents.requests.find((request) => request.role === "reviewer");
  assert.ok(reviewRequest?.prompt.includes("PLAN REVISION"));
  assert.ok(reviewRequest?.prompt.includes(REVISION_CORRECTION));

  // Chain-cumulative usage on the outcome (§11): carried + successor segment.
  assert.equal(outcome?.usage?.planner?.input, 100);
  assert.equal(outcome?.usage?.developer?.input, 250, "carried 200 + successor pass 50");
  assert.equal(outcome?.usage?.reviewer?.input, 30);

  // The handoff released the lock exactly once, at settle.
  const after = acquireRunLock(root, { runId: successorId, workflow: "feature" });
  assert.equal(after.ok, true, "the launcher released the repository lock when the successor settled");
  if (after.ok) after.release();
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: B7c — the resumed marker is never duplicated across repeated repairs before phase.started", async () => {
  const root = fixture();
  const runId = "run-t7-b7c";
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];

  // Repair #1: no stack override → resolveStack asks → the human dismisses →
  // the workflow dies BEFORE its first phase.started, with the marker already
  // on disk (launchRun emits it synchronously, before the workflow body).
  const first = successorDeps(root, { stackOverride: false });
  const outcome1 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(first.deps, requests)),
  );
  assert.equal(outcome1.kind, "launched");
  assert.equal(requests[0]?.resumedPhase, "develop");
  let events = eventsOf(root, successorId);
  assert.equal(countType(events, "workflow.resumed"), 1);
  assert.ok(!events.some((event) => event.type === "phase.started"), "the repair window is still open");
  assert.ok(events.some((event) => event.type === "workflow.failed"), "the dismissed launch settles as workflow.failed");
  assert.equal(countType(events, "workflow.started"), 1);

  // Repair #2, still before phase.started: the marker exists → resumedPhase
  // is OMITTED; no second marker, no second seed.
  const second = successorDeps(root, { stackOverride: false });
  const outcome2 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(second.deps, requests)),
  );
  assert.equal(outcome2.kind, "launched");
  assert.equal(requests[1]?.resumedPhase, undefined, "B7c omission: the stub already carries the marker");
  events = eventsOf(root, successorId);
  assert.equal(countType(events, "workflow.resumed"), 1, "at most one workflow.resumed, ever");
  assert.equal(countType(events, "workflow.started"), 1, "no duplicated seed across repeated repairs");

  // Repair #3 completes the launch (stack override set → the loop runs).
  const third = successorDeps(root);
  const outcome3 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(third.deps, requests)),
  );
  assert.equal(outcome3.kind, "launched");
  assert.equal(requests[2]?.resumedPhase, undefined);
  assert.equal(third.detached.length, 1);
  await third.detached[0];
  events = eventsOf(root, successorId);
  assert.equal(countType(events, "workflow.resumed"), 1);
  assert.equal(countType(events, "workflow.started"), 1);
  assert.ok(events.some((event) => event.type === "phase.started"), "the launch is now complete");
  assert.equal(outcomeOf(events)?.status, "completed");

  // The successor really runs: the revision is terminal for the predecessor.
  const again = await repairRevisionLaunch(repairDeps(root, runId, new ScriptedHuman(), async () => {}));
  assert.equal(again.kind, "refused");
  if (again.kind === "refused") assert.match(again.reason, /already recorded its first phase/);
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: B7b — a seeded stub without the marker launches with resumedPhase through the real launcher", async () => {
  const root = fixture();
  const runId = "run-t7-b7b";
  // Stage the pointer WITHOUT a launch (B6/B7a boundary): the seed exists, the
  // marker does not. approvedState with a throwing fake launch leaves exactly
  // this state (seed + pointer, no workflow.resumed).
  approvedState(root, runId, { pointer: true, successor: "full" });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];
  const { deps, detached } = successorDeps(root);
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(deps, requests)),
  );
  assert.equal(outcome.kind, "launched");
  assert.equal(requests[0]?.resumedPhase, "develop", "no marker on the stub → the request carries resumedPhase");
  await detached[0];
  const events = eventsOf(root, successorId);
  assert.equal(countType(events, "workflow.resumed"), 1);
  assert.equal(countType(events, "workflow.started"), 1);
  assert.equal(outcomeOf(events)?.status, "completed");
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: §10 — a changed partial diff asks; declining leaves the approved state recoverable", async () => {
  const root = fixture();
  const runId = "run-t7-diff";
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];

  // The tree moved after the approval: the launch-time git reports a new patch.
  const git = new NoRebaselineGit();
  git.patch = `${LAUNCH_PATCH}\n@@ -2 +2 @@\n+later change`;
  const declineHuman = new ScriptedHuman();
  declineHuman.selects = ["abort"];
  const declined = successorDeps(root, { git, human: declineHuman });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(declined.deps, requests)),
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.match(outcome.error, /launch aborted/);
  assert.equal(declineHuman.selectQuestions.length, 1, "exactly the §10 dialog");
  assert.ok(declineHuman.selectQuestions[0]?.options.some((option) => option.value === "abort"));

  const events = eventsOf(root, successorId);
  assert.ok(!events.some((event) => event.type === "workflow.resumed"), "declining launches nothing");
  assert.equal(countType(events, "workflow.started"), 1, "only the seed");
  const lifecycle = revisionLifecycle(eventsOf(root, runId));
  assert.equal(lifecycle.state, "launched", "the pointer precedes the launch");
  assert.equal(launchIncomplete(root, successorId), true, "the approved state stays repairable");

  // Second repair: the user confirms → the successor launches with the current tree.
  const acceptHuman = new ScriptedHuman();
  acceptHuman.selects = ["launch"];
  const accepted = successorDeps(root, { git, human: acceptHuman });
  const outcome2 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(accepted.deps, requests)),
  );
  assert.equal(outcome2.kind, "launched");
  assert.equal(requests[0]?.resumedPhase, "develop", "no marker existed: the request carries resumedPhase");
  assert.equal(accepted.detached.length, 1);
  await accepted.detached[0];
  const after = eventsOf(root, successorId);
  assert.equal(countType(after, "workflow.resumed"), 1);
  assert.equal(outcomeOf(after)?.status, "completed", "the successor ran on the current tree");
  assert.equal((accepted.git as NoRebaselineGit).baselineCalls, 0);
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: §13 preflight — a changed repository digest refuses before ANY developer pass", async () => {
  const root = fixture();
  const runId = "run-t7-preflight-digest";
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];
  const agents = new SuccessorAgents();
  const git = new NoRebaselineGit();
  git.digest = "moved-digest"; // the git state moved between approval and launch

  const { deps, detached } = successorDeps(root, { git, agents });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(deps, requests)),
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.match(outcome.error, /repository state changed/);
  assert.equal(agents.requests.length, 0, "zero developer calls: the guard fires before execution");
  const events = eventsOf(root, successorId);
  assert.ok(!events.some((event) => event.type === "phase.started"), "no phase event: the successor never ran");
  assert.ok(!events.some((event) => event.type === "workflow.resumed"), "no marker: launchRun never started");
  assert.equal(countType(events, "workflow.started"), 1, "only the seed");
  // The approved state stays recoverable: pointer + incomplete launch.
  assert.equal(launchIncomplete(root, successorId), true);
  assert.equal(revisionLifecycle(eventsOf(root, runId)).state, "launched");

  // Restored input: the next repair completes the launch.
  git.digest = "stable-digest";
  const retry = successorDeps(root, { git });
  const outcome2 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(retry.deps, requests)),
  );
  assert.equal(outcome2.kind, "launched");
  assert.equal(retry.detached.length, 1);
  await retry.detached[0];
  assert.equal(outcomeOf(eventsOf(root, successorId))?.status, "completed");
  assert.equal((retry.git as NoRebaselineGit).baselineCalls, 0);
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: §13 preflight — changed frozen scripts refuse before ANY developer pass", async () => {
  const root = fixture();
  const runId = "run-t7-preflight-scripts";
  const frozen: VerifyFreeze = {
    commands: [],
    scripts: { "package.json": { test: "echo frozen" } },
    scriptsDigest: digestScripts({ "package.json": { test: "echo frozen" } }),
    perimeter: "root",
  };
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "echo frozen" } }), "utf8");
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH), freeze: frozen });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];
  const agents = new SuccessorAgents();

  // The manifest script the freeze digested is rewritten after the approval.
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "echo changed" } }), "utf8");
  const { deps } = successorDeps(root, { agents });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(deps, requests)),
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.match(outcome.error, /verify scripts changed/);
  assert.match(outcome.error, /package\.json scripts\.test/);
  assert.equal(agents.requests.length, 0, "zero developer calls: no execution on rewritten scripts");
  const events = eventsOf(root, successorId);
  assert.ok(!events.some((event) => event.type === "phase.started"));
  assert.ok(!events.some((event) => event.type === "workflow.resumed"));
  assert.equal(launchIncomplete(root, successorId), true, "the approved state stays recoverable");

  // Restored scripts: the next repair completes the launch.
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "echo frozen" } }), "utf8");
  const retry = successorDeps(root);
  const outcome2 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(retry.deps, requests)),
  );
  assert.equal(outcome2.kind, "launched");
  assert.equal(retry.detached.length, 1);
  await retry.detached[0];
  assert.equal(outcomeOf(eventsOf(root, successorId))?.status, "completed");
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: §13 preflight — an unreadable repository state refuses (fail-closed, zero developer calls)", async () => {
  const root = fixture();
  const runId = "run-t7-preflight-unreadable";
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];
  const agents = new SuccessorAgents();
  const git = new NoRebaselineGit();
  git.readStateFails = true; // the digest cannot be re-read: changed, never unchanged

  const { deps } = successorDeps(root, { git, agents });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(deps, requests)),
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.match(outcome.error, /repository state changed/);
  assert.equal(agents.requests.length, 0, "zero developer calls: an unreadable read is a refusal");
  const events = eventsOf(root, successorId);
  assert.ok(!events.some((event) => event.type === "phase.started"));
  assert.ok(!events.some((event) => event.type === "workflow.resumed"));
  assert.equal(launchIncomplete(root, successorId), true);
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: §13 preflight repeats after the §10 confirmation — a digest moved inside the dialog window refuses with zero developer calls", async () => {
  const root = fixture();
  const runId = "run-t7-dialog-toctou";
  // The recorded evidence predates the current patch: the §10 dialog opens.
  approvedSuccessorChain(root, runId, { partialPatchSha: sha("diff --git a/src/a.ts\n@@ -1 +1 @@\n+older work") });
  const successorId = successorRunId(runId);
  const requests: SuccessorLaunchRequest[] = [];
  const agents = new SuccessorAgents();
  const git = new NoRebaselineGit(); // patch ≠ recorded evidence, digest still "stable-digest"
  const human = new DialogMutationHuman(() => {
    git.digest = "moved-while-dialog"; // the git state moves WHILE the dialog is open
  });
  human.selects = ["launch"]; // the user confirms the launch

  const { deps } = successorDeps(root, { git, agents, human });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(deps, requests)),
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.match(outcome.error, /repository state changed/);
  assert.equal(human.selectQuestions.length, 1, "the §10 dialog ran and was confirmed");
  assert.equal(agents.requests.length, 0, "zero developer calls after the confirmed dialog");
  const events = eventsOf(root, successorId);
  assert.ok(!events.some((event) => event.type === "phase.started"));
  assert.ok(!events.some((event) => event.type === "workflow.resumed"), "no marker: the repeated preflight refused");
  assert.equal(countType(events, "workflow.started"), 1, "only the seed");
  assert.equal(launchIncomplete(root, successorId), true, "the approved state stays recoverable");

  // Restored input: the next repair re-asks (patch still changed), the user
  // confirms again, and the launch completes.
  git.digest = "stable-digest";
  const retryHuman = new ScriptedHuman();
  retryHuman.selects = ["launch"];
  const retry = successorDeps(root, { git, human: retryHuman });
  const outcome2 = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(retry.deps, requests)),
  );
  assert.equal(outcome2.kind, "launched");
  assert.equal(retry.detached.length, 1);
  await retry.detached[0];
  assert.equal(retryHuman.selectQuestions.length, 1, "the changed patch still asks");
  assert.equal(outcomeOf(eventsOf(root, successorId))?.status, "completed");
  assert.equal((retry.git as NoRebaselineGit).baselineCalls, 0);
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: an unresolvable baseline at the §10 check refuses without launching", async () => {
  const root = fixture();
  const runId = "run-t7-unresolvable";
  approvedSuccessorChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const requests: SuccessorLaunchRequest[] = [];
  const git = new NoRebaselineGit();
  git.failDiff = true;
  const declined = successorDeps(root, { git });
  const outcome = await repairRevisionLaunch(
    repairDeps(root, runId, new ScriptedHuman(), realLaunch(declined.deps, requests)),
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.match(outcome.error, /no longer resolvable/);
  assert.ok(!eventsOf(root, successorRunId(runId)).some((event) => event.type === "workflow.resumed"),
    "the launch never happened: no marker on disk");
  rmSync(root, { recursive: true, force: true });
});

test("T7 launch: the launcher refuses a log that is not a complete seeded successor", async () => {
  const root = fixture();
  const runId = "run-t7-integrity";
  approvedSuccessorChain(root, runId);
  const successorId = successorRunId(runId);
  // Break the seed: remove the successor log entirely (B7a) — the launcher
  // must refuse rather than launch an unseeded run. (The repair would re-seed
  // first; this exercises the launcher's own integrity gate directly.)
  rmSync(runLogPathOf(root, successorId), { force: true });
  const { deps } = successorDeps(root);
  const context: SuccessorLaunchContext = { lock: { release: () => {} }, markHandedOff: () => {} };
  await assert.rejects(
    () => launchSuccessorRun(deps, { successorRunId: successorId, resumedPhase: "develop" }, context),
    /complete seeded workflow.started/,
  );
  rmSync(root, { recursive: true, force: true });
});
