/**
 * Integration tests for /feature with a fake agent runtime (spec §38).
 * No models, no Pi, no network — only the orchestration is exercised.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { DEFAULT_CONFIG, type PiBrainConfig } from "../src/config.ts";
import { FakeAgentRunner, type AgentRunRequest, type AgentRunResult } from "../src/agent.ts";
import type {
  CommandResult,
  GitBaseline,
  GitService,
  HumanInput,
  VerifyRunner,
  WorkflowEvent,
} from "../src/ports.ts";
import type { ReviewResult } from "../src/review.ts";
import { hasValidTaskList, runFeatureWorkflow, type FeatureDeps } from "../src/workflows/feature.ts";
import { mkdirSync, writeFileSync } from "node:fs";

const PROFILES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");
const SKILLS = new Set(["karpathy-guidelines", "code-review", "feature", "nodejs-best-practices"]);

const PLAN = "## PRD\nBuild the thing.\n\n## TASKS\n- T1 do it\n";

class FakeHuman implements HumanInput {
  approve = true;
  confirmCalls = 0;
  readonly notices: string[] = [];
  async confirm(): Promise<boolean> {
    this.confirmCalls += 1;
    return this.approve;
  }
  async select(q: { options: Array<{ value: string }> }): Promise<string> {
    return q.options[0]!.value;
  }
  async input(): Promise<string> {
    return "";
  }
  async editor(q: { content: string }): Promise<string> {
    return q.content;
  }
  notify(m: string): void {
    this.notices.push(m);
  }
}

class FakeVerifier implements VerifyRunner {
  calls = 0;
  readonly exitCodes: number[];
  constructor(exitCodes: number[]) {
    this.exitCodes = exitCodes;
  }
  async run(): Promise<CommandResult[]> {
    const code = this.exitCodes[Math.min(this.calls, this.exitCodes.length - 1)] ?? 0;
    this.calls += 1;
    return [{ command: "npm test", exitCode: code, output: code === 0 ? "ok" : "1 failing" }];
  }
}

class FakeGit implements GitService {
  patches = ["diff-1", "diff-2", "diff-3"];
  filesList = ["src/a.ts"];
  calls = 0;
  baselineCalls = 0;
  async baseline(cwd: string): Promise<GitBaseline> {
    this.baselineCalls += 1;
    return { repoRoot: cwd, branch: "main", headSha: "abc123", baseCommit: "snap-base" };
  }
  dirtySubmodules: string[] = [];
  async diffSince(): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    const patch = this.patches[Math.min(this.calls, this.patches.length - 1)]!;
    const files = this.filesList;
    this.calls += 1;
    return { patch, files, dirtySubmodules: this.dirtySubmodules };
  }
}

function harness(
  responder: (req: AgentRunRequest, i: number) => AgentRunResult,
  opts: { verifier?: VerifyRunner; config?: Partial<PiBrainConfig> } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "pi-brain-wf-"));
  const human = new FakeHuman();
  const agents = new FakeAgentRunner(responder);
  const events: WorkflowEvent[] = [];
  const verifier = opts.verifier ?? new FakeVerifier([0]);
  const deps: FeatureDeps = {
    cwd,
    profilesDir: PROFILES_DIR,
    availableSkills: SKILLS,
    config: { ...DEFAULT_CONFIG, stack: "nodejs", ...opts.config },
    agents,
    human,
    verifier,
    git: new FakeGit(),
    events: { emit: (e) => events.push(e) },
  };
  return { deps, human, agents, events, cwd, verifier };
}

const reviewOf = (r: ReviewResult): AgentRunResult => ({
  role: "reviewer",
  text: "",
  structured: r,
  aborted: false,
});

const plannerResult: AgentRunResult = { role: "planner", text: PLAN, aborted: false };
const devResult: AgentRunResult = { role: "developer", text: "DEV_INTERNAL_MONOLOGUE", aborted: false };

test("token usage aggregates per role and ships with the outcome", async () => {
  let reviewIndex = 0;
  const { deps, events } = harness((req) => {
    if (req.role === "planner") {
      return { ...plannerResult, usage: { input: 1000, output: 500 } };
    }
    if (req.role === "developer") {
      // 1st dev run + fix round: usage must accumulate per role.
      return { ...devResult, usage: { input: 2000, output: 900 } };
    }
    reviewIndex += 1;
    return {
      ...reviewOf(
        reviewIndex === 1
          ? {
              verdict: "changes_requested",
              summary: "one bug",
              issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "off by one" }],
            }
          : { verdict: "approved", summary: "ok", issues: [] },
      ),
      usage: { input: 3000, output: 1200 },
    };
  });

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-usage");

  assert.equal(outcome.status, "completed");
  assert.deepEqual(outcome.usage, {
    planner: { input: 1000, output: 500 },
    developer: { input: 4000, output: 1800 },
    reviewer: { input: 6000, output: 2400 },
  });

  const agentDone = events.filter((e) => e.type === "agent.completed");
  const devDone = agentDone.filter((e) => e.role === "developer");
  assert.deepEqual(
    devDone.map((e) => (e as { usage?: unknown }).usage),
    [
      { input: 2000, output: 900 },
      { input: 2000, output: 900 },
    ],
    "each agent.completed event carries its own call's usage",
  );
});

test("a run with no reported usage yields an empty usage map, not undefined", async () => {
  const { deps } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-no-usage");
  assert.deepEqual(outcome.usage, {});
});

test("happy path: changes requested on round 1, approved on round 2", async () => {
  let reviewIndex = 0;
  const { deps, agents, cwd, events } = harness((req) => {
    if (req.role === "planner") return plannerResult;
    if (req.role === "developer") return devResult;
    reviewIndex += 1;
    return reviewOf(
      reviewIndex === 1
        ? {
            verdict: "changes_requested",
            summary: "one bug",
            issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "off by one" }],
          }
        : { verdict: "approved", summary: "looks good", issues: [] },
    );
  });

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-1");

  assert.equal(outcome.status, "completed");
  assert.equal(agents.calls.filter((c) => c.role === "developer").length, 2);
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 2);

  // spec artefacts written, nothing committed
  assert.ok(existsSync(join(cwd, ".ai/features/add-invitations/prd-add-invitations.md")));
  assert.match(
    readFileSync(join(cwd, ".ai/features/add-invitations/tasks-add-invitations.md"), "utf8"),
    /T1/,
  );

  // the second developer run must carry the finding, not the reviewer's prose
  const secondDev = agents.calls.filter((c) => c.role === "developer")[1]!;
  assert.match(secondDev.prompt, /off by one/);

  // reviewer never receives the developer's conversation
  const reviewer = agents.calls.find((c) => c.role === "reviewer")!;
  assert.ok(!reviewer.prompt.includes("DEV_INTERNAL_MONOLOGUE"));
  assert.equal(reviewer.readOnly, true);
  assert.ok(reviewer.resultTool);

  assert.ok(events.some((e) => e.type === "review.completed"));
});

test("verification failure sends the developer back and does NOT call the reviewer", async () => {
  const verifier = new FakeVerifier([1, 0]);
  let reviewerCalls = 0;
  const { deps, agents } = harness(
    (req) => {
      if (req.role === "planner") return plannerResult;
      if (req.role === "developer") return devResult;
      reviewerCalls += 1;
      return reviewOf({ verdict: "approved", summary: "ok", issues: [] });
    },
    { verifier },
  );

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-2");

  assert.equal(outcome.status, "completed");
  const devPrompts = agents.calls.filter((c) => c.role === "developer");
  assert.equal(devPrompts.length, 2, "developer runs again after the failing check");
  assert.match(devPrompts[1]!.prompt, /npm test.*exited 1/s);
  assert.equal(reviewerCalls, 1, "reviewer only ran once verification was green");
});

test("failing checks do not eat the review budget", async () => {
  // Two failed verifications used to consume both review rounds, so the run
  // could end in needs_human without the reviewer ever being called.
  const verifier = new FakeVerifier([1, 1, 0]);
  let reviewerCalls = 0;
  const { deps, agents } = harness(
    (req) => {
      if (req.role === "planner") return plannerResult;
      if (req.role === "developer") return devResult;
      reviewerCalls += 1;
      return reviewOf({ verdict: "approved", summary: "ok", issues: [] });
    },
    { verifier },
  );

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-verify");

  assert.equal(outcome.status, "completed");
  assert.equal(agents.calls.filter((c) => c.role === "developer").length, 3);
  assert.equal(reviewerCalls, 1, "the reviewer still gets its turn");
});

test("verification that never goes green escalates with the failing command", async () => {
  const verifier = new FakeVerifier([1]);
  let reviewerCalls = 0;
  const { deps } = harness(
    (req) => {
      if (req.role === "planner") return plannerResult;
      if (req.role === "developer") return devResult;
      reviewerCalls += 1;
      return reviewOf({ verdict: "approved", summary: "ok", issues: [] });
    },
    { verifier, config: { maxVerifyRetries: 1 } },
  );

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-verify-2");

  assert.equal(outcome.status, "needs_human");
  assert.match((outcome as { reason: string }).reason, /npm test/);
  assert.equal(reviewerCalls, 0);
});

test("reviewer that never approves stops at maxReviewRounds", async () => {
  const { deps, agents } = harness((req) => {
    if (req.role === "planner") return plannerResult;
    if (req.role === "developer") return devResult;
    return reviewOf({
      verdict: "changes_requested",
      summary: "still broken",
      issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "nope" }],
    });
  });

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-3");

  assert.equal(outcome.status, "needs_human");
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 2);
});

test("rejecting the plan cancels before any developer runs", async () => {
  const { deps, human, agents } = harness((req) =>
    req.role === "planner" ? plannerResult : devResult,
  );
  human.approve = false;

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-4");

  assert.deepEqual(outcome, { status: "cancelled", at: "spec approval", usage: {} });
  assert.equal(agents.calls.filter((c) => c.role !== "planner").length, 0);
});

test("malformed reviewer output escalates instead of crashing", async () => {
  const { deps } = harness((req) => {
    if (req.role === "planner") return plannerResult;
    if (req.role === "developer") return devResult;
    return { role: "reviewer", text: "LGTM I guess", aborted: false };
  });

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-5");

  assert.equal(outcome.status, "needs_human");
  assert.match((outcome as { reason: string }).reason, /invalid result/);
});

test("abort before the first developer run cancels cleanly", async () => {
  const controller = new AbortController();
  const { deps } = harness((req) => {
    if (req.role === "planner") {
      controller.abort();
      return plannerResult;
    }
    return devResult;
  });
  deps.signal = controller.signal;

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-6");
  assert.equal(outcome.status, "cancelled");
});

test("a plan from an earlier pi-brain run on the same feature is overwritten", async () => {
  let plannerCalls = 0;
  const { deps, agents, cwd } = harness((req) => {
    if (req.role === "planner") {
      plannerCalls += 1;
      // the two runs must be distinguishable, or "overwritten" proves nothing
      return {
        role: "planner",
        text: `## PRD\nPlan revision ${plannerCalls}.\n\n## TASKS\n- T${plannerCalls} do it\n`,
        aborted: false,
      };
    }
    if (req.role === "developer") return devResult;
    return reviewOf({ verdict: "approved", summary: "ok", issues: [] });
  });

  // first run: the user rejects the plan
  const human = deps.human as FakeHuman;
  human.approve = false;
  await runFeatureWorkflow(deps, "add invitations", "run-first");

  const dir = join(cwd, ".ai/features/add-invitations");
  assert.match(readFileSync(join(dir, "prd-add-invitations.md"), "utf8"), /Plan revision 1/);

  // second run of the SAME feature: same directory, second plan wins
  human.approve = true;
  await runFeatureWorkflow(deps, "add invitations", "run-second");

  assert.ok(!existsSync(join(cwd, ".ai/features/add-invitations-2")), "must reuse its own directory");
  const prd = readFileSync(join(dir, "prd-add-invitations.md"), "utf8");
  assert.match(prd, /Plan revision 2/);
  assert.ok(!prd.includes("Plan revision 1"), "the rejected plan must be gone");

  const developer = agents.calls.find((c) => c.role === "developer")!;
  assert.match(developer.prompt, /T2 do it/);
  assert.ok(!developer.prompt.includes("T1 do it"));
});

test("a plan file pi-brain did not write is never clobbered", async () => {
  const { deps, cwd } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );

  const dir = join(cwd, ".ai/features/add-invitations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prd-add-invitations.md"), "# hand-written plan\n");

  await runFeatureWorkflow(deps, "add invitations", "run-foreign");

  assert.match(readFileSync(join(dir, "prd-add-invitations.md"), "utf8"), /hand-written/);
  assert.ok(existsSync(join(cwd, ".ai/features/add-invitations-2")));
});

test("a hand-written tasks file is not clobbered when the PRD is absent", async () => {
  const { deps, cwd } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );

  const dir = join(cwd, ".ai/features/add-invitations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "tasks-add-invitations.md"), "- MY OWN TASK LIST\n");

  await runFeatureWorkflow(deps, "add invitations", "run-partial");

  assert.match(readFileSync(join(dir, "tasks-add-invitations.md"), "utf8"), /MY OWN TASK LIST/);
  assert.ok(existsSync(join(cwd, ".ai/features/add-invitations-2")));
});

test("dirty submodules stop the run instead of approving unseen code", async () => {
  const { deps } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  (deps.git as FakeGit).dirtySubmodules = ["vendor/child"];

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-submodule");

  assert.equal(outcome.status, "needs_human");
  assert.match((outcome as { reason: string }).reason, /vendor\/child/);
  assert.equal(
    (deps.agents as FakeAgentRunner).calls.filter((c) => c.role === "reviewer").length,
    0,
    "escalation is deterministic: no reviewer call is spent first",
  );
});

test("two different features that slugify the same get separate directories", async () => {
  const { deps, cwd } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );

  await runFeatureWorkflow(deps, "add invitations to the org for admins only", "run-a");
  await runFeatureWorkflow(deps, "add invitations to the org for guests too", "run-b");

  assert.ok(existsSync(join(cwd, ".ai/features/add-invitations-to-the-org-for")));
  assert.ok(existsSync(join(cwd, ".ai/features/add-invitations-to-the-org-for-2")));
});

test("the planner's English TITLE names the directory, not the raw request", async () => {
  const planWithTitle = (title: string): AgentRunResult => ({
    role: "planner",
    text: `## TITLE\n${title}\n\n## PRD\nbody\n\n## TASKS\n- T1 do it\n`,
    aborted: false,
  });
  const { deps, cwd } = harness((req) =>
    req.role === "planner"
      ? planWithTitle("Playwright Flight Provider")
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );

  const outcome = await runFeatureWorkflow(
    deps,
    "aggiungi un PlaywrightProvider come nuovo provider",
    "run-titolo",
  );
  assert.equal(outcome.status, "completed");
  assert.ok(existsSync(join(cwd, ".ai/features/playwright-flight-provider")));
  assert.ok(
    !existsSync(join(cwd, ".ai/features/aggiungi-un-playwrightprovider-come-nuovo")),
    "the Italian description must not name the directory",
  );
});

test("the planner's TASKS validator rejects placeholders and duplicate ids", () => {
  assert.equal(hasValidTaskList("## TASKS\n- T1 implement it\n- T2 test it"), true);
  assert.equal(hasValidTaskList("## TASKS\n- TODO"), false);
  assert.equal(hasValidTaskList("## TASKS\n- T1 first\n- T1 duplicate"), false);
});

test("a planner response without granular TASKS is escalated before the gate", async () => {
  const { deps, agents, human } = harness((req) =>
    req.role === "planner"
      ? { role: "planner", text: "## PRD\nA plan with no executable tasks.\n", aborted: false }
      : devResult,
  );

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-no-tasks");

  assert.equal(outcome.status, "needs_human");
  assert.match(outcome.status === "needs_human" ? outcome.reason : "", /valid granular TASKS/);
  assert.equal(agents.calls.length, 1, "only the planner may run");
  assert.equal(human.confirmCalls, 0, "the approval gate was never opened");
});

test("a developer cannot mutate the approved spec before verification or review", async () => {
  const { deps, cwd, agents } = harness((req) => {
    if (req.role === "developer") {
      writeFileSync(
        join(cwd, ".ai", "features", "add-invitations", "prd-add-invitations.md"),
        "tampered plan\n",
        "utf8",
      );
      return devResult;
    }
    return req.role === "planner"
      ? plannerResult
      : reviewOf({ verdict: "approved", summary: "ok", issues: [] });
  });

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-same-round-tamper");

  assert.equal(outcome.status, "needs_human");
  assert.match(outcome.status === "needs_human" ? outcome.reason : "", /modified after the gate/);
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 0);
});

test("a spec mutation during diff collection is caught before the reviewer", async () => {
  const { deps, cwd, agents } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  const git = deps.git as FakeGit;
  git.diffSince = async () => {
    writeFileSync(
      join(cwd, ".ai", "features", "add-invitations", "tasks-add-invitations.md"),
      "tampered during diff\n",
      "utf8",
    );
    return { patch: "diff-1", files: ["src/a.ts"], dirtySubmodules: [] };
  };

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-diff-tamper");

  assert.equal(outcome.status, "needs_human");
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 0);
});

test("a spec mutation during review invalidates the verdict", async () => {
  const { deps, cwd, agents } = harness((req) => {
    if (req.role === "planner") return plannerResult;
    if (req.role === "developer") return devResult;
    writeFileSync(
      join(cwd, ".ai", "features", "add-invitations", "prd-add-invitations.md"),
      "tampered during review\n",
      "utf8",
    );
    return reviewOf({ verdict: "approved", summary: "ok", issues: [] });
  });

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-review-tamper");

  assert.equal(outcome.status, "needs_human");
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 1);
});

test("a rerun whose TITLE is worded differently reuses its earlier directory", async () => {
  let titleNo = 0;
  const { deps, cwd } = harness((req) =>
    req.role === "planner"
      ? ({
          role: "planner",
          text: `## TITLE\nPlaywright Provider slice ${++titleNo}\n\n## PRD\nbody\n\n## TASKS\n- T1 do it\n`,
          aborted: false,
        }) satisfies AgentRunResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );

  await runFeatureWorkflow(deps, "aggiungi un PlaywrightProvider", "run-1");
  await runFeatureWorkflow(deps, "aggiungi un PlaywrightProvider", "run-2");

  assert.ok(existsSync(join(cwd, ".ai/features/playwright-provider-slice-1")));
  assert.ok(
    !existsSync(join(cwd, ".ai/features/playwright-provider-slice-2")),
    "the marker, not the TITLE, identifies a rerun",
  );
});

test("an aborted child run cancels instead of pressing on", async () => {
  const { deps, agents } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : { role: "developer", text: "", aborted: true },
  );

  const outcome = await runFeatureWorkflow(deps, "add invitations", "run-abort");

  assert.deepEqual(outcome, { status: "cancelled", at: "development", usage: {} });
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 0);
});

// -- resume re-entry (IDEAS.md "Resume mode for interrupted runs") -----------

import { descriptionMarker, type ResumeState } from "../src/workflows/feature.ts";

const DESCRIPTION = "add invitations";

/** PRD/tasks on disk with the description marker, as the original run wrote them. */
function seedFeatureArtifacts(cwd: string, description: string): void {
  const dir = join(cwd, ".ai", "features", "add-invitations");
  mkdirSync(dir, { recursive: true });
  const marker = descriptionMarker(description);
  writeFileSync(join(dir, "prd-add-invitations.md"), `${marker}\n## PRD\nbody\n`, "utf8");
  writeFileSync(join(dir, "tasks-add-invitations.md"), `${marker}\n## TASKS\n- T1 do it\n`, "utf8");
}

const resumeStateOf = (overrides: Partial<ResumeState> = {}): ResumeState => ({
  phase: "develop",
  reviewRound: 0,
  verifyRetries: 0,
  developerRuns: 0,
  fixes: [],
  previousBlockingIds: new Set<string>(),
  usage: {},
  ...overrides,
});

const phaseTrace = (events: WorkflowEvent[]): string[] =>
  events.filter((e): e is Extract<WorkflowEvent, { type: "phase.started" }> => e.type === "phase.started")
    .map((e) => e.phase);

test("resume mid-develop re-runs the developer, keeps the persisted baseline and skips the planner", async () => {
  const { deps, cwd, agents, events } = harness(
    (req) =>
      req.role === "developer"
        ? { ...devResult, usage: { input: 2000, output: 900 } }
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  seedFeatureArtifacts(cwd, DESCRIPTION);
  const baseline: GitBaseline = { repoRoot: cwd, branch: "resumed", headSha: "x", baseCommit: "persisted-base" };

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-r1",
    resumeStateOf({
      phase: "develop",
      usage: { developer: { input: 5000, output: 2500 } },
      baseline,
    }),
  );

  assert.equal(outcome.status, "completed");
  assert.equal(agents.calls.filter((c) => c.role === "planner").length, 0, "no planner call on resume");
  assert.deepEqual(
    phaseTrace(events),
    ["develop", "verify", "review #1"],
    "the resumed run starts straight at the interrupted developer phase",
  );
  assert.ok(!events.some((e) => e.type === "workflow.started"), "workflow.started is not re-emitted");
  assert.equal((deps.git as FakeGit).baselineCalls, 0, "the persisted baseline is reused, never re-snapshotted");
  assert.deepEqual(outcome.usage, {
    developer: { input: 7000, output: 3400 }, // 5000/2500 reconstructed + 2000/900 fresh
  });
});

test("resume at review skips developer and verify, and reviews the ORIGINAL baseline diff", async () => {
  const { deps, cwd, agents, verifier, events } = harness((req) =>
    reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-r2",
    resumeStateOf({
      phase: "review #1",
      developerRuns: 1,
      usage: { developer: { input: 5000, output: 2500 } },
    }),
  );

  assert.equal(outcome.status, "completed");
  assert.deepEqual(agents.calls.map((c) => c.role), ["reviewer"], "only the reviewer runs");
  assert.equal((verifier as FakeVerifier).calls, 0, "verify already passed before the interruption");
  assert.deepEqual(phaseTrace(events), ["review #1"]);
});

test("resume at review with changes_requested runs the fix round instead of looping forever", async () => {
  // Regression: the resumed entry used to be name-matched against every
  // iteration and never consumed — a changes_requested verdict on the resumed
  // round spun the loop without ever calling an agent again.
  let reviewIndex = 0;
  const { deps, cwd, agents, events } = harness((req) => {
    if (req.role === "developer") return devResult;
    reviewIndex += 1;
    return reviewOf(
      reviewIndex === 1
        ? {
            verdict: "changes_requested",
            summary: "one bug",
            issues: [{ id: "R9", severity: "blocking", category: "bug", problem: "off by one" }],
          }
        : { verdict: "approved", summary: "ok", issues: [] },
    );
  });
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-r3",
    resumeStateOf({ phase: "review #1", developerRuns: 1 }),
  );

  assert.equal(outcome.status, "completed");
  assert.deepEqual(agents.calls.map((c) => c.role), ["reviewer", "developer", "reviewer"]);
  assert.deepEqual(phaseTrace(events), ["review #1", "fix #1", "verify", "review #2"]);
  const fixPrompt = agents.calls.find((c) => c.role === "developer")!.prompt;
  assert.ok(fixPrompt.includes("R9"), "the fix round prompt carries the resumed review's blocking finding");
});

test("resume at verify skips the developer and re-runs the deterministic checks", async () => {
  const { deps, cwd, agents, verifier, events } = harness((req) =>
    req.role === "developer" ? devResult : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-r4",
    resumeStateOf({ phase: "verify", developerRuns: 1 }),
  );

  assert.equal(outcome.status, "completed");
  assert.deepEqual(agents.calls.map((c) => c.role), ["reviewer"]);
  assert.equal((verifier as FakeVerifier).calls, 1);
  assert.deepEqual(phaseTrace(events), ["verify", "review #1"]);
});

test("resume at review #2 respects the review budget and escalates", async () => {
  const { deps, cwd, agents } = harness((req) =>
    reviewOf({
      verdict: "changes_requested",
      summary: "still broken",
      issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "off by one" }],
    }),
  );
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-r5",
    resumeStateOf({ phase: "review #2", reviewRound: 1, developerRuns: 1 }),
  );

  assert.equal(outcome.status, "needs_human");
  assert.match(outcome.status === "needs_human" ? outcome.reason ?? "" : "", /max review rounds/);
  assert.equal(agents.calls.filter((c) => c.role === "reviewer").length, 1, "no third round past the budget");
});

test("resume without matching artifacts escalates to needs_human", async () => {
  const { deps, cwd } = harness((req) => devResult);

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-r6", resumeStateOf());

  assert.equal(outcome.status, "needs_human");
  assert.match(
    outcome.status === "needs_human" ? outcome.reason ?? "" : "",
    /cannot find PRD\/tasks/,
  );
});

// -- pre-merge hardening (external review fix-then-merge set) ----------------

test("the developer runs WITHOUT shell access and the reviewer is read-only even when configured otherwise", async () => {
  const { deps, agents, events } = harness(
    (req) =>
      req.role === "planner"
        ? plannerResult
        : req.role === "developer"
          ? devResult
          : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
    { config: { roles: { reviewer: { readOnly: false } } } as Partial<PiBrainConfig> },
  );

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-tools");

  assert.equal(outcome.status, "completed");
  const devCall = agents.calls.find((c) => c.role === "developer")!;
  assert.deepEqual(devCall.tools, ["read", "grep", "find", "ls", "edit", "write"], "no bash for the developer, ever");
  const revCall = agents.calls.find((c) => c.role === "reviewer")!;
  assert.equal(revCall.readOnly, true, "readOnly is an invariant, config cannot disable it");
  assert.ok(
    events.some((e) => e.type === "spec.approved"),
    "the gate approval persists the spec content hashes",
  );
});

test("tampering with the approved PRD/tasks mid-run escalates to needs_human", async () => {
  const { deps, cwd, agents } = harness(
    (req) =>
      req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-tamper",
    resumeStateOf({
      phase: "review #1",
      developerRuns: 1,
      spec: {
        prdSha: createHash("sha256").update("## PRD\nbody\n", "utf8").digest("hex"),
        tasksSha: createHash("sha256").update("TAMPER-FREE\n", "utf8").digest("hex"),
      },
    }),
  );

  assert.equal(outcome.status, "needs_human");
  assert.match(
    outcome.status === "needs_human" ? outcome.reason ?? "" : "",
    /modified after the gate/,
  );
  assert.equal(agents.calls.length, 0, "no agent runs against a mutated spec");
});

test("a resumed verify failure re-observed after the crash does not consume a retry", async () => {
  // Crash sequence: fail #1 -> budget banked for fix#1 -> crash.
  // Resume at verify: the identical failure must NOT escalate (maxVerifyRetries
  // already at 1) — the banked fix round runs first.
  const { deps, cwd, agents } = harness((req) => devResult, {
    verifier: new FakeVerifier([1, 1]),
    config: { maxVerifyRetries: 1 } as Partial<PiBrainConfig>,
  });
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-vbudget",
    resumeStateOf({ phase: "verify", developerRuns: 1, verifyRetries: 1, verifyRetryBanked: true }),
  );

  assert.equal(outcome.status, "needs_human", "the SECOND genuine failure (after the fix) escalates");
  assert.match(outcome.status === "needs_human" ? outcome.reason ?? "" : "", /after 1 developer retries/);
  assert.equal(agents.calls.filter((c) => c.role === "developer").length, 1, "fix #1 ran — the crash had already paid for it");
});

test("a resumed verify phase with no persisted result charges its first failure", async () => {
  const { deps, cwd, agents } = harness((req) => devResult, {
    verifier: new FakeVerifier([1, 1]),
    config: { maxVerifyRetries: 1 } as Partial<PiBrainConfig>,
  });
  seedFeatureArtifacts(cwd, DESCRIPTION);

  const outcome = await runFeatureWorkflow(
    deps,
    DESCRIPTION,
    "run-vbudget-no-result",
    resumeStateOf({ phase: "verify", developerRuns: 1, verifyRetries: 0, verifyRetryBanked: false }),
  );

  assert.equal(outcome.status, "needs_human");
  assert.equal(agents.calls.filter((c) => c.role === "developer").length, 1);
});

test("ignore rules changed during the run are surfaced to the reviewer prompt", async () => {
  const { deps, cwd, agents, human } = harness((req) =>
    req.role === "planner"
      ? plannerResult
      : req.role === "developer"
        ? devResult
        : reviewOf({ verdict: "approved", summary: "ok", issues: [] }),
  );
  seedFeatureArtifacts(cwd, DESCRIPTION);
  (deps.git as FakeGit).filesList = [".gitignore", "src/a.ts"];

  const outcome = await runFeatureWorkflow(deps, DESCRIPTION, "run-ignore");

  assert.equal(outcome.status, "completed");
  const revCall = agents.calls.find((c) => c.role === "reviewer")!;
  assert.match(revCall.prompt, /IGNORE RULES CHANGED/, "the reviewer is told the diff touches ignore rules");
  assert.ok(
    human.notices.some((n) => n.includes("ignore rules changed")),
    `the user is notified too: ${human.notices.join(" | ")}`,
  );
});
