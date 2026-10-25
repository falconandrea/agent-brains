/**
 * Usage accounting (S2, C4): the ONE shape used by every layer that touches
 * usage — the Pi runner's per-call capture, the workflow's per-role totals,
 * the persisted run-log events, resume replay and the /flow renderers.
 *
 * Missing vs zero is a contract here: a field that is ABSENT was never
 * reported (unavailable); a field that is 0 was reported as zero. Nothing in
 * this module coerces undefined to 0 — not for tokens, not for cache, not for
 * cost. A provider that exposes no cache counters must not look like a call
 * with zero cache, and an old log that never measured cache must not acquire
 * a fake zero when it is replayed.
 *
 * `cost` is the cost EXPOSED BY THE PI SDK, computed from the provider's
 * published per-million pricing (Model.cost rates). It is not a bill, not an
 * invoice and not an estimated saving: subscription billing (OAuth plans) can
 * differ, and pi-brain never sees the real invoice.
 */

/** The numeric fields usage can carry. Coverage is tracked per field. */
export type UsageField = "input" | "output" | "cacheRead" | "cacheWrite" | "cost" | "elapsedMs";

export const USAGE_FIELDS: readonly UsageField[] = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "cost",
  "elapsedMs",
];

/** How many folded calls reported each field (0..calls). */
export type UsageCoverage = Record<UsageField, number>;

/**
 * Usage of ONE agent call, as reported by the runner. Every field optional:
 * absent = not reported by this call, present 0 = reported zero.
 */
export interface CallUsageDetail {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** SDK-exposed cost in USD for this call (provider pricing, not billing). */
  cost?: number;
  /** Wall-clock duration of the call (prompt to agent end), in ms. */
  elapsedMs?: number;
  /** Resolved provider when the runner observed it (kept separately from model). */
  provider?: string;
  /** Full model id when observed — may itself contain `/` (e.g. an OpenRouter id). */
  model?: string;
}

/**
 * Cumulative usage per role over one or more calls (a whole run, or the
 * pre-resume part of one replayed from the log).
 *
 * An absent numeric field was never reported by ANY folded call. A present
 * aggregate is a sum over the calls that DID report it; `coverage[field]`
 * says how many calls that was. When `coverage[field] < calls` the aggregate
 * is partial, which is why coverage is persisted rather than inferred.
 * `cost` and `elapsedMs` are absent until at least one call reports them.
 */
export interface UsageTotals {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** Sum of SDK-exposed cost over the calls that reported one; undefined when none did. */
  cost?: number;
  /** Sum of per-call wall-clock; undefined when no call reported it. */
  elapsedMs?: number;
  /** Distinct "provider/model" labels observed, in first-seen order. Empty when never observed. */
  models: string[];
  /** How many calls were folded into these totals. */
  calls: number;
  /**
   * Per-field reporting counts. Absent on totals replayed from logs that
   * predate coverage tracking (their completeness is unknown, never assumed).
   */
  coverage?: UsageCoverage;
}

/** Cumulative usage per role; roles with no reported usage have no entry. */
export type UsageByRole = Partial<Record<string, UsageTotals>>;

function emptyCoverage(): UsageCoverage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, elapsedMs: 0 };
}

/** Totals with no facts: no calls, zero coverage, every numeric field absent. */
export function emptyUsageTotals(): UsageTotals {
  return { models: [], calls: 0, coverage: emptyCoverage() };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** True when the call carries ANY usage fact worth persisting. */
export function hasUsageData(call: CallUsageDetail | undefined): boolean {
  if (call === undefined) return false;
  return (
    call.input !== undefined ||
    call.output !== undefined ||
    call.cacheRead !== undefined ||
    call.cacheWrite !== undefined ||
    call.cost !== undefined ||
    call.elapsedMs !== undefined ||
    call.provider !== undefined ||
    call.model !== undefined
  );
}

/**
 * Fold one call's usage into per-role totals. Mutates the totals object it is
 * given (the pattern every caller uses); returns it so callers can keep the
 * `usage[role] ?? empty` idiom in one place. A call with no data at all is
 * skipped — it must not materialize a zeroed role entry or count as a call.
 */
export function foldCallUsage(
  totals: UsageTotals | undefined,
  call: CallUsageDetail | undefined,
): UsageTotals {
  if (!hasUsageData(call)) return totals ?? emptyUsageTotals();
  const next = totals ?? emptyUsageTotals();
  const coverage = { ...(next.coverage ?? emptyCoverage()) };

  if (isFiniteNumber(call!.input)) {
    next.input = (next.input ?? 0) + call!.input;
    coverage.input += 1;
  }
  if (isFiniteNumber(call!.output)) {
    next.output = (next.output ?? 0) + call!.output;
    coverage.output += 1;
  }
  if (isFiniteNumber(call!.cacheRead)) {
    next.cacheRead = (next.cacheRead ?? 0) + call!.cacheRead;
    coverage.cacheRead += 1;
  }
  if (isFiniteNumber(call!.cacheWrite)) {
    next.cacheWrite = (next.cacheWrite ?? 0) + call!.cacheWrite;
    coverage.cacheWrite += 1;
  }
  // undefined propagates: an aggregate cost exists only once a call reported one.
  if (isFiniteNumber(call!.cost)) {
    next.cost = (next.cost ?? 0) + call!.cost;
    coverage.cost += 1;
  }
  if (isFiniteNumber(call!.elapsedMs)) {
    next.elapsedMs = (next.elapsedMs ?? 0) + call!.elapsedMs;
    coverage.elapsedMs += 1;
  }
  next.coverage = coverage;

  const label = modelLabel(call!.provider, call!.model);
  if (label !== null && !next.models.includes(label)) next.models.push(label);
  next.calls += 1;
  return next;
}

/**
 * True when at least one PRESENT aggregate covers fewer calls than the total
 * call count. Fields no call reported are unavailable, not partial.
 * Totals replayed from pre-coverage logs return false: their completeness is
 * unknown, and guessing "complete" would be as wrong as guessing "partial".
 */
export function isPartialUsageTotals(totals: UsageTotals): boolean {
  if (totals.coverage === undefined || totals.calls === 0) return false;
  return USAGE_FIELDS.some((field) => {
    const value = totals[field];
    return value !== undefined && totals.coverage![field] < totals.calls;
  });
}

/** Calls and per-field reporting counts summed over several roles. */
export interface UsageAggregateCoverage {
  /** Sum of `calls` over the roles folded into the aggregate. */
  calls: number;
  /** Sum of per-role coverage; how many calls reported each field. */
  coverage: UsageCoverage;
}

/**
 * Reporting counts for a CROSS-ROLE aggregate (the `total` line rendered by
 * `/flow`), so completeness is judged on the sum and not only per role: a
 * cost summed from the roles that reported one must not look complete when
 * another role's calls folded no cost.
 *
 * Returns undefined when any role that folded calls has no coverage: a total
 * mixing known and unknown completeness is unknown — neither complete nor
 * partial — and guessing either way would be wrong.
 */
export function aggregateUsageCoverage(usage: UsageByRole): UsageAggregateCoverage | undefined {
  const coverage = emptyCoverage();
  let calls = 0;
  for (const totals of Object.values(usage)) {
    if (totals === undefined) continue;
    calls += totals.calls;
    if (totals.coverage === undefined) {
      // Nothing folded: contributes no calls, so it cannot hide a gap.
      if (totals.calls > 0) return undefined;
      continue;
    }
    for (const field of USAGE_FIELDS) coverage[field] += totals.coverage[field];
  }
  return { calls, coverage };
}

/** `"provider/model"`, or whichever of the two exists, or null when neither. */
export function modelLabel(provider: string | undefined, model: string | undefined): string | null {
  const p = stringOrUndefined(provider);
  const m = stringOrUndefined(model);
  if (p !== undefined && m !== undefined) return `${p}/${m}`;
  return p ?? m ?? null;
}

/**
 * Defensive copy of one role's totals. Sources like old run logs or untyped
 * replay payloads may predate the S2/coverage fields: only facts actually
 * present are copied, cache included — a log that never measured cache stays
 * without a cache total instead of gaining a zero. Coverage is copied only
 * when the source had it (unknown coverage stays unknown).
 */
export function copyUsageTotals(totals: UsageTotals | undefined): UsageTotals {
  const next: UsageTotals = {
    models: [...(totals?.models ?? [])],
    calls: totals?.calls ?? 0,
  };
  for (const field of USAGE_FIELDS) {
    if (isFiniteNumber(totals?.[field])) next[field] = totals![field];
  }
  if (totals?.coverage !== undefined) {
    next.coverage = { ...emptyCoverage(), ...totals.coverage };
  }
  return next;
}

/**
 * Fold the `agent.completed` events of a run into per-role totals. Shared by
 * resume replay and the /flow live status so both count exactly like the
 * workflow does. Events predating S2 carry `{input, output}` only: they fold
 * with cache/cost/elapsed/models absent, never guessed. Non-agent events in
 * the iterable are ignored.
 */
export function usageFromEvents(
  events: Iterable<{ type: string; role?: unknown; usage?: CallUsageDetail; [extra: string]: unknown }>,
): UsageByRole {
  const usage: UsageByRole = {};
  for (const event of events) {
    if (typeof event.role !== "string" || event.usage === undefined) continue;
    if (!hasUsageData(event.usage)) continue;
    usage[event.role] = foldCallUsage(usage[event.role], event.usage);
  }
  return usage;
}

/**
 * Sum usage over the assistant messages of ONE agent call (the Pi SDK's
 * `agent_end` payload). Every assistant message carries a full `Usage`
 * object; non-assistant messages carry none.
 *
 * Only fields the payload actually reports are recorded. A usage object that
 * exposes a cost but no token counters yields `{ cost }` — never fabricated
 * zeros. Provider/model are recorded only when every assistant message
 * agrees, and the provider and the FULL model id are stored separately: a
 * model id containing `/` (e.g. `anthropic/claude-sonnet-4`) is never split.
 *
 * Defensive by design: it reads untyped SDK payloads and must never throw on
 * a shape Pi did not document. Returns undefined when no assistant message
 * reported a numeric fact or a model label.
 */
export function usageFromAssistantMessages(messages: readonly unknown[]): CallUsageDetail | undefined {
  let input: number | undefined;
  let output: number | undefined;
  let cacheRead: number | undefined;
  let cacheWrite: number | undefined;
  let cost: number | undefined;
  const labels = new Map<string, { provider?: string; model?: string }>();

  const add = (current: number | undefined, value: unknown): number | undefined =>
    isFiniteNumber(value) ? (current ?? 0) + value : current;

  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const m = message as { role?: unknown; usage?: unknown; provider?: unknown; model?: unknown };
    if (m.role !== "assistant") continue;
    const u = m.usage as
      | {
          input?: unknown;
          output?: unknown;
          cacheRead?: unknown;
          cacheWrite?: unknown;
          cost?: { total?: unknown };
        }
      | null
      | undefined;
    // Explicit null check: `typeof null === "object"` and reading `.input`
    // off it would throw, defeating the whole defensive contract.
    if (u === undefined || u === null || typeof u !== "object") continue;

    input = add(input, u.input);
    output = add(output, u.output);
    cacheRead = add(cacheRead, u.cacheRead);
    cacheWrite = add(cacheWrite, u.cacheWrite);
    const costObject = u.cost;
    if (typeof costObject === "object" && costObject !== null) {
      cost = add(cost, (costObject as { total?: unknown }).total);
    }

    const provider = stringOrUndefined(m.provider);
    const model = stringOrUndefined(m.model);
    if (provider !== undefined || model !== undefined) {
      const key = `${provider ?? ""}\u0000${model ?? ""}`;
      if (!labels.has(key)) labels.set(key, { ...(provider ? { provider } : {}), ...(model ? { model } : {}) });
    }
  }

  const detail: CallUsageDetail = {};
  if (input !== undefined) detail.input = input;
  if (output !== undefined) detail.output = output;
  if (cacheRead !== undefined) detail.cacheRead = cacheRead;
  if (cacheWrite !== undefined) detail.cacheWrite = cacheWrite;
  if (cost !== undefined) detail.cost = cost;
  // One consistent provider/model across the call (the normal case) is
  // recorded; a mixed call stays unlabeled instead of picking a winner.
  if (labels.size === 1) {
    const [only] = labels.values();
    if (only!.provider !== undefined) detail.provider = only!.provider;
    if (only!.model !== undefined) detail.model = only!.model;
  }
  return hasUsageData(detail) ? detail : undefined;
}

/**
 * Fold every `agent_end` batch of ONE `session.prompt()` call.
 *
 * A prompt can end the agent loop more than once: automatic retries and
 * compaction recovery call `agent.continue()`, and each loop invocation emits
 * its own `agent_end` carrying the messages of THAT invocation. Replacing the
 * captured usage per event would keep only the last execution's tokens/cost;
 * this accumulates all of them. Assistant message objects are de-duplicated
 * by identity so a batch that repeats an earlier message cannot double-count
 * it, while distinct executions still add up.
 */
export function usageFromAgentEnds(batches: Iterable<readonly unknown[]>): CallUsageDetail | undefined {
  const seen = new WeakSet<object>();
  const messages: unknown[] = [];
  for (const batch of batches) {
    for (const message of batch) {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { role?: unknown }).role === "assistant"
      ) {
        if (seen.has(message)) continue;
        seen.add(message);
      }
      messages.push(message);
    }
  }
  return usageFromAssistantMessages(messages);
}
