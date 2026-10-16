/**
 * Deterministic verification (spec §5 phase E, §24): resolve the cheapest
 * strong-signal checks for a project, run them before spending reviewer tokens.
 *
 * Resolution order: explicit config -> detected stack + capabilities -> package
 * scripts. Commands are returned, not executed, so resolution stays unit-testable.
 *
 * Frozen inputs (U2, F1): the developer can edit manifests during the run, so
 * `freezeVerifyInputs` snapshots the resolved commands together with the
 * manifest script sections they run through, and `changedScriptKeys` diffs the
 * live manifests against that snapshot before any verification executes.
 *
 * Scope of the snapshot (deliberate over-inclusion — the section, not single
 * entries): npm/pnpm/yarn/bun execute `pre<script>`/`post<script>` hooks and
 * scripts freely call other scripts, so freezing only the keys named on the
 * command line would leave the easy bypass open. A whole-section freeze means
 * any script edit — even an unrelated one — escalates to a human; the PRD
 * accepts that cost.
 *
 * Which manifests are involved:
 * - Stack defaults (commands WE resolved — plain, single, known shape): the
 *   ecosystem's own manifest. `package.json` for every node primary (npm,
 *   pnpm, yarn and bun all execute package.json scripts through `<pm> run`,
 *   the runner chosen in `runner()`), `composer.json` for laravel.
 * - Explicit `config.verify` (arbitrary shell written by a human): BOTH root
 *   manifests PLUS every nested `package.json`/`composer.json` in the tree,
 *   unconditionally. No tokenizer can prove which manifest an arbitrary
 *   command reaches — `true && npm run test`, `sh -c '…'`, `cd frontend &&
 *   pnpm test`, `npm --prefix frontend run test`, `yarn workspace … run …`
 *   each defeat any first-token or token-scan heuristic, and the `cd` /
 *   `--prefix` / workspace forms reach a subfolder manifest the root snapshot
 *   never saw. The conservative freeze wins over pattern matching. The scan
 *   perimeter is persisted on the freeze, and `changedScriptKeys` re-resolves
 *   it before every verify: a manifest CREATED mid-run ("root" or nested) is a
 *   detected change, not a silent pass — creating one adds keys the baseline
 *   (~empty section) diffs against. Dependency/VCS directories (node_modules,
 *   vendor, .git, .pi, bower_components) are excluded from the scan, and
 *   symlinked directories are skipped. Above MAX_FROZEN_MANIFESTS the freeze
 *   is refused rather than truncated.
 *
 * Known limits: what a script BODY runs (other files, node_modules/.bin,
 * vendor/bin) is not resolved and not frozen — a swapped test-runner binary
 * is invisible to this check, and the U3 repository-state digest does not
 * change that (it snapshots git state: HEAD, refs, .git/config, hooks — not
 * arbitrary working-tree files). A command that deliberately executes a
 * script from inside an excluded or symlinked directory is likewise outside
 * the perimeter.
 */

import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ProjectStack } from "./stack.ts";

export interface VerifyCommand {
  label: string;
  command: string;
  /** A failing `blocking` check goes back to the developer before review. */
  blocking: boolean;
}

/** A manifest's `scripts` section: key -> body (composer bodies may be arrays). */
export type ManifestScripts = Record<string, unknown>;

/**
 * How far the freeze looked when it resolved its manifests: `"root"` covers
 * only the recorded root manifest(s) (stack-resolved commands), `"tree"`
 * additionally covers nested manifests (explicit `config.verify`). Persisted
 * so the pre-verify re-scan can re-resolve the same perimeter.
 */
export type FreezePerimeter = "root" | "tree";

/**
 * The verification inputs of one run, resolved once at start (U2, F1):
 * persisted on `workflow.started` and replayed by resume, so nothing edited
 * mid-run — not even `.pi/pi-brain.json` — can rewrite what verify executes.
 */
export interface VerifyFreeze {
  commands: VerifyCommand[];
  /** Involved manifest script sections at freeze time: manifest path -> section. */
  scripts: Record<string, ManifestScripts>;
  /** sha256 of the canonical serialization of `scripts` (audit + comparison). */
  scriptsDigest: string;
  /**
   * The scan perimeter. Absent in freezes written before this field existed:
   * replay normalizes those to `"root"` (they did not scan the tree, so
   * re-scanning would flag pre-existing nested manifests).
   */
  perimeter?: FreezePerimeter;
}

/**
 * A plain JSON object: not null, not an array. Shared by capture and replay so
 * the two validations cannot drift (an array `scripts` section must never be
 * captured, because replay refuses arrays as corrupt).
 */
export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function manifestScripts(root: string, manifest: string): ManifestScripts {
  const path = join(root, manifest);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { scripts?: unknown };
    // Aligned with replay (see replayVerifyFreeze): only a plain object is a
    // scripts section. Arrays/scalars read as `{}` so capture can never emit a
    // section replay would reject as corrupt.
    return isPlainRecord(parsed.scripts) ? parsed.scripts : {};
  } catch {
    return {};
  }
}

function packageScripts(root: string): Record<string, string> {
  return manifestScripts(root, "package.json") as Record<string, string>;
}

function runner(stack: ProjectStack): string {
  const pm = stack.packageManagers.find((p) => p !== "composer") ?? "npm";
  return pm === "npm" ? "npm run" : `${pm} run`;
}

export function resolveVerifyCommands(
  root: string,
  stack: ProjectStack,
  configured: string[] = [],
): VerifyCommand[] {
  if (configured.length > 0) {
    return configured.map((command, i) => ({ label: `check ${i + 1}`, command, blocking: true }));
  }

  const out: VerifyCommand[] = [];

  if (stack.primary === "laravel") {
    out.push({
      label: "tests",
      command: stack.capabilities.includes("pest")
        ? "./vendor/bin/pest --compact"
        : "php artisan test",
      blocking: true,
    });
    if (stack.capabilities.includes("pint"))
      out.push({ label: "format", command: "./vendor/bin/pint --test", blocking: false });
    if (stack.capabilities.includes("phpstan"))
      out.push({ label: "static analysis", command: "./vendor/bin/phpstan analyse", blocking: true });
    return out;
  }

  const scripts = packageScripts(root);
  const run = runner(stack);

  if (scripts.test) out.push({ label: "tests", command: `${run} test`, blocking: true });
  if (scripts.lint) out.push({ label: "lint", command: `${run} lint`, blocking: false });

  if (stack.primary === "astro") {
    out.push({ label: "astro check", command: "npx astro check", blocking: true });
  } else if (scripts.typecheck) {
    out.push({ label: "typecheck", command: `${run} typecheck`, blocking: true });
  } else if (existsSync(join(root, "tsconfig.json"))) {
    out.push({ label: "typecheck", command: "npx tsc --noEmit", blocking: true });
  }

  return out;
}

// -- frozen inputs -------------------------------------------------------------

/** Repo-relative manifest names a verification command can execute through. */
const MANIFEST_NAMES = new Set(["package.json", "composer.json"]);

/**
 * Directories never scanned for nested manifests: dependency caches and VCS /
 * tooling state. Scanning them would be unbounded (thousands of manifests) for
 * no protection — they are not repo content the reviewer's diff covers. This is
 * a documented limit: a command that deliberately runs a script from inside one
 * of them is outside the freeze perimeter.
 */
const SKIP_DIRS = new Set(["node_modules", "vendor", ".git", ".pi", "bower_components"]);

/**
 * Above this many manifests the freeze is refused: an unbounded perimeter
 * cannot be frozen honestly, and truncating it would reopen the bypass
 * silently. Failing closed keeps the invariant that verify inputs are always
 * fully frozen before any command runs.
 */
export const MAX_FROZEN_MANIFESTS = 200;

/** Manifests in subdirectories, repo-relative, POSIX separators, sorted. */
function nestedManifests(root: string): string[] {
  const found: string[] = [];
  const walk = (absDir: string, relDir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory: nothing to freeze, nothing to trust
    }
    for (const entry of entries) {
      if (MANIFEST_NAMES.has(entry.name) && (entry.isFile() || entry.isSymbolicLink())) {
        found.push(`${relDir}${entry.name}`);
      } else if (entry.isDirectory() && !entry.isSymbolicLink() && !SKIP_DIRS.has(entry.name)) {
        // Symlinked directories are skipped: they can point outside the repo
        // or loop. Documented limit.
        walk(join(absDir, entry.name), `${relDir}${entry.name}/`);
      }
    }
  };
  walk(root, "");
  // The root's own manifests are always part of the explicit perimeter.
  return found.filter((m) => m !== "package.json" && m !== "composer.json").sort();
}

/**
 * The manifests whose script sections the run's verification runs through.
 *
 * Stack defaults are commands this module resolved itself — plain, single,
 * known shape — so the ecosystem's own manifest is enough. The moment the
 * commands come from explicit config they are arbitrary shell: a compound
 * (`true && npm run test`), a wrapper (`sh -c '…'`), a directory change
 * (`cd frontend && pnpm test`), leading options (`npm --prefix frontend run
 * test`) or a workspace call can each reach a DIFFERENT manifest from any
 * token heuristic's guess. Rather than guess, the whole perimeter is frozen:
 * both root manifests plus every nested manifest in the tree (dependency and
 * VCS directories excluded), missing ones as an empty section so creating them
 * mid-run is detected. Over-inclusive on purpose; fail-closed.
 */
function involvedManifests(root: string, stack: ProjectStack, explicit: boolean): string[] {
  const involved = new Set<string>([stack.primary === "laravel" ? "composer.json" : "package.json"]);
  if (explicit) {
    involved.add("package.json");
    involved.add("composer.json");
    for (const manifest of nestedManifests(root)) involved.add(manifest);
  }
  return [...involved].sort();
}

/** sha256 over the manifest script sections, independent of key order. */
export function digestScripts(scripts: Record<string, ManifestScripts>): string {
  const canonical = Object.keys(scripts)
    .sort()
    .map((manifest) => [
      manifest,
      Object.keys(scripts[manifest]!).sort().map((key) => [key, scripts[manifest]![key]]),
    ]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Outcome of freezing: the freeze, or a reason the perimeter could not be
 * frozen honestly. Callers fail closed (needs_human) on the negative branch
 * instead of verifying against an incomplete perimeter.
 */
export type FreezeResult = { ok: true; freeze: VerifyFreeze } | { ok: false; reason: string };

/**
 * Resolve the verification inputs of a run ONCE: the commands, the manifest
 * script sections they depend on, and the digest of those sections.
 */
export function freezeVerifyInputs(
  root: string,
  stack: ProjectStack,
  configured: string[] = [],
): FreezeResult {
  const commands = resolveVerifyCommands(root, stack, configured);
  const manifests = involvedManifests(root, stack, configured.length > 0);
  if (manifests.length > MAX_FROZEN_MANIFESTS) {
    return {
      ok: false,
      reason:
        `pi-brain: cannot freeze verify inputs — ${manifests.length} package manifests found ` +
        `(max ${MAX_FROZEN_MANIFESTS}); the verify script perimeter is not freezable. ` +
        `Narrow config.verify or reduce the workspace manifests, then retry.`,
    };
  }
  const scripts: Record<string, ManifestScripts> = {};
  for (const manifest of manifests) {
    scripts[manifest] = manifestScripts(root, manifest);
  }
  return {
    ok: true,
    freeze: {
      commands,
      scripts,
      scriptsDigest: digestScripts(scripts),
      perimeter: configured.length > 0 ? "tree" : "root",
    },
  };
}

/**
 * Content equality for one script body. Composer bodies may be arrays (and
 * the freeze side comes from the run log's JSON, the live side from the
 * manifest's), so reference equality would flag identical content: compare
 * the canonical serialization instead. `undefined` (absent key) stringifies
 * to undefined and never equals a present body.
 */
const sameScriptBody = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Diff the live manifest script sections against the freeze. Returns one entry
 * per changed key (`"<manifest> scripts.<key>"`, sorted) — added, removed or
 * edited — for the needs_human reason. An empty array means: safe to verify.
 * A manifest that became unreadable or was deleted reads as `{}`, which diffs
 * against a non-empty baseline and is reported like any other change.
 *
 * The perimeter is re-resolved first: a `"tree"` freeze re-scans for nested
 * manifests, so one CREATED after the freeze is still caught (a manifest that
 * did not exist at freeze time was never in the baseline, and verify could run
 * the scripts it now carries). A `"root"` freeze stays scoped to what it
 * recorded — re-scanning there would flag nested manifests that were never
 * part of the run's perimeter.
 */
export function changedScriptKeys(root: string, freeze: VerifyFreeze): string[] {
  const baseline = freeze.scripts;
  const paths = new Set(Object.keys(baseline));
  if (freeze.perimeter === "tree") {
    for (const manifest of nestedManifests(root)) paths.add(manifest);
  }

  const changed: string[] = [];
  for (const manifest of [...paths].sort()) {
    const before = baseline[manifest] ?? {};
    const current = manifestScripts(root, manifest);
    for (const key of new Set([...Object.keys(before), ...Object.keys(current)])) {
      if (!sameScriptBody(before[key], current[key])) changed.push(`${manifest} scripts.${key}`);
    }
  }
  return changed.sort();
}
