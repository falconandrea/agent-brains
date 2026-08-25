/**
 * Acceptance tests for /flow resume functionality.
 * Tests the replay module and resume orchestration end-to-end.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { replayRunLog, isResumable, validateResumePreconditions, hasPatchChanged, askResumeWithChangedDiff, type Refusal } from "../src/workflows/resume.ts";
import type { WorkflowEvent, GitService, GitBaseline, HumanInput } from "../src/ports.ts";

// Simple fakes for testing

class FakeGit implements GitService {
  async baseline(cwd: string): Promise<GitBaseline> {
    return { repoRoot: cwd, branch: "main", headSha: "abc123", baseCommit: "snap-base" };
  }
  async diffSince(baseline: GitBaseline) {
    return { patch: "diff content", files: ["src/file.ts"], dirtySubmodules: [] };
  }
}

class FakeHuman implements HumanInput {
  selectValue = "abort";
  async confirm(): Promise<boolean> {
    return true;
  }
  async select(q: { options: Array<{ value: string }> }): Promise<string> {
    return this.selectValue;
  }
  async input(): Promise<string> {
    return "";
  }
  async editor(q: { content: string }): Promise<string> {
    return q.content;
  }
  notify(_message: string): void {
    // no-op
  }
}

const fixture = (): string => mkdtempSync(join(tmpdir(), "pi-brain-resume-"));

test("replayRunLog returns empty_log for no events", () => {
  const result = replayRunLog([]);
  assert.equal(result.ok, false);
  assert.equal(result.refusal.type, "empty_log");
});

test("replayRunLog returns missing_workflow_started for non-started event", () => {
  const events: WorkflowEvent[] = [
    { type: "phase.started", runId: "run-1", phase: "discover" },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, false);
  assert.equal(result.refusal.type, "missing_workflow_started");
});

test("replayRunLog returns not_feature_workflow for non-feature workflow", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "other" },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, false);
  assert.equal(result.refusal.type, "not_feature_workflow");
  assert.equal((result.refusal as { workflow: string }).workflow, "other");
});

test("replayRunLog returns missing_baseline for old-format log", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature" },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, false);
  assert.equal(result.refusal.type, "missing_baseline");
});

test("replayRunLog returns gate_not_approved when no develop phase", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "discover" },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, false);
  assert.equal(result.refusal.type, "gate_not_approved");
});

test("replayRunLog returns terminal_outcome for completed runs", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "workflow.outcome", runId: "run-1", status: "completed", summary: "done" },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, false);
  assert.equal(result.refusal.type, "terminal_outcome");
  assert.equal((result.refusal as { outcome: string }).outcome, "workflow.outcome");
});

test("replayRunLog allows resuming workflow.failed runs", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "workflow.failed", runId: "run-1", error: "boom" },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "develop");
  assert.equal(result.state.developerRuns, 0, "the interrupted develop pass never completed");
});

test("replayRunLog reconstructs state from log interrupted mid-develop", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "discover" },
    { type: "phase.started", runId: "run-1", phase: "spec" },
    { type: "agent.started", runId: "run-1", role: "planner", model: "openai/gpt-4" },
    { type: "agent.completed", runId: "run-1", role: "planner", usage: { input: 1000, output: 500 } },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.started", runId: "run-1", role: "developer", model: "zai/coder" },
    // Interrupted here — agent.completed not emitted
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "develop");
  assert.equal(result.state.developerRuns, 0, "interrupted develop is re-run, not counted");
  assert.equal(result.state.reviewRound, 0);
  assert.deepEqual(result.state.usage, { planner: { input: 1000, output: 500 } });
});

test("replayRunLog reconstructs state from log after develop completed (verify)", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.started", runId: "run-1", role: "developer", model: "zai/coder" },
    { type: "agent.completed", runId: "run-1", role: "developer", usage: { input: 2000, output: 1000 } },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    // Interrupted during verify
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "verify");
  assert.equal(result.state.developerRuns, 1);
});

test("replayRunLog reconstructs state from log interrupted mid-review", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.started", runId: "run-1", role: "developer", model: "zai/coder" },
    { type: "agent.completed", runId: "run-1", role: "developer" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: true },
    { type: "phase.started", runId: "run-1", phase: "review #1", patchSha: "sha256-original" },
    { type: "agent.started", runId: "run-1", role: "reviewer", model: "openai/gpt-4" },
    // Interrupted during review
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "review #1");
  assert.equal(result.state.reviewRound, 0, "the interrupted review round never consumed budget");
  assert.equal(result.state.interruptedPatchSha, "sha256-original");
});

test("replayRunLog tracks reviewRound and budget across rounds", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.completed", runId: "run-1", role: "developer" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: true },
    { type: "phase.started", runId: "run-1", phase: "review #1", patchSha: "sha256-1" },
    { type: "review.completed", runId: "run-1", verdict: "changes_requested", round: 1, issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "bug" }] },
    { type: "phase.started", runId: "run-1", phase: "fix #1" },
    { type: "agent.completed", runId: "run-1", role: "developer" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: true },
    { type: "phase.started", runId: "run-1", phase: "review #2", patchSha: "sha256-2" },
    // Interrupted during review #2
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "review #2");
  assert.equal(result.state.reviewRound, 1, "only completed reviews count: round 2 re-runs");
  assert.equal(result.state.interruptedPatchSha, "sha256-2");
  assert.equal(result.state.fixes.length, 1);
  assert.equal(result.state.fixes[0]?.id, "R1");
});

test("replayRunLog tracks verifyRetries correctly", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.completed", runId: "run-1", role: "developer" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: false },
    { type: "phase.started", runId: "run-1", phase: "fix #1" },
    { type: "agent.completed", runId: "run-1", role: "developer" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: false },
    { type: "phase.started", runId: "run-1", phase: "fix #2" },
    // Interrupted during fix #2
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.verifyRetries, 2);
  assert.equal(result.state.developerRuns, 2, "develop + fix #1 completed; interrupted fix #2 re-runs");
  assert.equal(result.state.phase, "fix #2");
});

test("replayRunLog aggregates usage per role", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "spec" },
    { type: "agent.completed", runId: "run-1", role: "planner", usage: { input: 1000, output: 500 } },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.completed", runId: "run-1", role: "developer", usage: { input: 2000, output: 1000 } },
    { type: "phase.started", runId: "run-1", phase: "develop" }, // fix #1
    { type: "agent.completed", runId: "run-1", role: "developer", usage: { input: 1500, output: 750 } },
    { type: "phase.started", runId: "run-1", phase: "review #1" },
    { type: "agent.completed", runId: "run-1", role: "reviewer", usage: { input: 3000, output: 1500 } },
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.usage, {
    planner: { input: 1000, output: 500 },
    developer: { input: 3500, output: 1750 },
    reviewer: { input: 3000, output: 1500 },
  });
});

test("replayRunLog handles torn final line gracefully", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.completed", runId: "run-1", role: "developer" },
  ];
  // Simulate a torn final line by adding an incomplete event
  // In real usage, readRunLog already handles this, so this test ensures
  // replayRunLog doesn't crash on any valid event array
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
});

test("isResumable returns false for empty log", () => {
  assert.equal(isResumable([]), false);
});

test("isResumable returns false for terminal outcome", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "workflow.outcome", runId: "run-1", status: "completed" },
  ];
  assert.equal(isResumable(events), false);
});

test("isResumable returns true for interrupted run", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
  ];
  assert.equal(isResumable(events), true);
});

test("hasPatchChanged returns false when no interruptedPatchSha", () => {
  assert.equal(hasPatchChanged("some-patch", undefined), false);
});

test("hasPatchChanged returns false when patch unchanged", () => {
  const patch = "same patch content";
  const sha = createHash("sha256").update(patch).digest("hex");
  assert.equal(hasPatchChanged(patch, sha), false);
});

test("hasPatchChanged returns true when patch changed", () => {
  const oldPatch = "old patch";
  const newPatch = "new patch";
  const oldSha = createHash("sha256").update(oldPatch).digest("hex");
  assert.equal(hasPatchChanged(newPatch, oldSha), true);
});

test("validateResumePreconditions returns missing_artifacts when PRD missing", async () => {
  const root = fixture();
  const git = new FakeGit();
  const baseline = await git.baseline(root);

  const result = await validateResumePreconditions({
    cwd: root,
    description: "test feature",
    git,
    baseline,
  });

  assert.equal(result?.type, "missing_artifacts");
  rmSync(root, { recursive: true, force: true });
});

test("validateResumePreconditions returns missing_artifacts when marker mismatch", async () => {
  const root = fixture();
  const git = new FakeGit();
  const baseline = await git.baseline(root);

  // Create a feature directory with wrong marker
  const featureDir = join(root, ".ai", "features", "test-feature");
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, "prd-test-feature.md"), "<!-- wrong marker -->\n# PRD", "utf8");

  const result = await validateResumePreconditions({
    cwd: root,
    description: "test feature",
    git,
    baseline,
  });

  assert.equal(result?.type, "missing_artifacts");
  rmSync(root, { recursive: true, force: true });
});

test("validateResumePreconditions passes when artifacts exist with correct marker", async () => {
  const root = fixture();
  const git = new FakeGit();
  const baseline = await git.baseline(root);
  const description = "test feature";

  // Create a feature directory with correct marker
  const featureDir = join(root, ".ai", "features", "test-feature");
  mkdirSync(featureDir, { recursive: true });
  const marker = `<!-- pi-brain:feature ${JSON.stringify(description)} -->`;
  writeFileSync(join(featureDir, "prd-test-feature.md"), `${marker}\n# PRD`, "utf8");
  writeFileSync(join(featureDir, "tasks-test-feature.md"), `${marker}\n# Tasks`, "utf8");

  const result = await validateResumePreconditions({
    cwd: root,
    description,
    git,
    baseline,
  });

  assert.equal(result, undefined); // No refusal = success
  rmSync(root, { recursive: true, force: true });
});

test("validateResumePreconditions returns unresolvable_baseline when diffSince fails", async () => {
  const root = fixture();
  const description = "test feature";

  // Create artifacts
  const featureDir = join(root, ".ai", "features", "test-feature");
  mkdirSync(featureDir, { recursive: true });
  const marker = `<!-- pi-brain:feature ${JSON.stringify(description)} -->`;
  writeFileSync(join(featureDir, "prd-test-feature.md"), `${marker}\n# PRD`, "utf8");

  // Create a git that throws on diffSince
  const git = new FakeGit();
  git.diffSince = async () => { throw new Error("baseline not found"); };
  const baseline = await git.baseline(root);

  const result = await validateResumePreconditions({
    cwd: root,
    description,
    git,
    baseline,
  });

  assert.equal(result?.type, "unresolvable_baseline");
  rmSync(root, { recursive: true, force: true });
});

test("askResumeWithChangedDiff returns false when user aborts", async () => {
  const human = new FakeHuman();
  human.selectValue = "abort";

  const result = await askResumeWithChangedDiff(human);
  assert.equal(result, false);
});

test("askResumeWithChangedDiff returns true when user resumes", async () => {
  const human = new FakeHuman();
  human.selectValue = "resume";

  const result = await askResumeWithChangedDiff(human);
  assert.equal(result, true);
});

test("chained resume (resume of a resumed run) works correctly", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123", description: "test" },
    { type: "workflow.resumed", runId: "run-1", phase: "develop" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "agent.started", runId: "run-1", role: "developer", model: "zai/coder" },
    // Interrupted again during the resumed run
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "develop");
  assert.equal(result.state.developerRuns, 0, "the re-run develop pass still never completed");
});

test("consecutive developer phases are one logical pass, not two", () => {
  // A resume re-running an interrupted fix #1 appends a second phase.started
  // "fix #1" to the same log: replay must not count both.
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: true },
    { type: "phase.started", runId: "run-1", phase: "review #1" },
    { type: "review.completed", runId: "run-1", verdict: "changes_requested", round: 1, issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "bug" }] },
    { type: "phase.started", runId: "run-1", phase: "fix #1" },
    { type: "workflow.failed", runId: "run-1", error: "quota" },
    { type: "workflow.resumed", runId: "run-1", phase: "fix #1" },
    { type: "phase.started", runId: "run-1", phase: "fix #1" },
    // Interrupted again mid fix #1
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "fix #1");
  assert.equal(result.state.developerRuns, 1, "develop completed; both fix #1 attempts are the same logical pass");
});

test("review completed with fix due resumes at the fix round", () => {
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature", baseline: "abc123" },
    { type: "phase.started", runId: "run-1", phase: "develop" },
    { type: "phase.started", runId: "run-1", phase: "verify" },
    { type: "verification.completed", runId: "run-1", passed: true },
    { type: "phase.started", runId: "run-1", phase: "review #1" },
    { type: "review.completed", runId: "run-1", verdict: "changes_requested", round: 1, issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "bug" }] },
    // Interrupted between the review verdict and the fix round
  ];
  const result = replayRunLog(events);
  assert.equal(result.ok, true);
  assert.equal(result.state.phase, "fix #1");
  assert.equal(result.state.developerRuns, 1);
  assert.equal(result.state.reviewRound, 1);
  assert.equal(result.state.fixes[0]?.id, "R1");
  assert.ok(result.state.previousBlockingIds.has("R1"));
});
