/**
 * The reviewer's result tool is described as plain JSON schema in Pi-free code
 * and converted to TypeBox at the Pi boundary. If that conversion is wrong the
 * reviewer silently fails at runtime, so it is tested against the real schema.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Value } from "typebox/value";

import { toTypeBox, type JsonSchemaNode } from "../src/pi/json-schema.ts";
import { REVIEW_TOOL } from "../src/workflows/feature-prompts.ts";
import { validateReviewResult } from "../src/review.ts";

const schema = toTypeBox(REVIEW_TOOL.parameters as JsonSchemaNode);

test("a well-formed review passes both the TypeBox schema and our validator", () => {
  const payload = {
    verdict: "changes_requested",
    summary: "one blocking issue",
    issues: [
      {
        id: "R1",
        severity: "blocking",
        category: "bug",
        file: "src/a.ts",
        line: 12,
        problem: "off by one",
        recommendation: "use <=",
      },
    ],
  };

  assert.equal(Value.Check(schema, payload), true, "TypeBox must accept it");
  assert.equal(validateReviewResult(payload).ok, true, "our validator must accept it");
});

test("TypeBox rejects an invalid verdict, like the provider would", () => {
  assert.equal(Value.Check(schema, { verdict: "lgtm", summary: "x", issues: [] }), false);
});

test("optional issue fields may be omitted", () => {
  const minimal = {
    verdict: "approved",
    summary: "fine",
    issues: [{ id: "W1", severity: "warning", category: "tests", problem: "thin coverage" }],
  };
  assert.equal(Value.Check(schema, minimal), true);
});

test("unsupported schema types fail loudly instead of silently", () => {
  assert.throws(() => toTypeBox({ type: "null" } as JsonSchemaNode), /unsupported/);
  assert.throws(() => toTypeBox({ type: "array" } as JsonSchemaNode), /without items/);
});
