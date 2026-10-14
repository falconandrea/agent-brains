/**
 * Developer write-path policy (main-review-hardening U1, finding F2).
 *
 * A writable pipeline role may only modify paths strictly inside the
 * repository root, and never under `.git/` or `.pi/`: `.git` writes never
 * reach the reviewer's diff, and `.pi` is pi-brain's own runtime state.
 * The comparison is made on symlink-resolved paths: a path that does not
 * exist yet is resolved through its nearest existing ancestor, so creating
 * `repo/link-to-outside/new-file` is caught even though the file itself
 * cannot be resolved yet; a dangling symlink is followed link by link (via
 * `lstat` + `readlink`) so its true destination — outside the repo or under
 * `.git` — is what gets judged; a `".."` inside a symlink target is likewise
 * resolved by the kernel component by component, never collapsed lexically.
 *
 * Pi-free by design: the SDK is touched only by `src/pi/pi-agent-runner.ts`,
 * which injects these operations into Pi's write/edit tool definitions
 * (custom tools override the same-named built-ins, so the built-ins are
 * replaced, not forked).
 *
 * Fail-closed: a path that cannot be resolved (permissions, I/O errors) is
 * refused, never allowed through.
 */

import { constants } from "node:fs";
import {
  access as fsAccess,
  lstat,
  mkdir as fsMkdir,
  readFile as fsReadFile,
  readlink,
  realpath,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Directory names no pipeline agent may write to, at any depth. */
const PROTECTED_SEGMENTS = new Set([".git", ".pi"]);

export type WriteGuardVerdict = { allowed: true } | { allowed: false; reason: string };

/** Thrown by the guarded operations; Pi's agent loop turns it into a tool error. */
export class WriteGuardError extends Error {
  readonly refusedPath: string;

  constructor(refusedPath: string, reason: string) {
    super(reason);
    this.name = "WriteGuardError";
    this.refusedPath = refusedPath;
  }
}

type UnresolvedEntry =
  | { kind: "absent" } // nobody created it yet
  | { kind: "symlink"; target: string } // lstat succeeds, realpath failed
  | { kind: "present" }; // exists yet realpath failed: fail closed upstream

/**
 * Distinguish (via `lstat`) a path nobody created from an existing symlink
 * whose target is missing. `realpath` reports ENOENT for both; treating a
 * dangling symlink as "a new file" would let a write follow it out of the
 * repo or into `.git` (U1 review P1 — not TOCTOU: the link never changes).
 */
async function classifyUnresolved(path: string): Promise<UnresolvedEntry> {
  try {
    const st = await lstat(path);
    return st.isSymbolicLink() ? { kind: "symlink", target: await readlink(path) } : { kind: "present" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw err;
    return { kind: "absent" };
  }
}

/**
 * Resolve `path` as far as the filesystem allows: realpath of the nearest
 * existing ancestor (the path itself when it exists), with the not-yet-real
 * tail re-appended. Symlinked ancestors are resolved even when the final
 * component does not exist yet, and dangling symlinks are followed link by
 * link until their target classifies as absent or present. Symlink targets
 * keep their raw component sequence (".." included) so the kernel — never a
 * lexical normalization — decides where they land.
 */
async function resolveThroughExistingAncestor(path: string): Promise<string> {
  let current = path;
  const tail: string[] = [];
  let linkHops = 0;
  for (;;) {
    try {
      return join(await realpath(current), ...tail);
    } catch (err) {
      if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw err;
      const entry = await classifyUnresolved(current);
      if (entry.kind === "symlink") {
        if (linkHops >= 40) throw new Error(`too many symlink hops resolving '${path}'`);
        linkHops += 1;
        // Preserve the target's component sequence — ".." included — and let
        // the kernel resolve it with filesystem semantics: a relative target
        // is evaluated against the symlink's parent and each ".." pops a
        // REAL component (after the intermediate symlink has been followed).
        // join() would collapse ".." lexically first, so `dangling ->
        // link-out/../victim.txt` (link-out outside the repo) would be judged
        // as repo/victim.txt while the write lands outside (U1 review P1).
        // Preserve the target's component sequence — ".." included — and let
        // the kernel resolve it with filesystem semantics: a relative target
        // is evaluated against the symlink's parent and each ".." pops a
        // REAL component (after the intermediate symlink has been followed).
        // join() would collapse ".." lexically first, so `dangling ->
        // link-out/../victim.txt` (link-out outside the repo) would be judged
        // as repo/victim.txt while the write lands outside (U1 review P1).
        const parent = dirname(current);
        current = isAbsolute(entry.target)
          ? entry.target
          : parent.endsWith(sep)
            ? parent + entry.target
            : parent + sep + entry.target;
        continue;
      }
      if (entry.kind === "present") throw err; // cannot happen; fail closed
      const parent = dirname(current);
      if (parent === current) return path; // filesystem root: nothing exists
      tail.unshift(basename(current));
      current = parent;
    }
  }
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Whether any segment of the (in-root, resolved) relative path is protected. */
function hasProtectedSegment(path: string, root: string): boolean {
  const rel = relative(root, path);
  const segments = rel === "" ? [] : rel.split(sep);
  return segments.some((segment) => PROTECTED_SEGMENTS.has(segment));
}

/**
 * The path policy: allowed iff, after symlink resolution, the path is inside
 * `repoRoot` and no segment of its repo-relative path is `.git` or `.pi`.
 * Relative paths are resolved against `repoRoot`.
 */
export async function checkWritablePath(path: string, repoRoot: string): Promise<WriteGuardVerdict> {
  const requested = isAbsolute(path) ? resolve(path) : resolve(repoRoot, path);
  let root: string;
  let resolved: string;
  try {
    root = await realpath(repoRoot);
    resolved = await resolveThroughExistingAncestor(requested);
  } catch {
    return {
      allowed: false,
      reason:
        `refusing '${path}': it (or the repository root '${repoRoot}') could not be ` +
        "resolved on the filesystem — the write guard fails closed",
    };
  }
  if (!isWithin(root, resolved)) {
    return {
      allowed: false,
      reason: `refusing '${path}': it resolves to '${resolved}', outside the repository root '${root}'`,
    };
  }
  if (hasProtectedSegment(resolved, root)) {
    return {
      allowed: false,
      reason:
        `refusing '${path}': it resolves to '${resolved}', under '.git/' or '.pi/' — ` +
        "those directories are never writable by pipeline agents",
    };
  }
  return { allowed: true };
}

async function refuseUnlessAllowed(action: string, path: string, repoRoot: string): Promise<void> {
  const verdict = await checkWritablePath(path, repoRoot);
  if (!verdict.allowed) {
    throw new WriteGuardError(path, `${action} blocked by the write guard: ${verdict.reason}`);
  }
}

/**
 * Drop-in for Pi's `WriteOperations`: every filesystem entry point (including
 * the parent-directory creation the write tool performs first) goes through
 * the policy. A refusal throws before anything is modified.
 */
export interface GuardedWriteOperations {
  writeFile(absolutePath: string, content: string): Promise<void>;
  mkdir(dir: string): Promise<void>;
}

export function guardWriteOperations(repoRoot: string): GuardedWriteOperations {
  return {
    async writeFile(absolutePath, content) {
      await refuseUnlessAllowed("write", absolutePath, repoRoot);
      await fsWriteFile(absolutePath, content, "utf-8");
    },
    async mkdir(dir) {
      await refuseUnlessAllowed("write (parent directory)", dir, repoRoot);
      await fsMkdir(dir, { recursive: true }).then(() => undefined);
    },
  };
}

/**
 * Drop-in for Pi's `EditOperations`: access/read/write all guarded, so a
 * refused path fails on the first operation (access) without leaking content
 * or modifying anything.
 */
export interface GuardedEditOperations {
  readFile(absolutePath: string): Promise<Buffer>;
  writeFile(absolutePath: string, content: string): Promise<void>;
  access(absolutePath: string): Promise<void>;
}

export function guardEditOperations(repoRoot: string): GuardedEditOperations {
  return {
    async readFile(absolutePath) {
      await refuseUnlessAllowed("edit", absolutePath, repoRoot);
      return fsReadFile(absolutePath);
    },
    async writeFile(absolutePath, content) {
      await refuseUnlessAllowed("edit", absolutePath, repoRoot);
      await fsWriteFile(absolutePath, content, "utf-8");
    },
    async access(absolutePath) {
      await refuseUnlessAllowed("edit", absolutePath, repoRoot);
      await fsAccess(absolutePath, constants.R_OK | constants.W_OK);
    },
  };
}
