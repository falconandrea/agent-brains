import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acquireRunLock, releaseRunLock, lockPath, isStale } from "../src/run-lock.ts";
import { readFileSync } from "node:fs";

const repo = (): string => mkdtempSync(join(tmpdir(), "pi-brain-lock-"));

test("the first run takes the lock, the second is refused", () => {
  const dir = repo();
  const first = acquireRunLock(dir, { runId: "run-1", workflow: "feature" });
  assert.equal(first.ok, true);

  const second = acquireRunLock(dir, { runId: "run-2", workflow: "feature" });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.heldBy.runId, "run-1");
});

test("releasing lets the next run through", () => {
  const dir = repo();
  const first = acquireRunLock(dir, { runId: "run-1", workflow: "feature" });
  assert.equal(first.ok, true);
  if (first.ok) first.release();

  assert.equal(existsSync(lockPath(dir)), false);
  assert.equal(acquireRunLock(dir, { runId: "run-2", workflow: "feature" }).ok, true);
});

test("a lock from a dead process is taken over", () => {
  const dir = repo();
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(
    lockPath(dir),
    JSON.stringify({
      pid: 999_999_999, // no such process
      runId: "zombie",
      workflow: "feature",
      startedAt: new Date().toISOString(),
      repoRoot: dir,
    }),
  );

  assert.equal(acquireRunLock(dir, { runId: "run-new", workflow: "feature" }).ok, true);
});

test("a corrupt lock file does not wedge the repo", () => {
  const dir = repo();
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(lockPath(dir), "{ not json");

  assert.equal(acquireRunLock(dir, { runId: "run-new", workflow: "feature" }).ok, true);
});

test("a live but ancient lock is considered stale", () => {
  const old = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const info = { pid: process.pid, runId: "r", workflow: "feature", startedAt: old, repoRoot: "/x" };
  assert.equal(isStale(info), true);
  assert.equal(isStale({ ...info, startedAt: new Date().toISOString() }), false);
});

test("release never steals a lock held by another run", () => {
  const dir = repo();
  const held = acquireRunLock(dir, { runId: "run-1", workflow: "feature" });
  assert.equal(held.ok, true);

  releaseRunLock(dir, "some-other-run");
  assert.equal(existsSync(lockPath(dir)), true, "still held by run-1");
});

test("a takeover in progress is not overridden by a second one", () => {
  const dir = repo();
  mkdirSync(join(dir, ".pi"), { recursive: true });
  // a stale lock both processes would want to take over
  writeFileSync(
    lockPath(dir),
    JSON.stringify({
      pid: 999_999_999,
      runId: "zombie",
      workflow: "feature",
      startedAt: new Date().toISOString(),
      repoRoot: dir,
    }),
  );
  // process A is inside the critical section right now
  writeFileSync(`${lockPath(dir)}.takeover`, "");

  const b = acquireRunLock(dir, { runId: "run-b", workflow: "feature" });
  assert.equal(b.ok, false, "B must not take over while A is mid-swap");
});

test("the winner of a takeover owns the lock file", () => {
  const dir = repo();
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(
    lockPath(dir),
    JSON.stringify({
      pid: 999_999_999,
      runId: "zombie",
      workflow: "feature",
      startedAt: new Date().toISOString(),
      repoRoot: dir,
    }),
  );

  const a = acquireRunLock(dir, { runId: "run-a", workflow: "feature" });
  assert.equal(a.ok, true);
  assert.equal(JSON.parse(readFileSync(lockPath(dir), "utf8")).runId, "run-a");
  assert.equal(existsSync(`${lockPath(dir)}.takeover`), false, "marker cleaned up");

  const b = acquireRunLock(dir, { runId: "run-b", workflow: "feature" });
  assert.equal(b.ok, false, "the fresh lock is respected");
});
