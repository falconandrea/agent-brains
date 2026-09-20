/**
 * Tests for the context-audit helper script: mechanical collection only,
 * strictly read-only. The semantic classification lives in the skill, not here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { auditProject } from "../.agents/skills/context-audit/scripts/context-audit.mjs";

const write = (root: string, rel: string, text: string): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

function buildFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "context-audit-"));
  write(
    root,
    "AGENTS.md",
    [
      "# AGENTS",
      "",
      "Read [tech](.ai/context/TECH_STACK.md); blockers live in [blockers](.ai/memory/blockers.md).",
      "External [repo](https://example.com/x) and anchor [top](#top) are not path checks.",
      "",
    ].join("\n"),
  );
  write(root, ".ai/context/TECH_STACK.md", "# Stack\n\nNode 24, node:test.\n");
  write(
    root,
    ".ai/memory/lessons.md",
    [
      "# Lessons",
      "",
      "- [2026-01-02] [Node] one. Refs: [PR #1]",
      "- [2026-02-03] [Node] two. Refs: [PR #2]",
      "- [2026-03-04] [Node] three. Refs: [PR #3]",
      "- plain bullet that is not a dated lesson entry",
      "",
    ].join("\n"),
  );
  write(
    root,
    ".ai/memory/progress.md",
    ["# Progress", "", "1. [ ] open action", "2. [x] done action", "- [x] another done", ""].join("\n"),
  );
  write(root, "docs/adr/0001-pin-pi.md", "# ADR 1 — pin Pi\n\nStatus: accepted.\n");
  write(root, "app/AGENTS.md", "# Scoped agents\n\nSee [adr](../docs/adr/0001-pin-pi.md).\n");
  write(root, ".agents/AGENTS.md", "# Local agents additions\n");
  write(root, ".agents/skills/external/AGENTS.md", "# Managed skill — excluded\n");
  write(root, "node_modules/pkg/AGENTS.md", "# Must be excluded\n");
  return root;
}

function snapshot(root: string, relDir = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(join(root, relDir), { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, snapshot(root, rel));
    else if (entry.isFile()) {
      const abs = join(root, rel);
      const mtime = statSync(abs).mtimeMs;
      out[rel] = `${createHash("sha256").update(readFileSync(abs)).digest("hex")}@${mtime}`;
    }
  }
  return out;
}

test("collects the topology inventory with roles and ADR detection", () => {
  const report = auditProject(buildFixture());
  const roles = new Map(report.files.map((f) => [f.path, f.role]));

  assert.equal(roles.get("AGENTS.md"), "agents-root");
  assert.equal(roles.get("app/AGENTS.md"), "agents-scoped");
  assert.equal(roles.get(".agents/AGENTS.md"), "agents-scoped");
  assert.equal(roles.get(".ai/context/TECH_STACK.md"), "context");
  assert.equal(roles.get(".ai/memory/lessons.md"), "memory");
  assert.equal(roles.get(".ai/memory/progress.md"), "memory");
  assert.equal(roles.get("docs/adr/0001-pin-pi.md"), "adr");
  assert.equal(report.adrDir, "docs/adr");
  assert.ok(!roles.has("node_modules/pkg/AGENTS.md"), "excluded dirs must not be walked");
  assert.ok(!roles.has(".agents/skills/external/AGENTS.md"), "managed skill store must not be walked");
  assert.ok(report.files.every((f) => f.lines > 0 && f.bytes > 0));
});

test("counts lesson entries and progress completed markers mechanically", () => {
  const report = auditProject(buildFixture());
  assert.equal(report.lessons.present, true);
  assert.equal(report.lessons.entries, 3);
  assert.equal(report.progress.present, true);
  assert.equal(report.progress.completedMarkers, 2);
});

test("collects unresolved Markdown-link candidates without classifying them", () => {
  const report = auditProject(buildFixture());

  assert.deepEqual(report.markdownLinks.unresolved, [
    { from: "AGENTS.md", target: ".ai/memory/blockers.md", resolved: ".ai/memory/blockers.md" },
  ]);
  // tech + blockers from AGENTS.md, adr link from app/AGENTS.md; external and
  // anchor targets are skipped.
  assert.equal(report.markdownLinks.checked, 3);
});

test("is strictly read-only: fixture contents and mtimes are unchanged", () => {
  const root = buildFixture();
  const before = snapshot(root);
  auditProject(root);
  auditProject(root);
  assert.deepEqual(snapshot(root), before);
});

test("counts ADRs stored inside .ai/context/adrs once, under the adr role", () => {
  const root = mkdtempSync(join(tmpdir(), "context-audit-adr-"));
  writeFileSync(join(root, "AGENTS.md"), "# AGENTS\n");
  write(root, ".ai/context/TECH_STACK.md", "# Stack\n\nSee [adr](adrs/0001-pin-pi.md).\n");
  write(root, ".ai/context/adrs/0001-pin-pi.md", "# ADR 1\n\nBack to [home](../../../AGENTS.md).\n");

  const report = auditProject(root);
  assert.equal(report.adrDir, ".ai/context/adrs");

  const adrEntries = report.files.filter((f) => f.path === ".ai/context/adrs/0001-pin-pi.md");
  assert.equal(adrEntries.length, 1, "ADR must not be duplicated by the context pass");
  assert.equal(adrEntries[0]?.role, "adr", "the more specific adr role wins");
  assert.equal(
    new Set(report.files.map((f) => f.path)).size,
    report.files.length,
    "inventory holds exactly one entry per path",
  );
  assert.equal(report.markdownLinks.checked, 2, "links in re-visited files are checked once");
  assert.deepEqual(report.markdownLinks.unresolved, []);
});

test("missing optional inputs are reported as absent, not errors", () => {
  const root = mkdtempSync(join(tmpdir(), "context-audit-empty-"));
  writeFileSync(join(root, "AGENTS.md"), "# AGENTS\n");

  const report = auditProject(root);
  assert.equal(report.missingOptional.agentsRoot, false);
  assert.equal(report.missingOptional.aiContext, true);
  assert.equal(report.missingOptional.aiFeatures, true);
  assert.equal(report.missingOptional.lessons, true);
  assert.equal(report.missingOptional.progress, true);
  assert.equal(report.missingOptional.adr, true);
  assert.equal(report.lessons.entries, null);
  assert.equal(report.progress.completedMarkers, null);
  assert.equal(report.markdownLinks.checked, 0);
});
