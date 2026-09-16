import { test } from "node:test";
import assert from "node:assert/strict";

import { humanInputToolForRequest } from "../src/pi/human-input-policy.ts";

test("normal planner requests receive only ask_user_batch", () => {
  assert.equal(humanInputToolForRequest({ role: "planner" }), "ask_user_batch");
});

test("revision planner requests receive no human-question tool", () => {
  assert.equal(humanInputToolForRequest({ role: "planner", allowHumanInput: false }), null);
});
