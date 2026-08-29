/**
 * Git + shell verification. Plain Node child_process — no Pi, no LLM.
 *
 * The reviewer judges from the patch this file produces, so it has to be exact:
 * renames, deletions, odd filenames and pre-existing dirt all have to come out
 * right, and a git failure must never silently degrade into an empty patch.
 *
 * Strategy: snapshot the whole working tree — tracked modifications AND
 * untracked files — into a commit object, twice: once at baseline, once when
 * the diff is requested. Diffing snapshot-to-snapshot gives, correctly and for
 * free: only the workflow's own changes, proper rename and delete records, no
 * filename parsing, and pre-existing dirt cancelled out on both sides
 * (including an untracked file the workflow later `git add`s).
 *
 * Snapshotting uses a throwaway index file via GIT_INDEX_FILE, so the user's
 * real index and working tree are never touched. `git add -A` there honours
 * .gitignore, so ignored paths stay out.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { CommandResult, GitBaseline, GitService, VerifyRunner } from "./ports.ts";
import type { VerifyCommand } from "./verify.ts";

const exec = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024;

interface ExecFailure {
  code?: number | string;
  stdout?: string;
  stderr?: string;
  message: string;
}

async function git(
  cwd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: MAX_BUFFER, env });
    return stdout;
  } catch (err) {
    const e = err as ExecFailure;
    throw new Error(`git ${args.join(" ")} failed (${e.code}): ${e.stderr || e.message}`);
  }
}

/** NUL-separated output: the only form that survives newlines and quoting in paths. */
const splitZ = (out: string): string[] => out.split("\0").filter((s) => s !== "");

function fileForDigest(path: string): Buffer | string {
  try {
    return existsSync(path) ? readFileSync(path) : "<missing>";
  } catch {
    return "<unreadable>";
  }
}

/**
 * Digest the ignore rules that influence snapshotTree(). The repository's
 * .gitignore files are tracked by Git, but .git/info/exclude and the optional
 * global excludes file are not; keeping them in the digest makes changes to
 * those files visible to the workflow as well.
 */
export async function ignoreRulesDigest(repoRoot: string): Promise<string> {
  const tracked = splitZ(await git(repoRoot, ["ls-files", "-z"]))
    .filter((path) => path === ".gitignore" || path.endsWith("/.gitignore"))
    .sort();
  const gitDirRaw = (await git(repoRoot, ["rev-parse", "--git-dir"])).trim();
  const gitDir = isAbsolute(gitDirRaw) ? gitDirRaw : resolve(repoRoot, gitDirRaw);
  const entries: Array<[string, string]> = tracked.map((path) => [path, join(repoRoot, path)]);
  entries.push([".git/info/exclude", join(gitDir, "info", "exclude")]);

  try {
    const configured = (await git(repoRoot, ["config", "--path", "--get", "core.excludesFile"])).trim();
    if (configured !== "") {
      entries.push([
        "core.excludesFile",
        isAbsolute(configured) ? configured : resolve(repoRoot, configured),
      ]);
    }
  } catch {
    // No global excludes file configured is the normal case.
  }

  const hash = createHash("sha256");
  for (const [label, path] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(label).update("\0").update(fileForDigest(path)).update("\0");
  }
  return hash.digest("hex");
}

async function headSha(repoRoot: string): Promise<string | null> {
  try {
    return (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
  } catch {
    return null; // repository with no commits yet
  }
}

/**
 * Tree object for the current working tree, built in a SCRATCH index.
 *
 * The scratch index is what makes this trustworthy: `assume-unchanged` and
 * `skip-worktree` are bits stored in the repository's real index, so a fresh
 * index seeded from HEAD does not carry them and `git add -A` sees the actual
 * file contents. `git status` cannot make that guarantee.
 */
async function snapshotTree(repoRoot: string): Promise<string> {
  const indexFile = join(tmpdir(), `pi-brain-index-${process.pid}-${randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    const head = await headSha(repoRoot);
    await git(repoRoot, head ? ["read-tree", head] : ["read-tree", "--empty"], env);
    await git(repoRoot, ["add", "-A", "--", "."], env);
    return (await git(repoRoot, ["write-tree"], env)).trim();
  } finally {
    rmSync(indexFile, { force: true });
  }
}

/** The same snapshot, wrapped in a commit so it can be diffed against. */
async function snapshot(repoRoot: string, label: string): Promise<string> {
  const tree = await snapshotTree(repoRoot);
  const head = await headSha(repoRoot);
  const args = ["commit-tree", tree, "-m", `pi-brain ${label}`];
  if (head) args.push("-p", head);
  return (
    await git(repoRoot, args, {
      ...process.env,
      GIT_AUTHOR_NAME: "pi-brain",
      GIT_AUTHOR_EMAIL: "pi-brain@localhost",
      GIT_COMMITTER_NAME: "pi-brain",
      GIT_COMMITTER_EMAIL: "pi-brain@localhost",
    })
  ).trim();
}

/**
 * Submodules the reviewer cannot see into.
 *
 * `git submodule status` prefixes are about the recorded COMMIT (' ' in sync,
 * '+' moved, '-' uninitialised, 'U' conflicted) and say nothing about
 * uncommitted edits inside the submodule — those show a leading space while the
 * working tree is dirty. So each submodule is asked directly. Errors propagate:
 * silently returning [] here would let the run approve code nobody reviewed.
 */
async function dirtySubmodules(repoRoot: string): Promise<string[]> {
  const listing = await git(repoRoot, ["submodule", "status", "--recursive"]);
  const dirty: string[] = [];

  for (const line of listing.split("\n")) {
    if (line.trim() === "") continue;
    const marker = line[0];
    const path = submodulePath(line);
    if (path === null) continue;

    // Moved, uninitialised or conflicted: the reviewer sees a pointer at best.
    if (marker === "+" || marker === "-" || marker === "U") {
      dirty.push(path);
      continue;
    }
    // In sync on paper — but its working tree may still hold uncommitted work.
    // Compared by snapshot rather than `git status`, because status honours
    // both `status.showUntrackedFiles=no` and index flags such as
    // `assume-unchanged`, either of which would hide real code from the review.
    if (await hasUncommittedWork(join(repoRoot, path))) dirty.push(path);
  }

  return dirty;
}

/** True when the working tree differs from HEAD, whatever git status may claim. */
async function hasUncommittedWork(repoRoot: string): Promise<boolean> {
  const tree = await snapshotTree(repoRoot);
  const head = await headSha(repoRoot);
  if (head === null) return tree !== EMPTY_TREE;
  const headTree = (await git(repoRoot, ["rev-parse", `${head}^{tree}`])).trim();
  return tree !== headTree;
}

/** git's well-known hash of the empty tree. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * `git submodule status` lines are `<marker><sha> <path> (<describe>)`, and the
 * path may contain spaces — splitting on whitespace truncates it and the next
 * git call then runs in a directory that does not exist.
 */
export function submodulePath(line: string): string | null {
  const withoutMarker = line.slice(1);
  const firstSpace = withoutMarker.indexOf(" ");
  if (firstSpace === -1) return null;
  const rest = withoutMarker.slice(firstSpace + 1);
  // Trailing " (describe)" is optional and only present for initialised ones.
  const describeAt = rest.lastIndexOf(" (");
  const path = describeAt === -1 ? rest : rest.slice(0, describeAt);
  return path.trim() === "" ? null : path;
}

export class RealGitService implements GitService {
  async baseline(cwd: string): Promise<GitBaseline> {
    const repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    const branch = (await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const headSha = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
    const ignoreRules = await ignoreRulesDigest(repoRoot);

    // A failure here is fatal on purpose: silently falling back to HEAD would
    // hand the reviewer the user's pre-existing work as if the run had made it.
    const baseCommit = await snapshot(repoRoot, "baseline");

    return { repoRoot, branch, headSha, baseCommit, ignoreRulesDigest: ignoreRules };
  }

  async diffSince(
    baseline: GitBaseline,
  ): Promise<{
    patch: string;
    files: string[];
    dirtySubmodules: string[];
    ignoreRulesChanged?: boolean;
  }> {
    const root = baseline.repoRoot;
    const current = await snapshot(root, "current");
    const currentIgnoreRules = await ignoreRulesDigest(root);

    const files = splitZ(
      await git(root, [
        "diff",
        "--name-only",
        "--find-renames",
        "-z",
        baseline.baseCommit,
        current,
        "--",
      ]),
    );
    const patch =
      files.length > 0
        ? await git(root, ["diff", "--find-renames", baseline.baseCommit, current, "--"])
        : "";

    return {
      patch,
      files,
      dirtySubmodules: await dirtySubmodules(root),
      ...(baseline.ignoreRulesDigest !== undefined
        ? { ignoreRulesChanged: currentIgnoreRules !== baseline.ignoreRulesDigest }
        : {}),
    };
  }
}

export class ShellVerifyRunner implements VerifyRunner {
  readonly #cwd: string;
  readonly #onResult?: (r: CommandResult) => void;

  constructor(cwd: string, onResult?: (r: CommandResult) => void) {
    this.#cwd = cwd;
    this.#onResult = onResult;
  }

  async run(commands: VerifyCommand[], signal?: AbortSignal): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const cmd of commands) {
      if (signal?.aborted) break;
      const result = await this.one(cmd.command, signal);
      this.#onResult?.(result);
      results.push(result);
    }
    return results;
  }

  private async one(command: string, signal?: AbortSignal): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await exec("bash", ["-lc", command], {
        cwd: this.#cwd,
        signal,
        maxBuffer: 16 * 1024 * 1024,
      });
      return { command, exitCode: 0, output: `${stdout}${stderr}` };
    } catch (err) {
      const e = err as ExecFailure;
      return {
        command,
        exitCode: typeof e.code === "number" ? e.code : 1,
        output: `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message,
      };
    }
  }
}
