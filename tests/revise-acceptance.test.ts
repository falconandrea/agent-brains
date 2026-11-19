/**
 * T9 — acceptance-scenario end-to-end coverage (spec.md §17, AC-1…AC-13).
 *
 * Fake-driven journeys through the REAL command orchestration
 * (`runFlowRevise` → revision session → `repairRevisionLaunch` →
 * `launchSuccessorRun` → `runFeatureWorkflow`) and the REAL ordinary-resume
 * pipeline (`replayRunLog` → `validateResumePreconditions` → `launchRun` →
 * `runFeatureWorkflow`), reusing the established fake agent/git/human/verifier
 * patterns from tests/feature-workflow.test.ts, tests/revise.test.ts and
 * tests/revise-command.test.ts. Fixture scope only — no live TUI, no real
 * providers (spec §17 boundary).
 *
 * AC map (criterion → observing tests and assertions):
 * - AC-1  → "stop during develop …" (revision events precede every artifact
 *   mutation; the approved artifacts change only as the approval's effect)
 *   and "B8 …" (unverifiable approval contents refuse execution).
 * - AC-2  → "stop during develop …" (the persisted approval's candidate and
 *   contract shas equal the sidecar, promoted and successor-seed contents).
 * - AC-3  → "stop during develop …" (git.baseline is never called anywhere on
 *   the successor path; every diffSince runs on the ORIGINAL base commit; the
 *   seed re-records the original baseline) and the abandonment-resume tests
 *   (an ordinary resume after abandon never re-snapshots either).
 * - AC-4  → "stop during develop …" (the predecessor's stale review verdict
 *   and stale passing verification stay in P's log; the successor runs its
 *   own fresh developer/reviewer/verify passes with no stale fix items) and
 *   "two sequential successor resumes …" (counters and findings re-derived
 *   from the successor log only).
 * - AC-5  → the B0, B1, B2, B2b, B4, B4a, B5a, B7 and B8 acceptance tests.
 *   B7a (pointer, absent successor log) and B7b (pointer, seeded stub
 *   without the marker) complete directly through /flow revise; the B7c
 *   re-entry (stub WITH the marker, repeated repairs) is its own test. B3,
 *   B5 and B6 are single deterministic steps of the §7 sequence and run
 *   inside those journeys (the B7 journeys execute the B3→B6 promotion on
 *   the command path; B4a(c) is B5's repair) — their isolated fault staging
 *   is pinned at repair level in tests/revise.test.ts.
 * - AC-6  → "malformed output, reject-with-notes and the round budget …"
 *   (rounds recounted from events; invalid output persists its artifact and
 *   consumes no round) and "two sequential successor resumes …" (verify
 *   retries stay banked; counters identical across resumes).
 * - AC-7  → "crash healing and adversarial revision.* injections …" plus the
 *   existing regression suites (tests/resume.test.ts replay-injection test
 *   and already_decided heal tests, unchanged).
 * - AC-8  → the abandonment tests per predecessor status (interrupted/failed
 *   ordinarily resumable again under the old contract; cancelled/needs_human
 *   still refuse terminal_outcome — the refusal is asserted, not a promise).
 * - AC-9  → "B2b …" (the retry lands exactly ONE approval; nothing promotes
 *   without a verified persisted approval) and "B2b … landed-but-unverified"
 *   (the approval write lands, injectFaultAfterAppend fails the strict
 *   verification, appendCritical's real re-read reconciliation settles ONE
 *   copy, the regenerated-timestamp retry reconciles to the SAME copy, and
 *   the repair promotes and launches on it) plus the canonical-equality
 *   matrix pinned by tests/run-log.test.ts (fresh-timestamp reconcile,
 *   divergent-projection refuse, unreadable-log refuse, retry only after
 *   proven absence) and the repair-level B2b tests in tests/revise.test.ts.
 * - AC-10 → "B8 …" (only the explicit forced abandon lifts the block, with
 *   the honest disk report) and "changed partial work …" (a declined launch
 *   leaves the approved state recoverable; no post-promotion abandonment
 *   exists).
 * - AC-11 → "stop during develop …" and "two sequential successor resumes …"
 *   (the correction reaches both prompts at EVERY resume, reconstructed from
 *   the successor log, never from the launching process's memory).
 * - AC-12 → "stop during develop …" (the archive holds the original bytes)
 *   and "B4a …" (a verified archive is skipped untouched; a damaged one
 *   refuses on the normal and the step-1→5 skip path; a lost one is
 *   reported and does not block the approved launch).
 * - AC-13 → "B5a …" (only the missing spec.approved appends after prefix
 *   verification; divergent and spec-first seeds refuse byte-identically).
 *
 * §17 row-5 elements exercised elsewhere by existing suites (referenced, not
 * duplicated): the lock-held and cancelling refusals are pinned end-to-end in
 * tests/revise-command.test.ts; the §13 launch-time preflight regressions
 * (changed digest, changed frozen script, unreadable state, dialog-window
 * TOCTOU) live in tests/revise.test.ts's T7 rounds.
 *
 * Run: `node --test tests/revise-acceptance.test.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runFlowRevise, type FlowReviseDeps, type ReviseActiveRun } from "../src/revise-command.ts";
import {
  canonicalSuccessorSeed,
  launchIncomplete,
  repairRevisionLaunch,
  resumeRevisionRefusal,
  revisionEligibility,
  revisionLifecycle,
  revisionSidecarDir,
  runRevisionSessionCore,
  successorRunId,
  type RevisionSessionDeps,
} from "../src/workflows/revise.ts";
import { descriptionMarker, runFeatureWorkflow, validatePlannerOutput, type FeatureDeps, type ResumeState } from "../src/workflows/feature.ts";
import { healAlreadyDecided, replayRunLog, validateResumePreconditions } from "../src/workflows/resume.ts";
import { launchRun } from "../src/run-launcher.ts";
import { CriticalAppendError, RunLog, readRunLog, withEventId } from "../src/run-log.ts";
import { acquireRunLock } from "../src/run-lock.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { digestScripts, type VerifyCommand, type VerifyFreeze } from "../src/verify.ts";
import type {
  ConfirmQuestion,
  CommandResult,
  GitBaseline,
  GitService,
  HumanInput,
  SelectQuestion,
  VerifyRunner,
  WorkflowEvent,
} from "../src/ports.ts";
import { UserDismissedError } from "../src/ports.ts";
import { requestFlowStop, type FlowRunStatus } from "../src/pi/flow-stop.ts";
import type { AgentRunRequest, AgentRunResult, AgentRunner } from "../src/agent.ts";

// --- fixtures ---------------------------------------------------------------

const sha = (content: string): string => createHash("sha256").update(content).digest("hex");
const fixture = (): string => mkdtempSync(join(tmpdir(), "pi-brain-revise-acc-"));

const DESCRIPTION = "add user auth";
const SLUG = "add-user-auth";
const MARKER = descriptionMarker(DESCRIPTION);
const PRD_BODY = "Build the thing.";
const TASKS_BODY = "## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const CORRECTION = "make auth optional";
const LAUNCH_PATCH = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+work";
/** The stopped predecessor's partial work, served by the acceptance git fake. */
const PARTIAL_WORK_PATCH = "diff --git a/src/a.ts\n@@ -1 +1 @@\n+partial work from the stopped predecessor";
/** The ORIGINAL plan the fresh predecessor's gate approves (TITLE slugs to SLUG). */
const ORIGINAL_PLAN =
  "## TITLE\nAdd user auth\n\n## PRD\nBuild the thing.\n\n## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
if (!validatePlannerOutput(ORIGINAL_PLAN).valid) throw new Error("fixture original plan must validate");

const EMPTY_FREEZE: VerifyFreeze = {
  commands: [],
  scripts: {},
  scriptsDigest: digestScripts({}),
  perimeter: "root",
};
const FROZEN_SCRIPTS = { "package.json": { test: "npm test" } } as VerifyFreeze["scripts"];
const SCRIPT_FREEZE: VerifyFreeze = {
  commands: [],
  scripts: FROZEN_SCRIPTS,
  scriptsDigest: digestScripts(FROZEN_SCRIPTS),
  perimeter: "root",
};

const VALID_PLAN_A =
  "## TITLE\nAdd Invitations\n\n## PRD\nRevised body one.\n\n## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const VALID_PLAN_B =
  "## TITLE\nAdd Invitations\n\n## PRD\nRevised body two.\n\n## TASKS\n- T1 — do it. Files: `src/a.ts`.\n";
const INVALID_PLAN = "a conversational reply with no plan structure at all";
const planValidation = validatePlannerOutput(VALID_PLAN_A);
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

const artifactPaths = (root: string) => ({
  prd: join(root, ".ai", "features", SLUG, `prd-${SLUG}.md`),
  tasks: join(root, ".ai", "features", SLUG, `tasks-${SLUG}.md`),
});

interface PredecessorOptions {
  status?: "cancelled" | "needs_human" | "completed";
  /** No outcome — interrupted mid-loop (replayable). */
  interrupted?: boolean;
  /** workflow.failed after provider death (no outcome, replayable). */
  failed?: boolean;
  /** Stale evidence already in the log: a review verdict AND a passing
   * verification that judged the OLD contract (AC-4's stale half). */
  staleReview?: boolean;
  repoStateDigest?: string;
  freeze?: VerifyFreeze;
}

/** Writes the approved artifacts and the predecessor's execution log. */
function writePredecessor(root: string, runId: string, opts: PredecessorOptions = {}): void {
  const spec = writeArtifacts(root);
  const events: WorkflowEvent[] = [
    {
      type: "workflow.started",
      runId,
      workflow: "feature",
      description: DESCRIPTION,
      baseline: "snap-base",
      stack: { primary: "nodejs", frameworks: ["express"] },
      ignoreRulesDigest: "rules-1",
      ...(opts.repoStateDigest !== undefined ? { repoStateDigest: opts.repoStateDigest } : { repoStateDigest: "stable-digest" }),
      ...(opts.freeze !== undefined ? { verify: opts.freeze } : {}),
    },
    { type: "phase.started", runId, phase: "discover" },
    { type: "phase.started", runId, phase: "spec" },
    { type: "agent.completed", runId, role: "planner", usage: { input: 100, output: 50 } },
    { type: "spec.approved", runId, ...spec },
    { type: "phase.started", runId, phase: "develop" },
    { type: "agent.completed", runId, role: "developer", usage: { input: 200, output: 100 } },
  ];
  if (opts.staleReview) {
    events.push({ type: "verification.completed", runId, passed: true });
    events.push({
      type: "review.completed",
      runId,
      verdict: "approved",
      round: 1,
      issues: [],
    });
  }
  if (opts.failed) events.push({ type: "workflow.failed", runId, error: "provider died" });
  if (opts.status) events.push({ type: "workflow.outcome", runId, status: opts.status });
  const log = RunLog.open(root, runId);
  for (const event of events) log.append(event);
}

// --- revision-event staging (the state a crash leaves behind) ----------------

const runLogPathOf = (root: string, runId: string): string => join(root, ".pi", "pi-brain", "runs", `${runId}.jsonl`);

const appendRevisionEvent = (root: string, runId: string, event: object): void => {
  new RunLog(runLogPathOf(root, runId)).appendCritical(event as Parameters<RunLog["appendCritical"]>[0]);
};

const readEvents = (root: string, runId: string): WorkflowEvent[] => readRunLog(root, runId);

const countType = (events: WorkflowEvent[], type: string): number => events.filter((event) => event.type === type).length;

const outcomeOf = (events: WorkflowEvent[]): Extract<WorkflowEvent, { type: "workflow.outcome" }> | undefined =>
  events.find((event): event is Extract<WorkflowEvent, { type: "workflow.outcome" }> => event.type === "workflow.outcome");

const revisionTypes = (root: string, runId: string): string[] =>
  readEvents(root, runId)
    .map((event) => event.type)
    .filter((type) => type.startsWith("revision."));

const fileBytes = (path: string): string => readFileSync(path, "utf8");

const sidecarPaths = (root: string, runId: string) => {
  const dir = revisionSidecarDir(root, runId);
  return {
    dir,
    candidatePrd: join(dir, "candidate-prd.md"),
    candidateTasks: join(dir, "candidate-tasks.md"),
    archivePrd: join(dir, "previous-prd.md"),
    archiveTasks: join(dir, "previous-tasks.md"),
  };
};

/** Writes the sidecar candidate files exactly as a live session would. */
function stageCandidateFiles(root: string, runId: string, body: "valid" | "damaged" = "valid"): void {
  const sidecar = sidecarPaths(root, runId);
  mkdirSync(sidecar.dir, { recursive: true });
  writeFileSync(sidecar.candidatePrd, body === "valid" ? CANDIDATE_PRD : "corrupted-prd", "utf8");
  writeFileSync(sidecar.candidateTasks, body === "valid" ? CANDIDATE_TASKS : "corrupted-tasks", "utf8");
}

function stageRevisionStarted(root: string, runId: string, opts: { partialPatchSha?: string } = {}): void {
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

function stageRevisionCandidate(root: string, runId: string, body: "valid" | "damaged" = "valid"): void {
  stageCandidateFiles(root, runId, body);
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
}

function stageRevisionApproval(root: string, runId: string, opts: { pointer?: boolean } = {}): void {
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
}

/** The canonical successor seed, derived exactly as the repair derives it. */
function canonicalSeedOf(root: string, runId: string): { started: WorkflowEvent; spec: WorkflowEvent } {
  const events = readEvents(root, runId);
  const predStarted = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> => event.type === "workflow.started",
  )!;
  const verdict = revisionEligibility(events);
  if (!("eligible" in verdict) || !verdict.eligible) throw new Error("acceptance fixture predecessor must be eligible");
  const approval = events.find(
    (event): event is Extract<WorkflowEvent, { type: "revision.approved" }> => event.type === "revision.approved",
  )!;
  return canonicalSuccessorSeed(predStarted, approval, verdict.usage);
}

// --- fakes ------------------------------------------------------------------

/**
 * The git fake used on the SUCCESSOR path: `baseline` THROWS, because no
 * successor (and no post-abandon resume) may re-snapshot — the original
 * baseline is always rebuilt from the persisted log (AC-3).
 */
class NoRebaselineGit implements GitService {
  digest = "stable-digest";
  patches: string[] = [LAUNCH_PATCH];
  readStateFails = false;
  baselineCalls = 0;
  readonly diffBaseCommits: string[] = [];
  async baseline(): Promise<GitBaseline> {
    this.baselineCalls += 1;
    throw new Error("git.baseline MUST NOT run on a successor or resumed run — the original baseline is persisted");
  }
  async repoStateDigest(): Promise<string> {
    if (this.readStateFails) throw new Error("git for-each-ref failed (128): fatal: not a git repository");
    return this.digest;
  }
  async diffSince(baseline: GitBaseline): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    this.diffBaseCommits.push(baseline.baseCommit);
    const patch = this.patches.length > 1 ? this.patches.shift()! : (this.patches[0] ?? "");
    return { patch, files: ["src/a.ts"], dirtySubmodules: [] };
  }
}

class ScriptedHuman implements HumanInput {
  inputs: string[] = [];
  selects: string[] = [];
  confirms: Array<boolean | "dismiss"> = [];
  readonly selectQuestions: Array<{ message: string; options: Array<{ value: string; description?: string }> }> = [];
  readonly confirmQuestions: Array<{ message: string; detail?: string }> = [];
  readonly notifications: string[] = [];
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
    this.notifications.push(message);
  }
}

/**
 * One fake runtime for every role the command path touches: the revision
 * session's planner and the successor's developer/reviewer. Developer and
 * reviewer entries may be queued Errors — a thrown entry models a provider
 * death, which the launcher persists as `workflow.failed` (replayable).
 */
class RoleAgents implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  readonly #planners: string[];
  readonly #developers: Array<AgentRunResult | Error>;
  readonly #reviewers: Array<AgentRunResult | Error>;
  constructor(opts: { plans?: string[]; developers?: Array<AgentRunResult | Error>; reviewers?: Array<AgentRunResult | Error> } = {}) {
    this.#planners = opts.plans ?? [];
    this.#developers = opts.developers ?? [];
    this.#reviewers = opts.reviewers ?? [];
  }
  plannerCalls(): number {
    return this.requests.filter((request) => request.role === "planner").length;
  }
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    if (request.role === "planner") {
      const text = this.#planners.length > 1 ? this.#planners.shift()! : (this.#planners[0] ?? "");
      return { role: "planner", text, aborted: false };
    }
    if (request.role === "developer") {
      const next = this.#developers.length > 1 ? this.#developers.shift()! : (this.#developers[0] ?? { role: "developer", text: "work done", aborted: false, usage: { input: 50, output: 25 } });
      if (next instanceof Error) throw next;
      return next;
    }
    const next = this.#reviewers.length > 1 ? this.#reviewers.shift()! : (this.#reviewers[0] ?? {
      role: "reviewer",
      text: "",
      aborted: false,
      structured: { verdict: "approved", summary: "ok", issues: [] },
      usage: { input: 30, output: 15 },
    });
    if (next instanceof Error) throw next;
    return next;
  }
}

/** Queued verify exits — the last one repeats; `[]` means every run passes. */
class QueuedVerifier implements VerifyRunner {
  readonly calls: VerifyCommand[] = [];
  #exits: number[];
  constructor(exits: number[] = []) {
    this.#exits = exits;
  }
  async run(commands: VerifyCommand[]): Promise<CommandResult[]> {
    const exit = this.#exits.length > 1 ? this.#exits.shift()! : (this.#exits[0] ?? 0);
    this.calls.push(...commands);
    return commands.map((command) => ({ command: command.command, exitCode: exit, output: "" }));
  }
}

/**
 * Git for a run that must take its OWN original snapshot once (the fresh
 * predecessor) and then serve the partial-work patch for every diff. Counts
 * baseline calls so the acceptance tests can prove the successor path adds
 * none beyond the original run's own snapshot (AC-3).
 */
class SnapshotGit implements GitService {
  digest = "stable-digest";
  patch = PARTIAL_WORK_PATCH;
  baselineCalls = 0;
  readonly diffBaseCommits: string[] = [];
  async baseline(cwd: string): Promise<GitBaseline> {
    this.baselineCalls += 1;
    return { repoRoot: cwd, branch: "main", headSha: "h", baseCommit: "snap-base", ignoreRulesDigest: "rules-1" };
  }
  async repoStateDigest(): Promise<string> {
    return this.digest;
  }
  async diffSince(baseline: GitBaseline): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    this.diffBaseCommits.push(baseline.baseCommit);
    return { patch: this.patch, files: ["src/a.ts"], dirtySubmodules: [] };
  }
}

/**
 * Agents for the predecessor's real fresh run up to the stop: the planner
 * returns the ORIGINAL plan (whose TITLE slugs to the fixture's own feature
 * directory, so the gate-written artifacts match the established fixture
 * paths and hashes), and the developer pass can be held mid-flight — the
 * window where `/flow stop` lands.
 */
class StopDuringDevelopAgents implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  #releaseDeveloper?: () => void;
  #resolveDeveloperStarted?: () => void;
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
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    if (request.role === "planner") {
      return { role: "planner", text: ORIGINAL_PLAN, aborted: false, usage: { input: 100, output: 50 } };
    }
    if (request.role === "developer") {
      this.#resolveDeveloperStarted?.();
      await this.#releaseDeveloper;
      return { role: "developer", text: "partial work done", aborted: false, usage: { input: 200, output: 100 } };
    }
    return reviewOf("approved");
  }
}

/**
 * B2b: the approval write LANDS but the strict post-append verification
 * FAILS — `injectFaultAfterAppend` appends a foreign line after the physical
 * write (the provocation from tests/revise.test.ts's repair-B2b test), so
 * verification observes a log whose last line is not the approval.
 * `appendCritical`'s own re-read reconciliation must then find the approval
 * canonically intact and settle the append as ONE persisted copy.
 */
class LandedApprovalLog extends RunLog {
  readonly #path: string;
  #faulted = false;
  constructor(path: string) {
    super(path);
    this.#path = path;
  }
  override appendCritical(
    event: Parameters<RunLog["appendCritical"]>[0],
    options?: Parameters<RunLog["appendCritical"]>[1],
  ): void {
    if (event.type === "revision.approved" && !this.#faulted) {
      this.#faulted = true;
      return super.appendCritical(event, {
        ...options,
        injectFaultAfterAppend: () => {
          appendFileSync(
            this.#path,
            `${JSON.stringify({ type: "phase.started", runId: event.runId, phase: "foreign" })}\n`,
            "utf8",
          );
        },
      });
    }
    return super.appendCritical(event, options);
  }
}

const PROFILES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");

interface Harness {
  deps: FlowReviseDeps;
  notifications: Array<{ message: string; level: string }>;
  slot: () => ReviseActiveRun | null;
  detached: Array<Promise<void>>;
  agents: RoleAgents;
  human: ScriptedHuman;
  git: GitService;
}

function harness(
  root: string,
  runId: string,
  opts: {
    agents?: RoleAgents;
    git?: GitService;
    human?: ScriptedHuman;
    verifier?: VerifyRunner;
    /** Omit the stack override so the successor's resolveStack asks the human. */
    omitStack?: boolean;
  } = {},
): Harness {
  const notifications: Array<{ message: string; level: string }> = [];
  const detached: Array<Promise<void>> = [];
  let slot: ReviseActiveRun | null = null;
  const agents = opts.agents ?? new RoleAgents({ plans: [VALID_PLAN_A] });
  const human = opts.human ?? new ScriptedHuman();
  const git = opts.git ?? new NoRebaselineGit();
  const config = { ...DEFAULT_CONFIG, ...(opts.omitStack ? {} : { stack: "nodejs" }) };
  const deps: FlowReviseDeps = {
    cwd: root,
    runId,
    active: null,
    setActive: (next) => {
      slot = next;
    },
    notify: (message, level) => {
      notifications.push({ message, level });
    },
    human,
    createAgents: async () => agents,
    makeAbort: () => new AbortController(),
    config,
    profilesDir: PROFILES_DIR,
    availableSkills: new Set<string>(),
    verifier: opts.verifier ?? { run: async () => [] },
    git,
    history: () => {},
    setStatus: () => {},
    bell: () => {},
    onDetached: (run) => void detached.push(run),
  };
  return { deps, notifications, slot: () => slot, detached, agents, human, git };
}

async function waitForSuccessorSettled(root: string, successorId: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!readEvents(root, successorId).some((event) => event.type === "workflow.outcome" || event.type === "workflow.failed")) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for the successor ${successorId} to settle`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Waits for a NEW terminal event beyond `failedBefore` (a successor whose log already holds failures). */
async function waitForNewSuccessorTerminal(root: string, successorId: string, failedBefore: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const settled = (): boolean => {
    const events = readEvents(root, successorId);
    return events.some((event) => event.type === "workflow.outcome") || countType(events, "workflow.failed") > failedBefore;
  };
  while (!settled()) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for the successor ${successorId} to settle again`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const devResult = (input = 50, output = 25): AgentRunResult => ({ role: "developer", text: "work done", aborted: false, usage: { input, output } });
const reviewOf = (verdict: "approved" | "changes_requested", issues: Array<{ id: string; severity: "blocking" | "warning"; category: string; problem: string }> = [], input = 30): AgentRunResult => ({
  role: "reviewer",
  text: "",
  aborted: false,
  structured: { verdict, summary: verdict === "approved" ? "ok" : "one bug", issues },
  usage: { input, output: 15 },
});
const R1 = { id: "R1", severity: "blocking" as const, category: "bug", problem: "off by one" };

/**
 * The REAL ordinary-resume pipeline, mirroring the extension's
 * `handleResume` composition with injected fakes: revision gate → replay →
 * precondition validation → lock → `launchRun` with the replayed phase and
 * the rebuilt original baseline. Returns the replayed state (observable
 * BEFORE and independent of the run) and the detached launch promise.
 *
 * Deliberate omission vs `handleResume`: the §10 changed-diff ask for a
 * replay that ends on an interrupted REVIEW phase (`askResumeWithChangedDiff`
 * when `interruptedPatchSha` is set). That sha is only recorded when the last
 * phase is a review, and in this file's fixtures the fake patch never differs
 * at resume time, so the ask would always answer "unchanged" — the branch is
 * unreachable here, and the changed-patch resume dialog is covered at unit
 * level in tests/resume.test.ts.
 */
async function ordinaryResume(
  root: string,
  runId: string,
  workflow: { agents: AgentRunner; human: HumanInput; verifier: VerifyRunner; git: GitService },
): Promise<{ state: ResumeState; detached: Promise<void> }> {
  const events = readEvents(root, runId);
  const revisionRefusal = resumeRevisionRefusal(events, root);
  if (revisionRefusal) throw new Error(`the revision gate refused: ${revisionRefusal.message}`);
  const replay = replayRunLog(events, { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
  if (!replay.ok) throw new Error(`replay refused (${replay.refusal.type}) — the acceptance fixture expected a resumable log`);
  const state = replay.state;
  const started = events[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  const baseline = {
    repoRoot: root,
    branch: "resumed",
    headSha: "unknown",
    baseCommit: started.baseline!,
    ...(started.ignoreRulesDigest !== undefined ? { ignoreRulesDigest: started.ignoreRulesDigest } : {}),
    ...(started.repoStateDigest !== undefined ? { repoStateDigest: started.repoStateDigest } : {}),
  };
  const description = started.description!;
  const precondition = await validateResumePreconditions({ cwd: root, description, git: workflow.git, baseline });
  if (precondition) throw new Error(`resume preconditions refused (${precondition.type})`);
  const lock = acquireRunLock(root, { runId, workflow: "feature" });
  if (!lock.ok) throw new Error(`the resume lock refused (${lock.reason})`);
  const config = { ...DEFAULT_CONFIG, stack: "nodejs" };
  const deps: FeatureDeps = {
    cwd: root,
    profilesDir: PROFILES_DIR,
    availableSkills: new Set<string>(),
    config,
    agents: workflow.agents,
    human: workflow.human,
    verifier: workflow.verifier,
    git: workflow.git,
    events: { emit: () => {} },
  };
  const detached = launchRun(
    {
      run: { runId, workflow: "feature", phase: state.phase, status: "running", events: [] },
      runLog: RunLog.open(root, runId),
      history: () => {},
      setStatus: () => {},
      notify: () => {},
      bell: () => {},
      lock,
    },
    (events) => runFeatureWorkflow({ ...deps, events }, description, runId, { ...state, baseline }),
    { resumedPhase: state.phase },
  );
  return { state, detached };
}

/** Fault-injects appendCritical once per event type (the B2b harness). */
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

const sessionCoreDeps = (root: string, runId: string, agents: AgentRunner, human: HumanInput, git: GitService, events?: RunLog): RevisionSessionDeps => ({
  cwd: root,
  runId,
  agents,
  human,
  git,
  events: events ?? RunLog.open(root, runId),
});

// ---------------------------------------------------------------------------
// §17 row 1 — stop during develop → revise → approve → continue
// (AC-1, AC-2, AC-3, AC-4, AC-11, AC-12)
// ---------------------------------------------------------------------------

test("acceptance §17: stop during develop → revise → approve → continue (AC-1/2/3/4/11/12)", async () => {
  const root = fixture();
  const runId = "run-acc-happy";
  // A cancelled predecessor with partial develop work AND stale evidence that
  // judged the OLD contract: a passing verification and an approved review
  // verdict (AC-4's stale half).
  writePredecessor(root, runId, { status: "cancelled", staleReview: true });
  // Real partial work on the tree — the revision must never touch it.
  const partialWork = join(root, "src", "a.ts");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(partialWork, "const a = 1; // partial work from the superseded contract\n", "utf8");
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const h = harness(root, runId, { agents });
  h.human.inputs = [CORRECTION];
  h.human.selects = ["approve"]; // candidate decision

  await runFlowRevise(h.deps);
  const successorId = successorRunId(runId);
  await waitForSuccessorSettled(root, successorId);
  await h.detached[0];

  // --- AC-1: the revision exists as its own chain of events, and the
  // approved artifacts changed only as the approval's effect. ---
  const pEvents = readEvents(root, runId);
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
    "P's revision chain is exactly the four lifecycle events",
  );
  assert.equal(countType(pEvents, "workflow.outcome"), 1, "the revision session/repair never appends an outcome to P");
  assert.equal(countType(pEvents, "workflow.failed"), 0);
  assert.equal(countType(pEvents, "workflow.completed"), 0);
  assert.equal(countType(pEvents, "review.completed"), 1, "the stale review verdict stays untouched in P's log");
  assert.equal(countType(pEvents, "verification.completed"), 1, "the stale verification stays untouched in P's log");

  // --- AC-12: the sidecar holds the candidate and the ORIGINAL artifact
  // bytes as the archive, written before any overwrite. ---
  const sidecar = sidecarPaths(root, runId);
  assert.equal(fileBytes(sidecar.candidatePrd), CANDIDATE_PRD);
  assert.equal(fileBytes(sidecar.candidateTasks), CANDIDATE_TASKS);
  assert.equal(fileBytes(sidecar.archivePrd), `${MARKER}\n${PRD_BODY}`, "the archive holds the ORIGINAL PRD bytes");
  assert.equal(fileBytes(sidecar.archiveTasks), `${MARKER}\n${TASKS_BODY}`, "the archive holds the ORIGINAL tasks bytes");

  // --- AC-2: the persisted approval binds the exact contents. ---
  const approval = pEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "revision.approved" }> => event.type === "revision.approved",
  )!;
  assert.equal(approval.candidate.prdSha, sha(fileBytes(sidecar.candidatePrd)), "the candidate shas bind the sidecar bytes");
  assert.equal(approval.candidate.tasksSha, sha(fileBytes(sidecar.candidateTasks)));
  const paths = artifactPaths(root);
  assert.equal(fileBytes(paths.prd), `${MARKER}\n${CANDIDATE_PRD}`, "promotion wrote marker + candidate body");
  assert.equal(approval.contract.prdSha, sha(fileBytes(paths.prd)), "the contract shas bind the promoted bytes");
  assert.equal(approval.contract.tasksSha, sha(fileBytes(paths.tasks)));
  assert.equal(approval.correction, CORRECTION);
  assert.equal(approval.predecessorStatus, "cancelled");

  // --- AC-3: the original baseline, never a new snapshot. ---
  const sEvents = readEvents(root, successorId);
  const seed = sEvents[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  assert.equal(seed.baseline, "snap-base", "the seed re-records the ORIGINAL baseline commit");
  assert.equal((h.git as NoRebaselineGit).baselineCalls, 0, "git.baseline never ran on the successor path");
  assert.ok((h.git as NoRebaselineGit).diffBaseCommits.length > 0, "the successor diffed at least once");
  assert.deepEqual(
    [...new Set((h.git as NoRebaselineGit).diffBaseCommits)],
    ["snap-base"],
    "every diffSince ran against the ORIGINAL base commit — never a fresh snapshot",
  );
  assert.deepEqual(seed.revision, { predecessorRunId: runId, revision: 1, correction: CORRECTION });

  // --- Both logs' full event shape. ---
  assert.equal(countType(sEvents, "workflow.started"), 1, "exactly one seed, never a second workflow.started");
  assert.equal(countType(sEvents, "workflow.resumed"), 1);
  const firstPhase = sEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "phase.started" }> => event.type === "phase.started",
  );
  assert.equal(firstPhase?.phase, "develop", "the successor enters at develop");
  assert.equal(outcomeOf(sEvents)?.status, "completed");
  const sSpec = sEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "spec.approved" }> => event.type === "spec.approved",
  )!;
  assert.equal(sSpec.prdSha, CONTRACT.prdSha, "the successor's own spec.approved re-records the NEW contract");
  assert.equal(sSpec.tasksSha, CONTRACT.tasksSha);

  // --- AC-4: stale verdicts cannot complete the successor. ---
  const devRequest = agents.requests.find((request) => request.role === "developer")!;
  assert.ok(!devRequest.prompt.includes("BLOCKING"), "no stale fix items reach the successor's developer");
  assert.ok(agents.requests.some((request) => request.role === "reviewer"), "the successor ran its OWN fresh review");
  assert.equal(countType(sEvents, "review.completed"), 1, "exactly one verdict exists — the successor's own fresh one");
  assert.equal(countType(sEvents, "verification.completed"), 1, "exactly one verification exists — the successor's own fresh pass");
  assert.equal(countType(pEvents, "review.completed"), 1, "P's stale verdict remains historical evidence only");
  assert.equal(countType(pEvents, "verification.completed"), 1, "P's stale verification remains historical evidence only");
  const successorReview = sEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "review.completed" }> => event.type === "review.completed",
  )!;
  assert.equal(successorReview.round, 1, "the successor's review numbering starts fresh (P's stale round-1 verdict stayed in P's log)");

  // --- §17 row 1: the partial work is still on disk, byte-identical. ---
  assert.equal(fileBytes(partialWork), "const a = 1; // partial work from the superseded contract\n", "the revision never touched the partial code");

  // --- AC-11: developer and reviewer prompts carry the correction and the
  // retention notes. ---
  assert.ok(devRequest.prompt.includes("PLAN REVISION CONTEXT"));
  assert.ok(devRequest.prompt.includes(CORRECTION), "the correction reaches the developer verbatim");
  assert.ok(devRequest.prompt.includes("do not revert unrelated partial work"), "the developer keeps the partial work");
  const reviewRequest = agents.requests.find((request) => request.role === "reviewer")!;
  assert.ok(reviewRequest.prompt.includes("PLAN REVISION"));
  assert.ok(reviewRequest.prompt.includes(CORRECTION), "the correction reaches the reviewer verbatim");
  assert.ok(reviewRequest.prompt.includes("not unrequested scope"), "the reviewer judges the full original diff against the revised contract");

  // --- Chain-cumulative usage (§11). ---
  const outcome = outcomeOf(sEvents)!;
  assert.equal(outcome.usage?.planner?.input, 100, "planner usage is the carried predecessor total");
  assert.equal(outcome.usage?.developer?.input, 250, "carried 200 + successor pass 50");
  assert.equal(outcome.usage?.reviewer?.input, 30);

  // --- The revision is terminal for P, pointing at the successor. ---
  const refusal = resumeRevisionRefusal(readEvents(root, runId), root);
  assert.equal(refusal?.type, "revised_by_successor");
  if (refusal?.type === "revised_by_successor") assert.equal(refusal.successorRunId, successorId);

  const lock = acquireRunLock(root, { runId: successorId, workflow: "feature" });
  assert.ok(lock.ok, "the lock was released when the successor settled");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

test("acceptance §17 entry: /flow stop during develop, then revise → approve → continue, delivers the previous work's diff to the reviewer", async () => {
  const root = fixture();
  const runId = "run-acc-stop-develop";
  const git = new SnapshotGit();

  // --- The predecessor runs FOR REAL until develop, where /flow stop lands. ---
  const predecessorAgents = new StopDuringDevelopAgents();
  const hold = predecessorAgents.holdDeveloper();
  const controller = new AbortController();
  const slot = {
    runId,
    workflow: "feature",
    phase: "develop",
    status: "running" as FlowRunStatus,
    events: [] as WorkflowEvent[],
    abort: controller,
  };
  const predecessorLock = acquireRunLock(root, { runId, workflow: "feature" });
  assert.ok(predecessorLock.ok, "the predecessor takes the repository lock");
  if (!predecessorLock.ok) return;
  const predecessorHuman = new ScriptedHuman();
  predecessorHuman.selects = ["approve"]; // the in-gate approval dialog
  const config = { ...DEFAULT_CONFIG, stack: "nodejs" };
  const predecessorDeps: FeatureDeps = {
    cwd: root,
    profilesDir: PROFILES_DIR,
    availableSkills: new Set<string>(),
    config,
    agents: predecessorAgents,
    human: predecessorHuman,
    verifier: { run: async () => [] },
    git,
    events: { emit: () => {} },
    signal: controller.signal,
  };
  const predecessorSettled = launchRun(
    { run: slot, runLog: RunLog.open(root, runId), history: () => {}, setStatus: () => {}, notify: () => {}, bell: () => {}, lock: predecessorLock },
    (events) => runFeatureWorkflow({ ...predecessorDeps, events }, DESCRIPTION, runId),
    {},
  );
  await predecessorAgents.developerStarted; // the run is mid-develop

  // The stop: the real /flow stop entry cancels the in-flight run.
  const decision = requestFlowStop(slot, () => controller.abort());
  assert.equal(decision.action, "cancellation_requested");
  predecessorAgents.releaseDeveloper();
  await predecessorSettled; // the cancelled outcome is persisted before asserting
  const pEvents = readEvents(root, runId);
  const stoppedOutcome = outcomeOf(pEvents);
  assert.equal(stoppedOutcome?.status, "cancelled", "the stop persisted a cancelled outcome at development");
  assert.equal(slot.status, "cancelled");
  assert.ok(pEvents.some((event) => event.type === "phase.started" && (event as { phase: string }).phase === "develop"), "the run reached develop before the stop");
  assert.equal(git.baselineCalls, 1, "exactly one snapshot: the predecessor's own original baseline");

  // --- The revision journey over the REALLY stopped predecessor. ---
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const h = harness(root, runId, { agents, git });
  h.human.inputs = [CORRECTION];
  h.human.selects = ["approve"];
  await runFlowRevise(h.deps);
  const successorId = successorRunId(runId);
  await waitForSuccessorSettled(root, successorId);
  await h.detached[0];

  // The full lifecycle ran over the genuinely stopped run.
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
  );
  const sEvents = readEvents(root, successorId);
  const successorOutcome = outcomeOf(sEvents)!;
  assert.equal(successorOutcome.status, "completed", "the successor completed the revised contract");
  const seed = sEvents[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
  assert.equal(seed.baseline, "snap-base", "the seed re-records the ORIGINAL baseline commit");
  assert.equal(git.baselineCalls, 1, "no second snapshot: the successor path never re-baselines (AC-3)");
  assert.deepEqual([...new Set(git.diffBaseCommits)], ["snap-base"], "every diff runs on the ORIGINAL base commit");

  // The reviewer judges the COMPLETE original-baseline diff — the previous
  // work's patch reaches its prompt (§17 row 1's final-review observable).
  const reviewRequest = agents.requests.find((request) => request.role === "reviewer")!;
  assert.ok(reviewRequest.prompt.includes("+partial work from the stopped predecessor"), "the reviewer receives the previous work's diff");
  assert.ok(reviewRequest.prompt.includes("PLAN REVISION"), "and the revised-contract note to judge it against");
  const devRequest = agents.requests.find((request) => request.role === "developer")!;
  assert.ok(devRequest.prompt.includes(CORRECTION));

  // The approval binds the gate-written artifacts as the base contract.
  const approval = readEvents(root, runId).find(
    (event): event is Extract<WorkflowEvent, { type: "revision.approved" }> => event.type === "revision.approved",
  )!;
  assert.equal(approval.predecessorStatus, "cancelled");
  assert.equal(sha(fileBytes(artifactPaths(root).prd)), CONTRACT.prdSha, "the promoted artifacts replace the gate-written original");
  assert.equal(successorOutcome.usage?.planner?.input, 100, "chain-cumulative planner usage on the outcome");

  const lock = acquireRunLock(root, { runId: successorId, workflow: "feature" });
  assert.ok(lock.ok, "the lock was released when the successor settled");
  if (lock.ok) lock.release();
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §17 row 2 — abandonment per predecessor status; reject/budget/malformed
// (AC-8, AC-6)
// ---------------------------------------------------------------------------

test("acceptance AC-8: abandoning an INTERRUPTED predecessor's revision restores ordinary resumability under the old contract", async () => {
  const root = fixture();
  const runId = "run-acc-abandon-int";
  writePredecessor(root, runId, { interrupted: true });
  stageRevisionStarted(root, runId);
  const h = harness(root, runId);
  h.human.selects = ["abandon"]; // resume-revision dialog
  h.human.confirms = [true]; // the per-status disclosure confirm

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.abandoned"]);
  assert.equal(existsSync(revisionSidecarDir(root, runId)), false, "the sidecar was removed");
  const pEvents = readEvents(root, runId);
  assert.equal(countType(pEvents, "workflow.outcome"), 0, "the revision runner never appended an outcome to P");
  assert.equal(countType(pEvents, "workflow.failed"), 0);

  // The REAL ordinary resume works again, under the OLD contract.
  const paths = artifactPaths(root);
  const prdBefore = fileBytes(paths.prd);
  const resumeAgents = new RoleAgents();
  const resume = await ordinaryResume(root, runId, {
    agents: resumeAgents,
    human: new ScriptedHuman(),
    verifier: { run: async () => [] },
    git: new NoRebaselineGit(),
  });
  assert.equal(resume.state.phase, "develop", "the interrupted developer pass re-enters under its own (uncompleted) phase");
  assert.equal(resume.state.developerRuns, 0, "the interrupted pass was never counted");
  await resume.detached;
  const after = readEvents(root, runId);
  assert.equal(outcomeOf(after)?.status, "completed", "the predecessor completed under the old contract");
  assert.equal(countType(after, "workflow.started"), 1, "no re-snapshot: the original workflow.started stands alone");
  assert.equal(countType(after, "workflow.resumed"), 1);
  assert.equal(fileBytes(paths.prd), prdBefore, "the old artifacts were never rewritten by the revision");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance AC-8: abandoning a FAILED predecessor's revision restores ordinary resumability too", async () => {
  const root = fixture();
  const runId = "run-acc-abandon-fail";
  writePredecessor(root, runId, { failed: true });
  stageRevisionStarted(root, runId);
  const h = harness(root, runId);
  h.human.selects = ["abandon"];
  h.human.confirms = [true];

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.abandoned"]);
  assert.equal(existsSync(revisionSidecarDir(root, runId)), false);
  assert.equal(countType(readEvents(root, runId), "workflow.outcome"), 0, "no outcome from the revision runner");

  const resumeAgents = new RoleAgents();
  const resume = await ordinaryResume(root, runId, {
    agents: resumeAgents,
    human: new ScriptedHuman(),
    verifier: { run: async () => [] },
    git: new NoRebaselineGit(),
  });
  assert.ok(replayRunLog(readEvents(root, runId), { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds }).ok);
  await resume.detached;
  const after = readEvents(root, runId);
  assert.equal(outcomeOf(after)?.status, "completed", "a provider-failed predecessor is ordinarily resumable after abandon");
  assert.equal(countType(after, "workflow.failed"), 1, "the original workflow.failed stays as history");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance AC-8: abandoned CANCELLED and NEEDS_HUMAN predecessors still refuse terminal_outcome — revise stays eligible", async () => {
  for (const status of ["cancelled", "needs_human"] as const) {
    const root = fixture();
    const runId = `run-acc-abandon-${status}`;
    writePredecessor(root, runId, { status });
    stageRevisionStarted(root, runId);
    const h = harness(root, runId);
    h.human.selects = ["abandon"];
    h.human.confirms = [true];

    await runFlowRevise(h.deps);
    await h.detached[0];

    assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.abandoned"], `${status}: abandoned cleanly`);
    assert.equal(existsSync(revisionSidecarDir(root, runId)), false, `${status}: sidecar removed`);
    const pEvents = readEvents(root, runId);
    assert.equal(countType(pEvents, "workflow.outcome"), 1, `${status}: only the original outcome`);
    assert.equal(countType(pEvents, "workflow.failed"), 0);

    // The asserted refusal — abandonment restores the pre-revision behavior,
    // it does not promise a resume.
    const replay = replayRunLog(pEvents, { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
    assert.equal(replay.ok, false, `${status}: the run stays terminal`);
    if (!replay.ok) assert.equal(replay.refusal.type, "terminal_outcome");
    assert.equal(resumeRevisionRefusal(pEvents, root), undefined, `${status}: the lifecycle block is lifted`);

    // §14 remaining path: a NEW revise is possible again (lifecycle none).
    assert.equal(revisionLifecycle(pEvents).state, "abandoned");
    const verdict = revisionEligibility(pEvents);
    assert.ok("eligible" in verdict && verdict.eligible, `${status}: revise is eligible again`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("acceptance AC-6: malformed planner output, reject-with-notes and the round budget journey (command)", async () => {
  const root = fixture();
  const runId = "run-acc-budget";
  writePredecessor(root, runId, { status: "cancelled" });
  const agents = new RoleAgents({ plans: [INVALID_PLAN, VALID_PLAN_A, VALID_PLAN_B] });
  const h = harness(root, runId, { agents });
  h.human.inputs = [CORRECTION, "actually also add rate limiting"];
  // invalid output → retry (same round) → reject round-1 candidate with notes
  // → approve the round-2 candidate.
  h.human.selects = ["retry", "reject", "approve"];

  await runFlowRevise(h.deps);
  const successorId = successorRunId(runId);
  await h.detached[0];
  await waitForSuccessorSettled(root, successorId);

  const pEvents = readEvents(root, runId);
  const rejected = pEvents.filter(
    (event): event is Extract<WorkflowEvent, { type: "revision.candidate.rejected" }> =>
      event.type === "revision.candidate.rejected",
  );
  assert.equal(rejected.length, 2);
  assert.equal(rejected[0]!.round, 1);
  assert.match(rejected[0]!.reason, /planner/);
  assert.ok(existsSync(rejected[0]!.artifactPath), "the rejected raw output is persisted beside the run log");
  assert.equal(fileBytes(rejected[0]!.artifactPath), INVALID_PLAN, "the persisted artifact holds the raw invalid output");
  assert.equal(rejected[1]!.round, 1, "the user rejection records the candidate it rejects (round 1)");
  assert.equal(rejected[1]!.reason, "rejected by user");
  assert.equal(rejected[1]!.notes, "actually also add rate limiting", "the user's notes are preserved verbatim");
  const candidates = pEvents.filter(
    (event): event is Extract<WorkflowEvent, { type: "revision.candidate" }> => event.type === "revision.candidate",
  );
  assert.deepEqual(candidates.map((event) => event.round), [1, 2], "the invalid output consumed NO round; rejection moved to round 2");
  const approval = pEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "revision.approved" }> => event.type === "revision.approved",
  )!;
  assert.equal(approval.round, 2);
  assert.equal(approval.correction, "actually also add rate limiting", "the approval binds the replacement correction");
  assert.equal(agents.plannerCalls(), 3, "the budget respected MAX_PLAN_REVISIONS — no third candidate round");
  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate.rejected", "revision.candidate", "revision.candidate.rejected", "revision.candidate", "revision.approved", "revision.launched"],
  );
  assert.equal(countType(pEvents, "workflow.outcome"), 1, "the revision runner never appended an outcome to P");
  assert.equal(outcomeOf(readEvents(root, successorId))?.status, "completed");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §17 row 3 — the crash boundaries B0–B8 (AC-5, AC-9, AC-12, AC-13)
// ---------------------------------------------------------------------------

test("acceptance B0: a session that ends before revision.started leaves no state at all", async () => {
  const root = fixture();
  const runId = "run-acc-b0";
  writePredecessor(root, runId, { status: "cancelled" });
  const h = harness(root, runId);
  // Dismiss the correction input: the session dies before T1.
  h.human.inputs = ["dismiss"];

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.deepEqual(revisionTypes(root, runId), [], "no revision.started, no state");
  assert.equal(existsSync(revisionSidecarDir(root, runId)), false, "no sidecar");
  const lock = acquireRunLock(root, { runId, workflow: "check" });
  assert.ok(lock.ok, "the lock was released");
  if (lock.ok) lock.release();
  const verdict = revisionEligibility(readEvents(root, runId));
  assert.ok("eligible" in verdict && verdict.eligible, "revise restarts clean — nothing to repair");
  const replay = replayRunLog(readEvents(root, runId), { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
  assert.equal(replay.ok, false, "P's own replay verdict is unchanged");
  if (!replay.ok) assert.equal(replay.refusal.type, "terminal_outcome");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B1: an open revision without a candidate resumes through the command to a completed successor", async () => {
  const root = fixture();
  const runId = "run-acc-b1";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const h = harness(root, runId, { agents });
  h.human.selects = ["continue", "approve"]; // resume dialog → decide
  h.human.inputs = [""]; // keep the recorded correction

  await runFlowRevise(h.deps);
  const successorId = successorRunId(runId);
  await waitForSuccessorSettled(root, successorId);
  await h.detached[0];

  assert.deepEqual(
    revisionTypes(root, runId),
    ["revision.started", "revision.candidate", "revision.approved", "revision.launched"],
    "B1 resumed to approval and launch",
  );
  assert.equal(agents.plannerCalls(), 1, "exactly one planner round produced the candidate");
  const sEvents = readEvents(root, successorId);
  assert.equal(countType(sEvents, "workflow.started"), 1);
  assert.equal(outcomeOf(sEvents)?.status, "completed");
  assert.equal(fileBytes(sidecarPaths(root, runId).archivePrd), `${MARKER}\n${PRD_BODY}`);
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B2: a pending candidate approves through the command with zero planner calls", async () => {
  const root = fixture();
  const runId = "run-acc-b2";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId);
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const h = harness(root, runId, { agents });
  h.human.selects = ["continue", "approve"]; // resume dialog → candidate decision

  await runFlowRevise(h.deps);
  const successorId = successorRunId(runId);
  await waitForSuccessorSettled(root, successorId);
  await h.detached[0];

  assert.equal(agents.plannerCalls(), 0, "the pending candidate decides without a new planner call");
  const candidates = readEvents(root, runId).filter((event) => event.type === "revision.candidate");
  assert.equal(candidates.length, 1, "no second candidate event");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.approved", "revision.launched"]);
  assert.equal(outcomeOf(readEvents(root, successorId))?.status, "completed");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B2b: an approval append fault aborts before promotion; the command retry lands exactly ONE approval (AC-9)", async () => {
  const root = fixture();
  const runId = "run-acc-b2b";
  writePredecessor(root, runId, { status: "cancelled" });

  // The faulted session: the approval's appendCritical throws; nothing
  // irreversible happened and the candidate stays pending.
  const faulted = new FaultedLog(runLogPathOf(root, runId));
  faulted.failOnce = ["revision.approved"];
  const human = new ScriptedHuman();
  human.inputs = [CORRECTION];
  human.selects = ["approve"];
  const planner = new RoleAgents({ plans: [VALID_PLAN_A] });
  const outcome = await runRevisionSessionCore(sessionCoreDeps(root, runId, planner, human, new NoRebaselineGit(), faulted));
  assert.equal(outcome.kind, "failed");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate"], "no half-recorded approval");
  assert.equal(
    fileBytes(artifactPaths(root).prd),
    `${MARKER}\n${PRD_BODY}`,
    "nothing was promoted without the verified persisted approval (AC-1/AC-9)",
  );
  assert.equal(resumeRevisionRefusal(readEvents(root, runId), root)?.type, "revision_in_progress");
  const successorId = successorRunId(runId);
  assert.equal(existsSync(runLogPathOf(root, successorId)), false, "no successor seed after the fault");

  // The recovery arc: /flow revise resumes the pending candidate and the
  // approval append succeeds — exactly one approval ever lands on disk.
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const h = harness(root, runId, { agents });
  h.human.selects = ["continue", "approve"]; // resume dialog → candidate decision
  await runFlowRevise(h.deps);
  await h.detached[0];
  await waitForSuccessorSettled(root, successorId);

  assert.equal(countType(readEvents(root, runId), "revision.approved"), 1, "exactly one approval on disk");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.approved", "revision.launched"]);
  assert.equal(outcomeOf(readEvents(root, successorId))?.status, "completed");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B2b/AC-9: an approval write that LANDS but fails strict verification reconciles inside the real appendCritical re-read; the fresh-timestamp retry stays one row and the successor completes", async () => {
  const root = fixture();
  const runId = "run-acc-b2b-landed";
  writePredecessor(root, runId, { status: "cancelled" });

  // The fault provocation from tests/revise.test.ts's repair-B2b test: the
  // approval write LANDS, then injectFaultAfterAppend appends a foreign line
  // so the strict post-append verification FAILS — the landed-but-unverified
  // condition. appendCritical's own re-read reconciliation must settle it.
  const human = new ScriptedHuman();
  human.inputs = [CORRECTION];
  human.selects = ["approve"];
  const planner = new RoleAgents({ plans: [VALID_PLAN_A] });
  const outcome = await runRevisionSessionCore(
    sessionCoreDeps(root, runId, planner, human, new NoRebaselineGit(), new LandedApprovalLog(runLogPathOf(root, runId))),
  );
  assert.equal(outcome.kind, "approved", "the real re-read reconciliation settled the landed write inside appendCritical");
  const pEvents = readEvents(root, runId);
  assert.ok(
    pEvents.some((event) => event.type === "phase.started" && (event as { phase: string }).phase === "foreign"),
    "the fault really fired between the physical write and the verification",
  );
  assert.equal(countType(pEvents, "revision.approved"), 1, "exactly one approval on disk after the failed verification");
  assert.equal(resumeRevisionRefusal(pEvents, root)?.type, "revision_approved_pending_launch", "the lifecycle reads approved-pending-launch");
  assert.equal(
    fileBytes(artifactPaths(root).prd),
    `${MARKER}\n${PRD_BODY}`,
    "the session stops at the persisted approval; nothing promoted yet",
  );

  // The regenerated-timestamp retry of the SAME logical approval: canonical
  // equality reconciles it to the persisted copy — no duplicate, no rewrite.
  const persisted = pEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "revision.approved" }> => event.type === "revision.approved",
  )!;
  appendRevisionEvent(root, runId, {
    ...persisted,
    approvedBy: { ...persisted.approvedBy, at: "2030-01-01T00:00:00.000Z" },
  });
  assert.equal(countType(readEvents(root, runId), "revision.approved"), 1, "the fresh-timestamp retry reconciles to ONE copy");

  // /flow revise routes the approved-pending-launch state to the repair: the
  // disk re-read authorizes promotion and the launch completes.
  const successorId = successorRunId(runId);
  const h = harness(root, runId);
  await runFlowRevise(h.deps);
  await h.detached[0];
  await waitForSuccessorSettled(root, successorId);

  assert.equal(countType(readEvents(root, runId), "revision.approved"), 1, "still exactly ONE approval after promotion and launch");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.approved", "revision.launched"]);
  assert.equal(
    sha(fileBytes(artifactPaths(root).prd)),
    CONTRACT.prdSha,
    "the reconciled approval authorized the promotion",
  );
  assert.equal(outcomeOf(readEvents(root, successorId))?.status, "completed", "the successor launched on the reconciled approval");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B4: a crash with one artifact promoted rewrites BOTH deterministically through the command", async () => {
  const root = fixture();
  const runId = "run-acc-b4";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId);
  stageRevisionApproval(root, runId);
  // The transient crash mixture: the PRD already promoted, the tasks not yet.
  const paths = artifactPaths(root);
  writeFileSync(paths.prd, `${MARKER}\n${CANDIDATE_PRD}`, "utf8");
  assert.equal(sha(fileBytes(paths.tasks)), BASE_CONTRACT.tasksSha, "staged: tasks not yet promoted");
  // The archive was written before the PRD promotion (the crash order).
  const sidecar = sidecarPaths(root, runId);
  writeFileSync(sidecar.archivePrd, `${MARKER}\n${PRD_BODY}`, "utf8");
  writeFileSync(sidecar.archiveTasks, `${MARKER}\n${TASKS_BODY}`, "utf8");

  const h = harness(root, runId);
  await runFlowRevise(h.deps);
  const successorId = successorRunId(runId);
  await waitForSuccessorSettled(root, successorId);
  await h.detached[0];

  assert.equal(fileBytes(paths.prd), `${MARKER}\n${CANDIDATE_PRD}`);
  assert.equal(fileBytes(paths.tasks), `${MARKER}\n${CANDIDATE_TASKS}`, "the transient mixture never executes — both artifacts rewritten");
  assert.equal(fileBytes(sidecar.archivePrd), `${MARKER}\n${PRD_BODY}`, "the archive copy survived untouched");
  assert.equal(outcomeOf(readEvents(root, successorId))?.status, "completed");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B4a/AC-12: a damaged archive refuses byte-identically through the command on BOTH paths; a lost one reports and launches", async () => {
  // (a) Normal path: valid candidate sidecar, original artifacts, damaged
  // archive → refuse; repeat the command → the same refusal, byte-identical.
  const normalRoot = fixture();
  const normalId = "run-acc-b4a-normal";
  writePredecessor(normalRoot, normalId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(normalRoot, normalId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(normalRoot, normalId);
  stageRevisionApproval(normalRoot, normalId);
  const normalSidecar = sidecarPaths(normalRoot, normalId);
  writeFileSync(normalSidecar.archivePrd, `${MARKER}\ndamaged archive body`, "utf8");
  writeFileSync(normalSidecar.archiveTasks, `${MARKER}\ndamaged archive tasks`, "utf8");
  const damagedPrd = fileBytes(normalSidecar.archivePrd);
  const normalH = harness(normalRoot, normalId);
  await runFlowRevise(normalH.deps);
  assert.match(normalH.notifications.at(-1)?.message ?? "", /does not hash to revision\.started\.baseContract/);
  assert.equal(existsSync(runLogPathOf(normalRoot, successorRunId(normalId))), false, "no seed after the refusal");
  await runFlowRevise(normalH.deps);
  assert.equal(fileBytes(normalSidecar.archivePrd), damagedPrd, "never overwritten");
  assert.match(normalH.notifications.at(-1)?.message ?? "", /does not hash to revision\.started\.baseContract/, "the refusal is stable");
  assert.equal(countType(readEvents(normalRoot, normalId), "revision.launched"), 0, "no pointer without a launch");
  rmSync(normalRoot, { recursive: true, force: true });

  // (b) Step-1→5 skip path: candidate sidecar damaged, artifacts ALREADY
  // promoted (they verify against the contract), damaged archive → the
  // verify-only archive check refuses too, never overwriting.
  const skipRoot = fixture();
  const skipId = "run-acc-b4a-skip";
  writePredecessor(skipRoot, skipId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(skipRoot, skipId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(skipRoot, skipId, "damaged");
  stageRevisionApproval(skipRoot, skipId);
  const skipPaths = artifactPaths(skipRoot);
  writeFileSync(skipPaths.prd, `${MARKER}\n${CANDIDATE_PRD}`, "utf8");
  writeFileSync(skipPaths.tasks, `${MARKER}\n${CANDIDATE_TASKS}`, "utf8");
  const skipSidecar = sidecarPaths(skipRoot, skipId);
  writeFileSync(skipSidecar.archivePrd, `${MARKER}\ndamaged archive body`, "utf8");
  writeFileSync(skipSidecar.archiveTasks, `${MARKER}\ndamaged archive tasks`, "utf8");
  const skipDamagedPrd = fileBytes(skipSidecar.archivePrd);
  const skipH = harness(skipRoot, skipId);
  await runFlowRevise(skipH.deps);
  assert.match(skipH.notifications.at(-1)?.message ?? "", /does not hash to revision\.started\.baseContract/);
  assert.equal(fileBytes(skipSidecar.archivePrd), skipDamagedPrd, "the skip path never overwrites either");
  assert.equal(existsSync(runLogPathOf(skipRoot, successorRunId(skipId))), false);
  rmSync(skipRoot, { recursive: true, force: true });

  // (c) Lost archive: promoted artifacts, NO archive anywhere → the loss is
  // reported explicitly and the approved launch is NOT blocked.
  const lostRoot = fixture();
  const lostId = "run-acc-b4a-lost";
  writePredecessor(lostRoot, lostId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(lostRoot, lostId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(lostRoot, lostId, "damaged"); // the candidate copy is gone
  stageRevisionApproval(lostRoot, lostId);
  const lostPaths = artifactPaths(lostRoot);
  writeFileSync(lostPaths.prd, `${MARKER}\n${CANDIDATE_PRD}`, "utf8");
  writeFileSync(lostPaths.tasks, `${MARKER}\n${CANDIDATE_TASKS}`, "utf8");
  const lostH = harness(lostRoot, lostId);
  await runFlowRevise(lostH.deps);
  const lostSuccessorId = successorRunId(lostId);
  await waitForSuccessorSettled(lostRoot, lostSuccessorId);
  await lostH.detached[0];
  assert.ok(
    lostH.notifications.some((n) => /unrecoverable/.test(n.message)),
    "the loss of the old-contract copy is reported explicitly",
  );
  assert.equal(outcomeOf(readEvents(lostRoot, lostSuccessorId))?.status, "completed", "the loss does not block the approved launch");
  rmSync(lostRoot, { recursive: true, force: true });
});

test("acceptance B5a/AC-13: a partial seed gains ONLY spec.approved through the command; divergent and spec-first seeds refuse", async () => {
  // (a) started-only seed → the repair completes it by prefix verification.
  const root = fixture();
  const runId = "run-acc-b5a";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId);
  stageRevisionApproval(root, runId, { pointer: true });
  const successorId = successorRunId(runId);
  const seed = canonicalSeedOf(root, runId);
  const partialLog = RunLog.open(root, successorId);
  partialLog.append(seed.started);
  const firstLineBefore = fileBytes(runLogPathOf(root, successorId)).split("\n")[0];
  assert.equal(launchIncomplete(root, successorId), true, "the staged fixture holds a partial seed");

  const h = harness(root, runId);
  await runFlowRevise(h.deps);
  await waitForSuccessorSettled(root, successorId);
  await h.detached[0];

  const sEvents = readEvents(root, successorId);
  assert.deepEqual(
    sEvents.slice(0, 2).map((event) => event.type),
    ["workflow.started", "spec.approved"],
    "only the missing spec.approved was appended — never a rewrite",
  );
  assert.equal(fileBytes(runLogPathOf(root, successorId)).split("\n")[0], firstLineBefore, "the verified prefix line is byte-identical");
  assert.equal(countType(sEvents, "workflow.started"), 1);
  assert.equal(outcomeOf(sEvents)?.status, "completed");
  rmSync(root, { recursive: true, force: true });

  // (b) A divergent seed refuses field-by-field, byte-identically.
  const divergentRoot = fixture();
  const divergentId = "run-acc-b5a-divergent";
  writePredecessor(divergentRoot, divergentId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(divergentRoot, divergentId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(divergentRoot, divergentId);
  stageRevisionApproval(divergentRoot, divergentId, { pointer: true });
  const divergentSeed = canonicalSeedOf(divergentRoot, divergentId);
  const mutated = { ...divergentSeed.started, description: "someone else's feature" } as typeof divergentSeed.started;
  const divergentLog = RunLog.open(divergentRoot, successorRunId(divergentId));
  divergentLog.append(mutated);
  const divergentBefore = fileBytes(runLogPathOf(divergentRoot, successorRunId(divergentId)));
  const divergentH = harness(divergentRoot, divergentId);
  await runFlowRevise(divergentH.deps);
  assert.match(
    divergentH.notifications.at(-1)?.message ?? "",
    /workflow\.started diverges from the canonical seed at workflow\.started\.description/,
    "the divergence is refused field-by-field — the offending field is named",
  );
  assert.equal(fileBytes(runLogPathOf(divergentRoot, successorRunId(divergentId))), divergentBefore, "the divergent log stays byte-identical");
  assert.equal(countType(readEvents(divergentRoot, successorRunId(divergentId)), "workflow.resumed"), 0, "nothing launched over a divergent seed");
  rmSync(divergentRoot, { recursive: true, force: true });

  // (c) spec.approved without a preceding workflow.started is an impossible
  // order — refuse.
  const specFirstRoot = fixture();
  const specFirstId = "run-acc-b5a-specfirst";
  writePredecessor(specFirstRoot, specFirstId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(specFirstRoot, specFirstId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(specFirstRoot, specFirstId);
  stageRevisionApproval(specFirstRoot, specFirstId, { pointer: true });
  const specFirstLog = RunLog.open(specFirstRoot, successorRunId(specFirstId));
  specFirstLog.append({ type: "spec.approved", runId: successorRunId(specFirstId), ...CONTRACT } as WorkflowEvent);
  const specFirstBefore = fileBytes(runLogPathOf(specFirstRoot, successorRunId(specFirstId)));
  const specFirstH = harness(specFirstRoot, specFirstId);
  await runFlowRevise(specFirstH.deps);
  assert.match(specFirstH.notifications.at(-1)?.message ?? "", /impossible order/, "the impossible seed order refuses");
  assert.equal(fileBytes(runLogPathOf(specFirstRoot, successorRunId(specFirstId))), specFirstBefore, "byte-identical refusal");
  assert.equal(countType(readEvents(specFirstRoot, successorRunId(specFirstId)), "workflow.started"), 0, "no seed was force-appended");
  rmSync(specFirstRoot, { recursive: true, force: true });
});

test("acceptance B7c/AC-5: repair reachable from both lifecycles; repeated repairs never duplicate the seed or the resumed marker", async () => {
  const root = fixture();
  const runId = "run-acc-b7";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId);
  stageRevisionApproval(root, runId);
  const successorId = successorRunId(runId);

  // Repair #1 (from approved-pending-launch): the stack question is dismissed,
  // so the successor dies AFTER the resumed marker but BEFORE phase.started.
  const firstAgents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const firstH = harness(root, runId, { agents: firstAgents, omitStack: true });
  firstH.human.selects = ["dismiss"]; // resolveStack dismissal kills the successor
  await runFlowRevise(firstH.deps);
  await firstH.detached[0];
  const afterFirst = readEvents(root, successorId);
  assert.equal(countType(afterFirst, "workflow.started"), 1, "B7a: the seed was created once");
  assert.equal(countType(afterFirst, "workflow.resumed"), 1, "B7b: the marker landed with the launch");
  assert.equal(countType(afterFirst, "phase.started"), 0, "the launch is incomplete — the repair window stays open");
  assert.equal(countType(afterFirst, "workflow.failed"), 1, "the dismissed launch settled as workflow.failed");
  assert.equal(countType(readEvents(root, runId), "revision.launched"), 1, "the pointer was appended once");
  assert.equal(launchIncomplete(root, successorId), true);

  // Repair #2 (from launched-with-incomplete-launch): the marker exists →
  // resumedPhase is omitted; no second seed, no second marker.
  const secondAgents = new RoleAgents();
  const secondH = harness(root, runId, { agents: secondAgents });
  await runFlowRevise(secondH.deps);
  const successorIdAfter = successorId;
  await waitForNewSuccessorTerminal(root, successorIdAfter, 1);
  await secondH.detached[0];

  const sEvents = readEvents(root, successorId);
  assert.equal(countType(sEvents, "workflow.started"), 1, "no duplicated seed across repairs (B7a idempotence)");
  assert.equal(countType(sEvents, "workflow.resumed"), 1, "at most one workflow.resumed, ever (B7c)");
  assert.ok(countType(sEvents, "phase.started") >= 1, "the launch is now complete — the successor really ran");
  assert.equal(outcomeOf(sEvents)?.status, "completed");
  assert.deepEqual(revisionTypes(root, runId), ["revision.started", "revision.candidate", "revision.approved", "revision.launched"], "the pointer stays idempotent");
  assert.equal(resumeRevisionRefusal(readEvents(root, runId), root)?.type, "revised_by_successor", "the successor really runs — P is terminal");

  // Repair #3 would now refuse: the successor recorded its first phase.
  const gate = await repairRevisionLaunch({
    cwd: root,
    runId,
    human: new ScriptedHuman(),
    events: RunLog.open(root, runId),
    launch: async () => {},
  });
  assert.equal(gate.kind, "refused");
  if (gate.kind === "refused") assert.match(gate.reason, /already recorded its first phase/);
  rmSync(root, { recursive: true, force: true });
});

test("acceptance B7a/B7b: /flow revise completes the pointer with an ABSENT successor log and the pointer with a seeded stub WITHOUT the resumed marker", async () => {
  // (a) B7a: revision.launched persisted, the successor log ABSENT — the
  // pointer proves intent, not a run; the command seeds and launches.
  const aRoot = fixture();
  const aId = "run-acc-b7a";
  writePredecessor(aRoot, aId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(aRoot, aId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(aRoot, aId);
  stageRevisionApproval(aRoot, aId, { pointer: true });
  const aSuccessorId = successorRunId(aId);
  assert.equal(launchIncomplete(aRoot, aSuccessorId), true, "staged: the pointer holds, the successor log is absent");
  assert.equal(existsSync(runLogPathOf(aRoot, aSuccessorId)), false);

  const aH = harness(aRoot, aId);
  await runFlowRevise(aH.deps);
  await aH.detached[0];
  await waitForSuccessorSettled(aRoot, aSuccessorId);

  const aEvents = readEvents(aRoot, aSuccessorId);
  assert.equal(countType(aEvents, "workflow.started"), 1, "the seed was created exactly once");
  assert.deepEqual(
    aEvents.slice(0, 2).map((event) => event.type),
    ["workflow.started", "spec.approved"],
    "the canonical seed was written by this repair",
  );
  assert.equal(countType(aEvents, "workflow.resumed"), 1, "the stub had no marker → resumedPhase was carried");
  assert.ok(countType(aEvents, "phase.started") >= 1, "the launch completed");
  assert.equal(outcomeOf(aEvents)?.status, "completed");
  assert.equal(countType(readEvents(aRoot, aId), "revision.launched"), 1, "the pointer is never duplicated");
  assert.ok(
    aH.notifications.some((n) => /\(resumed at develop\)/.test(n.message)),
    "the launch request carried resumedPhase develop",
  );
  rmSync(aRoot, { recursive: true, force: true });

  // (b) B7b: the pointer holds AND the successor log is a complete seed
  // WITHOUT workflow.resumed — the repair appends only the marker and launches.
  const bRoot = fixture();
  const bId = "run-acc-b7b";
  writePredecessor(bRoot, bId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(bRoot, bId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(bRoot, bId);
  stageRevisionApproval(bRoot, bId, { pointer: true });
  const bSuccessorId = successorRunId(bId);
  const bSeed = canonicalSeedOf(bRoot, bId);
  const bLog = RunLog.open(bRoot, bSuccessorId);
  bLog.append(bSeed.started);
  bLog.append(bSeed.spec);
  const bSeedBytes = fileBytes(runLogPathOf(bRoot, bSuccessorId));
  assert.equal(launchIncomplete(bRoot, bSuccessorId), true, "staged: the seeded stub has no marker and no phase");

  const bH = harness(bRoot, bId);
  await runFlowRevise(bH.deps);
  await bH.detached[0];
  await waitForSuccessorSettled(bRoot, bSuccessorId);

  const bEvents = readEvents(bRoot, bSuccessorId);
  assert.equal(fileBytes(runLogPathOf(bRoot, bSuccessorId)).startsWith(bSeedBytes), true, "the seed was reused, never rewritten");
  assert.equal(countType(bEvents, "workflow.started"), 1, "no second workflow.started");
  assert.equal(countType(bEvents, "workflow.resumed"), 1, "exactly one marker, appended by this launch");
  assert.equal(outcomeOf(bEvents)?.status, "completed");
  assert.ok(
    bH.notifications.some((n) => /\(resumed at develop\)/.test(n.message)),
    "the launch request carried resumedPhase develop",
  );
  assert.equal(countType(readEvents(bRoot, bId), "revision.launched"), 1);
  rmSync(bRoot, { recursive: true, force: true });
});

test("acceptance B8/AC-10: unverifiable approval contents refuse; only the forced abandon lifts the block with an honest disk report", async () => {
  const root = fixture();
  const runId = "run-acc-b8";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId, "damaged"); // the candidate copy is corrupted
  stageRevisionApproval(root, runId);
  // The on-disk artifacts still hash to baseContract (the common case).
  const paths = artifactPaths(root);
  assert.equal(sha(fileBytes(paths.prd)), BASE_CONTRACT.prdSha);

  // (a) The repair refuses execution — fail-closed, with the B8 reason.
  const h = harness(root, runId);
  h.human.selects = ["leave"]; // the forced-abandonment dialog: keep blocked
  await runFlowRevise(h.deps);
  assert.match(
    h.notifications.at(-1)?.message ?? "",
    /neither the candidate sidecar nor the promoted artifacts verify/,
    "the B8 refusal surfaces with its reason",
  );
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "nothing was seeded");
  assert.equal(countType(readEvents(root, runId), "revision.launched"), 0, "no pointer, no launch");
  assert.equal(resumeRevisionRefusal(readEvents(root, runId), root)?.type, "revision_approved_pending_launch", "P stays blocked");

  // (b) The ONLY exit: the explicit forced abandon, reporting disk state.
  const second = harness(root, runId);
  second.human.selects = ["force"]; // the forced-abandonment dialog
  await runFlowRevise(second.deps);
  const pEvents = readEvents(root, runId);
  const abandoned = pEvents.find(
    (event): event is Extract<WorkflowEvent, { type: "revision.abandoned" }> => event.type === "revision.abandoned",
  );
  assert.ok(abandoned, "the forced abandon is recorded");
  assert.equal(abandoned!.reason, "approval contents unrecoverable");
  assert.match(second.notifications.at(-1)?.message ?? "", /[Uu]ntouched/, "the report states the ACTUAL on-disk state (the untouched common case)");
  assert.equal(sha(fileBytes(paths.prd)), BASE_CONTRACT.prdSha, "the untouched report is honest — the artifacts were never modified");
  assert.equal(resumeRevisionRefusal(pEvents, root), undefined, "the block is lifted");
  assert.equal(existsSync(sidecarPaths(root, runId).archivePrd), false, "no archive existed to keep; the candidate copy stays corrupt on disk as evidence");
  const replay = replayRunLog(pEvents, { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
  assert.equal(replay.ok, false, "the cancelled predecessor stays terminal — abandon restores the refusal, not a resume");
  if (!replay.ok) assert.equal(replay.refusal.type, "terminal_outcome");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §17 row 4 — two sequential resumes of the successor after interruption
// (AC-4, AC-6, AC-11)
// ---------------------------------------------------------------------------

test("acceptance §17: two sequential successor resumes re-derive identical state and keep the revision context in every prompt (AC-4/6/11)", async () => {
  const root = fixture();
  const runId = "run-acc-double-resume";
  // A freeze WITH a command, so the successor's verify actually runs and can
  // fail once (charging one retry that must stay banked across resumes).
  const verifyFreeze: VerifyFreeze = {
    commands: [{ label: "test", command: "npm test", blocking: true }],
    scripts: {},
    scriptsDigest: digestScripts({}),
    perimeter: "root",
  };
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: verifyFreeze });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId);
  stageRevisionApproval(root, runId);
  const successorId = successorRunId(runId);

  // Launch #1 (through the command): developer pass → verify fails once
  // (charging one retry, fixed by a developer pass) → review #1 requests a
  // blocking change → the fix pass is killed by a provider death →
  // workflow.failed (replayable).
  const agents = new RoleAgents({
    developers: [devResult(), devResult(), new Error("provider died mid-fix")],
    reviewers: [reviewOf("changes_requested", [R1])],
  });
  const h = harness(root, runId, { agents, verifier: new QueuedVerifier([1, 0]) });
  h.human.selects = ["approve"];
  await runFlowRevise(h.deps);
  await h.detached[0];
  await waitForSuccessorSettled(root, successorId);
  assert.equal(countType(readEvents(root, successorId), "workflow.failed"), 1);

  // Resume #1: the state is re-derived from the successor LOG.
  const resume1Agents = new RoleAgents({
    developers: [devResult()],
    reviewers: [new Error("provider died mid-review")],
  });
  const resume1 = await ordinaryResume(root, successorId, {
    agents: resume1Agents,
    human: new ScriptedHuman(),
    verifier: new QueuedVerifier([0]),
    git: new NoRebaselineGit(),
  });
  assert.equal(resume1.state.phase, "fix #2", "the interrupted fix pass re-enters under its own name");
  assert.equal(resume1.state.developerRuns, 2, "the two completed passes are counted; the interrupted one is not");
  assert.equal(resume1.state.reviewRound, 1);
  assert.equal(resume1.state.verifyRetries, 1, "the charged verify retry is re-derived from the log, not re-charged");
  assert.deepEqual(resume1.state.fixes.map((fix) => fix.id), ["R1"], "findings come fresh from the successor's own log");
  assert.ok(resume1.state.previousBlockingIds.has("R1"));
  assert.deepEqual(resume1.state.revision, { predecessorRunId: runId, revision: 1, correction: CORRECTION }, "AC-11: the revision context is reconstructed from the log");
  await resume1.detached;
  assert.equal(countType(readEvents(root, successorId), "workflow.failed"), 2, "resume #1 died at the review again");

  // Resume #1's fix prompt carried the blocking item AND the revision context.
  const resume1FixPrompt = resume1Agents.requests.find((request) => request.role === "developer")!.prompt;
  assert.ok(resume1FixPrompt.includes("BLOCKING"), "the fresh fix item drives the pass");
  assert.ok(resume1FixPrompt.includes("R1"));
  assert.ok(resume1FixPrompt.includes("PLAN REVISION CONTEXT"), "AC-11: the revision context reaches the fix pass too");
  assert.ok(resume1FixPrompt.includes(CORRECTION));

  // Resume #2: the SAME reconstruction, then the run completes.
  const resume2Agents = new RoleAgents({ reviewers: [reviewOf("approved")] });
  const resume2 = await ordinaryResume(root, successorId, {
    agents: resume2Agents,
    human: new ScriptedHuman(),
    verifier: new QueuedVerifier([0]),
    git: new NoRebaselineGit(),
  });
  assert.equal(resume2.state.phase, "review #2", "the interrupted review re-runs as the same round");
  assert.equal(resume2.state.developerRuns, 3, "the completed fix pass is now counted");
  assert.equal(resume2.state.reviewRound, 1, "the interrupted review round is re-run, not advanced");
  assert.equal(resume2.state.verifyRetries, 1, "verify retries stay banked — never double-charged across resumes");
  assert.deepEqual(resume2.state.fixes.map((fix) => fix.id), ["R1"]);
  assert.deepEqual(resume2.state.revision, { predecessorRunId: runId, revision: 1, correction: CORRECTION }, "AC-11: the context is present again at the second resume");
  await resume2.detached;

  // Resume #2's reviewer prompt carried the revision note as well.
  const resume2ReviewPrompt = resume2Agents.requests.find((request) => request.role === "reviewer")!.prompt;
  assert.ok(resume2ReviewPrompt.includes("PLAN REVISION"), "AC-11: the reviewer judges the revised contract at every resume");
  assert.ok(resume2ReviewPrompt.includes(CORRECTION));

  const sEvents = readEvents(root, successorId);
  assert.equal(outcomeOf(sEvents)?.status, "completed", "the successor completed on the second resume");
  assert.equal(countType(sEvents, "workflow.started"), 1, "never a second seed across resumes");
  assert.equal(countType(sEvents, "workflow.resumed"), 3, "one marker per launch segment (launch + two resumes)");
  const outcome = outcomeOf(sEvents)!;
  assert.equal(outcome.usage?.planner?.input, 100, "carried planner usage only — the successor never re-plans");
  assert.equal(outcome.usage?.developer?.input, 350, "carried 200 + three completed passes: the interrupted pass added nothing");
  assert.equal(outcome.usage?.reviewer?.input, 60, "two review passes across the chain");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §17 row 5 — the refusal matrix (lock / cancellation / changed candidate /
// changed partial work / changed frozen inputs)
// ---------------------------------------------------------------------------

test("acceptance §5/§16: a changed candidate sidecar refuses the approval with zero execution", async () => {
  const root = fixture();
  const runId = "run-acc-refusal-candidate";
  writePredecessor(root, runId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(root, runId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(root, runId);
  // The candidate changed on disk after the candidate event bound it.
  writeFileSync(sidecarPaths(root, runId).candidatePrd, "tampered after the candidate event", "utf8");
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const h = harness(root, runId, { agents });
  h.human.selects = ["continue", "approve", "leave"]; // resume dialog → decide → salvage dialog (leave pending)

  await runFlowRevise(h.deps);
  await h.detached[0];

  assert.match(
    h.human.notifications.at(-1) ?? "",
    /no longer match the persisted candidate event/,
    "the changed candidate refuses with its reason",
  );
  assert.ok(
    h.human.selectQuestions.some((q) => /candidate contents are unverifiable/.test(q.message)),
    "the §16-rule-5 salvage dialog surfaced",
  );
  assert.equal(countType(readEvents(root, runId), "revision.approved"), 0, "nothing was approved");
  assert.equal(countType(readEvents(root, runId), "revision.launched"), 0);
  assert.equal(existsSync(runLogPathOf(root, successorRunId(runId))), false, "zero execution");
  assert.equal(agents.plannerCalls(), 0, "the refusal needs no planner");
  assert.equal(resumeRevisionRefusal(readEvents(root, runId), root)?.type, "revision_in_progress", "the candidate stays pending and recoverable");
  rmSync(root, { recursive: true, force: true });
});

test("acceptance §10/AC-10: changed partial work refuses at the approval dialog and at launch; the declined launch stays recoverable", async () => {
  // (a) Approval-time: the tree moved between open and approval → the dialog
  // discloses it; going back and abandoning promotes nothing.
  const approvalRoot = fixture();
  const approvalId = "run-acc-refusal-partial";
  writePredecessor(approvalRoot, approvalId, { status: "cancelled" });
  const git = new NoRebaselineGit();
  git.patches = ["diff --git a/src/a.ts\n@@ -1 +1 @@\n+at open", "diff --git a/src/a.ts\n@@ -1 +1 @@\n+changed later"];
  const agents = new RoleAgents({ plans: [VALID_PLAN_A] });
  const approvalH = harness(approvalRoot, approvalId, { agents, git });
  approvalH.human.inputs = [CORRECTION];
  approvalH.human.selects = ["approve", "back", "abandon"]; // decide → change dialog → back → abandon
  approvalH.human.confirms = [true];
  await runFlowRevise(approvalH.deps);
  await approvalH.detached[0];
  const approvalDialog = approvalH.human.selectQuestions.find((q) => /partial work changed/.test(q.message));
  assert.ok(approvalDialog, "§10: the approval dialog disclosed the changed partial work");
  assert.deepEqual(revisionTypes(approvalRoot, approvalId), ["revision.started", "revision.candidate", "revision.abandoned"], "no approval was persisted; the user abandoned instead");
  assert.equal(countType(readEvents(approvalRoot, approvalId), "revision.approved"), 0);
  assert.equal(existsSync(runLogPathOf(approvalRoot, successorRunId(approvalId))), false, "zero execution");
  assert.equal(fileBytes(artifactPaths(approvalRoot).prd), `${MARKER}\n${PRD_BODY}`, "artifacts untouched");
  rmSync(approvalRoot, { recursive: true, force: true });

  // (b) Launch-time: the approval persisted, then the tree moved → the §10
  // launch dialog asks; declining leaves the approved state recoverable.
  const launchRoot = fixture();
  const launchId = "run-acc-refusal-launch";
  writePredecessor(launchRoot, launchId, { status: "cancelled", repoStateDigest: "stable-digest", freeze: EMPTY_FREEZE });
  stageRevisionStarted(launchRoot, launchId, { partialPatchSha: sha(LAUNCH_PATCH) });
  stageRevisionCandidate(launchRoot, launchId);
  stageRevisionApproval(launchRoot, launchId);
  const launchGit = new NoRebaselineGit();
  launchGit.patches = [`${LAUNCH_PATCH}\n@@ -2 +2 @@\n+later change`];
  const declineH = harness(launchRoot, launchId, { git: launchGit });
  declineH.human.selects = ["abort"];
  await runFlowRevise(declineH.deps);
  const successorId = successorRunId(launchId);
  assert.match(declineH.notifications.at(-1)?.message ?? "", /launch aborted/, "the declined launch reports the abort");
  const sEvents = readEvents(launchRoot, successorId);
  assert.equal(countType(sEvents, "workflow.resumed"), 0, "declining launches nothing");
  assert.equal(countType(sEvents, "workflow.started"), 1, "only the seed exists");
  assert.equal(resumeRevisionRefusal(readEvents(launchRoot, launchId), launchRoot)?.type, "revision_launch_incomplete", "the approved state stays recoverable via /flow revise");
  assert.equal(launchIncomplete(launchRoot, successorId), true);

  // (c) The tree restored → the next revise launches without a dialog.
  const acceptGit = new NoRebaselineGit();
  acceptGit.patches = [LAUNCH_PATCH];
  const acceptH = harness(launchRoot, launchId, { git: acceptGit });
  await runFlowRevise(acceptH.deps);
  await waitForSuccessorSettled(launchRoot, successorId);
  await acceptH.detached[0];
  assert.equal(outcomeOf(readEvents(launchRoot, successorId))?.status, "completed", "the successor ran on the restored tree");
  assert.equal(countType(readEvents(launchRoot, successorId), "workflow.resumed"), 1);
  rmSync(launchRoot, { recursive: true, force: true });
});

test("acceptance §13: changed frozen inputs refuse at revise entry with zero execution", async () => {
  // (a) The repository-state digest moved since the run started.
  const digestRoot = fixture();
  const digestId = "run-acc-refusal-digest";
  writePredecessor(digestRoot, digestId, { status: "cancelled", repoStateDigest: "digest-at-start" });
  stageRevisionStarted(digestRoot, digestId);
  const digestGit = new NoRebaselineGit();
  digestGit.digest = "digest-now";
  const digestH = harness(digestRoot, digestId, { git: digestGit });
  await runFlowRevise(digestH.deps);
  await digestH.detached[0];
  assert.match(digestH.notifications.at(-1)?.message ?? "", /repository state changed/);
  assert.deepEqual(revisionTypes(digestRoot, digestId), ["revision.started"], "no new events after the refusal");
  assert.equal(existsSync(runLogPathOf(digestRoot, successorRunId(digestId))), false, "zero execution");
  rmSync(digestRoot, { recursive: true, force: true });

  // (b) A frozen manifest script changed since the run started.
  const scriptsRoot = fixture();
  const scriptsId = "run-acc-refusal-scripts";
  writePredecessor(scriptsRoot, scriptsId, { status: "cancelled", freeze: SCRIPT_FREEZE });
  stageRevisionStarted(scriptsRoot, scriptsId);
  writeFileSync(join(scriptsRoot, "package.json"), JSON.stringify({ scripts: { test: "npm run unit" } }), "utf8");
  const scriptsH = harness(scriptsRoot, scriptsId);
  await runFlowRevise(scriptsH.deps);
  await scriptsH.detached[0];
  const scriptsMessage = scriptsH.notifications.at(-1)?.message ?? "";
  assert.match(scriptsMessage, /verify scripts changed/);
  assert.match(scriptsMessage, /scripts\.test/, "the offending key is named");
  assert.deepEqual(revisionTypes(scriptsRoot, scriptsId), ["revision.started"], "no new events after the refusal");
  assert.equal(existsSync(runLogPathOf(scriptsRoot, successorRunId(scriptsId))), false, "zero execution");
  rmSync(scriptsRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §17 row 6 — ordinary-log regression (AC-7)
// ---------------------------------------------------------------------------

test("acceptance AC-7: crash healing and adversarial revision.* injections leave ordinary logs byte-identical", () => {
  const root = fixture();
  const runId = "run-acc-legacy";
  // A decided log (review completed, outcome events lost) with adversarial
  // revision.* events injected at chronological slots.
  const spec = writeArtifacts(root);
  const injected = [
    withEventId({
      type: "revision.started" as const,
      runId,
      revision: 7,
      correction: "adversarial",
      correctionSha: sha("adversarial"),
      baseContract: BASE_CONTRACT,
      at: "2026-01-01T00:00:00.000Z",
    }),
    withEventId({
      type: "revision.candidate" as const,
      runId,
      revision: 7,
      round: 1,
      prdSha: CANDIDATE_PAIR.prdSha,
      tasksSha: CANDIDATE_PAIR.tasksSha,
      at: "2026-01-01T00:01:00.000Z",
    }),
    withEventId({
      type: "revision.approved" as const,
      runId,
      revision: 7,
      round: 1,
      correction: "adversarial",
      correctionSha: sha("adversarial"),
      candidate: CANDIDATE_PAIR,
      contract: CONTRACT,
      predecessorStatus: "cancelled",
      approvedBy: { via: "/flow revise", pid: 1, at: "2026-01-01T00:02:00.000Z" },
    }),
  ];
  const log = RunLog.open(root, runId);
  log.append({
    type: "workflow.started",
    runId,
    workflow: "feature",
    description: DESCRIPTION,
    baseline: "snap-base",
    stack: { primary: "nodejs", frameworks: ["express"] },
  });
  log.append({ type: "phase.started", runId, phase: "discover" });
  log.append({ type: "phase.started", runId, phase: "spec" });
  log.append({ type: "agent.completed", runId, role: "planner", usage: { input: 100, output: 50 } });
  log.append({ type: "spec.approved", runId, ...spec });
  log.append(injected[0]!);
  log.append({ type: "phase.started", runId, phase: "develop" });
  log.append({ type: "agent.completed", runId, role: "developer", usage: { input: 200, output: 100 } });
  log.append(injected[1]!);
  log.append({
    type: "review.completed",
    runId,
    verdict: "approved",
    round: 1,
    issues: [],
  });
  log.append(injected[2]!);
  const bytesBefore = fileBytes(runLogPathOf(root, runId));

  // The plain-log verdict is unchanged by the injections (§16 rule 1/2):
  // the injected log and its revision-free twin replay identically.
  const events = readEvents(root, runId);
  const plain: WorkflowEvent[] = JSON.parse(JSON.stringify(events.filter((event) => !event.type.startsWith("revision."))));
  const injectedReplay = replayRunLog(events, { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
  const plainReplay = replayRunLog(plain, { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
  assert.equal(plainReplay.ok, false, "the plain decided log refuses with already_decided");
  assert.equal(injectedReplay.ok, plainReplay.ok, "the replay verdict is unchanged by revision.* presence");
  if (!injectedReplay.ok) {
    assert.equal(injectedReplay.refusal.type, "already_decided", "the heal path still recognizes the decided run");
    if (injectedReplay.refusal.type === "already_decided") {
      assert.equal(injectedReplay.refusal.status, "completed");
    }
  }

  // Ordinary crash healing appends EXACTLY the outcome pair, rewrites
  // nothing, and the injected events survive verbatim.
  if (!injectedReplay.ok && injectedReplay.refusal.type === "already_decided") {
    healAlreadyDecided(root, runId, injectedReplay.refusal);
  } else {
    throw new Error("expected an already_decided refusal to heal");
  }
  assert.equal(fileBytes(runLogPathOf(root, runId)).startsWith(bytesBefore), true, "the heal only appends — the log prefix (injections included) is byte-identical");
  const healed = readEvents(root, runId);
  assert.deepEqual(
    healed.slice(-2).map((event) => event.type),
    ["workflow.outcome", "workflow.completed"],
    "the heal appends exactly the outcome pair and nothing else",
  );
  assert.equal(outcomeOf(healed)?.status, "completed", "the approved verdict is recorded honestly");
  const healedIds = new Set(healed.map((event) => (event as { eventId?: string }).eventId));
  for (const event of injected) {
    assert.ok(healedIds.has(event.eventId), "each injected revision.* event survives the heal untouched");
  }
  const afterHeal = replayRunLog(readEvents(root, runId), { maxReviewRounds: DEFAULT_CONFIG.maxReviewRounds });
  assert.equal(afterHeal.ok, false, "post-heal the run is terminal, exactly as an ordinary decided log");
  if (!afterHeal.ok) assert.equal(afterHeal.refusal.type, "terminal_outcome");
  rmSync(root, { recursive: true, force: true });
});
