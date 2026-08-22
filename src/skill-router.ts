/**
 * Role x stack -> minimal skill set (spec §8.3, §31).
 *
 * The stack profile decides *what the project is*; the role policy decides
 * *which slice of it this agent needs*. Nothing here touches Pi — the result is
 * a list of skill names that `agent-runner` turns into a `skillsOverride`.
 *
 * Routing model (2026-08-21 refactor): every skill belongs to one CATEGORY
 * (the table below — the single place that says what a skill IS), and every
 * role admits a set of categories. A skill reaches a role only when
 * (a) its category is admitted AND (b) the stack profile contains it.
 * `always` lists are gone: the profile stays the only source of skills, the
 * role is only a filter. Operational/session skills (handoff, start, …)
 * belong to the main session and are excluded from every pipeline role.
 */

import { resolveProfile } from "./profiles.ts";

export type Role = "planner" | "developer" | "reviewer" | "security-reviewer" | "tester";

/**
 * Skill taxonomy. One category per skill; unknown skills default to "craft"
 * so new stack-technical skills flow to every role without editing the table
 * (deliberately permissive for TECHNICAL skills only — the explicit entries
 * exist to pin the process/operational ones).
 */
export type SkillCategory =
  | "planning" // spec/PRD/requirement shaping
  | "review" // judging existing code or plans
  | "testing" // test-writing disciplines
  | "debugging" // fault isolation and diagnosis
  | "craft" // engineering judgement that improves any code being written
  | "operational" // main-session workflow management (never for pipeline roles)
  | "stack"; // domain/technical knowledge of a specific stack

const SKILL_CATEGORIES: Record<string, SkillCategory> = {
  // planning
  feature: "planning",
  grilling: "planning",
  "grill-with-docs": "planning",
  "to-spec": "planning",
  "product-thinking": "planning",
  prototype: "planning",
  // review
  "code-review": "review",
  simplify: "review",
  "security-reviewer": "review",
  "web-design-guidelines": "review",
  "review-animations": "review",
  // testing
  tdd: "testing",
  "test-master": "testing",
  "pest-testing": "testing",
  "webapp-testing": "testing",
  // debugging
  "diagnosing-bugs": "debugging",
  // craft
  "karpathy-guidelines": "craft",
  "verification-before-completion": "craft",
  research: "craft",
  // UI/design — stack-shaped knowledge, not universal craft: without an
  // explicit entry they would default to "craft" and reach backend projects
  // too, where they are noise.
  designer: "stack",
  "frontend-design": "stack",
  "ui-ux-pro-max": "stack",
  "tailwind-design-system": "stack",
  "emil-design-eng": "stack",
  "improve-animations": "stack",
  "pagespeed-optimizer": "stack",
  "tailwindcss-development": "stack",
  // operational
  start: "operational",
  handoff: "operational",
  "lessons-gardener": "operational",
  "to-tickets": "operational",
  "long-horizon-brief": "operational",
  "improve-codebase-architecture": "operational",
  "i-have-adhd": "operational",
  "find-skills": "operational",
  setup: "operational", // greenfield bootstrap drives a whole session, not a pipeline child
};

/**
 * Categories each role admits. A role NEVER sees "operational" — those skills
 * manage a conversational session, and pipeline children are one-shot runs.
 */
const ROLE_CATEGORIES: Record<Role, SkillCategory[]> = {
  planner: ["planning", "craft", "stack"],
  developer: ["testing", "debugging", "craft", "stack"],
  reviewer: ["review", "craft", "stack"],
  "security-reviewer": ["review", "stack"],
  tester: ["testing", "debugging", "stack"],
};

function categoryOf(skill: string): SkillCategory {
  return SKILL_CATEGORIES[skill] ?? "craft";
}

export interface SkillSelection {
  role: Role;
  profile: string;
  skills: string[];
  /** Names routed to this role but missing from the canonical store. */
  missing: string[];
}

export function selectSkills(
  profilesDir: string,
  profile: string,
  role: Role,
  availableSkills: ReadonlySet<string>,
): SkillSelection {
  const admitted = new Set<SkillCategory>(ROLE_CATEGORIES[role]);
  const fromProfile = resolveProfile(profilesDir, profile).skills;

  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const skill of fromProfile) {
    if (seen.has(skill)) continue;
    if (!admitted.has(categoryOf(skill))) continue;
    seen.add(skill);
    wanted.push(skill);
  }

  return {
    role,
    profile,
    skills: wanted.filter((s) => availableSkills.has(s)),
    missing: wanted.filter((s) => !availableSkills.has(s)),
  };
}
