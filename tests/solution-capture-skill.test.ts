/** W1 promotion guardrails for capture, retrieval, scaffold, and maintenance. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
  const common = readFileSync(join(ROOT, "profiles", "common.list"), "utf8");
  const full = readFileSync(join(ROOT, "profiles", "full.list"), "utf8");
  assert.match(common, /^solution-capture$/m);
  assert.match(full, /^solution-capture$/m);
  assert.ok(!readFileSync(join(ROOT, "src", "skill-router.ts"), "utf8").includes("solution-capture"));
});

test("solution memory is scaffolded and progressively retrieved", () => {
  const template = join(ROOT, "templates", ".ai", "memory", "solutions", "_TEMPLATE.md");
  assert.ok(existsSync(template));
  assert.match(readFileSync(template, "utf8"), /^## Root cause \(verified\)$/m);
  assert.match(readFileSync(join(ROOT, "scaffold.sh"), "utf8"), /memory\/solutions\/_TEMPLATE\.md/);

  for (const workflow of ["feature", "diagnosing-bugs"]) {
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
