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

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import type { WorkflowEvent } from "./ports.ts";

export const runsDir = (repoRoot: string): string => join(repoRoot, ".pi", "pi-brain", "runs");

export const runLogPath = (repoRoot: string, runId: string): string =>
  join(runsDir(repoRoot), `${runId}.jsonl`);

/**
 * Thrown only by the verified-append primitive below (spec.md §8): an
 * approval-critical event that could not be verifiably persisted must abort
 * the revision session BEFORE any irreversible step, never degrade to the
 * best-effort no-op sink ordinary audit events use.
 */
export class CriticalAppendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriticalAppendError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Deterministic JSON: object keys sorted recursively, undefined-valued keys
 * dropped (mirroring JSON.stringify, so an in-memory event and its re-parsed
 * JSONL line project identically). Timestamps never participate in identity.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The canonical projection of an event: the event minus `eventId` and minus
 * every timestamp field (`at`, `approvedBy.at`) — exactly the `eventId` input
 * (spec.md §8). Two events are THE SAME logical event iff their eventIds match
 * AND their canonical projections are identical.
 */
export function canonicalEventProjection(event: object): Record<string, unknown> {
  const { eventId: _eventId, at: _at, ...rest } = event as Record<string, unknown>;
  const projection: Record<string, unknown> = { ...rest };
  if (isRecord(projection.approvedBy)) {
    const { at: _approvedByAt, ...approvedBy } = projection.approvedBy;
    projection.approvedBy = approvedBy;
  }
  return projection;
}

/** Canonical projection serialized deterministically — the equality unit for reconciliation. */
export const canonicalEventJson = (event: object): string =>
  stableJson(canonicalEventProjection(event));

/**
 * sha256 of the canonical projection. Content-derived: the same logical step
 * retried re-derives the SAME id from the same persisted evidence, with fresh
 * timestamps that never participate.
 */
export const deriveEventId = (event: object): string =>
  createHash("sha256").update(canonicalEventJson(event)).digest("hex");

/** Attaches the content-derived `eventId` to a draft revision event. */
export function withEventId<T extends object>(draft: T): T & { eventId: string } {
  return { ...draft, eventId: deriveEventId(draft) };
}

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
      // Heal a torn final line: a crash mid-append leaves a partial JSON
      // without its newline, and the NEXT append would concatenate onto it,
      // destroying that event too (readRunLog drops the whole merged line).
      // Appending the missing newline first confines the loss to the event
      // that was already being lost when the process died.
      try {
        const raw = readFileSync(log.#path);
        if (raw.length > 0 && raw[raw.length - 1] !== 0x0a) appendFileSync(log.#path, "\n", "utf8");
      } catch {
        // Missing file (first open) or unreadable: the touch below handles creation.
      }
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

  /**
   * Verified, IDEMPOTENT persistence for approval-critical events (spec.md
   * §8). Unlike the best-effort `append`, any failure THROWS
   * `CriticalAppendError` — a revision event that may not be on disk must
   * abort the session before promotion can run, never degrade to a no-op.
   *
   * Sequence:
   * 1. Refuse when the sink is already marked broken (never pretend to persist).
   * 2. Torn-final-line healing, exactly like `RunLog.open`, so the new event
   *    cannot merge into a torn line.
   * 3. Reconciliation BEFORE appending, under CANONICAL equality: re-read the
   *    log and look for the same `eventId`. Found with an identical canonical
   *    projection (timestamps excluded) → idempotent no-op, the persisted copy
   *    wins even when the retry carries a fresh timestamp. Same id with a
   *    differing projection → fail-closed refuse. Unreadable log → refuse
   *    without retrying (nothing may be appended that cannot be verified).
   * 4. Append WITHOUT the best-effort catch.
   * 5. Re-read and verify the last complete line parses back to EXACTLY the
   *    appended event (strict JSON equality — same object just serialized).
   *    On failure, reconcile once more: canonically present → success (the
   *    write had landed, the failure was observational); provably absent →
   *    retry the append exactly once and re-verify; still failing → throw.
   *
   * `options.injectFaultAfterAppend` is a test seam (the repo's
   * fault-injection discipline): invoked after every physical append, BEFORE
   * verification, so tests can deterministically exercise the
   * verification-failure, reconcile-success and retry-once branches.
   */
  appendCritical(
    event: CriticalAppendEvent,
    options?: { injectFaultAfterAppend?: () => void },
  ): void {
    if (this.#broken) {
      throw new CriticalAppendError(
        `run log sink is broken (${this.#path}) — refusing to pretend the critical event was persisted`,
      );
    }
    // §8: the stable content-derived id must bind THIS event's canonical
    // content. An incoming event whose eventId is arbitrary or belongs to
    // different content is corrupt input — refuse at the entry, before any
    // file access, rather than reconciling an untrue identity.
    const incomingEventId = deriveEventId(event);
    if (event.eventId !== incomingEventId) {
      throw new CriticalAppendError(
        `${event.type} eventId ${event.eventId} does not bind its canonical content (expected ${incomingEventId}) — refusing to persist`,
      );
    }
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      this.#healTornLineCritical();
      const existing = this.#parseAllCritical();
      const incomingCanonical = canonicalEventJson(event);
      const duplicate = findSameEventId(existing, event, incomingCanonical);
      if (duplicate !== undefined) {
        if (duplicate.equal) return; // idempotent no-op
        throw new CriticalAppendError(
          `run log ${this.#path} already holds eventId ${event.eventId} with a DIFFERENT canonical projection — refusing (corruption or collision, never a forced retry)`,
        );
      }

      this.#appendRawCritical(event);
      options?.injectFaultAfterAppend?.();
      if (this.#lastLineIsExactly(event)) return;

      // Verification failed: reconcile once more before touching anything.
      const reRead = this.#parseAllCritical();
      const reDuplicate = findSameEventId(reRead, event, incomingCanonical);
      if (reDuplicate !== undefined) {
        if (reDuplicate.equal) return; // write had landed; failure was observational
        throw new CriticalAppendError(
          `run log ${this.#path} holds eventId ${event.eventId} with a DIFFERENT canonical projection after append — refusing`,
        );
      }
      // Provably absent (the re-read succeeded): one clean retry.
      this.#appendRawCritical(event);
      options?.injectFaultAfterAppend?.();
      if (this.#lastLineIsExactly(event)) return;
      throw new CriticalAppendError(
        `run log ${this.#path} could not be verified to contain the appended event after one retry — refusing`,
      );
    } catch (err) {
      if (err instanceof CriticalAppendError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new CriticalAppendError(`critical append to ${this.#path} failed: ${message}`);
    }
  }

  /** Torn-line healing for the critical path: fs errors throw, ENOENT is "no file yet". */
  #healTornLineCritical(): void {
    let raw: Buffer;
    try {
      raw = readFileSync(this.#path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    if (raw.length > 0 && raw[raw.length - 1] !== 0x0a) appendFileSync(this.#path, "\n", "utf8");
  }

  /** Plain append — no catch. Fs errors propagate to the CriticalAppendError wrapper. */
  #appendRawCritical(event: CriticalAppendEvent): void {
    appendFileSync(this.#path, `${JSON.stringify(event)}\n`, "utf8");
  }

  /**
   * Re-read the whole log line by line. Torn/partial lines are skipped (they
   * never contained a complete event), but a file that cannot be READ throws —
   * reconciliation may never guess about content it could not observe.
   */
  #parseAllCritical(): unknown[] {
    let raw: string;
    try {
      raw = readFileSync(this.#path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const parsed: unknown[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      try {
        parsed.push(JSON.parse(trimmed));
      } catch {
        // Torn final line: skipped, as in readRunLog.
      }
    }
    return parsed;
  }

  /**
   * True when the last complete line parses back to EXACTLY the appended
   * event. A read error here counts as verification failure (the reconcile
   * step below will throw on the unreadable log, per the persistence contract).
   */
  #lastLineIsExactly(event: CriticalAppendEvent): boolean {
    let raw: string;
    try {
      raw = readFileSync(this.#path, "utf8");
    } catch {
      return false;
    }
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    const last = lines.at(-1);
    if (last === undefined) return false;
    try {
      return JSON.stringify(JSON.parse(last)) === JSON.stringify(event);
    } catch {
      return false;
    }
  }
}

/**
 * The event shapes `appendCritical` accepts: the revision lifecycle events,
 * the only union members carrying the stable content-derived `eventId`.
 */
export type CriticalAppendEvent = Extract<WorkflowEvent, { eventId: string }>;

/**
 * Scan ALL events with the same `eventId` in a parsed log — reconciliation
 * never stops at the first match: a matching duplicate followed by a
 * conflicting one is still a conflict, and must refuse. Returns undefined
 * when the id is absent, `{ equal: true }` when every same-id copy is
 * canonically identical to the incoming event, `{ equal: false }` otherwise.
 */
function findSameEventId(
  parsed: unknown[],
  event: CriticalAppendEvent,
  incomingCanonical: string,
): { equal: boolean } | undefined {
  let found: { equal: boolean } | undefined;
  for (const candidate of parsed) {
    if (!isRecord(candidate) || candidate.eventId !== event.eventId) continue;
    const equal = stableJson(canonicalEventProjection(candidate)) === incomingCanonical;
    if (!equal) return { equal: false }; // one conflicting duplicate is enough to refuse
    found = { equal: true }; // keep scanning: a later copy may still conflict
  }
  return found;
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
