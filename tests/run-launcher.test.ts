/**
 * Shared run launcher (U6, F7): the execution cycle `/feature` and
 * `/flow resume` both go through. Every Pi-facing effect of the production
 * wiring (history append, status line, notify, bell, lock) is injected here
 * as a plain fake, so each completion path runs with no Pi, no filesystem
 * and no models. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { agentStatus, launchRun, type LaunchRunDeps, type LauncherRunState } from "../src/run-launcher.ts";
import { UserDismissedError } from "../src/ports.ts";
import type { WorkflowEvent, WorkflowEventSink } from "../src/ports.ts";
import type { FeatureOutcome } from "../src/workflows/feature.ts";

/** Fake active-run record — the mutable thing /flow status|log|stop read. */
function makeRun(): LauncherRunState {
  return { runId: "run-test", workflow: "feature", phase: "starting", status: "running", events: [] };
}

/** Every injected effect, recorded. `historyThrows` simulates a stale Pi
 * ctx; `runLogThrows` simulates a broken audit-trail dep. `notifyThrows`,
 * `bellThrows` and `statusThrows` simulate the stale/removed Pi UI context
 * F6/U8 hardens against. */
function makeDeps(
  options: {
    historyThrows?: boolean;
    runLogThrows?: boolean;
    notifyThrows?: boolean;
    bellThrows?: boolean;
    statusThrows?: boolean;
  } = {},
) {
  const {
    historyThrows = false,
    runLogThrows = false,
    notifyThrows = false,
    bellThrows = false,
    statusThrows = false,
  } = options;
  const state = {
    runLog: [] as WorkflowEvent[],
    history: [] as WorkflowEvent[],
    statusCalls: [] as Array<string | undefined>,
    notifications: [] as Array<{ message: string; level: "info" | "warning" | "error" }>,
    bells: 0,
    releases: 0,
  };
  const deps: LaunchRunDeps = {
    run: makeRun(),
    runLog: {
      append: (event) => {
        state.runLog.push(event);
        if (runLogThrows) throw new Error("run log broken");
      },
    },
    history: (event) => {
      state.history.push(event);
      if (historyThrows) throw new Error("stale pi context");
    },
    setStatus: (text) => {
      state.statusCalls.push(text);
      if (statusThrows) throw new Error("stale pi status");
    },
    notify: (message, level) => {
      state.notifications.push({ message, level });
      if (notifyThrows) throw new Error("stale pi notify");
    },
    bell: () => {
      state.bells += 1;
      if (bellThrows) throw new Error("stale pi bell");
    },
    lock: { release: () => {
      state.releases += 1;
    } },
  };
  return { deps, state };
}

/**
 * Capture whatever the launcher writes to stderr (the U8 report) while `run`
 * executes. Always restores the real stream, even if `run` rejects.
 */
async function captureStderr<T>(run: () => T): Promise<{ result: T; stderr: string }> {
  const original = process.stderr.write;
  let stderr = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    return { result: await run(), stderr };
  } finally {
    process.stderr.write = original;
  }
}

/**
 * A workflow whose settlement the test controls. `onStart` runs synchronously
 * at invocation — like the real deps construction before the first await.
 */
function pendingWorkflow(onStart?: (sink: WorkflowEventSink) => void) {
  const sinks: WorkflowEventSink[] = [];
  let settle!: (outcome: FeatureOutcome) => void;
  let fail!: (err: unknown) => void;
  const workflow = (sink: WorkflowEventSink): Promise<FeatureOutcome> => {
    sinks.push(sink);
    onStart?.(sink);
    return new Promise((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
  };
  return {
    workflow,
    sinks,
    resolve: (outcome: FeatureOutcome) => settle(outcome),
    reject: (err: unknown) => fail(err),
  };
}

/** The last event, asserted to be the outcome, as a plain record. */
function outcomeOf(events: WorkflowEvent[]): Record<string, unknown> {
  const last = events.at(-1);
  assert.equal(last?.type, "workflow.outcome", `expected workflow.outcome last, got ${last?.type}`);
  return last as unknown as Record<string, unknown>;
}

const completedOutcome: FeatureOutcome = {
  status: "completed",
  summary: "auth added",
  files: ["src/auth.ts", "tests/auth.test.ts"],
  review: {
    verdict: "approved",
    summary: "clean",
    issues: [{ id: "R1", severity: "warning", category: "maintainability", problem: "long function" }],
  },
  usage: { planner: { input: 100, output: 20 }, developer: { input: 400, output: 80 } },
};

test("completed: full outcome event last, status/phase transitions, lock released exactly once", async () => {
  const { deps, state } = makeDeps();
  const wf = pendingWorkflow((sink) => {
    sink.emit({ type: "workflow.started", runId: deps.run.runId, workflow: "feature", description: "add auth" });
    sink.emit({ type: "phase.started", runId: deps.run.runId, phase: "develop" });
  });
  const launched = launchRun(deps, wf.workflow);

  // While the workflow is pending the lock is held and the run reads live.
  assert.equal(state.releases, 0, "the lock stays acquired while the workflow is pending");
  assert.equal(deps.run.status, "running");
  assert.equal(deps.run.phase, "develop", "phase.started updates the current phase");
  assert.deepEqual(
    deps.run.events.map((e) => e.type),
    ["workflow.started", "phase.started"],
  );

  wf.resolve(completedOutcome);
  await launched;

  assert.equal(deps.run.status, "completed");
  assert.equal(state.releases, 1, "lock released exactly once");
  assert.deepEqual(state.runLog, deps.run.events, "the run log receives every event, in order");
  assert.deepEqual(state.history, deps.run.events, "pi-side history receives every event");
  assert.deepEqual(state.runLog.at(-1), {
    type: "workflow.outcome",
    runId: "run-test",
    status: "completed",
    summary: "auth added",
    files: ["src/auth.ts", "tests/auth.test.ts"],
    review: {
      verdict: "approved",
      summary: "clean",
      issues: [{ id: "R1", severity: "warning", category: "maintainability", problem: "long function" }],
    },
    usage: { planner: { input: 100, output: 20 }, developer: { input: 400, output: 80 } },
  });

  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0]!.level, "info");
  assert.match(state.notifications[0]!.message, /FEATURE COMPLETE \(automated review\) — 2 files changed/);
  assert.match(state.notifications[0]!.message, /total 500\/100/);
  assert.equal(state.bells, 1);
  assert.deepEqual(state.statusCalls, ["feature: develop", undefined]);
});

test("needs_human: reason and review on the outcome event, warning notification", async () => {
  const { deps, state } = makeDeps();
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);
  assert.equal(state.releases, 0, "the lock stays acquired while the workflow is pending");

  wf.resolve({
    status: "needs_human",
    reason: "verify failed after 3 attempts",
    review: { verdict: "needs_human", summary: "flaky suite", issues: [] },
    usage: { developer: { input: 10, output: 5 } },
  });
  await launched;

  assert.equal(deps.run.status, "needs_human");
  assert.equal(state.releases, 1);
  const outcome = outcomeOf(state.runLog);
  assert.equal(outcome.reason, "verify failed after 3 attempts");
  assert.equal("summary" in outcome, false);
  assert.equal("files" in outcome, false);
  assert.deepEqual(outcome.review, { verdict: "needs_human", summary: "flaky suite", issues: [] });
  assert.deepEqual(outcome.usage, { developer: { input: 10, output: 5 } });
  assert.deepEqual(state.notifications.map((n) => n.level), ["warning"]);
  assert.match(state.notifications[0]!.message, /NEEDS HUMAN — verify failed after 3 attempts/);
  assert.equal(state.bells, 1);
});

test("cancelled outcome: no reason/summary/files/review, lock released once", async () => {
  const { deps, state } = makeDeps();
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);
  assert.equal(state.releases, 0, "the lock stays acquired while the workflow is pending");

  wf.resolve({ status: "cancelled", at: "phase verify", usage: {} });
  await launched;

  assert.equal(deps.run.status, "cancelled");
  const outcome = outcomeOf(state.runLog);
  assert.equal(outcome.status, "cancelled");
  assert.equal("reason" in outcome, false);
  assert.equal("summary" in outcome, false);
  assert.equal("files" in outcome, false);
  assert.equal("review" in outcome, false);
  assert.deepEqual(outcome.usage, {});
  assert.deepEqual(state.notifications.map((n) => n.level), ["warning"]);
  assert.match(state.notifications[0]!.message, /cancelled at phase verify/);
  assert.equal(state.releases, 1);
});

test("UserDismissedError: run cancelled, workflow.failed last, no outcome, no bell", async () => {
  const { deps, state } = makeDeps();
  const wf = pendingWorkflow((sink) => {
    sink.emit({ type: "phase.started", runId: deps.run.runId, phase: "spec" });
  });
  const launched = launchRun(deps, wf.workflow);
  assert.equal(state.releases, 0, "the lock stays acquired while the workflow is pending");

  wf.reject(new UserDismissedError("select"));
  await launched;

  assert.equal(deps.run.status, "cancelled");
  assert.deepEqual(
    state.runLog.map((e) => e.type),
    ["phase.started", "workflow.failed"],
  );
  assert.deepEqual(state.runLog.at(-1), {
    type: "workflow.failed",
    runId: "run-test",
    error: "the user dismissed the select dialog",
  });
  assert.equal(state.bells, 0);
  assert.deepEqual(state.notifications, [
    { message: "pi-brain: the user dismissed the select dialog", level: "error" },
  ]);
  assert.equal(state.releases, 1);
  assert.deepEqual(state.statusCalls, ["feature: spec", undefined]);
});

test("a thrown workflow error fails the run: workflow.failed, error notification, lock released once", async () => {
  const { deps, state } = makeDeps();
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);
  assert.equal(state.releases, 0, "the lock stays acquired while the workflow is pending");

  wf.reject(new Error("agent runner exploded"));
  await launched;

  assert.equal(deps.run.status, "failed");
  assert.deepEqual(state.runLog.at(-1), {
    type: "workflow.failed",
    runId: "run-test",
    error: "agent runner exploded",
  });
  assert.deepEqual(state.notifications, [{ message: "pi-brain: agent runner exploded", level: "error" }]);
  assert.equal(state.bells, 0);
  assert.equal(state.releases, 1);
});

test("a synchronous throw from the workflow wiring is handled like a rejection", async () => {
  // The deps construction (agent runner, verifier, git service) runs inside
  // the launcher's body: blowing up there must not leak the lock either.
  const { deps, state } = makeDeps();
  const launched = launchRun(deps, () => {
    throw new Error("runtime creation failed");
  });
  await launched; // resolves — the failure is an event, not a rejection

  assert.equal(deps.run.status, "failed");
  assert.deepEqual(
    state.runLog.map((e) => e.type),
    ["workflow.failed"],
  );
  assert.equal(state.releases, 1);
});

test("a throwing pi-side history never stops the run log, the buffer, or the run", async () => {
  const { deps, state } = makeDeps({ historyThrows: true });
  const wf = pendingWorkflow((sink) => {
    sink.emit({ type: "workflow.started", runId: deps.run.runId, workflow: "feature" });
    sink.emit({ type: "phase.started", runId: deps.run.runId, phase: "develop" });
  });
  const launched = launchRun(deps, wf.workflow);

  wf.resolve(completedOutcome);
  await launched;

  assert.equal(state.history.length, 3, "history was invoked for every event before throwing");
  assert.equal(state.runLog.length, 3, "every event still reaches the run log");
  assert.deepEqual(state.runLog, deps.run.events);
  assert.equal(deps.run.status, "completed");
  assert.equal(state.releases, 1);
});

test("workflow.outcome carries the complete payload: optional issue fields, usage totals filled in", async () => {
  const { deps, state } = makeDeps();
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);

  wf.resolve({
    status: "completed",
    summary: "done",
    files: ["src/a.ts"],
    review: {
      verdict: "approved",
      summary: "two issues",
      issues: [
        {
          id: "R1",
          severity: "warning",
          category: "standards",
          problem: "naming",
          file: "src/a.ts",
          line: 7,
          recommendation: "rename",
        },
        { id: "R2", severity: "suggestion", category: "tests", problem: "no test" },
      ],
    },
    // `cost` never persists on the outcome event; only input/output do.
    usage: { planner: { input: 3, output: 4, cost: 0.01 }, reviewer: { input: 5, output: 6 } },
  });
  await launched;

  assert.deepEqual(state.runLog.at(-1), {
    type: "workflow.outcome",
    runId: "run-test",
    status: "completed",
    summary: "done",
    files: ["src/a.ts"],
    review: {
      verdict: "approved",
      summary: "two issues",
      issues: [
        {
          id: "R1",
          severity: "warning",
          category: "standards",
          problem: "naming",
          file: "src/a.ts",
          line: 7,
          recommendation: "rename",
        },
        { id: "R2", severity: "suggestion", category: "tests", problem: "no test" },
      ],
    },
    usage: { planner: { input: 3, output: 4 }, reviewer: { input: 5, output: 6 } },
  });
  assert.equal(state.releases, 1);
});

test("resume: workflow.resumed is the first new event, before the workflow re-enters", async () => {
  const { deps, state } = makeDeps();
  deps.run.phase = "fix #1"; // the extension seeds this from the replayed state
  const wf = pendingWorkflow((sink) => {
    sink.emit({ type: "phase.started", runId: deps.run.runId, phase: "verify" });
  });
  const launched = launchRun(deps, wf.workflow, { resumedPhase: "fix #1" });

  // The marker is in every sink — and on disk — before the workflow emitted
  // anything of its own: a crash right after launch still leaves the marker.
  assert.equal(state.history[0]?.type, "workflow.resumed");
  assert.deepEqual(
    state.runLog.map((e) => e.type),
    ["workflow.resumed", "phase.started"],
  );
  assert.deepEqual(state.runLog[0], { type: "workflow.resumed", runId: "run-test", phase: "fix #1" });
  assert.equal(deps.run.phase, "verify");
  assert.equal(state.releases, 0, "the lock stays acquired while the workflow is pending");

  wf.resolve({ status: "cancelled", at: "phase verify", usage: {} });
  await launched;

  assert.deepEqual(
    state.runLog.map((e) => e.type),
    ["workflow.resumed", "phase.started", "workflow.outcome"],
  );
  assert.equal(deps.run.status, "cancelled");
  assert.equal(state.releases, 1);
});

test("a throwing run-log callback on the resumed marker still releases the lock", async () => {
  // The resumed emission lives inside the run body's try/finally: a broken
  // audit-trail dep throwing on that first event must not leak the lock.
  // U8 guards the UI effects, not the audit trail: a broken persistence dep
  // still rejects loudly (it is neither a workflow error nor a UI effect) —
  // the finally runs either way.
  const { deps, state } = makeDeps({ runLogThrows: true });
  const launched = launchRun(deps, async () => completedOutcome, { resumedPhase: "develop" });

  await assert.rejects(launched, /run log broken/);
  assert.equal(state.releases, 1, "lock released exactly once despite the throwing log");
  assert.equal(deps.run.status, "failed");
  assert.equal(state.bells, 0);
  // The in-memory buffer still holds both events — /flow log's fallback
  // when the persisted log is unusable.
  assert.deepEqual(
    deps.run.events.map((e) => e.type),
    ["workflow.resumed", "workflow.failed"],
  );
});

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// -- U8 (F6): best-effort UI in the detached runner --------------------------
//
// A stale/removed Pi UI context can make notify, the terminal bell or the
// status line throw. Before U8 a throw after workflow.outcome fell into the
// failure handler, emitted a contradictory workflow.failed, and a second
// throw there became an unhandled rejection (the extension calls
// `void launchRun(...)`). UI effects are now best-effort: reported once on
// stderr, never changing the persisted outcome, never rejecting, never
// skipping the lock release. Workflow and persistence errors stay loud.

test("U8: a throwing outcome notify is best-effort — outcome persisted, no workflow.failed, resolves, lock released once, reported once", async () => {
  const { deps, state } = makeDeps({ notifyThrows: true });
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);

  wf.resolve(completedOutcome);
  const { stderr } = await captureStderr(() => launched);

  assert.equal(deps.run.status, "completed", "the UI failure does not change the persisted outcome");
  assert.deepEqual(
    state.runLog.map((e) => e.type),
    ["workflow.outcome"],
    "the log ends with workflow.outcome only — no contradictory workflow.failed after it",
  );
  assert.equal(state.releases, 1, "lock released exactly once");
  assert.equal(state.bells, 1, "a failed notify does not stop the bell");
  assert.equal(occurrences(stderr, " failed: "), 1, "the UI failure is reported to stderr exactly once");
});

test("U8: a throwing bell is best-effort — outcome persisted, resolves, lock released once, reported once", async () => {
  const { deps, state } = makeDeps({ bellThrows: true });
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);

  wf.resolve(completedOutcome);
  const { stderr } = await captureStderr(() => launched);

  assert.equal(deps.run.status, "completed");
  assert.deepEqual(state.runLog.map((e) => e.type), ["workflow.outcome"]);
  assert.equal(state.releases, 1);
  assert.equal(occurrences(stderr, " failed: "), 1);
});

test("U8: a throwing status clear is best-effort — outcome persisted, resolves, lock released once, reported once", async () => {
  // No phase.started, so setStatus is only invoked to clear the line at the
  // end: the report count is deterministic.
  const { deps, state } = makeDeps({ statusThrows: true });
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);

  wf.resolve(completedOutcome);
  const { stderr } = await captureStderr(() => launched);

  assert.equal(deps.run.status, "completed");
  assert.deepEqual(state.runLog.map((e) => e.type), ["workflow.outcome"]);
  assert.equal(state.releases, 1);
  assert.equal(occurrences(stderr, " failed: "), 1);
});

test("U8: a throwing status on phase.started does not derail the workflow or the persisted outcome", async () => {
  const { deps, state } = makeDeps({ statusThrows: true });
  const wf = pendingWorkflow((sink) => {
    sink.emit({ type: "workflow.started", runId: deps.run.runId, workflow: "feature" });
    sink.emit({ type: "phase.started", runId: deps.run.runId, phase: "develop" });
  });

  // The phase event fires synchronously at launch, so capture from there.
  await captureStderr(async () => {
    const launched = launchRun(deps, wf.workflow);
    assert.equal(deps.run.phase, "develop", "the phase still advances when the status UI throws");
    wf.resolve(completedOutcome);
    await launched;
  });

  assert.equal(deps.run.status, "completed");
  assert.deepEqual(
    state.runLog.map((e) => e.type),
    ["workflow.started", "phase.started", "workflow.outcome"],
  );
});

test("U8: a real workflow error stays loud — workflow.failed persisted, the error notify itself guarded", async () => {
  const { deps, state } = makeDeps({ notifyThrows: true });
  const wf = pendingWorkflow();
  const launched = launchRun(deps, wf.workflow);

  wf.reject(new Error("agent runner exploded"));
  const { stderr } = await captureStderr(() => launched);

  assert.equal(deps.run.status, "failed", "a workflow error is still classified as failed");
  assert.deepEqual(state.runLog.at(-1), {
    type: "workflow.failed",
    runId: "run-test",
    error: "agent runner exploded",
  });
  assert.equal(state.releases, 1);
  assert.equal(occurrences(stderr, " failed: "), 1, "the error notify failure is reported once, not rethrown");
});

test("U8: a persistence failure is not absorbed — a throwing run log rejects loudly and still releases the lock", async () => {
  const { deps, state } = makeDeps({ runLogThrows: true });
  const launched = launchRun(deps, async () => completedOutcome);

  await assert.rejects(launched, /run log broken/);
  assert.equal(state.releases, 1, "the lock is released even when the audit trail is broken");
});

test("U8: a throwing status during an agent event is best-effort (the runtime's onEvent path)", async () => {
  // /feature and /flow resume build their `onEvent` through `agentStatus`; the
  // runtime invokes it from its session listener DURING a run — outside the
  // launcher's own body, so the launcher's `safeUi` does not reach it.
  const attempted: Array<string | undefined> = [];
  const onEvent = agentStatus((text) => {
    attempted.push(text);
    throw new Error("stale pi status");
  });

  const { stderr } = await captureStderr(async () => {
    onEvent({ role: "developer", type: "tool", detail: "Read" });
    onEvent({ role: "reviewer", type: "agent_end" });
  });

  assert.deepEqual(attempted, ["developer: tool Read", "reviewer: agent_end"], "the status text is built for every event");
  assert.equal(occurrences(stderr, " failed: "), 2, "each broken status is reported once and never thrown");
});

test("U8: agentStatus passes a working status through unchanged", () => {
  const seen: Array<string | undefined> = [];
  const onEvent = agentStatus((text) => void seen.push(text));
  onEvent({ role: "planner", type: "agent_end" });
  assert.deepEqual(seen, ["planner: agent_end"]);
});
