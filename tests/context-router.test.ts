/**
 * ContextRouter (spec §31): the point is what it does NOT load.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectAspects, routeContext } from "../src/context-router.ts";
import type { ProjectStack } from "../src/stack.ts";

const STACK: ProjectStack = {
  primary: "laravel",
  frameworks: ["laravel"],
  languages: ["php"],
  packageManagers: ["composer"],
  capabilities: [],
  confidence: 1,
  evidence: [],
};

/** A project with the full .ai/ tree, so every test can check what is skipped. */
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-brain-ctx-"));
  mkdirSync(join(dir, ".ai", "context", "adr"), { recursive: true });
  mkdirSync(join(dir, ".ai", "memory"), { recursive: true });

  const write = (rel: string, body: string) => writeFileSync(join(dir, rel), body);
  write("AGENTS.md", "# agents");
  write(".ai/context/TECH_STACK.md", "laravel 12");
  write(".ai/memory/lessons.md", "lesson one");
  write(".ai/context/DESIGN_SYSTEM.md", "tokens");
  write(".ai/context/APP_FLOW.md", "flows");
  write(".ai/context/database_schema.mmd", "erDiagram");
  write(".ai/context/ROADMAP.md", "someday");
  write(".ai/context/PRD.md", "product");
  write(".ai/context/adr/0001-invitations-storage.md", "adr one");
  write(".ai/context/adr/0002-queue-driver.md", "adr two");
  return dir;
}

const paths = (dir: string, task: string, role: "planner" | "developer" | "reviewer" = "developer") =>
  routeContext({ cwd: dir, role, task, stack: STACK }).files.map((f) => f.path);

test("always-on context is loaded for any task", () => {
  const loaded = paths(project(), "rename a variable");
  assert.deepEqual(loaded, ["AGENTS.md", ".ai/context/TECH_STACK.md", ".ai/memory/lessons.md"]);
});

test("ROADMAP is never loaded", () => {
  for (const task of ["build the invitations screen", "add a migration", "plan the roadmap items"]) {
    assert.ok(!paths(project(), task).includes(".ai/context/ROADMAP.md"), task);
  }
});

test("a UI task pulls the design system, a backend task does not", () => {
  const dir = project();
  assert.ok(paths(dir, "build the invitation acceptance page and form").includes(".ai/context/DESIGN_SYSTEM.md"));
  assert.ok(!paths(dir, "add a queued job to expire old records").includes(".ai/context/DESIGN_SYSTEM.md"));
});

test("a database task pulls the schema and only the matching ADR", () => {
  const loaded = paths(project(), "add an invitations table with a migration");
  assert.ok(loaded.includes(".ai/context/database_schema.mmd"));
  assert.ok(loaded.includes(".ai/context/adr/0001-invitations-storage.md"));
  assert.ok(!loaded.includes(".ai/context/adr/0002-queue-driver.md"), "unrelated ADRs stay out");
});

test("the planner gets product context, the developer does not", () => {
  const dir = project();
  assert.ok(paths(dir, "invitations for users", "planner").includes(".ai/context/PRD.md"));
  assert.ok(!paths(dir, "invitations for users", "developer").includes(".ai/context/PRD.md"));
});

test("missing files are reported, not loaded as empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-brain-ctx-empty-"));
  const result = routeContext({ cwd: dir, role: "developer", task: "add a page", stack: STACK });
  assert.deepEqual(result.files, []);
  assert.ok(result.absent.includes("AGENTS.md"));
});

test("the character budget is respected", () => {
  const dir = project();
  writeFileSync(join(dir, "AGENTS.md"), "x".repeat(5000));
  const result = routeContext({
    cwd: dir,
    role: "developer",
    task: "add a page",
    stack: STACK,
    maxChars: 1000,
  });
  assert.ok(!result.files.some((f) => f.path === "AGENTS.md"), "oversized file skipped");
  assert.ok(result.files.some((f) => f.path === ".ai/context/TECH_STACK.md"), "small ones still fit");
});

test("aspect detection does not fire on unrelated prose", () => {
  assert.deepEqual(detectAspects("rename a helper function"), []);
  assert.deepEqual(detectAspects("add a migration for the users table").sort(), [
    "database",
    "product",
  ]);
});
