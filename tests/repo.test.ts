/**
 * Tests that guard the repository itself: profile manifests must point at real
 * skills, and the git service must produce a diff a reviewer can trust.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
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

const README = readFileSync(join(ROOT, "README.md"), "utf8");

interface WorkflowRow {
  skill: string;
  pointer: string;
  link: string;
}

/** Workflow rows from the README table (skill | OpenCode pointer | workflow link). */
const readmeWorkflows = (): WorkflowRow[] => {
  const section = README.match(/## Workflow agents[\s\S]*?(?=\n## )/)?.[0] ?? "";
  return [...section.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|$/gm)].map((m) => ({
    skill: m[1]!,
    pointer: m[2]!,
    link: m[3]!,
  }));
};

test("every workflow in the README table has an OpenCode pointer and a resolved workflow link", () => {
  const workflows = readmeWorkflows();
  assert.ok(workflows.length > 0, "README workflow table not found");

  const problems: string[] = [];
  for (const { skill, pointer, link } of workflows) {
    if (pointer !== `.opencode/agents/${skill}.md`) {
      problems.push(`${skill}: pointer must be .opencode/agents/${skill}.md (found ${pointer})`);
    }
    if (link !== `.agents/workflows/${skill}.md`) {
      problems.push(`${skill}: link must be .agents/workflows/${skill}.md (found ${link})`);
    }

    const pointerPath = join(ROOT, pointer);
    if (!existsSync(pointerPath)) {
      problems.push(`${skill}: missing OpenCode pointer ${pointer}`);
    } else if (!readFileSync(pointerPath, "utf8").includes(link)) {
      problems.push(`${skill}: ${pointer} does not reference ${link}`);
    }

    const linkPath = join(ROOT, link);
    const target = join(SKILLS_DIR, skill, "SKILL.md");
    try {
      if (realpathSync(linkPath) !== realpathSync(target)) {
        problems.push(`${skill}: ${link} does not resolve to ${target}`);
      }
    } catch {
      problems.push(`${skill}: broken or missing workflow link ${link}`);
    }
  }

  assert.deepEqual(problems, [], problems.join("\n"));
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
