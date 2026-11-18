/**
 * T8 — the Pi-free `/flow revise` command orchestration (src/revise-command.ts):
 * the §6 ordered refusal stage, lifecycle routing (both repair entry states,
 * the successor pointer, the shared already_decided heal), the detached
 * revision-session runner (active slot with workflow "revision", /flow stop,
 * safeUi settlement, no execution-terminal events appended to the
 * predecessor), and the handoff to the REAL T7 launcher with injected
 * dependencies. Every effect is a fake — no Pi session, no model.
 * Run: `node --test tests/revise-command.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runFlowRevise, type FlowReviseDeps, type ReviseActiveRun } from "../src/revise-command.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { RunLog, readRunLog, withEventId } from "../src/run-log.ts";
import { acquireRunLock } from "../src/run-lock.ts";
import { requestFlowStop, type FlowRunStatus } from "../src/pi/flow-stop.ts";
import { launchIncomplete, revisionLifecycle, successorRunId, resumeRevisionRefusal } from "../src/workflows/revise.ts";
import { descriptionMarker, validatePlannerOutput } from "../src/workflows/feature.ts";
import { digestScripts, type VerifyFreeze } from "../src/verify.ts";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../src/agent.ts";
import type { ConfirmQuestion, GitBaseline, GitService, HumanInput, SelectQuestion, VerifyRunner, WorkflowEvent } from "../src/ports.ts";
import { UserDismissedError } from "../src/ports.ts";

// --- fixtures ---------------------------------------------------------------

const sha = (content: string): string => createHash("sha256").update(content).digest("hex");
const fixture = (): string => mkdtempSync(join(tmpdir(), "pi-brain-revise-cmd-"));

const DESCRIPTION = "add user auth";
const SLUG = "add-user-auth";
const MARKER = descriptionMarker(DESCRIPTION);
const PRD_BODY = "Build the thing.";
const TASKS_BODY = "## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const CORRECTION = "make auth optional";
const LAUNCH_PATCH = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+work";
const EMPTY_FREEZE: VerifyFreeze = {
  commands: [],
  scripts: {},
  scriptsDigest: digestScripts({}),
  perimeter: "root",
};

const VALID_PLAN =
  "## TITLE\nAdd Invitations\n\n## PRD\nRevised body one.\n\n## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const planValidation = validatePlannerOutput(VALID_PLAN);
if (!planValidation.valid) throw new Error("fixture plan must validate");
const CANDIDATE_PRD = planValidation.value.prd;
const CANDIDATE_TASKS = planValidation.value.tasks;
const CANDIDATE_PAIR = { prdSha: sha(CANDIDATE_PRD), tasksSha: sha(CANDIDATE_TASKS) };
const CONTRACT = {
  prdSha: sha(`${MARKER}\n${CANDIDATE_PRD}`),
  tasksSha: sha(`${MARKER}\n${CANDIDATE_TASKS}`),
};
const BASE_CONTRACT = {
  prdSha: sha(`${MARKER}\n${PRD_BODY}`),
  tasksSha: sha(`${MARKER}\n${TASKS_BODY}`),
};

function writeArtifacts(root: string): { prdSha: string; tasksSha: string } {
  const dir = join(root, ".ai", "features", SLUG);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `prd-${SLUG}.md`), `${MARKER}\n${PRD_BODY}`, "utf8");
  writeFileSync(join(dir, `tasks-${SLUG}.md`), `${MARKER}\n${TASKS_BODY}`, "utf8");
  return { prdSha: sha(`${MARKER}\n${PRD_BODY}`), tasksSha: sha(`${MARKER}\n${TASKS_BODY}`) };
}

/** A generic predecessor log: cancelled / interrupted / decided / completed shapes. */
function predecessorEvents(
  root: string,
  runId: string,
  opts: { status?: "cancelled" | "needs_human" | "completed"; interrupted?: boolean; decided?: "completed" | "needs_human" } = {},
): WorkflowEvent[] {
  const spec = writeArtifacts(root);
  const events: WorkflowEvent[] = [
    {
      type: "workflow.started",
      runId,
      workflow: "feature",
      description: DESCRIPTION,
      baseline: "snap-base",
      stack: { primary: "nodejs", frameworks: ["express"] },
    },
    { type: "phase.started", runId, phase: "discover" },
    { type: "phase.started", runId, phase: "spec" },
    { type: "agent.completed", runId, role: "planner", usage: { input: 100, output: 50 } },
    { type: "spec.approved", runId, ...spec },
  ];
  if (opts.interrupted || opts.decided) {
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
  if (opts.status) {
    events.push({ type: "workflow.outcome", runId, status: opts.status });
  }
  return events;
}

function writePredecessorLog(root: string, runId: string, events: WorkflowEvent[]): void {
  const log = RunLog.open(root, runId);
  for (const event of events) log.append(event);
}

const appendRevisionEvent = (root: string, runId: string, event: object): void => {
  const log = new RunLog(join(root, ".pi", "pi-brain", "runs", `${runId}.jsonl`));
  log.appendCritical(event as Parameters<RunLog["appendCritical"]>[0]);
};

const revisionTypes = (root: string, runId: string): string[] =>
  readRunLog(root, runId)
    .map((event) => event.type)
    .filter((type) => type.startsWith("revision."));

const countType = (events: WorkflowEvent[], type: string): number =>
  events.filter((event) => event.type === type).length;

const outcomeOf = (events: WorkflowEvent[]): Extract<WorkflowEvent, { type: "workflow.outcome" }> | undefined =>
  events.find((event): event is Extract<WorkflowEvent, { type: "workflow.outcome" }> => event.type === "workflow.outcome");

/** A cancelled predecessor with revision 1 open (optionally recording the patch sha). */
function openRevisionChain(root: string, runId: string, opts: { partialPatchSha?: string } = {}): void {
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  appendRevisionEvent(
    root,
    runId,
    withEventId({
      type: "revision.started" as const,
      runId,
      revision: 1,
      correction: CORRECTION,
      correctionSha: sha(CORRECTION),
      baseContract: BASE_CONTRACT,
      ...(opts.partialPatchSha !== undefined ? { partialPatchSha: opts.partialPatchSha } : {}),
      at: "2026-01-01T00:00:00.000Z",
    }),
  );
}

/**
 * A cancelled predecessor with FULL guards and revision 1 approved against
 * CANDIDATE/CONTRACT with candidate sidecar files present (the repair's
 * promotion input). `pointer` appends revision.launched; `successorPhaseStarted`
 * writes a successor log that already recorded its first phase (T12).
 */
function approvedChain(
  root: string,
  runId: string,
  opts: { pointer?: boolean; successorPhaseStarted?: boolean } = {},
): string {
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
      verify: EMPTY_FREEZE,
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
      correction: CORRECTION,
      correctionSha: sha(CORRECTION),
      baseContract: BASE_CONTRACT,
      partialPatchSha: sha(LAUNCH_PATCH),
      at: "2026-01-01T00:00:00.000Z",
    }),
  );
  appendRevisionEvent(
    root,
    runId,
    withEventId({
      type: "revision.candidate" as const,
      runId,
      revision: 1,
      round: 1,
      prdSha: CANDIDATE_PAIR.prdSha,
      tasksSha: CANDIDATE_PAIR.tasksSha,
      at: "2026-01-01T00:01:00.000Z",
    }),
  );
  appendRevisionEvent(
    root,
    runId,
    withEventId({
      type: "revision.approved" as const,
      runId,
      revision: 1,
      round: 1,
      correction: CORRECTION,
      correctionSha: sha(CORRECTION),
      candidate: CANDIDATE_PAIR,
      contract: CONTRACT,
      predecessorStatus: "cancelled",
      approvedBy: { via: "/flow revise", pid: 4321, at: "2026-01-01T00:03:00.000Z" },
    }),
  );
  const sidecarDir = join(root, ".pi", "pi-brain", "revision", runId);
  mkdirSync(sidecarDir, { recursive: true });
  writeFileSync(join(sidecarDir, "candidate-prd.md"), CANDIDATE_PRD, "utf8");
  writeFileSync(join(sidecarDir, "candidate-tasks.md"), CANDIDATE_TASKS, "utf8");
  const successorId = successorRunId(runId);
  if (opts.pointer) {
    appendRevisionEvent(
      root,
      runId,
      withEventId({
        type: "revision.launched" as const,
        runId,
        revision: 1,
        successorRunId: successorId,
        at: "2026-01-01T00:04:00.000Z",
      }),
    );
  }
  if (opts.successorPhaseStarted) {
    const sLog = RunLog.open(root, successorId);
    sLog.append({
      type: "workflow.started",
      runId: successorId,
      workflow: "feature",
      description: DESCRIPTION,
      baseline: "snap-base",
      revision: { predecessorRunId: runId, revision: 1, correction: CORRECTION },
    });
    sLog.append({ type: "phase.started", runId: successorId, phase: "develop" });
  }
  return successorId;
}

// --- fakes ------------------------------------------------------------------

class FakeGit implements GitService {
  digest = "stable-digest";
  patch = LAUNCH_PATCH;
  baselineCalls = 0;
  readStateFails = false;
  async baseline(cwd: string): Promise<GitBaseline> {
    this.baselineCalls += 1;
    return { repoRoot: cwd, branch: "main", headSha: "h", baseCommit: "snap-base" };
  }
  async repoStateDigest(): Promise<string> {
    if (this.readStateFails) throw new Error("git for-each-ref failed (128): fatal: not a git repository");
    return this.digest;
  }
  async diffSince(): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    return { patch: this.patch, files: ["src/a.ts"], dirtySubmodules: [] };
  }
}

class ScriptedHuman implements HumanInput {
  inputs: string[] = [];
  selects: string[] = [];
  confirms: Array<boolean | "dismiss"> = [];
  readonly selectQuestions: Array<{ message: string; options: Array<{ value: string; description?: string }> }> = [];
  readonly confirmQuestions: Array<{ message: string; detail?: string }> = [];
  readonly notices: string[] = [];
  async confirm(q: ConfirmQuestion): Promise<boolean> {
    this.confirmQuestions.push(q);
    const value = this.confirms.shift();
    if (value === undefined) return true;
    if (value === "dismiss") return false;
    return value;
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

/**
 * One fake runtime for every role the command path touches: the revision
 * session's planner and the successor's developer/reviewer. The planner can
 * be gated mid-call (the /flow stop scenario) and marked aborted (provider
 * failure); the reviewer approves so a healthy successor completes.
 */
class RoleAgents implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  readonly #plans: string[];
  readonly #plannerAborted: boolean;
  #plannerGate?: Promise<void>;
  #releasePlanner?: () => void;
  #plannerCalls = 0;
  #plannerStartedResolvers: Array<() => void> = [];
  constructor(opts: { plans?: string[]; gatePlanner?: boolean; plannerAborted?: boolean } = {}) {
    this.#plans = opts.plans ?? [];
    this.#plannerAborted = opts.plannerAborted ?? false;
    if (opts.gatePlanner) {
      this.#plannerGate = new Promise((resolve) => {
        this.#releasePlanner = resolve;
      });
    }
  }
  get plannerStarted(): Promise<void> {
    // A subscriber attaching after the first planner call already resolved it.
    if (this.#plannerCalls > 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.#plannerStartedResolvers.push(resolve);
    });
  }
  releasePlanner(): void {
    this.#releasePlanner?.();
  }
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    if (request.role === "planner") {
      this.#plannerCalls += 1;
      for (const resolve of this.#plannerStartedResolvers.splice(0)) resolve();
      await this.#plannerGate;
      const text = this.#plans.length > 1 ? this.#plans.shift()! : (this.#plans[0] ?? "");
      return { role: "planner", text, aborted: this.#plannerAborted };
    }
    if (request.role === "developer") {
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

interface Harness {
  deps: FlowReviseDeps;
  notifications: Array<{ message: string; level: string }>;
  slotCalls: Array<ReviseActiveRun | null>;
  slot: () => ReviseActiveRun | null;
  detached: Array<Promise<void>>;
  agentsCreated: () => number;
  agents: RoleAgents;
  human: ScriptedHuman;
}

function harness(
  root: string,
  runId: string,
  opts: {
    agents?: RoleAgents;
    git?: FakeGit;
    human?: ScriptedHuman;
    active?: { workflow: string; status: FlowRunStatus } | null;
    notifyThrows?: boolean;
  } = {},
): Harness {
  const notifications: Array<{ message: string; level: string }> = [];
  const slotCalls: Array<ReviseActiveRun | null> = [];
  const detached: Array<Promise<void>> = [];
  let slot: ReviseActiveRun | null = null;
  let agentsCreated = 0;
  const agents = opts.agents ?? new RoleAgents();
  const human = opts.human ?? new ScriptedHuman();
  const deps: FlowReviseDeps = {
    cwd: root,
    runId,
    active: opts.active ?? null,
    setActive: (next) => {
      slot = next;
      slotCalls.push(next);
    },
    notify: (message, level) => {
      if (opts.notifyThrows) throw new Error("stale ctx: the ui is gone");
      notifications.push({ message, level });
    },
    human,
    createAgents: async () => {
      agentsCreated += 1;
      return agents;
    },
    makeAbort: () => new AbortController(),
    config: { ...DEFAULT_CONFIG, stack: "nodejs" },
    profilesDir: PROFILES_DIR,
    availableSkills: new Set<string>(),
    verifier: { run: async () => [] } satisfies VerifyRunner,
    git: opts.git ?? new FakeGit(),
    history: () => {},
    setStatus: () => {},
    bell: () => {},
    onDetached: (run) => void detached.push(run),
  };
  return {
    deps,
    notifications,
    slotCalls,
    slot: () => slot,
    detached,
    agentsCreated: () => agentsCreated,
    agents,
    human,
  };
}

async function waitFor(what: string, pred: () => boolean, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Wait for the successor to SETTLE — completed OR failed. A successor that
 * failed (e.g. a fixture path artifact) surfaces immediately with its failure
 * event instead of burning the whole timeout waiting for an outcome that will
 * never come; the caller asserts the expected status afterwards.
 */
async function waitForSuccessorSettled(root: string, successorId: string, timeoutMs = 15000): Promise<void> {
  await waitFor(
    `the successor ${successorId} to settle`,
    () => {
      const events = readRunLog(root, successorId);
      return events.some((event) => event.type === "workflow.outcome" || event.type === "workflow.failed");
    },
    timeoutMs,
  );
}

// ---------------------------------------------------------------------------
// The §6 ordered refusal stage
// ---------------------------------------------------------------------------

test("command: a RUNNING in-session run refuses before any setup or mutation", async () => {
  const root = fixture();
  const runId = "run-cmd-running";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const h = harness(root, runId, { active: { workflow: "feature", status: "running" } });

  await runFlowRevise(h.deps);

  assert.match(h.notifications[0]?.message ?? "", /another run is active in this session/);
  assert.equal(h.agentsCreated(), 0, "no runtime is created");
  assert.equal(h.slotCalls.length, 0, "the active slot is never touched");
  assert.equal(h.detached.length, 0);
  assert.deepEqual(revisionTypes(root, runId), [], "no log mutation");
  rmSync(root, { recursive: true, force: true });
});

test("command: a CANCELLING in-session run refuses the same way (blocksFeatureStart)", async () => {
  const root = fixture();
  const runId = "run-cmd-cancelling";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "cancelled" }));
  const h = harness(root, runId, { active: { workflow: "feature", status: "cancelling" } });

  await runFlowRevise(h.deps);

  assert.match(h.notifications[0]?.message ?? "", /another run is active/);
  assert.equal(h.agentsCreated(), 0);
  assert.equal(h.slotCalls.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test("command: an unknown run refuses and creates nothing", async () => {
  const root = fixture();
  const h = harness(root, "run-missing");

  await runFlowRevise(h.deps);

  assert.match(h.notifications[0]?.message ?? "", /unknown run run-missing/);
  assert.equal(h.agentsCreated(), 0);
  assert.equal(h.slotCalls.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test("command: an ineligible predecessor refuses with the §5 message and appends nothing", async () => {
  const root = fixture();
  const runId = "run-cmd-completed";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "completed" }));
  const h = harness(root, runId);

  await runFlowRevise(h.deps);

  assert.match(h.notifications[0]?.message ?? "", /new \/feature/);
  assert.equal(h.agentsCreated(), 0);
  assert.deepEqual(revisionTypes(root, runId), []);
  rmSync(root, { recursive: true, force: true });
});

test("command: corrupt revision evidence fails closed before any dialog or runtime", async () => {
  const root = fixture();
  const runId = "run-cmd-corrupt";
  openRevisionChain(root, runId);
  // An eventId that does not bind its canonical content is corrupt evidence.
  // Written RAW (appendCritical refuses by design — that is the corruption).
  const broken = withEventId({
    type: "revision.candidate" as const,
    runId,
    revision: 1,
    round: 1,
    prdSha: CANDIDATE_PAIR.prdSha,
    tasksSha: CANDIDATE_PAIR.tasksSha,
    at: "2026-01-01T00:01:00.000Z",
  });
  appendFileSync(
    join(root, ".pi", "pi-brain", "runs", `${runId}.jsonl`),
    `${JSON.stringify({ ...broken, eventId: "f".repeat(64) })}\n`,
    "utf8",
  );
  const h = harness(root, runId);

  await runFlowRevise(h.deps);

  assert.match(h.notifications[0]?.message ?? "", /corrupt/);
  assert.equal(h.agentsCreated(), 0);
  assert.equal(h.slotCalls.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test("command: a held lock refuses through the session core, clears the slot, and frees the lock", async () => {
  const root = fixture();
  const runId = "run-cmd-locked";
  openRevisionChain(root, runId);
  const foreign = acquireRunLock(root, { runId: "other-run", workflow: "feature" });
  assert.ok(foreign.ok, "the fixture lock is acquired for a live pid");
  const human = new ScriptedHuman();
  human.inputs = ["make auth optional"];
  const h = harness(root, runId, { human });

  await runFlowRevise(h.deps);
  assert.equal(h.detached.length, 1, "the session started detached");
  await h.detached[0];

  assert.match(h.notifications.at(-1)?.message ?? "", /run lock is held/);
  assert.equal(h.slot(), null, "the slot is cleared at settlement");
  assert.equal(h.agentsCreated(), 1, "the runtime came up after the routing refusals");
  foreign.release();
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The shared already_decided heal (§5), then the ACTUAL healed status
// ---------------------------------------------------------------------------

test("command: the heal runs first and a healed needs_human predecessor proceeds to the session", async () => {
  const root = fixture();
  const runId = "run-cmd-heal-nh";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { decided: "needs_human" }));
  const human = new ScriptedHuman();
  human.inputs = ["dismiss"]; // correction dialog dismissed: nothing is opened
  const h = harness(root, runId, { human });

  await runFlowRevise(h.deps);
  assert.equal(h.detached.length, 1);
  await h.detached[0];

  const events = readRunLog(root, runId);
  const outcome = outcomeOf(events);
  assert.equal(outcome?.status, "needs_human", "the heal recorded the reconstructed outcome");
  assert.match(outcome?.reason ?? "", /reconstructed/);
  assert.ok(events.some((event) => event.type === "workflow.completed"), "the completed marker is appended");
  assert.deepEqual(revisionTypes(root, runId), [], "the dismissed session appended nothing");
  assert.equal(h.slot(), null);
  rmSync(root, { recursive: true, force: true });
});

test("command: the heal runs first and a healed completed predecessor refuses (new /feature)", async () => {
  const root = fixture();
  const runId = "run-cmd-heal-done";
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { decided: "completed" }));
  const h = harness(root, runId);

  await runFlowRevise(h.deps);

  const events = readRunLog(root, runId);
  assert.equal(outcomeOf(events)?.status, "completed", "the heal landed first");
  assert.match(h.notifications.at(-1)?.message ?? "", /new \/feature/, "the HEALED status is re-evaluated and refused");
  assert.equal(h.agentsCreated(), 0);
  assert.equal(h.slotCalls.length, 0);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Lifecycle routing and the detached session runner
// ---------------------------------------------------------------------------

test("command: an open revision resumes, approves, and hands off to the REAL successor launcher", async () => {
  const root = fixture();
  const runId = "run-cmd-happy";
  openRevisionChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const human = new ScriptedHuman();
  human.selects = ["continue", "approve"]; // resume dialog → decide
  human.inputs = [""]; // keep the recorded correction
  const h = harness(root, runId, { agents, human });

  await runFlowRevise(h.deps);
  assert.equal(h.detached.length, 1, "the session runs detached");
  await h.detached[0];

  const successorId = successorRunId(runId);
  await waitForSuccessorSettled(root, successorId);

  // The active slot: swapped to the successor at the detached launch, and
  // NOT cleared by the runner's settlement (the successor owns it now).
  const slot = h.slot();
  assert.ok(slot, "the successor occupies the active slot");
  assert.equal(slot.workflow, "feature");
  assert.equal(slot.runId, successorId);

  // P's execution history is unchanged: only revision.* appends by the
  // session/repair — never loop, outcome or failure events.
  const pEvents = readRunLog(root, runId);
  assert.equal(countType(pEvents, "workflow.outcome"), 1, "only the predecessor's original cancelled outcome");
  assert.equal(countType(pEvents, "workflow.failed"), 0);
  assert.equal(countType(pEvents, "workflow.completed"), 0);
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
  );

  // The successor really ran, from develop, with the original baseline.
  const sEvents = readRunLog(root, successorId);
  assert.equal(countType(sEvents, "workflow.started"), 1, "no duplicate seed");
  assert.equal(countType(sEvents, "workflow.resumed"), 1);
  const firstPhase = sEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "phase.started" }> => event.type === "phase.started",
  );
  assert.equal(firstPhase?.phase, "develop");
  assert.equal(outcomeOf(sEvents)?.status, "completed");
  assert.equal((agents.requests.find((r) => r.role === "developer")?.prompt ?? "").includes(CORRECTION),
    true, "the correction reaches the successor's developer prompt");

  // The handoff released the lock exactly once, at successor settlement.
  const lock = acquireRunLock(root, { runId: successorId, workflow: "feature" });
  assert.ok(lock.ok, "the successor's launcher released the repository lock when it settled");
  if (lock.ok) lock.release();

  assert.ok(
    h.notifications.some((n) => /successor .* launched from the approved revision/.test(n.message)),
    "the launch is announced",
  );
  rmSync(root, { recursive: true, force: true });
});

test("command: an approved-pending-launch predecessor repairs directly through the real launcher", async () => {
  const root = fixture();
  const runId = "run-cmd-approved";
  const successorId = approvedChain(root, runId);
  const h = harness(root, runId);

  await runFlowRevise(h.deps);
  await waitForSuccessorSettled(root, successorId);

  assert.equal(outcomeOf(readRunLog(root, successorId))?.status, "completed");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.approved", "revision.launched"]);
  const slot = h.slot();
  assert.equal(slot?.runId, successorId, "the successor owns the slot after the repair");
  assert.equal(slot?.workflow, "feature");
  const lock = acquireRunLock(root, { runId: successorId, workflow: "feature" });
  assert.ok(lock.ok, "the lock was released when the successor settled");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("command: a launched-but-INCOMPLETE predecessor completes the launch through the SAME repair", async () => {
  const root = fixture();
  const runId = "run-cmd-incomplete";
  const successorId = approvedChain(root, runId, { pointer: true });
  assert.equal(launchIncomplete(root, successorId), true, "the fixture holds an incomplete launch");
  const h = harness(root, runId);

  await runFlowRevise(h.deps);
  await waitForSuccessorSettled(root, successorId);

  assert.ok(h.notifications.some((n) => /revision launch is incomplete/.test(n.message)));
  assert.equal(outcomeOf(readRunLog(root, successorId))?.status, "completed");
  assert.equal(
    countType(readRunLog(root, runId), "revision.launched"),
    1,
    "the pointer stays idempotent — the repair never duplicates it",
  );
  rmSync(root, { recursive: true, force: true });
});

test("command: a launched successor with phase.started redirects to the successor (T12)", async () => {
  const root = fixture();
  const runId = "run-cmd-running-s";
  const successorId = approvedChain(root, runId, { pointer: true, successorPhaseStarted: true });
  const h = harness(root, runId);

  await runFlowRevise(h.deps);

  assert.match(h.notifications[0]?.message ?? "", new RegExp(`revised by ${successorId}`));
  assert.match(h.notifications[0]?.message ?? "", /revise the successor run instead/);
  assert.equal(h.agentsCreated(), 0, "no runtime, no competing revision, no rerun");
  assert.equal(h.slotCalls.length, 0);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// /flow stop, provider failure, and throwing UI effects while detached
// ---------------------------------------------------------------------------

test("command: /flow stop during the planner settles the session cancelled and keeps the revision recoverable", async () => {
  const root = fixture();
  const runId = "run-cmd-stop";
  openRevisionChain(root, runId);
  const agents = new RoleAgents({ plans: ["irrelevant — cancelled mid-call"], gatePlanner: true });
  const human = new ScriptedHuman();
  human.selects = ["continue"]; // resume dialog: the open revision continues
  human.inputs = [""]; // keep the recorded correction
  const h = harness(root, runId, { agents, human });

  await runFlowRevise(h.deps);
  const slot = h.slot();
  assert.ok(slot, "the revision session occupies the active slot");
  assert.equal(slot.workflow, "revision", "workflow \"revision\" so status/stop answer during the planner");
  assert.equal(slot.status, "running");

  // The existing open revision routes through the resume dialog first.
  await agents.plannerStarted;
  const decision = requestFlowStop(slot, () => slot.abort.abort());
  assert.equal(decision.action, "cancellation_requested");
  agents.releasePlanner();
  await h.detached[0];

  assert.equal(h.slot(), null, "the slot is cleared at settlement");
  assert.ok(
    h.notifications.some((n) => /revision session cancelled.*recoverable via \/flow revise/.test(n.message)),
  );
  assert.deepEqual(revisionTypes(root, runId), ["revision.started"], "the revision stays open — cancellation is not abandonment");
  const lock = acquireRunLock(root, { runId, workflow: "check" });
  assert.ok(lock.ok, "the session's lock was released exactly once by its finally");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("command: a provider abort keeps the revision open and releases everything", async () => {
  const root = fixture();
  const runId = "run-cmd-abort";
  openRevisionChain(root, runId);
  const agents = new RoleAgents({ plans: ["ignored"], plannerAborted: true });
  const human = new ScriptedHuman();
  human.selects = ["continue"]; // resume dialog: the open revision continues
  human.inputs = [""]; // keep the recorded correction
  const h = harness(root, runId, { agents, human });

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.equal(h.slot(), null);
  assert.ok(h.notifications.some((n) => /stays open.*continue it with \/flow revise/.test(n.message)));
  assert.deepEqual(revisionTypes(root, runId), ["revision.started"], "a provider abort consumes no round and appends no candidate");
  const lock = acquireRunLock(root, { runId, workflow: "check" });
  assert.ok(lock.ok);
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("command: throwing UI effects cannot corrupt refusals, settlement, the slot or the lock", async () => {
  const root = fixture();
  const runId = "run-cmd-ui-throw";
  // (a) A routing refusal with a throwing notify never throws to the caller.
  writePredecessorLog(root, runId, predecessorEvents(root, runId, { status: "completed" }));
  const direct = harness(root, runId, { notifyThrows: true });
  await runFlowRevise(direct.deps);
  assert.equal(direct.agentsCreated(), 0);
  assert.equal(direct.slotCalls.length, 0);

  // (b) A detached settlement with a throwing notify still clears the slot
  // and releases the lock (safeUi swallows the stale-context throw).
  const runId2 = "run-cmd-ui-throw-2";
  openRevisionChain(root, runId2);
  const foreign = acquireRunLock(root, { runId: "other", workflow: "feature" });
  assert.ok(foreign.ok);
  const human = new ScriptedHuman();
  human.inputs = [CORRECTION];
  const detachedRun = harness(root, runId2, { human, notifyThrows: true });
  await runFlowRevise(detachedRun.deps);
  await detachedRun.detached[0];
  assert.equal(detachedRun.slot(), null, "the settlement cleared the slot despite the throwing notify");
  foreign.release();
  const lock = acquireRunLock(root, { runId: runId2, workflow: "check" });
  assert.ok(lock.ok, "the lock is free");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The handoff: failure keeps the lock with the repair; success transfers it
// ---------------------------------------------------------------------------

test("command: a handoff failure keeps the lock with the repair, clears the slot, and starts no successor", async () => {
  const root = fixture();
  const runId = "run-cmd-handoff-fail";
  const successorId = approvedChain(root, runId);
  const git = new FakeGit();
  git.readStateFails = true; // the §13 preflight treats an unreadable read as changed
  const h = harness(root, runId, { git });

  await runFlowRevise(h.deps);

  assert.ok(
    h.notifications.some((n) => /the approved revision launch failed/.test(n.message)),
    "the failed handoff is reported",
  );
  assert.equal(h.slot(), null, "no ghost successor slot after a failed launch");
  const lock = acquireRunLock(root, { runId, workflow: "check" });
  assert.ok(lock.ok, "the repair released the lock — it was never handed off");
  if (lock.ok) lock.release();
  const sEvents = readRunLog(root, successorId);
  assert.equal(countType(sEvents, "workflow.resumed"), 0, "zero developer calls: no marker, no execution");
  assert.equal(countType(sEvents, "phase.started"), 0);
  // The pointer-plus-incomplete state stays recoverable via /flow revise.
  const refusal = resumeRevisionRefusal(readRunLog(root, runId), root);
  assert.equal(refusal?.type, "revision_launch_incomplete");
  assert.equal(revisionLifecycle(readRunLog(root, runId)).state, "launched");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Dispatch wiring (the Pi-specific surface; behavior lives above)
// ---------------------------------------------------------------------------

test("dispatch: /flow revise routes through the Pi-free command module, before the active-run guard", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "extensions", "pi-brain.ts"),
    "utf8",
  );
  const dispatch = source.indexOf('subcommand === "revise"');
  assert.ok(dispatch >= 0, "the revise subcommand is dispatched");
  const usage = source.indexOf("Usage: /flow revise <runId>");
  assert.ok(usage > dispatch, "a missing id prints usage without starting work");
  const guard = source.indexOf("if (!active)");
  assert.ok(guard > dispatch, "revise dispatches without an active run — it precedes the no-active guard");
  const wiring = source.indexOf("runFlowRevise({");
  assert.ok(wiring > dispatch, "the dispatch delegates to the Pi-free orchestration");
  assert.ok(
    source.includes("healAlreadyDecided(cwd, runId"),
    "/flow resume reuses the shared heal the revise command heals with",
  );
  const completions = source.indexOf("getArgumentCompletions");
  const reviseEntry = source.indexOf('{ value: "revise"', completions);
  assert.ok(reviseEntry > completions, "revise is offered in the argument completions");
  assert.ok(source.includes('value: `revise ${id}`'), "run-id completions carry the whole-argument form");
});

// ---------------------------------------------------------------------------
// Review-round regressions (2026-11-17 review: five findings)
// ---------------------------------------------------------------------------

test("command: the edited correction is persisted and survives the pending-candidate reopen", async () => {
  const root = fixture();
  const runId = "run-cmd-edit-persist";
  openRevisionChain(root, runId);
  const edited = "require explicit invitation tokens";
  // Session 1: continue → edit → planner → candidate → dismiss the decision.
  const human1 = new ScriptedHuman();
  human1.selects = ["continue", "dismiss"];
  human1.inputs = [edited];
  const agents1 = new RoleAgents({ plans: [VALID_PLAN] });
  const h1 = harness(root, runId, { agents: agents1, human: human1 });
  await runFlowRevise(h1.deps);
  await h1.detached[0];
  assert.match(agents1.requests[0]?.prompt ?? "", new RegExp(edited), "the planner applied the edit");
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate.rejected", "revision.candidate"],
    "the edit is authoritative (persisted event) BEFORE generation",
  );

  // Session 2: reopen → the pending candidate approves with the edit bound.
  const human2 = new ScriptedHuman();
  human2.selects = ["continue", "approve"];
  const h2 = harness(root, runId, { human: human2 });
  await runFlowRevise(h2.deps);
  await waitForSuccessorSettled(root, successorRunId(runId));
  const approval = readRunLog(root, runId).find(
    (event): event is Extract<WorkflowEvent, { type: "revision.approved" }> => event.type === "revision.approved",
  );
  assert.equal(approval?.correction, edited, "the approval binds the correction that actually drove the plan");
  rmSync(root, { recursive: true, force: true });
});

test("command: a stop during the candidate decision prevents the approval and the launch", async () => {
  const root = fixture();
  const runId = "run-cmd-stop-decide";
  openRevisionChain(root, runId);
  const human = new ScriptedHuman();
  human.selects = ["continue", "approve"];
  human.inputs = [""]; // keep the recorded correction
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { agents, human });
  const origSelect = human.select.bind(human);
  human.select = async (q) => {
    const answer = await origSelect(q);
    // /flow stop lands while the candidate decision dialog is open.
    if (q.message.includes("candidate ready")) {
      const slot = h.slot();
      assert.ok(slot);
      requestFlowStop(slot, () => slot.abort.abort());
    }
    return answer;
  };

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.equal(countType(readRunLog(root, runId), "revision.approved"), 0, "no approval during cancellation");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"]);
  assert.equal(h.slot(), null, "the session settled and cleared the slot");
  assert.ok(
    h.notifications.some((n) => /revision session cancelled/.test(n.message)),
    "the settlement reports the cancellation, not a launch",
  );
  assert.ok(
    !h.notifications.some((n) => /launched from the approved revision/.test(n.message)),
    "no successor was launched from a cancelled session",
  );
  rmSync(root, { recursive: true, force: true });
});

test("command: the candidate content and the abandonment disclosure reach the dialog surface", async () => {
  const root = fixture();
  const runId = "run-cmd-content";
  openRevisionChain(root, runId);
  const human = new ScriptedHuman();
  // Abandon at the resume dialog, then confirm — the §14 disclosure must be
  // in the CONFIRM dialog (message/detail reach Pi positionally; select
  // descriptions do not).
  human.selects = ["abandon"];
  human.confirms = [true];
  const h = harness(root, runId, { human });

  // First, verify the candidate content on a continuation (separate fixture).
  const root2 = fixture();
  const runId2 = "run-cmd-content-2";
  openRevisionChain(root2, runId2);
  const human2 = new ScriptedHuman();
  human2.selects = ["continue", "dismiss"]; // decide dismissed — content shown
  human2.inputs = [""]; // keep the recorded correction
  const h2 = harness(root2, runId2, { human: human2, agents: new RoleAgents({ plans: [VALID_PLAN] }) });
  await runFlowRevise(h2.deps);
  await h2.detached[0];
  const decide = human2.selectQuestions.find((q) => q.message.includes("candidate ready"));
  assert.ok(decide, "the candidate decision dialog opened");
  assert.ok(decide.message.includes(CANDIDATE_PRD), "the PRD body is presented in the visible message");
  assert.ok(decide.message.includes(CANDIDATE_TASKS), "the tasks body is presented in the visible message");

  await runFlowRevise(h.deps);
  await h.detached[0];
  const confirmDialog = human.confirmQuestions[0];
  assert.ok(confirmDialog, "abandoning asks a visible confirm dialog");
  assert.match(confirmDialog.message, /Abandon revision 1 of run-cmd-content/);
  assert.match(confirmDialog.detail ?? "", /stays terminal/, "the §14 disclosure is visible, not hidden in a description");
  rmSync(root, { recursive: true, force: true });
  rmSync(root2, { recursive: true, force: true });
});

test("command: a throwing human.notify never aborts the session (zero-skill informational path)", async () => {
  const root = fixture();
  const runId = "run-cmd-notify-throw";
  openRevisionChain(root, runId);
  const human = new ScriptedHuman();
  human.selects = ["continue", "dismiss"];
  human.inputs = [""]; // keep the recorded correction
  human.notify = () => {
    throw new Error("stale ctx notify");
  };
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { agents, human });

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.equal(agents.requests.filter((r) => r.role === "planner").length, 1, "the planner ran despite the throwing notify");
  assert.equal(h.slot(), null, "the session settled normally");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"]);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Review round 2 regressions (2026-11-18: three findings)
// ---------------------------------------------------------------------------

test("command: a stop during the launch confirmation prevents the successor from starting", async () => {
  const root = fixture();
  const runId = "run-cmd-stop-launch";
  openRevisionChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const git = new FakeGit();
  const human = new ScriptedHuman();
  human.selects = ["continue", "approve", "approve", "launch"]; // resume → decide → §10 approval → §10 launch
  human.inputs = [""]; // keep the recorded correction
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { human, git, agents });
  const origSelect = human.select.bind(human);
  human.select = async (q) => {
    const value = await origSelect(q);
    if (q.message.includes("candidate ready")) git.patch = `${LAUNCH_PATCH}\n+changed`; // the tree moves before approval
    if (q.message.includes("Launch the successor")) {
      // /flow stop lands while the launcher's §10 dialog is open.
      const slot = h.slot();
      assert.ok(slot, "the revision session still owns the slot during the launch dialog");
      requestFlowStop(slot, () => slot.abort.abort());
    }
    return value;
  };

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.equal(
    agents.requests.filter((r) => r.role === "developer").length,
    0,
    "cancellation is respected up to the handoff: zero developer calls",
  );
  // The approval and the pointer are persisted; the successor is seeded but
  // never started — the pointer-plus-incomplete state stays recoverable.
  assert.equal(countType(readRunLog(root, runId), "revision.approved"), 1);
  assert.equal(countType(readRunLog(root, runId), "revision.launched"), 1);
  const successorId = successorRunId(runId);
  assert.equal(countType(readRunLog(root, successorId), "workflow.resumed"), 0, "the successor never started");
  assert.equal(resumeRevisionRefusal(readRunLog(root, runId), root)?.type, "revision_launch_incomplete");
  assert.ok(
    h.notifications.some((n) => /launch was cancelled before the handoff/.test(n.message)),
    "the cancellation is reported as such, not as a failure",
  );
  const lock = acquireRunLock(root, { runId: successorId, workflow: "check" });
  assert.ok(lock.ok, "the repair released the lock — the handoff never happened");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("command: repeated corrections A → B → A stay authoritative in the lifecycle", async () => {
  const root = fixture();
  const runId = "run-cmd-aba";
  openRevisionChain(root, runId);
  const A = "require invitation tokens";
  const B = "require mandatory SSO";
  for (const edit of [A, B]) {
    const human = new ScriptedHuman();
    human.selects = ["continue"];
    human.inputs = [edit];
    const h = harness(root, runId, { human, agents: new RoleAgents({ plannerAborted: true }) });
    await runFlowRevise(h.deps);
    await h.detached[0];
  }
  const human = new ScriptedHuman();
  human.selects = ["continue", "dismiss"];
  human.inputs = [A]; // re-edit A after B: a NEW logical edit, not a retry
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { agents, human });

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.match(agents.requests[0]?.prompt ?? "", new RegExp(A), "the planner received A");
  const lifecycle = revisionLifecycle(readRunLog(root, runId));
  assert.ok(lifecycle.state === "open" || lifecycle.state === "candidate-pending", "the revision is still active");
  assert.equal(lifecycle.correction, A, "the lifecycle reconstructs A, not B");
  const rejected = readRunLog(root, runId).filter(
    (event): event is Extract<WorkflowEvent, { type: "revision.candidate.rejected" }> =>
      event.type === "revision.candidate.rejected",
  );
  assert.equal(rejected.length, 3, "three distinct edit events — the third A is never reconciled away");
  assert.deepEqual(
    rejected.map((event) => new Set([event.notes])),
    [new Set([A]), new Set([B]), new Set([A])],
  );
  assert.equal(new Set(rejected.map((event) => event.eventId)).size, 3, "distinct eventIds");
  rmSync(root, { recursive: true, force: true });
});

test("command: the resumed session routes the persisted stack's planner skills", async () => {
  const root = fixture();
  const runId = "run-cmd-resume-skills";
  openRevisionChain(root, runId);
  const human = new ScriptedHuman();
  human.selects = ["continue", "dismiss"];
  human.inputs = [""]; // keep the recorded correction
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { agents, human });
  h.deps.availableSkills = new Set(["nodejs-best-practices"]);

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.deepEqual(
    agents.requests[0]?.skills,
    ["nodejs-best-practices"],
    "the resume entry routes skills by the persisted stack, like the fresh-open entry",
  );
  rmSync(root, { recursive: true, force: true });
});

test("command: repeated transition A → B → A → B keeps the last edit authoritative", async () => {
  const root = fixture();
  const runId = "run-cmd-abab";
  openRevisionChain(root, runId);
  const A = "require invitation tokens";
  const B = "require mandatory SSO";
  for (const edit of [A, B, A]) {
    const human = new ScriptedHuman();
    human.selects = ["continue"];
    human.inputs = [edit];
    const h = harness(root, runId, { human, agents: new RoleAgents({ plannerAborted: true }) });
    await runFlowRevise(h.deps);
    await h.detached[0];
  }
  const human = new ScriptedHuman();
  human.selects = ["continue", "dismiss"];
  human.inputs = [B]; // the SAME transition A → B as edits #1→#2: never deduplicated
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { agents, human });

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.match(agents.requests[0]?.prompt ?? "", new RegExp(B), "the planner received B");
  const lifecycle = revisionLifecycle(readRunLog(root, runId));
  assert.ok(lifecycle.state === "open" || lifecycle.state === "candidate-pending", "the revision is still active");
  assert.equal(lifecycle.correction, B, "the lifecycle reconstructs B, not the stale A");
  const rejected = readRunLog(root, runId).filter(
    (event): event is Extract<WorkflowEvent, { type: "revision.candidate.rejected" }> =>
      event.type === "revision.candidate.rejected",
  );
  assert.equal(rejected.length, 4, "four distinct edit events");
  assert.equal(new Set(rejected.map((event) => event.eventId)).size, 4, "every edit instance has its own eventId");
  rmSync(root, { recursive: true, force: true });
});

test("command: a failed diff read with recorded evidence refuses the approval (fail-closed)", async () => {
  const root = fixture();
  const runId = "run-cmd-diff-error";
  openRevisionChain(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const git = new FakeGit();
  const human = new ScriptedHuman();
  human.selects = ["continue", "approve"]; // decide → the approval-time §10 read fails
  human.inputs = [""]; // keep the recorded correction
  const agents = new RoleAgents({ plans: [VALID_PLAN] });
  const h = harness(root, runId, { human, git, agents });
  const origSelect = human.select.bind(human);
  human.select = async (q) => {
    const value = await origSelect(q);
    if (q.message.includes("candidate ready")) {
      git.diffSince = async () => {
        throw new Error("unresolvable baseline");
      };
    }
    return value;
  };

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.equal(countType(readRunLog(root, runId), "revision.approved"), 0, "no approval on an unreadable diff — never silently skipped");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"], "the candidate stays pending");
  assert.match(
    human.notices.at(-1) ?? "",
    /could not be read to verify the approval/,
    "the refusal is reported to the user with the read error",
  );
  assert.equal(h.slot(), null, "the session settled recoverable");
  const lock = acquireRunLock(root, { runId, workflow: "check" });
  assert.ok(lock.ok, "the session lock was released");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("command: a setup failure after activation settles the session slot and is reported", async () => {
  const root = fixture();
  const runId = "run-cmd-setup-fail";
  openRevisionChain(root, runId);
  // A profile that EXISTS but includes a missing one: the top-level
  // existsSync guard passes and selectSkills throws — the post-activation
  // guard must settle the session instead of rejecting the detached promise
  // with the slot stuck on revision/running.
  const profiles = join(root, "profiles");
  mkdirSync(profiles);
  writeFileSync(join(profiles, "nodejs.list"), "@include missing-profile\n");
  const human = new ScriptedHuman();
  human.selects = ["continue"];
  human.inputs = [""]; // never consumed: the failure precedes the dialogs
  const h = harness(root, runId, { human });
  h.deps.profilesDir = profiles;

  await runFlowRevise(h.deps);
  const results = await Promise.allSettled(h.detached);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled"],
    "the detached promise settles — an unhandled rejection must never surface a setup fault",
  );
  assert.equal(h.slot(), null, "the setup failure cleared the session slot — later starts are not blocked");
  assert.ok(
    h.notifications.some((n) => /could not start the revision session/.test(n.message)),
    "the failure is reported through the UI, best-effort",
  );
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started"],
    "nothing NEW was appended — the failure precedes the session core (the started event is the fixture's)",
  );
  rmSync(root, { recursive: true, force: true });
});
