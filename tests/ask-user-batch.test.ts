/**
 * F0.1 contract tests: the planner's `ask_user_batch` tool. The module under
 * test (src/pi/ask-user-batch.ts) is Pi-free; PiHumanInput is exercised with
 * a fake ctx, same rule as human-input.test.ts. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ASK_USER_BATCH_PARAMETERS,
  BATCH_ANSWER_HINT,
  MAX_BATCH_QUESTIONS,
  askToolForRole,
  parseBatchQuestions,
  renderBatchQuestions,
  type BatchQuestion,
} from "../src/pi/ask-user-batch.ts";
import { PiHumanInput } from "../src/pi/human-input.ts";
import { PLANNER_PROMPT } from "../src/workflows/feature-prompts.ts";
import type { ProjectStack } from "../src/stack.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

interface Call {
  method: "select" | "input";
  args: unknown[];
}

function fakeCtx() {
  const calls: Call[] = [];
  const ctx = {
    hasUI: true,
    ui: {
      select: async (title: string, options: string[]) => {
        calls.push({ method: "select", args: [title, options] });
        return options[0];
      },
      input: async (title: string, placeholder?: string) => {
        calls.push({ method: "input", args: [title, placeholder] });
        return "1: A, 2: B";
      },
      confirm: async () => true,
      editor: async (_t: string, c: string) => c,
      notify: () => undefined,
      setStatus: () => undefined,
    },
  };
  return { ctx: ctx as unknown as ExtensionContext, calls };
}

const question = (over: Partial<BatchQuestion> = {}): BatchQuestion => ({
  question: "Which cache backend?",
  options: ["Redis", "In-memory"],
  recommendation: "In-memory — no new dependency",
  ...over,
});

// --- schema: the hard limits live in the TypeBox schema ----------------------

test("the batch schema enforces 1-6 questions and 2-3 options per question", () => {
  const questions = ASK_USER_BATCH_PARAMETERS.properties.questions as {
    minItems?: number;
    maxItems?: number;
    items: {
      required?: string[];
      properties: {
        options: { minItems?: number; maxItems?: number };
        question: { type: string };
        recommendation: { type: string };
      };
    };
  };
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, MAX_BATCH_QUESTIONS);
  assert.equal(questions.items.properties.options.minItems, 2);
  assert.equal(questions.items.properties.options.maxItems, 3);
  for (const field of ["question", "options", "recommendation"]) {
    assert.ok(
      questions.items.required?.includes(field),
      `${field} is required on every question`,
    );
  }
});

test("parseBatchQuestions rejects more than six questions", () => {
  const seven = { questions: Array.from({ length: 7 }, () => question()) };
  const result = parseBatchQuestions(seven);
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : "", /at most 6/);

  const six = parseBatchQuestions({ questions: Array.from({ length: 6 }, () => question()) });
  assert.equal(six.ok, true);
});

test("parseBatchQuestions rejects empty batches and malformed decisions", () => {
  assert.equal(parseBatchQuestions({ questions: [] }).ok, false);
  assert.equal(parseBatchQuestions({}).ok, false);
  assert.equal(parseBatchQuestions(null).ok, false);
  assert.equal(parseBatchQuestions({ questions: [question({ question: "  " })] }).ok, false);
  assert.equal(parseBatchQuestions({ questions: [question({ options: ["A"] })] }).ok, false);
  assert.equal(
    parseBatchQuestions({ questions: [question({ options: ["1", "2"] })] }).ok,
    false,
    "bare-number options are a schema-filling mistake",
  );
  assert.equal(parseBatchQuestions({ questions: [question({ recommendation: "" })] }).ok, false);
});

// --- tool routing ------------------------------------------------------------

test("only the planner gets ask_user_batch; every other role keeps ask_user", () => {
  assert.equal(askToolForRole("planner"), "ask_user_batch");
  for (const role of ["developer", "reviewer", "security-reviewer", "tester"] as const) {
    assert.equal(askToolForRole(role), "ask_user", `${role} keeps the single-decision tool`);
  }
});

// --- rendering ---------------------------------------------------------------

test("renderBatchQuestions produces one numbered list with options and recommendations", () => {
  const rendered = renderBatchQuestions([
    question(),
    question({ question: "Dark mode at launch?", options: ["Yes", "No", "Later"] }),
  ]);
  assert.match(rendered, /^1\. Which cache backend\?$/m);
  assert.match(rendered, /^   A\. Redis$/m);
  assert.match(rendered, /^   B\. In-memory$/m);
  assert.match(rendered, /^   ★ In-memory — no new dependency$/m);
  assert.match(rendered, /^2\. Dark mode at launch\?$/m);
  assert.match(rendered, /^   C\. Later$/m);
});

test("batch chrome is language-neutral: no fixed English labels reach the dialog", () => {
  const rendered = renderBatchQuestions([question(), question({ question: "Auth provider?" })]);
  assert.ok(!/Recommended:/.test(rendered), "no English label for the recommendation");
  assert.equal(BATCH_ANSWER_HINT, "1: A, 2: B", "the placeholder is just the answer format");
});

// --- live rendering: one freeform dialog per batch ---------------------------

test("a batch reaches the user as exactly one freeform input dialog", async () => {
  const { ctx, calls } = fakeCtx();
  const human = new PiHumanInput(() => ctx);
  const rendered = renderBatchQuestions([question(), question({ question: "Auth provider?" })]);

  // Exactly what #buildAskUserBatchTool forwards: question WITHOUT options.
  const answer = await human.askFromChild({ question: rendered });

  assert.equal(answer, "1: A, 2: B");
  assert.equal(calls.length, 1, "one dialog for the whole batch");
  assert.equal(calls[0]!.method, "input", "never a select");
  const title = (calls[0]!.args as [string])[0];
  assert.ok(title.includes("1. Which cache backend?"), "first decision inlined");
  assert.ok(title.includes("2. Auth provider?"), "second decision inlined");
});

test("a one-question batch uses the same freeform path, never select", async () => {
  const { ctx, calls } = fakeCtx();
  const human = new PiHumanInput(() => ctx);
  const rendered = renderBatchQuestions([question()]);

  await human.askFromChild({ question: rendered });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "input", "one-question batches stay freeform");
});

// --- deferred mode: one queue entry per batch --------------------------------

test("a batch queues exactly one deferred entry containing the whole list", async () => {
  const { ctx } = fakeCtx();
  const human = new PiHumanInput(() => ctx, "deferred");
  const rendered = renderBatchQuestions([question(), question({ question: "Auth provider?" })]);

  assert.equal(await human.askFromChild({ question: rendered }), null);
  const queued = human.takeDeferred();
  assert.equal(queued.length, 1, "one entry per batch, not per decision");
  assert.ok(queued[0]!.question.includes("1. Which cache backend?"));
  assert.ok(queued[0]!.question.includes("2. Auth provider?"));
  assert.equal(queued[0]!.options, undefined, "no options: cannot become a select");
});

// --- the planner prompt declares the same contract ---------------------------

const stack: ProjectStack = {
  primary: "nodejs",
  frameworks: [],
  languages: [],
  packageManagers: [],
  capabilities: [],
  confidence: 1,
  evidence: [],
};

test("the planner prompt prescribes batching and assumption fallback, not sequential asks", () => {
  const prompt = PLANNER_PROMPT({ description: "do the thing", stack });
  assert.ok(prompt.includes("ask_user_batch"), "names the batch tool");
  assert.match(prompt, /at most six decisions/, "hard limit declared");
  assert.match(prompt, /ONE exceptional second ask_user_batch call/, "one exceptional retry");
  assert.match(prompt, /NEVER fall back to question-by-question follow-ups/, "no sequential loop");
  assert.match(prompt, /assumption you\s+must list in the PRD's Assumptions/, "unclear answers become assumptions");
  assert.doesNotMatch(prompt, /\bask_user\b/, "the planner is never pointed at the single-decision tool");
});
