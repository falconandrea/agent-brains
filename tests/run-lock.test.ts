import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, statSync, utimesSync, rmSync } from "node:fs";
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
  if (!second.ok && second.reason === "held") assert.equal(second.heldBy.runId, "run-1");
  else assert.fail(`expected held, got ${JSON.stringify(second)}`);
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
  // process A is inside the critical section for THIS lock right now
  writeFileSync(`${lockPath(dir)}.takeover-${statSync(lockPath(dir)).ino}`, "");

  const b = acquireRunLock(dir, { runId: "run-b", workflow: "feature" });
  assert.equal(b.ok, false, "B must not take over while A is mid-swap");
  if (!b.ok) assert.equal(b.reason, "takeover_in_progress");
});

test("a stuck takeover marker is reported, never forced on a timer", () => {
  // An expiring marker is exactly what reintroduces the race: a paused taker
  // would wake up and install its lock after someone else took over.
  const dir = repo();
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(
    lockPath(dir),
    JSON.stringify({
      pid: 999_999_999,
      runId: "zombie",
      workflow: "feature",
      startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      repoRoot: dir,
    }),
  );
  const inode = statSync(lockPath(dir)).ino;
  const marker = `${lockPath(dir)}.takeover-${inode}`;
  // a marker left behind hours ago by a crashed process
  writeFileSync(marker, "");
  utimesSync(marker, new Date(Date.now() - 86_400_000), new Date(Date.now() - 86_400_000));

  const result = acquireRunLock(dir, { runId: "run-late", workflow: "feature" });
  assert.equal(result.ok, false);
  if (!result.ok && result.reason === "takeover_in_progress") {
    assert.equal(result.markerPath, marker, "the user is told exactly what to delete");
  } else {
    assert.fail(`expected takeover_in_progress, got ${JSON.stringify(result)}`);
  }
});

test("a run whose lock was taken over cannot delete its successor's lock", () => {
  const dir = repo();
  const a = acquireRunLock(dir, { runId: "run-a", workflow: "feature" });
  assert.equal(a.ok, true);

  // simulate a takeover: someone replaced the lock file while A was stalled
  rmSync(lockPath(dir), { force: true });
  writeFileSync(
    lockPath(dir),
    JSON.stringify({
      pid: process.pid,
      runId: "run-b",
      workflow: "feature",
      startedAt: new Date().toISOString(),
      repoRoot: dir,
    }),
  );

  if (a.ok) a.release();

  assert.equal(existsSync(lockPath(dir)), true, "B's lock survives A's release");
  assert.equal(JSON.parse(readFileSync(lockPath(dir), "utf8")).runId, "run-b");
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

  const inode = statSync(lockPath(dir)).ino;
  const a = acquireRunLock(dir, { runId: "run-a", workflow: "feature" });
  assert.equal(a.ok, true);
  assert.equal(JSON.parse(readFileSync(lockPath(dir), "utf8")).runId, "run-a");
  assert.equal(existsSync(`${lockPath(dir)}.takeover-${inode}`), false, "marker cleaned up");

  const later = acquireRunLock(dir, { runId: "run-b", workflow: "feature" });
  assert.equal(later.ok, false, "the fresh lock is respected");
});
