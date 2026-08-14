/**
 * Tests that guard the repository itself: profile manifests must point at real
 * skills, and the git service must produce a diff a reviewer can trust.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { listProfiles, resolveProfile } from "../src/profiles.ts";
import { RealGitService } from "../src/shell.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(ROOT, "profiles");
const SKILLS_DIR = join(ROOT, ".agents", "skills");

/**
 * Plain `.md` files at the root of `.agents/skills/` are NOT Agent Skills and
 * Pi ignores them. These two are legacy OpenCode-era files still referenced by
 * profiles; convert them to `<name>/SKILL.md` to make them usable from Pi.
 */
const KNOWN_LOOSE_MD = new Set(["product-thinking", "designer"]);

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

// --- git --------------------------------------------------------------------

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-brain-git-"));
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir });
  run("init", "-q", "-b", "main");
  run("config", "user.email", "t@example.com");
  run("config", "user.name", "t");
  writeFileSync(join(dir, "existing.txt"), "one\n");
  run("add", ".");
  run("commit", "-qm", "base");
  return dir;
}

test("diffSince includes newly created files", async () => {
  const dir = initRepo();
  const git = new RealGitService();
  const baseline = await git.baseline(dir);

  // what a developer agent typically does: edit one file, create another
  writeFileSync(join(dir, "existing.txt"), "one\ntwo\n");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "new-model.ts"), "export const invitation = 1;\n");

  const { patch, files } = await git.diffSince(baseline);

  assert.ok(files.includes("existing.txt"));
  assert.ok(files.includes("src/new-model.ts"));
  assert.match(patch, /two/, "modified file must be in the patch");
  assert.match(patch, /invitation/, "NEW file must be in the patch, not just the file list");
});

test("diffSince ignores changes that were already there before the workflow", async () => {
  const dir = initRepo();
  writeFileSync(join(dir, "existing.txt"), "dirty before we started\n");

  const git = new RealGitService();
  const baseline = await git.baseline(dir);
  assert.deepEqual(baseline.preexistingChanges, ["existing.txt"]);

  writeFileSync(join(dir, "workflow.txt"), "written by the agent\n");
  const { files, patch } = await git.diffSince(baseline);

  assert.deepEqual(files, ["workflow.txt"]);
  assert.ok(!patch.includes("dirty before we started"));
});
