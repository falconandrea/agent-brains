/**
 * Run-state log: the audit trail pi-brain owns. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

import {
  RunLog,
  readRunLog,
  listRunIds,
  runLogPath,
  runsDir,
  withEventId,
  deriveEventId,
  CriticalAppendError,
} from "../src/run-log.ts";
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
      // S2 full-detail totals, persisted verbatim: cost/elapsed stay absent
      // when absent — never coerced to zero by the JSONL round trip.
      usage: {
        reviewer: {
          input: 42,
          output: 7,
          cacheRead: 11,
          cacheWrite: 3,
          cost: 0.0042,
          elapsedMs: 21_000,
          models: ["zai/glm-5.2"],
          calls: 2,
        },
      },
      elapsedMs: 95_000,
    },
  ];
  for (const event of events) log.append(event);

  const read = readRunLog(root, "run-1");
  assert.equal(read.length, 4);
  assert.equal(read[0]!.type, "workflow.started");
  assert.deepEqual((read[2] as { issues: unknown[] }).issues, [
    { id: "R1", severity: "blocking", category: "bug", problem: "boom" },
  ]);
  assert.deepEqual((read[3] as { usage: unknown }).usage, {
    reviewer: {
      input: 42,
      output: 7,
      cacheRead: 11,
      cacheWrite: 3,
      cost: 0.0042,
      elapsedMs: 21_000,
      models: ["zai/glm-5.2"],
      calls: 2,
    },
  });

  // Missing vs zero survives the round trip: a role without cost keeps the
  // field absent (unavailable), a zero cost stays a reported zero.
  log.append({
    type: "workflow.outcome",
    runId: "run-1",
    status: "completed",
    usage: {
      // Cache was never measured for this role: the field is ABSENT, and the
      // JSONL round trip must not turn it into a reported zero.
      planner: { input: 1, output: 1, cost: 0, models: [], calls: 1 },
    },
  });
  const reRead = readRunLog(root, "run-1");
  const plannerUsage = (reRead.at(-1) as unknown as { usage: { planner: Record<string, unknown> } }).usage.planner;
  assert.equal("cost" in plannerUsage, true);
  assert.equal(plannerUsage.cost, 0, "a reported zero cost reads back as 0");
  assert.equal("cacheRead" in plannerUsage, false, "an unmeasured cache stays absent");
  assert.equal("cacheWrite" in plannerUsage, false);
  assert.equal("elapsedMs" in plannerUsage, false, "an unreported elapsed stays absent");

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

// --- appendCritical: verified, idempotent persistence (spec.md §8, tasks T1) ---

const sha256 = (content: string): string => createHash("sha256").update(content).digest("hex");

/** A signed revision.started event; retries re-derive the SAME eventId from evidence. */
const revisionStarted = (runId: string, correction: string, at: string) =>
  withEventId({
    type: "revision.started" as const,
    runId,
    revision: 1,
    correction,
    correctionSha: sha256(correction),
    baseContract: { prdSha: "a".repeat(64), tasksSha: "b".repeat(64) },
    at,
  });

const rawLines = (root: string, runId: string): string[] =>
  readFileSync(runLogPath(root, runId), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");

test("eventId is content-derived and stable across retries: timestamps are excluded", () => {
  const first = revisionStarted("run-id-stable", "fix the thing", "2026-01-01T00:00:00.000Z");
  // The same logical step retried later with a FRESH timestamp:
  const retry = revisionStarted("run-id-stable", "fix the thing", "2026-06-05T10:00:00.000Z");
  assert.equal(retry.eventId, first.eventId, "same evidence → same id");
  assert.equal(deriveEventId(retry), first.eventId);
  const other = revisionStarted("run-id-stable", "a different correction", first.at);
  assert.notEqual(other.eventId, first.eventId, "different content → different id");
});

test("appendCritical persists verifiably and reads back exactly", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-critical");
  const event = revisionStarted("run-critical", "fix the thing", "2026-01-01T00:00:00.000Z");
  log.appendCritical(event);
  const read = readRunLog(root, "run-critical");
  assert.equal(read.length, 1);
  assert.deepEqual(read[0], event);
  assert.match(rawLines(root, "run-critical")[0]!, /"revision\.started"/);
});

test("THE TIMESTAMP CASE: a retried logical event with a regenerated `at` reconciles to the persisted copy", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-retry");
  const first = revisionStarted("run-retry", "fix the thing", "2026-01-01T00:00:00.000Z");
  log.appendCritical(first);
  const retry = revisionStarted("run-retry", "fix the thing", "2026-06-05T10:00:00.000Z");
  assert.equal(retry.eventId, first.eventId);
  assert.notEqual(retry.at, first.at);
  log.appendCritical(retry); // canonical projection equal → idempotent no-op

  const lines = rawLines(root, "run-retry");
  assert.equal(lines.length, 1, "exactly one persisted line — the retry never duplicated");
  const persisted = readRunLog(root, "run-retry")[0] as { at: string };
  assert.equal(persisted.at, first.at, "the persisted copy wins");
});

test("the same eventId with a DIFFERENT canonical projection refuses, fail-closed", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-conflict");
  const first = revisionStarted("run-conflict", "fix the thing", "2026-01-01T00:00:00.000Z");
  log.appendCritical(first);
  // Same id, tampered canonical content: corruption or collision, never a retry.
  const forged = {
    ...first,
    correction: "tampered correction",
    correctionSha: sha256("tampered correction"),
    at: "2026-02-02T00:00:00.000Z",
  } as unknown as WorkflowEvent;
  assert.throws(() => log.appendCritical(forged as never), CriticalAppendError);
  assert.equal(rawLines(root, "run-conflict").length, 1);
});

test("reconciliation scans ALL same-id duplicates: a later conflicting copy refuses an otherwise-identical retry", () => {
  const root = fixture();
  const path = runLogPath(root, "run-scanall");
  const log = RunLog.open(root, "run-scanall");
  const good = revisionStarted("run-scanall", "fix the thing", "2026-01-01T00:00:00.000Z");
  log.appendCritical(good);
  // A forged same-id copy lands AFTER the good one — first-match
  // reconciliation would stop at the good copy and silently succeed.
  appendFileSync(
    path,
    `${JSON.stringify({ ...good, correction: "tampered", correctionSha: sha256("tampered") })}\n`,
    "utf8",
  );
  const retry = revisionStarted("run-scanall", "fix the thing", "2026-02-02T00:00:00.000Z");
  assert.equal(retry.eventId, good.eventId);
  assert.throws(() => log.appendCritical(retry), CriticalAppendError, "the scan must reach the conflicting duplicate");
  assert.equal(readRunLog(root, "run-scanall").length, 2, "nothing was appended");
});

test("reconciliation keeps scanning past equal copies and still finds a later conflict", () => {
  const root = fixture();
  const path = runLogPath(root, "run-scanall2");
  mkdirSync(dirname(path), { recursive: true });
  const good = revisionStarted("run-scanall2", "fix the thing", "2026-01-01T00:00:00.000Z");
  const equalRetry = revisionStarted("run-scanall2", "fix the thing", "2026-03-03T00:00:00.000Z"); // same canonical, fresh at
  const forged = { ...good, correction: "tampered", correctionSha: sha256("tampered") };
  writeFileSync(
    path,
    `${JSON.stringify(good)}\n${JSON.stringify(equalRetry)}\n${JSON.stringify(forged)}\n`,
    "utf8",
  );
  const log = new RunLog(path);
  assert.throws(
    () => log.appendCritical(revisionStarted("run-scanall2", "fix the thing", "2026-04-04T00:00:00.000Z")),
    CriticalAppendError,
    "an equal copy does not end the scan — the later conflict still refuses",
  );
});

test("a write that landed but failed verification reconciles to exactly ONE copy", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-landed");
  const event = revisionStarted("run-landed", "fix the thing", "2026-01-01T00:00:00.000Z");
  // A concurrent writer appends a foreign line after ours: the last complete
  // line is no longer our event, so strict verification fails — but the
  // reconcile pass finds our event canonically intact.
  log.appendCritical(event, {
    injectFaultAfterAppend: () => {
      appendFileSync(
        runLogPath(root, "run-landed"),
        `${JSON.stringify({ type: "phase.started", runId: "run-landed", phase: "foreign" })}\n`,
        "utf8",
      );
    },
  });
  const events = readRunLog(root, "run-landed");
  assert.equal(events.length, 2, "our event + the concurrent foreign line");
  assert.equal(events.filter((e) => (e as { eventId?: string }).eventId === event.eventId).length, 1, "exactly one copy");
  assert.equal(events[0]!.type, "revision.started");
});

test("a provably absent write retries exactly once and still lands exactly one copy", () => {
  const root = fixture();
  const path = runLogPath(root, "run-absent");
  const log = RunLog.open(root, "run-absent");
  const event = revisionStarted("run-absent", "fix the thing", "2026-01-01T00:00:00.000Z");
  let faults = 0;
  log.appendCritical(event, {
    injectFaultAfterAppend: () => {
      faults += 1;
      if (faults === 1) writeFileSync(path, "", "utf8"); // the write was lost despite no throw
      // The fault deliberately stops after the first append: the retry verifies clean.
    },
  });
  assert.equal(faults, 2, "one clean retry after provable absence");
  assert.equal(readRunLog(root, "run-absent").length, 1);
});

test("verification failing after the retry throws and leaves nothing behind", () => {
  const root = fixture();
  const path = runLogPath(root, "run-lost");
  const log = RunLog.open(root, "run-lost");
  const event = revisionStarted("run-lost", "fix the thing", "2026-01-01T00:00:00.000Z");
  assert.throws(
    () =>
      log.appendCritical(event, {
        injectFaultAfterAppend: () => writeFileSync(path, "", "utf8"), // lose it EVERY time
      }),
    CriticalAppendError,
  );
  assert.deepEqual(readRunLog(root, "run-lost"), []);
});

test("a log that becomes unreadable after the append refuses without retrying", () => {
  const root = fixture();
  const path = runLogPath(root, "run-unreadable2");
  const log = RunLog.open(root, "run-unreadable2");
  const event = revisionStarted("run-unreadable2", "fix the thing", "2026-01-01T00:00:00.000Z");
  assert.throws(
    () =>
      log.appendCritical(event, {
        injectFaultAfterAppend: () => {
          rmSync(path);
          mkdirSync(path); // the file is replaced by a directory: reconciliation cannot read
        },
      }),
    CriticalAppendError,
  );
});

test("a log path that cannot be read at all refuses before any append", () => {
  const root = fixture();
  mkdirSync(runLogPath(root, "run-eisdir"), { recursive: true }); // log path IS a directory
  const log = new RunLog(runLogPath(root, "run-eisdir"));
  assert.throws(
    () => log.appendCritical(revisionStarted("run-eisdir", "fix the thing", "2026-01-01T00:00:00.000Z")),
    CriticalAppendError,
  );
});

test("appendCritical heals a torn final line before appending", () => {
  const root = fixture();
  const path = runLogPath(root, "run-torn-critical");
  mkdirSync(dirname(path), { recursive: true });
  const first = JSON.stringify({ type: "workflow.started", runId: "run-torn-critical", workflow: "feature" });
  writeFileSync(path, `${first}\n{"type":"phase.star`, "utf8");

  const log = new RunLog(path);
  log.appendCritical(revisionStarted("run-torn-critical", "fix the thing", "2026-01-01T00:00:00.000Z"));

  const events = readRunLog(root, "run-torn-critical");
  assert.equal(events.length, 2, "the torn fragment stays skipped, the critical event parses");
  assert.equal(events[0]!.type, "workflow.started");
  assert.equal(events[1]!.type, "revision.started");
});

test("a broken sink refuses appendCritical instead of pretending to persist", () => {
  const root = fixture();
  mkdirSync(join(root, ".pi", "pi-brain"), { recursive: true });
  writeFileSync(join(root, ".pi", "pi-brain", "runs"), "not a directory", "utf8");
  const log = RunLog.open(root, "run-broken-critical");
  assert.throws(
    () => log.appendCritical(revisionStarted("run-broken-critical", "fix the thing", "2026-01-01T00:00:00.000Z")),
    CriticalAppendError,
  );
});

test("appendCritical refuses an ARBITRARY eventId at the entry, before touching the file", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-arbitrary-id");
  const event = {
    ...revisionStarted("run-arbitrary-id", "fix the thing", "2026-01-01T00:00:00.000Z"),
    eventId: "not-a-hash",
  };
  assert.throws(
    () => log.appendCritical(event as Parameters<RunLog["appendCritical"]>[0]),
    (err: unknown) => err instanceof CriticalAppendError && /does not bind its canonical content/.test(err.message),
  );
  assert.equal(readRunLog(root, "run-arbitrary-id").length, 0, "nothing was written");
});

test("appendCritical refuses a formally valid SHA256 eventId that does not match the content", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-mismatched-id");
  const event = {
    ...revisionStarted("run-mismatched-id", "fix the thing", "2026-01-01T00:00:00.000Z"),
    eventId: "b".repeat(64), // 64 hex chars, but not the content-derived id
  };
  assert.throws(
    () => log.appendCritical(event as Parameters<RunLog["appendCritical"]>[0]),
    (err: unknown) => err instanceof CriticalAppendError && /does not bind its canonical content/.test(err.message),
  );
  assert.equal(readRunLog(root, "run-mismatched-id").length, 0, "nothing was written");
});

test("the id-binding entry check keeps the regenerated-timestamp retry valid", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-retry-binding");
  const first = revisionStarted("run-retry-binding", "fix the thing", "2026-01-01T00:00:00.000Z");
  log.appendCritical(first);
  // Same canonical content, regenerated timestamp: the derived id is unchanged,
  // the entry check passes, and reconciliation still collapses to one copy.
  const retry = revisionStarted("run-retry-binding", "fix the thing", "2026-09-09T00:00:00.000Z");
  log.appendCritical(retry);
  assert.equal(rawLines(root, "run-retry-binding").length, 1);
});

test("ordinary append keeps its best-effort contract next to appendCritical", () => {
  const root = fixture();
  const log = RunLog.open(root, "run-ordinary");
  log.append({ type: "workflow.started", runId: "run-ordinary", workflow: "feature" });
  assert.deepEqual(readRunLog(root, "run-ordinary").map((e) => e.type), ["workflow.started"]);
  // The critical path coexists on the same log:
  log.appendCritical(revisionStarted("run-ordinary", "fix the thing", "2026-01-01T00:00:00.000Z"));
  assert.deepEqual(readRunLog(root, "run-ordinary").map((e) => e.type), ["workflow.started", "revision.started"]);
});
