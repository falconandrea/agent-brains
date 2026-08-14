/**
 * Run lock (spec §21): two Pi terminals open on the same repository must not
 * both start a writing workflow.
 *
 * Node's fs exposes no advisory locking (`flock`), so the only atomic primitive
 * available is exclusive create. The design leans on it entirely:
 *
 *  - Acquiring a free lock is `link()` into place: atomic, no race.
 *  - Taking over a *stale* lock is inherently check-then-act, so it runs under a
 *    marker file whose NAME encodes the identity (inode) of the exact stale lock
 *    being replaced. Two processes that see the same stale lock therefore
 *    contend for the same marker, and exactly one can create it.
 *  - The marker never expires on a timer. A timed expiry was tried and is
 *    precisely what reintroduces the race: a paused taker wakes up and installs
 *    its lock after someone else has already taken over. A marker left behind by
 *    a crash is reported to the user instead, with the path to delete.
 *  - Releasing is bound to the inode captured at acquisition, so a run whose
 *    lock was taken over while it was stalled cannot delete its successor's lock.
 *
 * Residual limitation, deliberate: inode reuse could in principle defeat the
 * identity checks. This is a single-user local tool; the alternative is a native
 * flock dependency, which the dependency policy rules out.
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
  statSync,
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
  | { ok: false; reason: "held"; heldBy: LockInfo }
  | { ok: false; reason: "takeover_in_progress"; markerPath: string };

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

/** Inode of the current lock file, or null when there is none. */
function inodeOf(path: string): number | null {
  try {
    return statSync(path).ino;
  } catch {
    return null;
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

  const held = (): AcquireResult => ({
    ok: false,
    reason: "held",
    heldBy: readLock(path) ?? payload,
  });

  /** Written in full before it is visible, so no reader sees a partial lock. */
  const install = (): boolean => {
    const staging = `${path}.${process.pid}.${payload.runId}.tmp`;
    const fd = openSync(staging, "w");
    try {
      writeSync(fd, body);
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(staging, path); // EEXIST if someone got there first
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      return false;
    } finally {
      rmSync(staging, { force: true });
    }
  };

  const acquired = (): AcquireResult => {
    const ino = inodeOf(path);
    return { ok: true, release: () => releaseRunLock(repoRoot, payload.runId, ino) };
  };

  // --- fast path: no lock at all ------------------------------------------
  if (install()) return acquired();

  // --- someone holds it ----------------------------------------------------
  if (!isStale(readLock(path), options.ttlMs)) return held();

  // --- stale: exactly one process may replace THIS lock instance -----------
  const staleInode = inodeOf(path);
  if (staleInode === null) return acquireRunLock(repoRoot, info, options); // vanished; retry
  const markerPath = `${path}.takeover-${staleInode}`;

  try {
    closeSync(openSync(markerPath, "wx"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    // Another process is replacing this same stale lock, or died doing so.
    // Never force it on a timer — that is what makes takeover racy.
    return { ok: false, reason: "takeover_in_progress", markerPath };
  }

  try {
    // Re-check inside the critical section. If the inode changed, someone
    // already replaced this lock and the new one deserves the usual treatment.
    if (inodeOf(path) !== staleInode) return held();
    if (!isStale(readLock(path), options.ttlMs)) return held();

    rmSync(path, { force: true });
    if (!install()) return held();
    return acquired();
  } finally {
    rmSync(markerPath, { force: true });
  }
}

/**
 * Only removes the lock when it is still the very file this run installed —
 * matched by inode as well as content, so a run that stalled past the TTL and
 * was taken over cannot delete its successor's lock.
 */
export function releaseRunLock(repoRoot: string, runId: string, inode?: number | null): void {
  const path = lockPath(repoRoot);
  if (!existsSync(path)) return;
  if (inode != null && inodeOf(path) !== inode) return; // replaced while we ran
  const held = readLock(path);
  if (held && (held.runId !== runId || held.pid !== process.pid)) return;
  rmSync(path, { force: true });
}

export function describeLock(info: LockInfo): string {
  return `${info.workflow} (run ${info.runId}) started ${info.startedAt} by pid ${info.pid}`;
}
