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
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * Commit object for the current working tree, built in a scratch index so the
 * user's index is untouched. Includes untracked, non-ignored files.
 */
async function snapshot(repoRoot: string, label: string): Promise<string> {
  const indexFile = join(tmpdir(), `pi-brain-index-${process.pid}-${randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    let head: string | null = null;
    try {
      head = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
    } catch {
      head = null; // repository with no commits yet
    }

    await git(repoRoot, head ? ["read-tree", head] : ["read-tree", "--empty"], env);
    await git(repoRoot, ["add", "-A", "--", "."], env);
    const tree = (await git(repoRoot, ["write-tree"], env)).trim();

    const commitArgs = ["commit-tree", tree, "-m", `pi-brain ${label}`];
    if (head) commitArgs.push("-p", head);
    return (
      await git(repoRoot, commitArgs, {
        ...env,
        GIT_AUTHOR_NAME: "pi-brain",
        GIT_AUTHOR_EMAIL: "pi-brain@localhost",
        GIT_COMMITTER_NAME: "pi-brain",
        GIT_COMMITTER_EMAIL: "pi-brain@localhost",
      })
    ).trim();
  } finally {
    rmSync(indexFile, { force: true });
  }
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
    const path = line.slice(1).trim().split(/\s+/)[1];
    if (path === undefined) continue;

    // Moved, uninitialised or conflicted: the reviewer sees a pointer at best.
    if (marker === "+" || marker === "-" || marker === "U") {
      dirty.push(path);
      continue;
    }
    // In sync on paper — but its working tree may still hold uncommitted work.
    const status = await git(join(repoRoot, path), ["status", "--porcelain", "-z"]);
    if (status.trim() !== "") dirty.push(path);
  }

  return dirty;
}

export class RealGitService implements GitService {
  async baseline(cwd: string): Promise<GitBaseline> {
    const repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    const branch = (await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const headSha = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();

    // A failure here is fatal on purpose: silently falling back to HEAD would
    // hand the reviewer the user's pre-existing work as if the run had made it.
    const baseCommit = await snapshot(repoRoot, "baseline");

    return { repoRoot, branch, headSha, baseCommit };
  }

  async diffSince(
    baseline: GitBaseline,
  ): Promise<{ patch: string; files: string[]; dirtySubmodules: string[] }> {
    const root = baseline.repoRoot;
    const current = await snapshot(root, "current");

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

    return { patch, files, dirtySubmodules: await dirtySubmodules(root) };
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
