/**
 * Run-state log: the audit trail pi-brain owns. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { RunLog, readRunLog, listRunIds, runLogPath, runsDir } from "../src/run-log.ts";
import type { WorkflowEvent } from "../src/ports.ts";

const fixture = (): string => mkdtempSync(join(tmpdir(), "pi-brain-runlog-"));

test("events are appended as JSONL and read back in order", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-1");
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-1", workflow: "feature" },
    { type: "phase.started", runId: "run-1", phase: "discover" },
    {
      type: "review.completed",
      runId: "run-1",
      verdict: "changes_requested",
      round: 2,
      issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "boom" }],
    },
    {
      type: "workflow.outcome",
      runId: "run-1",
      status: "needs_human",
      reason: "max rounds",
      usage: { reviewer: { input: 42, output: 7 } },
    },
  ];
  for (const event of events) log.append(event);

  const read = readRunLog(root, "run-1");
  assert.equal(read.length, 4);
  assert.equal(read[0]!.type, "workflow.started");
  assert.deepEqual((read[2] as { issues: unknown[] }).issues, [
    { id: "R1", severity: "blocking", category: "bug", problem: "boom" },
  ]);
  assert.deepEqual((read[3] as { usage: unknown }).usage, { reviewer: { input: 42, output: 7 } });

  // The outcome line is on disk verbatim — the incident that motivated this
  // module was losing exactly this content to TUI scrolling.
  const raw = readFileSync(runLogPath(root, "run-1"), "utf8");
  assert.match(raw, /"status":"needs_human"/);
  assert.match(raw, /"reason":"max rounds"/);
});

test("a missing log reads as empty, a torn final line is skipped", () => {
  const root = fixture();
  assert.deepEqual(readRunLog(root, "run-nope"), []);

  RunLog.open(root, "run-2").append({ type: "workflow.started", runId: "run-2", workflow: "feature" });
  // Simulate a crash mid-write: partial JSON on the last line.
  const path = runLogPath(root, "run-2");
  const good = readFileSync(path, "utf8");
  writeFileSync(path, `${good}{"type":"workflow.outcome","runId":"run-2","sta`, "utf8");

  const read = readRunLog(root, "run-2");
  assert.equal(read.length, 1, "the torn line is skipped, the good one survives");
});

test("a broken filesystem degrades to no-op instead of killing the run", () => {
  // The runs path collides with an existing FILE: mkdir fails, the sink breaks,
  // append becomes a no-op — and nothing throws.
  const root = fixture();
  mkdirSync(join(root, ".pi", "pi-brain"), { recursive: true });
  writeFileSync(join(root, ".pi", "pi-brain", "runs"), "not a directory", "utf8");
  const log = RunLog.open(root, "run-3");
  log.append({ type: "workflow.started", runId: "run-3", workflow: "feature" });
  assert.deepEqual(readRunLog(root, "run-3"), []);
});

test("listRunIds returns persisted runs newest first", () => {
  const root = fixture();
  const a = RunLog.open(root, "run-a");
  a.append({ type: "workflow.started", runId: "run-a", workflow: "feature" });
  const b = RunLog.open(root, "run-b");
  b.append({ type: "workflow.started", runId: "run-b", workflow: "feature" });
  // Ensure distinct mtimes.
  const future = new Date(Date.now() + 5000);
  utimesSync(runLogPath(root, "run-b"), future, future);

  assert.deepEqual(listRunIds(root), ["run-b", "run-a"]);
  assert.deepEqual(listRunIds(fixture()), []);
});

test("run logs live under .pi/pi-brain/runs, cleaned up with the repo", () => {
  const root = fixture();
  RunLog.open(root, "run-x");
  assert.match(runLogPath(root, "run-x"), /\.pi\/pi-brain\/runs\/run-x\.jsonl$/);
  // .pi/ is untracked by convention; nothing here writes outside it.
  mkdirSync(join(root, ".pi", "pi-brain", "runs"), { recursive: true });
  rmSync(root, { recursive: true, force: true });
});

test("new optional fields round-trip through JSONL", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-new-fields");
  const events: WorkflowEvent[] = [
    {
      type: "workflow.started",
      runId: "run-new-fields",
      workflow: "feature",
      description: "add user auth",
      stack: { primary: "nodejs", frameworks: ["express"] },
      baseline: "abc123def456",
    },
    {
      type: "phase.started",
      runId: "run-new-fields",
      phase: "review #1",
      patchSha: "sha256-hash-of-patch",
    },
    {
      type: "review.completed",
      runId: "run-new-fields",
      verdict: "changes_requested",
      round: 1,
      issues: [
        {
          id: "R1",
          severity: "blocking",
          category: "bug",
          problem: "off by one",
          file: "src/auth.ts",
          line: 42,
          recommendation: "use <= instead of <",
        },
      ],
    },
    {
      type: "workflow.resumed",
      runId: "run-new-fields",
      phase: "develop",
    },
  ];
  for (const event of events) log.append(event);

  const read = readRunLog(root, "run-new-fields");
  assert.equal(read.length, 4);

  const started = read[0] as { type: "workflow.started"; description?: string; stack?: unknown; baseline?: string };
  assert.equal(started.description, "add user auth");
  assert.deepEqual(started.stack, { primary: "nodejs", frameworks: ["express"] });
  assert.equal(started.baseline, "abc123def456");

  const phase = read[1] as { type: "phase.started"; patchSha?: string };
  assert.equal(phase.patchSha, "sha256-hash-of-patch");

  const review = read[2] as { type: "review.completed"; issues?: unknown[] };
  assert.deepEqual(review.issues, [
    {
      id: "R1",
      severity: "blocking",
      category: "bug",
      problem: "off by one",
      file: "src/auth.ts",
      line: 42,
      recommendation: "use <= instead of <",
    },
  ]);

  const resumed = read[3] as { type: "workflow.resumed"; phase: string };
  assert.equal(resumed.phase, "develop");
});

test("open heals a torn final line so the NEXT appended event survives", () => {
  const root = fixture();
  const path = `${root}/.pi/pi-brain/runs/run-torn.jsonl`;
  mkdirSync(dirname(path), { recursive: true });
  // Simulate a crash mid-append: a valid first event, then a partial JSON
  // line with NO trailing newline.
  const first = JSON.stringify({ type: "workflow.started", runId: "run-torn", workflow: "feature" });
  writeFileSync(path, `${first}\n{"type":"phase.star`, "utf8");

  // A resume opens the log and appends its marker event.
  const log = RunLog.open(root, "run-torn");
  log.append({ type: "workflow.resumed", runId: "run-torn", phase: "develop" });

  const events = readRunLog(root, "run-torn");
  // The torn event is lost (it was lost when the process died) — but the
  // resumed event MUST parse instead of being fused into the torn line.
  assert.equal(events.length, 2);
  assert.equal(events[0]!.type, "workflow.started");
  assert.equal(events[1]!.type, "workflow.resumed");
});

test("old-format events without new fields still parse correctly", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-old-format");
  // Events without the new optional fields (backward compatibility).
  const events: WorkflowEvent[] = [
    { type: "workflow.started", runId: "run-old-format", workflow: "feature" },
    { type: "phase.started", runId: "run-old-format", phase: "develop" },
    {
      type: "review.completed",
      runId: "run-old-format",
      verdict: "approved",
      round: 1,
      issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "boom" }],
    },
  ];
  for (const event of events) log.append(event);

  const read = readRunLog(root, "run-old-format");
  assert.equal(read.length, 3);
  const started = read[0] as { type: "workflow.started"; description?: string };
  assert.equal(started.description, undefined); // optional, not present
  const phase = read[1] as { type: "phase.started"; patchSha?: string };
  assert.equal(phase.patchSha, undefined); // optional, not present
  const review = read[2] as { type: "review.completed"; issues?: unknown[] };
  assert.equal((review.issues?.[0] as { file?: string }).file, undefined); // optional, not present
});
