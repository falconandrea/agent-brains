/**
 * U7 (F5): `/feature`'s ordered start sequence (`startRun`). The run lock is
 * acquired before the agent runtime and the audit log; a failed runtime
 * releases the lock exactly once and restores the inactive state; on success
 * the lock is handed to the launcher, which releases it when the run settles.
 * Every effect is a fake — no Pi session, no model, no filesystem.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  launchRun,
  startRun,
  type LauncherRunState,
  type StartRunDeps,
  type StartRunFailure,
} from "../src/run-launcher.ts";
import type { AcquireResult } from "../src/run-lock.ts";
import type { WorkflowEvent } from "../src/ports.ts";
import type { FeatureOutcome } from "../src/workflows/feature.ts";

interface FakeLog {
  append(event: WorkflowEvent): void;
}

type Hooks = StartRunDeps<LauncherRunState, "agents", FakeLog>;

/** A held lock that counts its releases, or a refusal, chosen by the test. */
function makeHooks(options: { lock?: AcquireResult; lockThrows?: Error; agentsError?: Error } = {}) {
  const state = {
    /** Effectful calls, in the order they happened. */
    order: [] as string[],
    activeCalls: [] as Array<LauncherRunState | null>,
    failures: [] as StartRunFailure[],
    releases: 0,
    launches: [] as Array<{ run: LauncherRunState; lock: { release(): void }; agents: "agents"; runLog: FakeLog }>,
  };
  const run: LauncherRunState = {
    runId: "run-start",
    workflow: "feature",
    phase: "starting",
    status: "running",
    events: [],
  };
  const runLog: FakeLog = { append: () => {} };
  const lock: AcquireResult = options.lock ?? {
    ok: true,
    release: () => {
      state.releases += 1;
    },
  };
  const deps: Hooks = {
    run,
    setActive: (next) => void state.activeCalls.push(next),
    acquireLock: () => {
      state.order.push("lock");
      if (options.lockThrows) throw options.lockThrows;
      return lock;
    },
    createAgents: async () => {
      state.order.push("agents");
      if (options.agentsError) throw options.agentsError;
      return "agents";
    },
    openRunLog: () => {
      state.order.push("log");
      return runLog;
    },
    onFailure: (failure) => void state.failures.push(failure),
    launch: (input) => {
      state.order.push("launch");
      state.launches.push(input);
    },
  };
  return { run, runLog, lock, state, deps };
}

const refusedLock: AcquireResult = {
  ok: false,
  reason: "held",
  heldBy: {
    pid: 4242,
    runId: "run-other",
    workflow: "feature",
    startedAt: "2026-10-17T10:00:00.000Z",
    repoRoot: "/repo",
  },
};

test("a refused lock creates neither the run log nor the runtime and never activates the run", async () => {
  const h = makeHooks({ lock: refusedLock });
  await startRun(h.deps);

  assert.deepEqual(h.state.order, ["lock"], "only the lock attempt ran — no runtime, no log");
  assert.deepEqual(h.state.activeCalls, [null], "the run is never published as active");
  assert.deepEqual(h.state.failures, [{ kind: "lock_refused", lock: refusedLock }]);
  assert.equal(h.state.releases, 0, "nothing was acquired, so nothing is released");
  assert.equal(h.state.launches.length, 0);
});

test("a lock acquisition error creates nothing either", async () => {
  const error = new Error("EACCES: permission denied, mkdir '/repo/.pi'");
  const h = makeHooks({ lockThrows: error });
  await startRun(h.deps);

  assert.deepEqual(h.state.order, ["lock"]);
  assert.deepEqual(h.state.activeCalls, [null]);
  assert.deepEqual(h.state.failures, [{ kind: "lock_error", error }]);
  assert.equal(h.state.releases, 0);
  assert.equal(h.state.launches.length, 0);
});

test("a failed runtime releases the lock exactly once and restores the inactive state", async () => {
  const error = new Error("no model runtime available");
  const h = makeHooks({ agentsError: error });
  await startRun(h.deps);

  assert.deepEqual(h.state.order, ["lock", "agents"], "the runtime is attempted, the log is not opened");
  assert.deepEqual(h.state.activeCalls, [h.run, null], "the run becomes active, then is restored");
  assert.equal(h.state.releases, 1, "the lock is released exactly once");
  assert.deepEqual(h.state.failures, [{ kind: "runtime_error", error }]);
  assert.equal(h.state.launches.length, 0);
});

test("a successful start opens the log last and hands the lock to the launcher without releasing it", async () => {
  const h = makeHooks();
  await startRun(h.deps);

  assert.deepEqual(
    h.state.order,
    ["lock", "agents", "log", "launch"],
    "the lock precedes every side effect; the log is opened last",
  );
  assert.deepEqual(h.state.activeCalls, [h.run], "the run stays active");
  assert.equal(h.state.releases, 0, "startRun never releases a handed-off lock");
  assert.equal(h.state.launches.length, 1);
  assert.deepEqual(h.state.launches[0], { run: h.run, lock: h.lock, agents: "agents", runLog: h.runLog });
});

test("the launcher holds the handed-off lock until the run settles and releases it exactly once", async () => {
  const h = makeHooks();
  let settle!: (outcome: FeatureOutcome) => void;
  const workflow = () => new Promise<FeatureOutcome>((resolve) => (settle = resolve));

  let launched: Promise<void> | undefined;
  const deps: Hooks = {
    ...h.deps,
    launch: (input) => {
      launched = launchRun(
        {
          run: input.run,
          runLog: input.runLog,
          history: () => {},
          setStatus: () => {},
          notify: () => {},
          bell: () => {},
          lock: input.lock,
        },
        workflow,
      );
    },
  };

  await startRun(deps);
  assert.ok(launched, "the launcher started");
  assert.equal(h.state.releases, 0, "the lock is held while the workflow is pending");

  settle({ status: "cancelled", at: "phase verify", usage: {} });
  await launched;
  assert.equal(h.state.releases, 1, "released exactly once, by the launcher — never by startRun");
});
