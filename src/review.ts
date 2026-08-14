/**
 * Structured reviewer output (spec §11.2).
 *
 * Pi has no JSON-schema response mode, so the reviewer is given a single
 * custom tool, `submit_review`, and told it MUST call it exactly once. The
 * typebox schema lives in `pi/review-tool.ts` (it imports Pi); the shape and
 * the runtime validation live here so they can be tested without Pi installed.
 */

export type Verdict = "approved" | "changes_requested" | "needs_human";
export type Severity = "blocking" | "warning" | "suggestion";
export type IssueCategory =
  | "spec"
  | "bug"
  | "security"
  | "performance"
  | "maintainability"
  | "tests"
  | "standards";

export interface ReviewIssue {
  id: string;
  severity: Severity;
  category: IssueCategory;
  file?: string;
  line?: number;
  problem: string;
  recommendation?: string;
}

export interface ReviewResult {
  verdict: Verdict;
  summary: string;
  issues: ReviewIssue[];
}

const VERDICTS: Verdict[] = ["approved", "changes_requested", "needs_human"];
const SEVERITIES: Severity[] = ["blocking", "warning", "suggestion"];
const CATEGORIES: IssueCategory[] = [
  "spec",
  "bug",
  "security",
  "performance",
  "maintainability",
  "tests",
  "standards",
];

export type ValidationResult =
  | { ok: true; value: ReviewResult }
  | { ok: false; errors: string[] };

export function validateReviewResult(input: unknown): ValidationResult {
  const errors: string[] = [];
  const raw = input as Partial<ReviewResult> | null;

  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["not an object"] };
  if (!VERDICTS.includes(raw.verdict as Verdict))
    errors.push(`verdict must be one of ${VERDICTS.join(" | ")}`);
  if (typeof raw.summary !== "string" || raw.summary.trim() === "")
    errors.push("summary must be a non-empty string");
  if (!Array.isArray(raw.issues)) errors.push("issues must be an array");

  const issues: ReviewIssue[] = [];
  if (Array.isArray(raw.issues)) {
    raw.issues.forEach((issue, i) => {
      const at = `issues[${i}]`;
      if (typeof issue !== "object" || issue === null) {
        errors.push(`${at} is not an object`);
        return;
      }
      const it = issue as Partial<ReviewIssue>;
      if (typeof it.id !== "string" || it.id === "") errors.push(`${at}.id missing`);
      if (!SEVERITIES.includes(it.severity as Severity)) errors.push(`${at}.severity invalid`);
      if (!CATEGORIES.includes(it.category as IssueCategory)) errors.push(`${at}.category invalid`);
      if (typeof it.problem !== "string" || it.problem.trim() === "")
        errors.push(`${at}.problem missing`);
      if (errors.length === 0) issues.push(it as ReviewIssue);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { verdict: raw.verdict!, summary: raw.summary!, issues } };
}

export const blockingIssues = (r: ReviewResult): ReviewIssue[] =>
  r.issues.filter((i) => i.severity === "blocking");

/**
 * Loop control (spec §5.3, §11 phase G). Returns the next action for the
 * developer <-> reviewer loop. Pure function: unit-tested with fake reviews.
 */
export type LoopDecision =
  | { action: "complete"; reason: string }
  | { action: "fix"; issues: ReviewIssue[] }
  | { action: "escalate"; reason: string };

export function decideNextRound(
  review: ReviewResult,
  round: number,
  maxRounds: number,
  previousBlockingIds: ReadonlySet<string>,
  diffChangedSinceLastRound: boolean,
): LoopDecision {
  if (review.verdict === "needs_human")
    return { action: "escalate", reason: "reviewer asked for a human decision" };

  const blocking = blockingIssues(review);
  if (review.verdict === "approved" || blocking.length === 0)
    return { action: "complete", reason: `approved on round ${round}` };

  if (round >= maxRounds)
    return { action: "escalate", reason: `max review rounds (${maxRounds}) reached` };

  const repeated = blocking.every((i) => previousBlockingIds.has(i.id));
  if (repeated && previousBlockingIds.size > 0 && !diffChangedSinceLastRound)
    return { action: "escalate", reason: "no progress: same blocking issues, no new changes" };

  return { action: "fix", issues: blocking };
}
