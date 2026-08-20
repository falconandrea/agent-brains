/**
 * PiHumanInput dialog behavior. The SDK import inside human-input.ts is
 * type-only, so these run without Pi at runtime — same Pi-free rule as the
 * rest of tests/. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PiHumanInput } from "../src/pi/human-input.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

interface Call {
  method: "confirm" | "select" | "input";
  args: unknown[];
}

function fakeCtx(ui: Partial<ExtensionContext["ui"]> = {}) {
  const calls: Call[] = [];
  const ctx = {
    hasUI: true,
    ui: {
      confirm: async (title: string, message: string) => {
        calls.push({ method: "confirm", args: [title, message] });
        return true;
      },
      select: async (title: string, options: string[]) => {
        calls.push({ method: "select", args: [title, options] });
        return options[0];
      },
      input: async (title: string, placeholder?: string) => {
        calls.push({ method: "input", args: [title, placeholder] });
        return "1: A, 2: B";
      },
      editor: async (_title: string, content: string) => content,
      notify: () => undefined,
      setStatus: () => undefined,
      ...ui,
    },
  };
  return { ctx: ctx as unknown as ExtensionContext, calls };
}

// --- ask_user routing -------------------------------------------------------

test("askFromChild uses single-pick select for up to 3 options", async () => {
  const { ctx, calls } = fakeCtx();
  const human = new PiHumanInput(() => ctx);
  const answer = await human.askFromChild({
    question: "Switch config.yaml to playwright?",
    options: ["Yes", "No"],
  });
  assert.equal(answer, "Yes");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "select");
  const [, options] = calls[0]!.args as [string, string[]];
  assert.deepEqual(options, ["Yes", "No", "Other — type your answer"]);
});

test("picking the freeform escape in a select opens a chained input that reaches the child", async () => {
  const { ctx, calls } = fakeCtx({
    select: async (_title: string, options: string[]) => {
      calls.push({ method: "select", args: [_title, options] });
      return options.at(-1); // the user picks "Other — type your answer"
    },
  });
  const human = new PiHumanInput(() => ctx);

  const answer = await human.askFromChild({
    question: "Switch config.yaml to playwright?",
    options: ["Yes", "No"],
  });

  assert.equal(answer, "1: A, 2: B", "the typed answer is what the child receives");
  assert.deepEqual(
    calls.map((c) => c.method),
    ["select", "input"],
    "the input opens only after the select resolves, through the dialog lock",
  );
});

test("askFromChild routes option batches larger than 3 to freeform input", async () => {
  const { ctx, calls } = fakeCtx();
  const human = new PiHumanInput(() => ctx);
  const options = ["2A — reuse SerpApi pattern", "2B — skip", "3A — pure parser", "3B — live browser"];
  const answer = await human.askFromChild({ question: "Decisions Q2–Q3:", options });

  assert.equal(answer, "1: A, 2: B");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "input");
  const [title, placeholder] = calls[0]!.args as [string, string | undefined];
  assert.ok(title.includes("Decisions Q2–Q3:"), "question text kept");
  for (const option of options) {
    assert.ok(title.includes(option), `option inlined: ${option}`);
  }
  assert.match(placeholder ?? "", /1: A/);
});

test("askFromChild without options is a plain input", async () => {
  const { ctx, calls } = fakeCtx();
  const human = new PiHumanInput(() => ctx);
  const answer = await human.askFromChild({ question: "Budget?", reason: "affects provider choice" });
  assert.equal(answer, "1: A, 2: B");
  assert.equal(calls[0]!.method, "input");
  assert.equal((calls[0]!.args as [string, string?])[1], "affects provider choice");
});

test("a dismissed dialog resolves to null instead of killing the child run", async () => {
  const { ctx } = fakeCtx({ input: async () => undefined });
  const human = new PiHumanInput(() => ctx);
  assert.equal(await human.askFromChild({ question: "Anything?" }), null);
});

test("deferred mode queues the question and answers null", async () => {
  const { ctx } = fakeCtx();
  const human = new PiHumanInput(() => ctx, "deferred");
  assert.equal(await human.askFromChild({ question: "Q?" }), null);
  const queued = human.takeDeferred();
  assert.equal(queued.length, 1);
  assert.equal(queued[0]!.question, "Q?");
});

// --- dialog serialization ---------------------------------------------------

test("a second dialog starts only after the first resolves", async () => {
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const { ctx } = fakeCtx({
    input: async () => {
      order.push("input:start");
      await firstGate;
      order.push("input:end");
      return "a";
    },
    select: async () => {
      order.push("select:start");
      return "x";
    },
  });
  const human = new PiHumanInput(() => ctx);

  const first = human.input({ message: "q1" });
  const second = human.select({ message: "q2", options: [{ label: "x", value: "x" }] });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(order, ["input:start"], "select must not open while input is pending");
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["input:start", "input:end", "select:start"]);
});

test("a rejected dialog does not poison the chain", async () => {
  const { ctx, calls } = fakeCtx({
    select: async () => {
      throw new Error("tui exploded");
    },
  });
  const human = new PiHumanInput(() => ctx);

  await assert.rejects(
    () => human.select({ message: "boom", options: [{ label: "x", value: "x" }] }),
    /tui exploded/,
  );
  const answer = await human.input({ message: "after" });
  assert.equal(answer, "1: A, 2: B");
  assert.deepEqual(
    calls.map((c) => c.method),
    ["input"],
  );
});
