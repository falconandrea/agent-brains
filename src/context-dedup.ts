/**
 * S1: deduplicate the context files a child receives.
 *
 * `DefaultResourceLoader` discovers project/global `AGENTS.md` files, while the
 * workflow also routes explicit files through `request.contextFiles`. The same
 * file can therefore enter the child prompt twice (typically the root
 * `AGENTS.md`). This module collapses entries by canonical absolute path —
 * resolving relative paths and symlinks — while keeping genuinely distinct
 * files and scoped instructions.
 *
 * Deterministic precedence when the same canonical path carries different
 * content:
 * 1. an explicit `request.contextFiles` entry wins over a discovered entry;
 * 2. among explicit entries, the first in request order wins;
 * 3. among discovered entries, the first discovery wins.
 *
 * A discarded entry is never silent: the caller reports `conflicts` with both
 * content hashes, and `buildResourceLoader()` writes a warning for each one.
 * Identical duplicates are simply collapsed (no conflict), but an identical
 * injected duplicate still claims ownership of the slot so that the first
 * explicit injection keeps precedence over later injections.
 *
 * Pi-free by design, so the merge is unit-testable without an SDK session.
 */

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

export interface AgentsFile {
  path: string;
  content: string;
}

export type AgentsFileOrigin = "discovered" | "injected";

export interface AgentsFileConflict {
  /** Canonical absolute path shared by the conflicting entries. */
  path: string;
  /** Entry whose content is kept. */
  winner: AgentsFileOrigin;
  /** Entry whose content is discarded. */
  loser: AgentsFileOrigin;
  winnerSha256: string;
  loserSha256: string;
}

export interface DedupedAgentsFiles {
  files: AgentsFile[];
  conflicts: AgentsFileConflict[];
}

/**
 * Canonical key for a context file. Relative paths resolve against `cwd`;
 * symlinks resolve to their target when the path exists. A nonexistent path
 * still gets a stable absolute key, so injected virtual files cannot collide
 * by accident.
 *
 * `realpathSync.native` is required, not the JS `realpathSync`: the JS
 * implementation normalizes `..` lexically, while the filesystem resolves a
 * symlink before applying `..`. For `alias -> nested/sub`, the OS reads
 * `alias/../AGENTS.md` as `nested/AGENTS.md`, but a lexical resolve lands on
 * the root `AGENTS.md` and would collapse two distinct instruction files.
 */
export function canonicalAgentsPath(cwd: string, filePath: string): string {
  const absolute = isAbsolute(filePath) ? filePath : `${resolve(cwd)}${sep}${filePath}`;
  return resolveExistingPrefix(absolute);
}

/**
 * Resolve the longest existing prefix with OS semantics, then append the
 * still-missing tail lexically. This keeps `realpathSync.native` (symlink +
 * `..` correctness) for injected files that exist, while still giving virtual
 * (not-yet-written) paths a deterministic absolute key.
 */
function resolveExistingPrefix(rawPath: string): string {
  const tail: string[] = [];
  let current = rawPath;
  for (;;) {
    try {
      const real = realpathSync.native(current);
      return tail.length === 0 ? real : join(real, ...tail.slice().reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(rawPath); // nothing exists: stable lexical key
      tail.push(basename(current));
      current = parent;
    }
  }
}

const sha256 = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

interface Slot {
  index: number;
  origin: AgentsFileOrigin;
}

/**
 * Collapse `discovered` + `injected` by canonical path, preserving first-seen
 * order (discovery order first, injection-only files appended in request
 * order). Returns copies, so the caller's input arrays are never mutated.
 */
export function dedupeAgentsFiles(
  cwd: string,
  discovered: readonly AgentsFile[],
  injected: readonly AgentsFile[] = [],
): DedupedAgentsFiles {
  const files: AgentsFile[] = [];
  const slots = new Map<string, Slot>();
  const conflicts: AgentsFileConflict[] = [];

  const add = (file: AgentsFile, origin: AgentsFileOrigin): void => {
    const key = canonicalAgentsPath(cwd, file.path);
    const existing = slots.get(key);
    if (existing === undefined) {
      slots.set(key, { index: files.length, origin });
      files.push({ path: file.path, content: file.content });
      return;
    }

    const current = files[existing.index];
    if (current === undefined) return; // unreachable: slots and files grow together
    if (current.content === file.content) {
      // Identical content still transfers ownership to the first explicit
      // injection. Without this, a later injection with different content
      // would override it as if the slot were discovery-only.
      if (origin === "injected") existing.origin = "injected";
      return;
    }

    // Explicit injection overrides discovery in place, keeping discovery order.
    if (origin === "injected" && existing.origin === "discovered") {
      conflicts.push({
        path: key,
        winner: "injected",
        loser: "discovered",
        winnerSha256: sha256(file.content),
        loserSha256: sha256(current.content),
      });
      current.content = file.content;
      existing.origin = "injected";
      return;
    }

    // Otherwise the first entry already holds the winning content: the first
    // explicit entry wins among injections, the first discovery among
    // discoveries. A same-content duplicate can only be a conflict once the
    // slot belongs to an injection; identical content never reaches this path.
    conflicts.push({
      path: key,
      winner: existing.origin,
      loser: origin,
      winnerSha256: sha256(current.content),
      loserSha256: sha256(file.content),
    });
  };

  for (const file of discovered) add(file, "discovered");
  for (const file of injected) add(file, "injected");

  return { files, conflicts };
}
