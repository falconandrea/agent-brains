import assert from "node:assert/strict";
import { test } from "node:test";
import { retryDelay } from "../src/retry.js";

test("doubles exponentially from the base", () => {
  assert.equal(retryDelay(0, 100), 100);
  assert.equal(retryDelay(3, 100), 800);
});
test("validates arguments", () => {
  assert.throws(() => retryDelay(-1), RangeError);
  assert.throws(() => retryDelay(0, 0), RangeError);
});
