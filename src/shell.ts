/**
 * Git + shell verification. Plain Node child_process — no Pi, no LLM.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  CommandResult,
  GitBaseline,
  GitService,
  VerifyRunner,
} from "./ports.ts";
import type { VerifyCommand } from "./verify.ts";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

export class RealGitService implements GitService {
  async baseline(cwd: string): Promise<GitBaseline> {
    const repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    const branch = (await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const headSha = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
    const status = await git(repoRoot, ["status", "--porcelain"]);
    const preexistingChanges = status
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => l.slice(3).trim());
    return { repoRoot, branch, headSha, preexistingChanges };
  }

  /**
   * Working-tree diff vs the baseline commit, minus files that were already
   * dirty when the workflow started (spec §22).
   */
  async diffSince(baseline: GitBaseline): Promise<{ patch: string; files: string[] }> {
    const preexisting = new Set(baseline.preexistingChanges);
    const nameOnly = await git(baseline.repoRoot, ["diff", "--name-only", baseline.headSha, "--"]);
    const untracked = await git(baseline.repoRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);

    const files = [...nameOnly.split("\n"), ...untracked.split("\n")]
      .map((f) => f.trim())
      .filter((f) => f !== "" && !preexisting.has(f));

    if (files.length === 0) return { patch: "", files: [] };

    const patch = await git(baseline.repoRoot, [
      "diff",
      baseline.headSha,
      "--",
      ...files,
    ]).catch(() => "");
    return { patch, files };
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
      const e = err as { code?: number; stdout?: string; stderr?: string; message: string };
      return {
        command,
        exitCode: typeof e.code === "number" ? e.code : 1,
        output: `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message,
      };
    }
  }
}
