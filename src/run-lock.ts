/**
 * Run lock (spec §21): two Pi terminals open on the same repository must not
 * both start a writing workflow.
 *
 * Deliberately dumb: one file, `O_EXCL` create, PID liveness check, no daemon,
 * no distributed locking. A stale lock (process gone, or older than the TTL) is
 * taken over rather than blocking the user forever.
 *
 * Read-only workflows do not need a lock.
 */

import {
  openSync,
  closeSync,
  writeSync,
  readFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  linkSync,
} from "node:fs";
import { join } from "node:path";

export interface LockInfo {
  pid: number;
  runId: string;
  workflow: string;
  startedAt: string;
  /** Repo root, so a lock file copied elsewhere is obviously not ours. */
  repoRoot: string;
}

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; heldBy: LockInfo; reason: "held" };

/** A lock older than this is considered abandoned even if the PID still exists. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export const lockPath = (repoRoot: string): string => join(repoRoot, ".pi", "pi-brain.lock");

function isAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0); // signal 0: existence check only
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLock(path: string): LockInfo | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LockInfo;
  } catch {
    return null; // unreadable or truncated -> treat as stale
  }
}

export function isStale(info: LockInfo | null, ttlMs = DEFAULT_TTL_MS, now = Date.now()): boolean {
  if (!info) return true;
  if (!isAlive(info.pid)) return true;
  const started = Date.parse(info.startedAt);
  return Number.isNaN(started) || now - started > ttlMs;
}

export function acquireRunLock(
  repoRoot: string,
  info: Omit<LockInfo, "pid" | "startedAt" | "repoRoot">,
  options: { ttlMs?: number } = {},
): AcquireResult {
  const path = lockPath(repoRoot);
  mkdirSync(join(repoRoot, ".pi"), { recursive: true });

  const payload: LockInfo = {
    ...info,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    repoRoot,
  };
  const body = JSON.stringify(payload, null, 2);
  const held = (): { ok: false; heldBy: LockInfo; reason: "held" } => ({
    ok: false,
    heldBy: readLock(path) ?? payload,
    reason: "held",
  });
  const acquired = (): { ok: true; release: () => void } => ({
    ok: true,
    release: () => releaseRunLock(repoRoot, payload.runId),
  });

  // Written in full before it is visible, so a reader never sees a half-written
  // lock and mistakes it for a corrupt one.
  const writeAtomic = (target: string, flags: "wx" | "w"): void => {
    const fd = openSync(target, flags);
    try {
      writeSync(fd, body);
    } finally {
      closeSync(fd);
    }
  };

  try {
    const staging = `${path}.${process.pid}.tmp`;
    writeAtomic(staging, "w");
    try {
      linkSync(staging, path); // fails if the lock already exists — the atomic bit
      return acquired();
    } finally {
      rmSync(staging, { force: true });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }

  const current = readLock(path);
  if (!isStale(current, options.ttlMs)) return held();

  // Takeover is read -> remove -> create, which is not atomic: another process
  // may win the same race. Re-read afterwards and only claim the lock if what
  // is on disk is actually ours.
  rmSync(path, { force: true });
  try {
    const staging = `${path}.${process.pid}.tmp`;
    writeAtomic(staging, "w");
    try {
      linkSync(staging, path);
    } finally {
      rmSync(staging, { force: true });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    return held();
  }

  const after = readLock(path);
  if (after?.runId !== payload.runId || after.pid !== payload.pid) return held();
  return acquired();
}

/** Only removes the lock if it is still ours — never steals someone else's. */
export function releaseRunLock(repoRoot: string, runId: string): void {
  const path = lockPath(repoRoot);
  if (!existsSync(path)) return;
  const held = readLock(path);
  if (held && (held.runId !== runId || held.pid !== process.pid)) return;
  rmSync(path, { force: true });
}

export function describeLock(info: LockInfo): string {
  return `${info.workflow} (run ${info.runId}) started ${info.startedAt} by pid ${info.pid}`;
}
