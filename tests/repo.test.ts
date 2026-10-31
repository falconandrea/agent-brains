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

test("the full manifest covers the same skill catalog as whole-directory setup", () => {
  assert.deepEqual(
    [...resolveProfile(PROFILES_DIR, "full").skills].sort(),
    [...realSkills()].sort(),
  );
});

test("the skills the role router insists on are actually installed", () => {
  const skills = realSkills();
  for (const required of ["code-review", "karpathy-guidelines", "grilling", "spec-and-tasks", "tdd"]) {
    assert.ok(skills.has(required), `${required} missing from .agents/skills/`);
  }
});

/** Every markdown file inside a skill directory (SKILL.md, references, evals). */
function* skillMarkdownFiles(): Generator<{ skill: string; file: string; content: string }> {
  for (const skill of realSkills()) {
    const stack = [join(SKILLS_DIR, skill)];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name.endsWith(".md")) {
          yield { skill, file: full, content: readFileSync(full, "utf8") };
        }
      }
    }
  }
}

test("each skill's frontmatter name matches its directory", () => {
  const mismatches: string[] = [];
  for (const skill of realSkills()) {
    const fm = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8").match(/^---\n(.*?)\n---/s)?.[1] ?? "";
    const name = fm.match(/^name:\s*(\S+)\s*$/m)?.[1];
    if (name !== skill) mismatches.push(`directory ${skill} declares name: ${name ?? "<none>"}`);
  }
  assert.deepEqual(mismatches, [], `frontmatter name must equal the directory name:\n${mismatches.join("\n")}`);
});

test("cross-skill references resolve relative to the skill, without project-local .agents paths", () => {
  const broken: string[] = [];
  const localPaths: string[] = [];
  for (const { skill, file, content } of skillMarkdownFiles()) {
    // Sibling/catalog references like `../<skill>/SKILL.md` (or `../../tdd/SKILL.md`
    // from a references/ subdirectory) must resolve from the file's own location.
    for (const m of content.matchAll(/(?:\.\.\/)+[a-z0-9-]+\/SKILL\.md/g)) {
      const target = join(dirname(file), m[0]!);
      if (!existsSync(target)) broken.push(`${skill}: ${m[0]} (from ${file}) does not exist`);
    }
    // Skills must not assume the consuming project contains `.agents/`.
    if (/\.agents\/(skills|workflows)\b/.test(content)) {
      localPaths.push(`${skill}: ${file} references a project-local .agents path`);
    }
  }
  assert.deepEqual(broken, [], `broken skill-relative references:\n${broken.join("\n")}`);
  assert.deepEqual(
    localPaths,
    [],
    `skills must reference other skills by name or relative to themselves, never via the consumer project's .agents tree:\n${localPaths.join("\n")}`,
  );
});

test("sibling references also resolve from the REAL skill directory behind a workflow link", () => {
  // Harnesses may load these skills through `.agents/workflows/<name>.md`
  // symlinks. The prescribed resolution is: realpath the skill first, then
  // walk `../<name>/SKILL.md` from the resolved directory. This pins that the
  // references do resolve there — they would NOT resolve from the link's own
  // directory, which is why every skill must prescribe symlink resolution.
  const workflowsDir = join(ROOT, ".agents", "workflows");
  const problems: string[] = [];
  for (const entry of readdirSync(workflowsDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink() || !entry.name.endsWith(".md")) continue;
    const realDir = dirname(realpathSync(join(workflowsDir, entry.name)));
    const content = readFileSync(realpathSync(join(workflowsDir, entry.name)), "utf8");
    for (const m of content.matchAll(/(?:\.\.\/)+[a-z0-9-]+\/SKILL\.md/g)) {
      if (!existsSync(join(realDir, m[0]!))) {
        problems.push(`${entry.name}: ${m[0]} does not resolve from the real directory ${realDir}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("every workflow link resolves to the matching skill's SKILL.md", () => {
  const workflowsDir = join(ROOT, ".agents", "workflows");
  const problems: string[] = [];
  for (const entry of readdirSync(workflowsDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink() || !entry.name.endsWith(".md")) {
      problems.push(`${entry.name}: workflows entries must be <name>.md symlinks`);
      continue;
    }
    const skill = entry.name.slice(0, -".md".length);
    const target = join(SKILLS_DIR, skill, "SKILL.md");
    try {
      if (realpathSync(join(workflowsDir, entry.name)) !== realpathSync(target)) {
        problems.push(`${entry.name}: does not resolve to ${target}`);
      }
    } catch {
      problems.push(`${entry.name}: broken symlink`);
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
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

test("the bootstrap installer cannot replace locally managed skills", () => {
  const installer = readFileSync(join(ROOT, "update-upstream-skills.sh"), "utf8");
  const selected = [...installer.matchAll(/--skill\s+([a-z][a-z0-9-]*)/g)].map((m) => m[1]!);
  for (const skill of selected) {
    assert.doesNotMatch(frontmatterOf(skill), /^ {2}management:\s*local$/m,
      `${skill} is locally authoritative and must not be reinstalled`);
  }
});

const README = readFileSync(join(ROOT, "README.md"), "utf8");

interface WorkflowRow {
  skill: string;
  pointer: string;
  link: string;
}

/** Workflow rows from the README table (skill | OpenCode pointer | workflow link). */
const readmeWorkflows = (): WorkflowRow[] => {
  const section = README.match(/## Workflow (?:agents|skills)[\s\S]*?(?=\n## )/)?.[0] ?? "";
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

test("the adopted skills grill-with-docs, research and to-spec carry provenance and stay out of the lock", () => {
  const lock = JSON.parse(readFileSync(join(ROOT, "skills-lock.json"), "utf8"));
  for (const skill of ["grill-with-docs", "research", "to-spec"]) {
    assert.ok(!(skill in lock.skills), `${skill} must not be upstream-lock-managed`);
    assert.ok(existsSync(join(SKILLS_DIR, skill, "LICENSE")), `${skill} must retain its upstream LICENSE`);
    const fm = frontmatterOf(skill);
    assert.match(fm, /^ {2}management:\s*local$/m);
    assert.match(fm, /^ {2}provenance:\s*adopted$/m);
    assert.match(fm, /^ {4}- repository:\s*https:\/\/github\.com\/mattpocock\/skills$/m);
    assert.match(fm, /^ {6}commit:\s*[0-9a-f]{40}$/m);
  }
});
