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
import { runFeatureWorkflow, type FeatureDeps } from "../src/workflows/feature.ts";

const PROFILES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");
const SKILLS = new Set(["karpathy-guidelines", "code-review", "feature", "nodejs-best-practices"]);

const PLAN = "## PRD\nBuild the thing.\n\n## TASKS\n- T1 do it\n";

class FakeHuman implements HumanInput {
  approve = true;
  readonly notices: string[] = [];
  async confirm(): Promise<boolean> {
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
  calls = 0;
  async baseline(cwd: string): Promise<GitBaseline> {
    return { repoRoot: cwd, branch: "main", headSha: "abc123", preexistingChanges: [] };
  }
  async diffSince(): Promise<{ patch: string; files: string[] }> {
    const patch = this.patches[Math.min(this.calls, this.patches.length - 1)]!;
    this.calls += 1;
    return { patch, files: ["src/a.ts"] };
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

  assert.deepEqual(outcome, { status: "cancelled", at: "spec approval" });
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
