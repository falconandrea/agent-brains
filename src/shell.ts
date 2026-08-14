/**
 * Git + shell verification. Plain Node child_process — no Pi, no LLM.
 *
 * The reviewer judges from the patch this file produces, so it has to be exact:
 * renames, deletions, odd filenames and pre-existing dirt all have to come out
 * right, and a git failure must never silently degrade into an empty patch.
 *
 * Strategy: at baseline, capture the working tree as a real commit object with
 * `git stash create` (non-destructive — it writes objects, never touches the
 * tree or the index). Diffing against that commit gives, for free and correctly:
 * only the workflow's own changes to already-dirty files, proper rename and
 * delete records, and no filename parsing at all for the patch itself.
 */

import { execFile } from "node:child_process";
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

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    const e = err as ExecFailure;
    throw new Error(`git ${args.join(" ")} failed (${e.code}): ${e.stderr || e.message}`);
  }
}

/** `git diff --no-index` exits 1 when there IS a diff; anything else is an error. */
async function gitDiffNoIndex(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    const e = err as ExecFailure;
    if (e.code === 1) return e.stdout ?? "";
    throw new Error(`git ${args.join(" ")} failed (${e.code}): ${e.stderr || e.message}`);
  }
}

/** NUL-separated output: the only form that survives newlines and quoting in paths. */
const splitZ = (out: string): string[] => out.split("\0").filter((s) => s !== "");

export class RealGitService implements GitService {
  async baseline(cwd: string): Promise<GitBaseline> {
    const repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    const branch = (await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const headSha = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
    const preexistingUntracked = splitZ(
      await git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
    );

    // Empty output means the tree was clean. A failure (no identity configured,
    // unusual repo state) falls back to HEAD: the diff then over-reports the
    // user's own dirt, which is safe, rather than hiding workflow changes.
    let baseCommit = headSha;
    let capturedWorkingTree = false;
    try {
      const wip = (await git(repoRoot, ["stash", "create"])).trim();
      if (wip !== "") {
        baseCommit = wip;
        capturedWorkingTree = true;
      }
    } catch {
      // keep headSha
    }

    return {
      repoRoot,
      branch,
      headSha,
      baseCommit,
      capturedWorkingTree,
      preexistingUntracked,
    };
  }

  async diffSince(baseline: GitBaseline): Promise<{ patch: string; files: string[] }> {
    const root = baseline.repoRoot;

    // Tracked changes: one diff, rename detection on, no pathspec to mangle.
    const trackedFiles = splitZ(
      await git(root, ["diff", "--name-only", "--find-renames", "-z", baseline.baseCommit, "--"]),
    );
    const parts: string[] = [];
    if (trackedFiles.length > 0) {
      parts.push(await git(root, ["diff", "--find-renames", baseline.baseCommit, "--"]));
    }

    // Untracked files the workflow created. `git diff <commit>` cannot see them,
    // so each is diffed against /dev/null explicitly.
    const preexisting = new Set(baseline.preexistingUntracked);
    const newUntracked = splitZ(
      await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ).filter((f) => !preexisting.has(f));

    for (const file of newUntracked) {
      parts.push(await gitDiffNoIndex(root, ["diff", "--no-index", "--", "/dev/null", file]));
    }

    return {
      patch: parts.filter((p) => p !== "").join("\n"),
      files: [...trackedFiles, ...newUntracked],
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
