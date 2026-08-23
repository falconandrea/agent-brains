/**
 * Run-state log (IDEAS.md, priority 2026-08-22): pi-brain owns its audit
 * trail. Every workflow event is appended to
 * `.pi/pi-brain/runs/<runId>.jsonl` — one JSON per line — so outcomes, review
 * findings and token usage survive TUI scrolling, crashes and pi's unflushed
 * session files (two real incidents of lost data, see IDEAS.md).
 *
 * `pi.appendEntry` is still called by the extension for pi-side history, but
 * nothing READS it back: the file here is the source of truth for `/flow log`
 * and future resume mode.
 *
 * Writes are best-effort appendFileSync: a run must never die because its
 * audit trail hit a filesystem error. Such errors are reported once on stderr
 * and the sink degrades to no-op.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowEvent } from "./ports.ts";

export const runsDir = (repoRoot: string): string => join(repoRoot, ".pi", "pi-brain", "runs");

export const runLogPath = (repoRoot: string, runId: string): string =>
  join(runsDir(repoRoot), `${runId}.jsonl`);

export class RunLog {
  readonly #path: string;
  #broken = false;

  constructor(path: string) {
    this.#path = path;
  }

  static open(repoRoot: string, runId: string): RunLog {
    const log = new RunLog(runLogPath(repoRoot, runId));
    try {
      mkdirSync(runsDir(repoRoot), { recursive: true });
      appendFileSync(log.#path, "", "utf8"); // touch: create even before the first event
    } catch (err) {
      log.#fail(err);
    }
    return log;
  }

  #fail(err: unknown): void {
    if (this.#broken) return;
    this.#broken = true;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`pi-brain: run log unavailable (${this.#path}): ${message}`);
  }

  append(event: WorkflowEvent): void {
    if (this.#broken) return;
    try {
      appendFileSync(this.#path, `${JSON.stringify(event)}\n`, "utf8");
    } catch (err) {
      this.#fail(err);
    }
  }
}

/** All events of a past run, oldest first. Empty when the log does not exist. */
export function readRunLog(repoRoot: string, runId: string): WorkflowEvent[] {
  const path = runLogPath(repoRoot, runId);
  if (!existsSync(path)) return [];
  const events: WorkflowEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      events.push(JSON.parse(trimmed) as WorkflowEvent);
    } catch {
      // A torn final line (crash mid-write) is skipped, not fatal.
    }
  }
  return events;
}

/** Run ids that have a log on disk, newest first (by mtime of the log). */
export function listRunIds(repoRoot: string): string[] {
  const dir = runsDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => ({
      runId: name.slice(0, -".jsonl".length),
      mtime: statSync(join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.runId);
}
