#!/usr/bin/env node
/**
 * context-audit — mechanical, strictly read-only checks for the context-audit
 * skill. Collects the context-file inventory, size/entry counts and unresolved
 * Markdown-link candidates as JSON. It never writes, never classifies
 * references and never decides contradictions: those judgments stay with the
 * agent, per the skill contract.
 *
 * Usage: node context-audit.mjs <project-root> [--adr-dir <relative-dir>]
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "vendor",
  "target", ".next", ".nuxt", ".cache", ".turbo", ".output", "tmp", "logs",
]);

// The managed skill store is a dependency tree (installed from skills-lock),
// not project-authored context; its bundled AGENTS.md files are not ours.
const EXCLUDED_PATHS = new Set([".agents/skills"]);

const ADR_CANDIDATES = [
  "docs/adr", "docs/adrs", ".ai/context/adr", ".ai/context/adrs",
  "adr", "adrs", "docs/decisions", "decisions",
];

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function metrics(relPath, text) {
  return {
    path: relPath,
    lines: text.split("\n").length,
    bytes: Buffer.byteLength(text, "utf8"),
  };
}

function walk(root, relDir, visit) {
  const abs = join(root, relDir);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name) && !EXCLUDED_PATHS.has(rel)) walk(root, rel, visit);
    } else if (entry.isFile()) {
      visit(rel);
    }
  }
}

function findScopedAgents(root) {
  const found = [];
  const visit = (rel) => {
    if (rel === "AGENTS.md" || rel.endsWith("/AGENTS.md")) found.push(rel);
  };
  walk(root, "", visit);
  return found.sort();
}

function findAdrDir(root, explicit) {
  const candidates = explicit ? [explicit, ...ADR_CANDIDATES] : ADR_CANDIDATES;
  for (const candidate of candidates) {
    if (isDir(join(root, candidate))) return candidate;
  }
  return null;
}

const LESSON_ENTRY = /^[ \t]*-[ \t]+\[\d{4}-\d{2}-\d{2}\]/;
const COMPLETED_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]*\[x\]/i;
const MD_LINK = /(!?)\[[^\]]*\]\(([^)\s]+)(?:[ \t]+"[^"]*")?\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function collectLinks(root, files) {
  const checked = [];
  const unresolved = [];
  for (const file of files) {
    const abs = join(root, file.path);
    const text = readFileSync(abs, "utf8");
    for (const match of text.matchAll(MD_LINK)) {
      const target = match[2];
      if (EXTERNAL.test(target)) continue;
      const clean = target.split("#")[0];
      if (clean === "") continue;
      const resolved = relative(root, resolve(dirname(abs), clean));
      const exists = existsSync(resolve(dirname(abs), clean));
      checked.push({ from: file.path, target, resolved, exists });
      if (!exists) unresolved.push({ from: file.path, target, resolved });
    }
  }
  return { checked: checked.length, unresolved };
}

export function auditProject(root, options = {}) {
  const files = new Map();
  // One inventory entry per path. When the ADR directory lives inside
  // .ai/context/, a file is first added as "context" and then re-visited by
  // the ADR pass: the later, more specific role wins instead of duplicating.
  const addFile = (relPath, role) => {
    const abs = join(root, relPath);
    if (!existsSync(abs)) return null;
    const text = readFileSync(abs, "utf8");
    let entry = files.get(relPath);
    if (entry) {
      entry.role = role;
    } else {
      entry = { role, ...metrics(relPath, text) };
      files.set(relPath, entry);
    }
    return { entry, text };
  };

  for (const rel of findScopedAgents(root)) {
    addFile(rel, rel === "AGENTS.md" ? "agents-root" : "agents-scoped");
  }

  if (isDir(join(root, ".ai/context"))) {
    walk(root, ".ai/context", (rel) => {
      if (/\.(md|mmd)$/.test(rel)) addFile(rel, "context");
    });
  }

  if (isDir(join(root, ".ai/features"))) {
    walk(root, ".ai/features", (rel) => {
      if (rel.endsWith(".md")) addFile(rel, "features");
    });
  }

  const lessons = addFile(".ai/memory/lessons.md", "memory");
  const progress = addFile(".ai/memory/progress.md", "memory");

  const adrDir = findAdrDir(root, options.adrDir);
  if (adrDir) {
    walk(root, adrDir, (rel) => {
      if (rel.endsWith(".md")) addFile(rel, "adr");
    });
  }

  const lessonsText = lessons?.text ?? "";
  const progressText = progress?.text ?? "";
  const lessonCount = lessonsText
    .split("\n")
    .filter((line) => LESSON_ENTRY.test(line)).length;

  return {
    root,
    adrDir,
    files: [...files.values()],
    lessons: {
      present: Boolean(lessons),
      entries: lessons ? lessonCount : null,
    },
    progress: {
      present: Boolean(progress),
      completedMarkers: progress
        ? progressText.split("\n").filter((line) => COMPLETED_ITEM.test(line)).length
        : null,
    },
    markdownLinks: collectLinks(root, [...files.values()]),
    missingOptional: {
      agentsRoot: !existsSync(join(root, "AGENTS.md")),
      aiContext: !isDir(join(root, ".ai/context")),
      aiFeatures: !isDir(join(root, ".ai/features")),
      lessons: !lessons,
      progress: !progress,
      adr: adrDir === null,
    },
  };
}

function main(argv) {
  const root = argv[0];
  const adrFlag = argv.indexOf("--adr-dir");
  const adrDir = adrFlag !== -1 ? argv[adrFlag + 1] : undefined;
  if (!root || adrFlag !== -1 && !adrDir) {
    process.stderr.write("usage: node context-audit.mjs <project-root> [--adr-dir <dir>]\n");
    process.exitCode = 1;
    return;
  }
  if (!isDir(root)) {
    process.stderr.write(`not a directory: ${root}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(auditProject(resolve(root), { adrDir }), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
