/**
 * Pi-free core of the planner's `ask_user_batch` tool (roadmap F0.1).
 *
 * `/feature` collects its open decisions in ONE numbered batch; the socratic
 * one-decision-at-a-time contract belongs to explicit grilling sessions only.
 * Everything here — schema, routing decision, rendering, payload validation —
 * is testable without Pi: only the thin `defineTool` wrapper stays in
 * `pi-agent-runner.ts`.
 */

import { Type } from "typebox";
import type { Role } from "../skill-router.ts";

/** Hard cap from the F0.1 contract: one batch carries at most six decisions. */
export const MAX_BATCH_QUESTIONS = 6;

export type RecommendedOption = "A" | "B" | "C";

export interface BatchQuestion {
  question: string;
  options: string[];
  recommendedOption: RecommendedOption;
  recommendationReason: string;
}

/**
 * The ask tool a child role receives. The planner gets the batch tool and
 * never the single-decision `ask_user`; every other role keeps `ask_user`
 * unchanged.
 */
export type AskToolKind = "ask_user_batch" | "ask_user";

export function askToolForRole(role: Role): AskToolKind {
  return role === "planner" ? "ask_user_batch" : "ask_user";
}

/**
 * TypeBox schema shipped to the model. The six-question limit is enforced
 * HERE (and again in `parseBatchQuestions`), never only in the prompt.
 */
export const ASK_USER_BATCH_PARAMETERS = Type.Object({
  questions: Type.Array(
    Type.Object({
      question: Type.String({ description: "The decision, phrased for a busy human." }),
      options: Type.Array(Type.String(), {
        minItems: 2,
        maxItems: 3,
        description: "2-3 concrete, mutually exclusive options.",
      }),
      recommendedOption: Type.Union([Type.Literal("A"), Type.Literal("B"), Type.Literal("C")], {
        description: "The letter of the recommended option: A, B or C.",
      }),
      recommendationReason: Type.String({
        minLength: 1,
        description: "A concise reason for recommending that option; never leave it empty.",
      }),
    }),
    { minItems: 1, maxItems: MAX_BATCH_QUESTIONS },
  ),
});

/**
 * Render the structured batch as ONE numbered message. The result is passed
 * to the existing child-question callback as `question` WITHOUT `options`,
 * so `PiHumanInput.askFromChild` always takes the freeform `input()` path —
 * including for a one-question batch, which must never fall back to select.
 */
export function renderBatchQuestions(questions: BatchQuestion[]): string {
  return questions
    .map((q, i) => {
      const options = q.options
        .map((o, j) => {
          const letter = String.fromCharCode(65 + j);
          return `   ${letter}. ${o}${letter === q.recommendedOption ? " ★" : ""}`;
        })
        .join("\n");
      return `${i + 1}. ${q.question}\n${options}\n   ↳ ${q.recommendationReason}`;
    })
    .join("\n");
}

/**
 * Placeholder shown in the freeform dialog (askFromChild uses `reason`).
 * Language-neutral: the prompt puts question and recommendation text in the
 * user's language, so the fixed chrome must not be English.
 */
export const BATCH_ANSWER_HINT = "1: A, 2: B";

export type BatchParseResult =
  | { ok: true; questions: BatchQuestion[] }
  | { ok: false; error: string };

/**
 * Hard runtime validation, mirroring the garbage checks of `ask_user`: a
 * malformed call bounces back to the child as a tool error instead of
 * reaching the user's screen as a garbage dialog.
 */
export function parseBatchQuestions(params: unknown): BatchParseResult {
  const raw = (params ?? {}) as { questions?: unknown };
  if (!Array.isArray(raw.questions)) {
    return { ok: false, error: "questions must be an array" };
  }
  const items = raw.questions;
  if (items.length < 1) {
    return { ok: false, error: "at least one decision is required" };
  }
  if (items.length > MAX_BATCH_QUESTIONS) {
    return { ok: false, error: `at most ${MAX_BATCH_QUESTIONS} decisions per call` };
  }

  const questions: BatchQuestion[] = [];
  for (const [i, entry] of items.entries()) {
    const item = (entry ?? {}) as Partial<BatchQuestion>;

    const question = typeof item.question === "string" ? item.question.trim() : "";
    if (!question || /^placeholder$/i.test(question)) {
      return { ok: false, error: `decision ${i + 1}: empty or placeholder question text` };
    }

    const options = Array.isArray(item.options)
      ? item.options.map((o) => String(o ?? "").trim())
      : [];
    if (options.length < 2 || options.length > 3) {
      return { ok: false, error: `decision ${i + 1}: provide 2-3 concrete options` };
    }
    if (options.some((o) => !o || /^[0-9.]+$/.test(o))) {
      return { ok: false, error: `decision ${i + 1}: options must be meaningful labels, not bare numbers` };
    }

    const recommendedOption =
      typeof item.recommendedOption === "string" ? item.recommendedOption.trim() : "";
    if (!/^[ABC]$/.test(recommendedOption)) {
      return { ok: false, error: `decision ${i + 1}: recommendedOption must be A, B or C` };
    }
    const recommendedIndex = recommendedOption.charCodeAt(0) - 65;
    if (recommendedIndex >= options.length) {
      return {
        ok: false,
        error: `decision ${i + 1}: ${recommendedOption} does not identify an existing option`,
      };
    }

    const recommendationReason =
      typeof item.recommendationReason === "string" ? item.recommendationReason.trim() : "";
    if (!recommendationReason) {
      return { ok: false, error: `decision ${i + 1}: recommendationReason must not be empty` };
    }

    questions.push({
      question,
      options,
      recommendedOption: recommendedOption as RecommendedOption,
      recommendationReason,
    });
  }
  return { ok: true, questions };
}
