/**
 * Tests that guard the repository itself: profile manifests must point at real
 * skills, and the git service must produce a diff a reviewer can trust.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { listProfiles, resolveProfile } from "../src/profiles.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(ROOT, "profiles");
const SKILLS_DIR = join(ROOT, ".agents", "skills");

/**
 * Plain `.md` files at the root of `.agents/skills/` are NOT Agent Skills — Pi
 * ignores them. There are none left; keep this empty so a new one fails the test.
 */
const KNOWN_LOOSE_MD = new Set<string>();

const realSkills = (): Set<string> =>
  new Set(
    readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(
        (d) =>
          (d.isDirectory() || d.isSymbolicLink()) &&
          existsSync(join(SKILLS_DIR, d.name, "SKILL.md")),
      )
      .map((d) => d.name),
  );

test("every profile entry points at a real skill directory", () => {
  const skills = realSkills();
  const broken: string[] = [];

  for (const profile of listProfiles(PROFILES_DIR)) {
    for (const skill of resolveProfile(PROFILES_DIR, profile).skills) {
      if (!skills.has(skill) && !KNOWN_LOOSE_MD.has(skill)) broken.push(`${profile}: ${skill}`);
    }
  }

  assert.deepEqual(broken, [], `profiles reference skills that do not exist:\n${broken.join("\n")}`);
});

test("the skills the role router insists on are actually installed", () => {
  const skills = realSkills();
  for (const required of ["code-review", "karpathy-guidelines", "grilling", "feature", "tdd"]) {
    assert.ok(skills.has(required), `${required} missing from .agents/skills/`);
  }
});
