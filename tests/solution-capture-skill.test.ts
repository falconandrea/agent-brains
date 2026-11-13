/** W1 promotion guardrails for capture, retrieval, scaffold, and maintenance. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { listProfiles, resolveProfile } from "../src/profiles.ts";
import { selectSkills } from "../src/skill-router.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(ROOT, "profiles");
const SKILL_DIR = join(ROOT, ".agents", "skills", "solution-capture");

test("solution-capture is a stable explicit-only local skill", () => {
  assert.ok(existsSync(join(SKILL_DIR, "SKILL.md")));
  assert.equal(
    readFileSync(join(SKILL_DIR, "agents", "openai.yaml"), "utf8"),
    "policy:\n  allow_implicit_invocation: false\n",
  );

  const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  assert.match(skill, /^name:\s*solution-capture$/m);
  assert.match(skill, /^ {2}management:\s*local$/m);
  assert.match(skill, /^ {2}opencode\/autoinvoke:\s*false$/m);
  assert.ok(!existsSync(join(ROOT, "extra", "skills", "solution-capture", "SKILL.md")));
});

test("solution-capture is distributed without implicit workflow routing", () => {
  // RV3 review P2: the former textual pin ("the name must not appear in
  // skill-router.ts") did not guarantee exclusion — the craft fallback
  // routed the skill into four pipeline roles while the text check passed.
  // The requirement is unchanged; the guarantee is now behavioral (see the
  // routing test below) instead of a file-text comparison.
  const common = readFileSync(join(ROOT, "profiles", "common.list"), "utf8");
  const full = readFileSync(join(ROOT, "profiles", "full.list"), "utf8");
  assert.match(common, /^solution-capture$/m);
  assert.match(full, /^solution-capture$/m);
});

test("solution-capture never reaches a pipeline role in any profile", () => {
  // Behavioral guarantee: the skill is an explicit-only, approval-gated
  // workflow that ends in memory writes. Tool permissions bound what a child
  // could do, but only the ROUTING decision resolves the incompatibility.
  // The main session keeps it through common for explicit invocation.
  for (const profile of listProfiles(PROFILES_DIR)) {
    const available = new Set(resolveProfile(PROFILES_DIR, profile).skills);
    for (const role of ["planner", "developer", "reviewer", "security-reviewer", "tester"] as const) {
      const selection = selectSkills(PROFILES_DIR, profile, role, available);
      assert.ok(
        !selection.skills.includes("solution-capture"),
        `solution-capture must not reach ${profile}/${role}`,
      );
      assert.ok(!selection.missing.includes("solution-capture"));
    }
  }
  assert.ok(
    resolveProfile(PROFILES_DIR, "common").skills.includes("solution-capture"),
    "the main session keeps solution-capture through common",
  );
});

test("solution memory is scaffolded and progressively retrieved", () => {
  const template = join(ROOT, "templates", ".ai", "memory", "solutions", "_TEMPLATE.md");
  assert.ok(existsSync(template));
  assert.match(readFileSync(template, "utf8"), /^## Root cause \(verified\)$/m);
  assert.match(readFileSync(join(ROOT, "scaffold.sh"), "utf8"), /memory\/solutions\/_TEMPLATE\.md/);

  for (const workflow of ["spec-and-tasks", "diagnosing-bugs"]) {
    const skill = readFileSync(join(ROOT, ".agents", "skills", workflow, "SKILL.md"), "utf8");
    assert.match(skill, /\.ai\/memory\/solutions\//);
    assert.match(skill, /targeted `rg`/);
  }

  const gardener = readFileSync(
    join(ROOT, ".agents", "skills", "lessons-gardener", "SKILL.md"),
    "utf8",
  );
  assert.match(gardener, /BROKEN REFS/);
  assert.match(gardener, /DUPLICATE SOLUTIONS/);
  assert.match(gardener, /older than 180 days/);
});
