import { test } from "node:test";
import assert from "node:assert/strict";

import {
  blocksFeatureStart,
  decideFlowStop,
  requestFlowStop,
  type FlowRunStatus,
} from "../src/pi/flow-stop.ts";

test("running becomes cancelling and abort is requested once", () => {
  const run: { status: FlowRunStatus } = { status: "running" };
  let abortCalls = 0;

  const first = requestFlowStop(run, () => {
    abortCalls += 1;
  });
  const second = requestFlowStop(run, () => {
    abortCalls += 1;
  });

  assert.equal(first.action, "cancellation_requested");
  assert.equal(run.status, "cancelling");
  assert.equal(abortCalls, 1);
  assert.equal(second.action, "cancellation_in_progress");
});

test("cancelling blocks a new feature run", () => {
  assert.equal(blocksFeatureStart("cancelling"), true);
  assert.equal(blocksFeatureStart("running"), true);
  assert.equal(blocksFeatureStart("completed"), false);
});

test("terminal runs do not abort or change status", () => {
  for (const status of ["needs_human", "completed", "failed", "cancelled"] as const) {
    const run: { status: FlowRunStatus } = { status };
    let abortCalls = 0;

    const decision = requestFlowStop(run, () => {
      abortCalls += 1;
    });

    assert.equal(decision.action, "already_finished");
    assert.equal(run.status, status);
    assert.equal(abortCalls, 0);
  }
});

test("the pure stop decision covers a missing run", () => {
  assert.deepEqual(decideFlowStop(null), { action: "no_run" });
});
