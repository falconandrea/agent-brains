/**
 * Role x stack -> minimal skill set (spec §8.3, §31).
 *
 * The stack profile decides *what the project is*; the role policy decides
 * *which slice of it this agent needs*. Nothing here touches Pi — the result is
 * a list of skill names that `agent-runner` turns into a `skillsOverride`.
 */

import { resolveProfile } from "./profiles.ts";

export type Role = "planner" | "developer" | "reviewer" | "security-reviewer" | "tester";

interface RolePolicy {
  /** Always included, even if absent from the stack profile. */
  always: string[];
  /** Dropped from the resolved profile for this role. */
  deny: string[];
  /** Only for roles that must stay narrow: keep just these + `always`. */
  onlyStackSkills?: boolean;
}

/**
 * Skill names below must exist in .agents/skills/. Unknown names are dropped
 * with a diagnostic rather than failing the run.
 */
const ROLE_POLICIES: Record<Role, RolePolicy> = {
  planner: {
    always: ["feature", "grilling", "grill-with-docs", "to-spec", "product-thinking", "research"],
    deny: ["code-review", "simplify", "verification-before-completion"],
  },
  developer: {
    always: ["karpathy-guidelines", "verification-before-completion", "diagnosing-bugs", "tdd"],
    deny: ["feature", "setup", "start", "to-tickets", "to-spec", "handoff", "code-review"],
  },
  reviewer: {
    always: ["code-review", "karpathy-guidelines", "simplify"],
    deny: ["feature", "setup", "start", "grilling", "grill-with-docs", "to-spec", "to-tickets", "handoff"],
  },
  "security-reviewer": {
    always: ["code-review"],
    deny: [],
    onlyStackSkills: true,
  },
  tester: {
    always: ["tdd", "verification-before-completion", "test-master"],
    deny: ["feature", "setup", "start"],
  },
};

export interface SkillSelection {
  role: Role;
  profile: string;
  skills: string[];
  /** Names requested by policy but missing from the canonical store. */
  missing: string[];
}

export function selectSkills(
  profilesDir: string,
  profile: string,
  role: Role,
  availableSkills: ReadonlySet<string>,
): SkillSelection {
  const policy = ROLE_POLICIES[role];
  const fromProfile = resolveProfile(profilesDir, profile).skills;

  const denied = new Set(policy.deny);
  const base = policy.onlyStackSkills
    ? fromProfile.filter((s) => !resolveProfile(profilesDir, "common").skills.includes(s))
    : fromProfile;

  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const skill of [...policy.always, ...base]) {
    if (denied.has(skill) || seen.has(skill)) continue;
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
