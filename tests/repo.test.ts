/**
 * Tests that guard the repository itself: profile manifests must point at real
 * skills, and the git service must produce a diff a reviewer can trust.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const frontmatterOf = (skill: string): string =>
  readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8").match(/^---\n(.*?)\n---/s)?.[1] ?? "";

test("a skill declaring metadata.management local is never in skills-lock.json", () => {
  // A lock-managed skill is replaceable by `npx skills`; a local-managed one
  // is authoritative here. The two states must never coexist for one skill.
  const lock = JSON.parse(readFileSync(join(ROOT, "skills-lock.json"), "utf8"));
  const locked = new Set(Object.keys(lock.skills));
  const localManaged = [...realSkills()].filter((skill) =>
    // Anchored under metadata's two-space indent: must not match prose
    // mentions of the same key elsewhere in the frontmatter.
    /^ {2}management:\s*local$/m.test(frontmatterOf(skill)),
  );

  assert.ok(localManaged.length > 0, "at least one local-managed skill must be declared");
  const conflicts = localManaged.filter((skill) => locked.has(skill));
  assert.deepEqual(
    conflicts,
    [],
    `locally managed skills must not appear in skills-lock.json:\n${conflicts.join("\n")}`,
  );
});

test("the adopted skills grill-with-docs and research carry provenance and stay out of the lock", () => {
  const lock = JSON.parse(readFileSync(join(ROOT, "skills-lock.json"), "utf8"));
  for (const skill of ["grill-with-docs", "research"]) {
    assert.ok(!(skill in lock.skills), `${skill} must not be upstream-lock-managed`);
    assert.ok(existsSync(join(SKILLS_DIR, skill, "LICENSE")), `${skill} must retain its upstream LICENSE`);
    const fm = frontmatterOf(skill);
    assert.match(fm, /^ {2}management:\s*local$/m);
    assert.match(fm, /^ {2}provenance:\s*adopted$/m);
    assert.match(fm, /^ {4}- repository:\s*https:\/\/github\.com\/mattpocock\/skills$/m);
    assert.match(fm, /^ {6}commit:\s*[0-9a-f]{40}$/m);
  }
});
