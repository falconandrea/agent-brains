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

import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_VERIFY_TIMEOUT_MS } from "./config.ts";
import type { CommandResult, GitBaseline, GitService, VerifyRunner } from "./ports.ts";
import type { VerifyCommand } from "./verify.ts";

const exec = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024;

/** Reported exit code for a command that exceeded its timeout (GNU timeout convention). */
const TIMEOUT_EXIT_CODE = 124;
/** Reported exit code for a command terminated by explicit cancellation (128 + SIGTERM). */
const CANCELLED_EXIT_CODE = 143;
/** Grace between SIGTERM and SIGKILL of the process group. */
const DEFAULT_KILL_GRACE_MS = 5000;
/** Combined stdout+stderr a verification command may produce before it is killed. */
const VERIFY_OUTPUT_LIMIT = 16 * 1024 * 1024;
/** Poll interval while waiting for a terminated tree to disappear. */
const SETTLE_POLL_MS = 10;
/** After SIGKILL, how long settle() waits before giving up on an unkillable (D-state) survivor. */
const SETTLE_UNKILLABLE_MS = 2000;
/** Fallback resolution when 'close' never fires after forceSettle (D-state pipe holder). */
const LAST_RESORT_MS = 2000;

export interface ShellVerifyOptions {
  /** Receives each command result as soon as it is available. */
  onResult?: (r: CommandResult) => void;
  /** Per-command duration limit in ms; defaults to the config default (10 min). */
  timeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL of the process group. */
  killGraceMs?: number;
}

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
  readonly #timeoutMs: number;
  readonly #killGraceMs: number;

  constructor(cwd: string, options: ShellVerifyOptions = {}) {
    this.#cwd = cwd;
    this.#onResult = options.onResult;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
    this.#killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
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

  private one(command: string, signal?: AbortSignal): Promise<CommandResult> {
    return new Promise((resolve) => {
      // Single termination cause: the FIRST one wins and later triggers are
      // ignored, so a late timeout can never relabel an ongoing cancellation
      // (or vice versa). Independent boolean flags could both be true.
      type Cause = "timeout" | "cancel" | "overflow";
      let termination: Cause | undefined;
      let terminatedAt = 0;
      let stdout = "";
      let stderr = "";
      let escalation: NodeJS.Timeout | undefined;
      let lastResort: NodeJS.Timeout | undefined;
      let settled = false;

      // `detached` puts the shell in its OWN process group, so a negative-pid
      // kill reaches the whole tree (test runners, watchers, workers). Plain
      // spawn() is required for this: the exec/execFile family silently drops
      // `detached` on current Node (verified: the child keeps the parent's
      // pgid), and Node's own `timeout`/`signal` options only ever signal
      // the direct child, stranding grandchildren.
      const child = spawn("bash", ["-lc", command], {
        cwd: this.#cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const killTree = (sig: NodeJS.Signals): void => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, sig);
        } catch {
          // Group already gone, or a non-POSIX platform without group kill:
          // fall back to the shell alone — the best the old code could do.
          try {
            child.kill(sig);
          } catch {
            // already gone
          }
        }
      };

      const groupGone = (): boolean => {
        if (child.pid === undefined) return true;
        try {
          process.kill(-child.pid, 0);
          return false;
        } catch (err) {
          // Only ESRCH means "no member left". EPERM — a live group owned by
          // someone else — must keep waiting, not read as gone.
          return (err as NodeJS.ErrnoException).code === "ESRCH";
        }
      };

      /**
       * Last step of every termination: SIGKILL the group, drop our pipe
       * ends (a straggler holding them would keep 'close' from firing), and
       * resolve even if 'close' never arrives — a survivor stuck in
       * uninterruptible sleep must not hold the workflow hostage.
       */
      const forceSettle = (): void => {
        killTree("SIGKILL");
        child.stdout?.destroy();
        child.stderr?.destroy();
        if (lastResort === undefined) {
          lastResort = setTimeout(
            () => { if (!settled) finish((cleanupConfirmed) => resultFor(null, cleanupConfirmed)); },
            LAST_RESORT_MS,
          );
        }
      };

      const terminate = (reason: Cause): void => {
        if (termination !== undefined) return; // idempotent: first cause wins
        termination = reason;
        terminatedAt = Date.now();
        if (reason === "overflow") {
          forceSettle(); // runaway output: no grace, same contract maxBuffer had
        } else {
          // SIGTERM first (graceful teardown), forceSettle after a grace
          // period for anything that traps or ignores it (watch-mode runners).
          killTree("SIGTERM");
          escalation = setTimeout(forceSettle, this.#killGraceMs);
        }
      };

      /**
       * The result must not reach the workflow — which proceeds and releases
       * the repository lock — while any member of the terminated tree can
       * still run. Waits for the group to empty, SIGKILLing once the grace
       * is exhausted. Returns false in the unkillable (D-state) edge case
       * instead of hanging, so the result can say so instead of claiming a
       * cleanup that was not confirmed.
       */
      const settle = async (): Promise<boolean> => {
        if (termination === undefined || groupGone()) return true;
        const killAt = terminatedAt + (termination === "overflow" ? 0 : this.#killGraceMs);
        const giveUpAt = killAt + SETTLE_UNKILLABLE_MS;
        for (;;) {
          if (groupGone()) return true;
          if (Date.now() >= giveUpAt) return false; // best effort: never hang the run
          if (Date.now() >= killAt) killTree("SIGKILL");
          await new Promise((r) => setTimeout(r, SETTLE_POLL_MS));
        }
      };

      const collect = (chunk: Buffer, stream: "out" | "err"): void => {
        const total = stdout.length + stderr.length;
        if (total >= VERIFY_OUTPUT_LIMIT) {
          if (termination === undefined) terminate("overflow");
          return;
        }
        const text = chunk.toString("utf8").slice(0, VERIFY_OUTPUT_LIMIT - total);
        if (stream === "out") stdout += text;
        else stderr += text;
      };
      child.stdout?.on("data", (c: Buffer) => collect(c, "out"));
      child.stderr?.on("data", (c: Buffer) => collect(c, "err"));

      const timer = setTimeout(() => terminate("timeout"), this.#timeoutMs);
      const onAbort = (): void => {
        clearTimeout(timer); // deactivate the concurrent timeout
        terminate("cancel");
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      /**
       * Resolves only after settle(): the result is built with the cleanup
       * outcome, so the promise never claims a completed termination that
       * was not confirmed.
       */
      const finish = (build: (cleanupConfirmed: boolean) => CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        void settle().then((cleanupConfirmed) => {
          if (escalation !== undefined) clearTimeout(escalation);
          if (lastResort !== undefined) clearTimeout(lastResort);
          resolve(build(cleanupConfirmed));
        });
      };

      /** Partial output plus the pi-brain note explaining how the command ended. */
      const annotated = (note: string): string => `${stdout}${stderr}\n[pi-brain] ${note}`;

      const resultFor = (code: number | null, cleanupConfirmed: boolean): CommandResult => {
        const outcomeNote = cleanupConfirmed
          ? "the command's process group was terminated."
          : "its process group could not be confirmed dead — check for leftover processes.";
        if (termination === "timeout") {
          return {
            command,
            exitCode: TIMEOUT_EXIT_CODE,
            output: annotated(`${command} timed out after ${this.#timeoutMs}ms; ${outcomeNote}`),
            timedOut: true,
          };
        }
        if (termination === "cancel") {
          return {
            command,
            exitCode: CANCELLED_EXIT_CODE,
            output: annotated(`${command} was cancelled; ${outcomeNote}`),
            cancelled: true,
          };
        }
        if (termination === "overflow") {
          return {
            command,
            exitCode: 1,
            output: annotated(
              `${command} produced more than ${VERIFY_OUTPUT_LIMIT} characters of output; ${outcomeNote}`,
            ),
          };
        }
        return { command, exitCode: code ?? 1, output: `${stdout}${stderr}` };
      };

      child.on("error", (err) => {
        // spawn-level failure (bash missing, cwd gone): an ordinary failure.
        finish(() => ({ command, exitCode: 1, output: err.message }));
      });

      child.on("close", (code) => {
        finish((cleanupConfirmed) => resultFor(code, cleanupConfirmed));
      });
    });
  }
}
