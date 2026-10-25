/**
 * S2 (C4) usage accounting: the fold that every layer shares — the runner's
 * per-call capture, the workflow's per-role totals, resume replay and the
 * /flow renderers. The contract under test is missing-vs-zero: an absent
 * field was never reported; a present 0 was reported as zero; a partial
 * aggregate carries explicit coverage. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateUsageCoverage,
  copyUsageTotals,
  emptyUsageTotals,
  foldCallUsage,
  hasUsageData,
  isPartialUsageTotals,
  modelLabel,
  usageFromAgentEnds,
  usageFromAssistantMessages,
  usageFromEvents,
  type CallUsageDetail,
  type UsageCoverage,
  type UsageTotals,
} from "../src/usage.ts";

const coverage = (overrides: Partial<UsageCoverage> = {}): UsageCoverage => ({
  input: 1,
  output: 1,
  cacheRead: 1,
  cacheWrite: 1,
  cost: 0,
  elapsedMs: 0,
  ...overrides,
});

const expectTotals = (expected: UsageTotals, actual: UsageTotals | undefined): void =>
  assert.deepEqual(actual, expected);

test("foldCallUsage sums tokens, cache, elapsed and counts calls", () => {
  const folded = foldCallUsage(undefined, { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, elapsedMs: 1000 });
  expectTotals(
    {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      elapsedMs: 1000,
      models: [],
      calls: 1,
      coverage: coverage({ elapsedMs: 1 }),
    },
    folded,
  );
  const again = foldCallUsage(folded, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, elapsedMs: 500 });
  expectTotals(
    {
      input: 101,
      output: 52,
      cacheRead: 13,
      cacheWrite: 9,
      elapsedMs: 1500,
      models: [],
      calls: 2,
      coverage: { input: 2, output: 2, cacheRead: 2, cacheWrite: 2, cost: 0, elapsedMs: 2 },
    },
    again,
  );
});

test("cost stays undefined until a call reports one, then sums only over reporting calls", () => {
  // A call with tokens but no cost (provider exposes no pricing).
  let folded = foldCallUsage(undefined, { input: 100, output: 50 });
  assert.equal(folded.cost, undefined, "no cost reported yet — unavailable, not zero");
  // A call reporting a genuine zero cost (e.g. fully cached/free tier).
  folded = foldCallUsage(folded, { cost: 0 });
  assert.equal(folded.cost, 0, "a reported zero is a zero, distinguishable from undefined");
  assert.equal(folded.coverage?.cost, 1);
  folded = foldCallUsage(folded, { cost: 0.01 });
  assert.equal(folded.cost, 0.01, "sums only over the calls that reported a cost");
  assert.equal(folded.coverage?.cost, 2);
});

test("elapsed stays undefined until a call reports it", () => {
  let folded = foldCallUsage(undefined, { input: 10 });
  assert.equal(folded.elapsedMs, undefined);
  assert.equal(folded.coverage?.elapsedMs, 0);
  folded = foldCallUsage(folded, { elapsedMs: 250 });
  assert.equal(folded.elapsedMs, 250);
});

test("a field no call reported stays absent; a partially reported one carries coverage", () => {
  // First call exposes no cache counters at all; second exposes cacheRead=0.
  let folded = foldCallUsage(undefined, { input: 10, output: 2 });
  assert.equal("cacheRead" in folded, false, "cache was never measured — no invented zero");
  assert.equal(folded.coverage?.cacheRead, 0);
  folded = foldCallUsage(folded, { input: 5, output: 1, cacheRead: 0, cacheWrite: 0 });
  assert.equal(folded.cacheRead, 0, "a reported zero is preserved as zero");
  assert.equal(folded.cacheWrite, 0);
  assert.equal(folded.coverage?.cacheRead, 1, "only one of two calls reported cache");
  assert.equal(isPartialUsageTotals(folded), true);
});

test("distinct provider/model labels are collected and deduplicated", () => {
  let folded = foldCallUsage(undefined, { provider: "zai", model: "glm-5.2", input: 1 });
  folded = foldCallUsage(folded, { provider: "zai", model: "glm-5.2", input: 1 });
  folded = foldCallUsage(folded, { provider: "openrouter", model: "anthropic/claude-sonnet-4", input: 1 });
  assert.deepEqual([...folded.models].sort(), [
    "openrouter/anthropic/claude-sonnet-4",
    "zai/glm-5.2",
  ]);
  assert.equal(folded.calls, 3);
});

test("a call with no usage data at all is skipped and materializes no role entry", () => {
  assert.equal(hasUsageData(undefined), false);
  assert.equal(hasUsageData({}), false);
  // The workflow/resume callers guard with hasUsageData; foldCallUsage must
  // still not count an empty call if handed one directly.
  const folded = foldCallUsage(undefined, {});
  assert.deepEqual(folded, emptyUsageTotals());
  assert.equal(folded.calls, 0);
  // usageFromEvents is the pattern the extension and resume use:
  const usage = usageFromEvents([{ type: "agent.completed", role: "planner", usage: {} }]);
  assert.deepEqual(usage, {}, "a data-less call creates no role entry");
});

test("usageFromEvents folds per role and skips calls without usage", () => {
  const usage = usageFromEvents([
    { type: "agent.completed", role: "planner", usage: { input: 10, output: 5 } },
    { type: "agent.completed", role: "planner" }, // no usage field at all
    { type: "agent.completed", role: "developer", usage: { input: 7, output: 3, cost: 0.002 } },
    { type: "phase.started", phase: "verify" },
  ]);
  expectTotals(
    { input: 10, output: 5, models: [], calls: 1, coverage: coverage({ cacheRead: 0, cacheWrite: 0 }) },
    usage.planner,
  );
  expectTotals(
    {
      input: 7,
      output: 3,
      cost: 0.002,
      models: [],
      calls: 1,
      coverage: coverage({ cacheRead: 0, cacheWrite: 0, cost: 1 }),
    },
    usage.developer,
  );
});

test("usageFromAssistantMessages sums assistant usage including cache and SDK cost.total", () => {
  const usage = usageFromAssistantMessages([
    { role: "user", content: "hi" },
    {
      role: "assistant",
      provider: "zai",
      model: "glm-5.2",
      usage: { input: 100, output: 20, cacheRead: 40, cacheWrite: 10, totalTokens: 170, cost: { total: 0.001 } },
    },
    {
      role: "assistant",
      provider: "zai",
      model: "glm-5.2",
      usage: { input: 200, output: 30, cacheRead: 60, cacheWrite: 0, totalTokens: 290, cost: { total: 0.002 } },
    },
    { role: "toolResult", content: "ok" },
  ]);
  assert.deepEqual(usage, {
    input: 300,
    output: 50,
    cacheRead: 100,
    cacheWrite: 10,
    cost: 0.003,
    provider: "zai",
    model: "glm-5.2",
  });
});

test("usageFromAssistantMessages returns undefined without assistant usage and never throws on garbage", () => {
  assert.equal(usageFromAssistantMessages([]), undefined);
  assert.equal(usageFromAssistantMessages([{ role: "user" }, { role: "toolResult" }]), undefined);
  assert.equal(usageFromAssistantMessages([{ role: "assistant" }]), undefined, "no usage object, no data");
  // Defensive shape reading: wrong field types contribute nothing.
  assert.equal(
    usageFromAssistantMessages([
      { role: "assistant", usage: { input: "x", output: null, cacheRead: {}, cost: 42 } },
    ]),
    undefined,
  );
});

test("usage: null does not throw and reports nothing", () => {
  assert.equal(usageFromAssistantMessages([{ role: "assistant", usage: null }]), undefined);
  assert.equal(usageFromAgentEnds([[{ role: "assistant", usage: null }]]), undefined);
});

test("a usage object with only a cost reports NO invented token or cache zeros", () => {
  const usage = usageFromAssistantMessages([
    { role: "assistant", provider: "p", model: "m", usage: { cost: { total: 0.25 } } },
  ]);
  assert.deepEqual(usage, { cost: 0.25, provider: "p", model: "m" });
  assert.equal("input" in usage!, false);
  assert.equal("cacheRead" in usage!, false);
});

test("a mixed-provider call records no model label rather than a wrong one", () => {
  const usage = usageFromAssistantMessages([
    {
      role: "assistant",
      provider: "zai",
      model: "glm-5.2",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
    },
    {
      role: "assistant",
      provider: "openrouter",
      model: "other",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
    },
  ]);
  assert.equal("provider" in usage!, false);
  assert.equal("model" in usage!, false);
  assert.equal(usage!.input, 2, "tokens still counted");
});

test("provider and a model id containing / are preserved separately", () => {
  const usage = usageFromAssistantMessages([
    {
      role: "assistant",
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
      usage: { input: 3, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 4 },
    },
  ]);
  assert.equal(usage!.provider, "openrouter");
  assert.equal(usage!.model, "anthropic/claude-sonnet-4", "the full id survives, never split");
});

test("two agent_end batches accumulate retry usage without double-counting", () => {
  const first = { role: "assistant", usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 } };
  const retry = { role: "assistant", usage: { input: 20, output: 4, cacheRead: 5, cacheWrite: 0 } };
  const usage = usageFromAgentEnds([
    [{ role: "user" }, first],
    // A retry's loop invocation emits only its own messages.
    [{ role: "user" }, retry],
  ]);
  assert.deepEqual(usage, { input: 30, output: 6, cacheRead: 5, cacheWrite: 0 });

  // Even if a batch repeats an earlier assistant message object, identity
  // de-duplication keeps it counted once.
  const repeated = usageFromAgentEnds([[first], [first, retry]]);
  assert.deepEqual(repeated, { input: 30, output: 6, cacheRead: 5, cacheWrite: 0 });
});

test("usage without a cost object stays cost-free (unavailable, not zero)", () => {
  const usage = usageFromAssistantMessages([
    { role: "assistant", provider: "p", model: "m", usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 10 } },
  ]);
  assert.equal("cost" in usage!, false);
});

test("copyUsageTotals normalizes pre-S2 shapes without inventing cache or coverage", () => {
  // Old run logs carry {input, output} per role on workflow.outcome.
  const copied = copyUsageTotals({ input: 5, output: 6 } as UsageTotals);
  assert.deepEqual(copied, { input: 5, output: 6, models: [], calls: 0 });
  assert.equal("cacheRead" in copied, false, "cache was never measured");
  assert.equal("cost" in copied, false);
  assert.equal("elapsedMs" in copied, false);
  assert.equal("coverage" in copied, false, "completeness unknown across old logs");
  // Full shapes copy without aliasing the models array or coverage object.
  const full: UsageTotals = { ...emptyUsageTotals(), input: 1, cost: 0.5, models: ["a/b"] };
  const fullCopy = copyUsageTotals(full);
  assert.notEqual(fullCopy.models, full.models);
  assert.deepEqual(fullCopy, { ...full });
  assert.notEqual(fullCopy.coverage, full.coverage);
});

test("modelLabel joins provider and model, or returns whichever exists", () => {
  assert.equal(modelLabel("zai", "glm-5.2"), "zai/glm-5.2");
  assert.equal(modelLabel("zai", undefined), "zai");
  assert.equal(modelLabel(undefined, "glm-5.2"), "glm-5.2");
  assert.equal(modelLabel(undefined, undefined), null);
  assert.equal(modelLabel("", ""), null);
});

test("partial usage records what exists: cost without tokens, elapsed only", () => {
  // Exotic runners may report only some fields — each recorded fact must
  // survive, none may be invented.
  const folded = foldCallUsage(foldCallUsage(undefined, { cost: 0.02 }), { elapsedMs: 100 });
  expectTotals(
    {
      cost: 0.02,
      elapsedMs: 100,
      models: [],
      calls: 2,
      coverage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 1, elapsedMs: 1 },
    },
    folded,
  );
  assert.equal(isPartialUsageTotals(folded), true);
  assert.equal(isPartialUsageTotals(emptyUsageTotals()), false);
});

test("aggregateUsageCoverage sums calls and per-field counts across roles", () => {
  const planner = foldCallUsage(undefined, { input: 10, output: 2, cost: 0.1 });
  const developer = foldCallUsage(undefined, { input: 20, output: 3 });
  const aggregate = aggregateUsageCoverage({ planner, developer });
  assert.deepEqual(aggregate, {
    calls: 2,
    coverage: { input: 2, output: 2, cacheRead: 0, cacheWrite: 0, cost: 1, elapsedMs: 0 },
  });
  // The summed cost covers 1 of 2 calls: the aggregate is incomplete even
  // though no single role is (each role covers its own reported fields).
  assert.equal(isPartialUsageTotals(planner!), false);
  assert.equal(isPartialUsageTotals(developer!), false);
  assert.equal(aggregate!.coverage.cost < aggregate!.calls, true);
});

test("aggregateUsageCoverage refuses to guess when a role's coverage is unknown", () => {
  const legacy: UsageTotals = { input: 2, output: 2, models: [], calls: 1 };
  assert.equal(aggregateUsageCoverage({ planner: foldCallUsage(undefined, { input: 1 }), legacy }), undefined);
  // A role with no calls and no coverage hides nothing.
  assert.deepEqual(aggregateUsageCoverage({ planner: foldCallUsage(undefined, { input: 1 }), idle: { models: [], calls: 0 } }), {
    calls: 1,
    coverage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, elapsedMs: 0 },
  });
});

test("a CallUsageDetail with only model/provider still counts as a call", () => {
  const folded = foldCallUsage(undefined, { provider: "zai", model: "glm-5.2" } as CallUsageDetail);
  assert.deepEqual(folded.models, ["zai/glm-5.2"]);
  assert.equal(folded.calls, 1);
  assert.equal("input" in folded, false);
});
