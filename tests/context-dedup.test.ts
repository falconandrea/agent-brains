/**
 * S1: context-file deduplication at the production loader boundary.
 *
 * The regression that motivated S1: a project-root AGENTS.md is discovered by
 * DefaultResourceLoader and also routed through request.contextFiles, so the
 * child receives the same file twice. These tests pin the production
 * buildResourceLoader() wiring, not a copy of the merge logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import { canonicalAgentsPath, dedupeAgentsFiles } from "../src/context-dedup.ts";
import { buildResourceLoader } from "../src/pi/pi-agent-runner.ts";

// buildResourceLoader() resolves the agent dir at call time. Keep discovery
// away from the personal Pi state and from unrelated global AGENTS.md files.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-brain-s1-agent-"));

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pi-brain-s1-"));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return root;
}

async function loadAgents(
  cwd: string,
  contextFiles?: Array<{ path: string; content: string }>,
): Promise<Array<{ path: string; content: string }>> {
  const loader = buildResourceLoader({
    cwd,
    skills: [],
    ...(contextFiles ? { contextFiles } : {}),
  });
  await loader.reload();
  return loader.getAgentsFiles().agentsFiles;
}

/** Loader-returned paths may stay relative for injected files. */
const absolute = (root: string, path: string): string => (isAbsolute(path) ? path : join(root, path));

test("a root AGENTS.md discovered and injected is loaded once", async () => {
  const root = project({ "AGENTS.md": "# Root\n\n- project instruction\n" });
  const content = readFileSync(join(root, "AGENTS.md"), "utf8");

  const files = await loadAgents(root, [{ path: "AGENTS.md", content }]);

  assert.equal(files.length, 1);
  assert.equal(files[0]?.content, content);
  assert.equal(realpathSync(files[0]!.path), realpathSync(join(root, "AGENTS.md")));
});

test("relative and absolute aliases of the same file collapse", async () => {
  const root = project({ "AGENTS.md": "# Root\n" });
  const content = readFileSync(join(root, "AGENTS.md"), "utf8");

  const files = await loadAgents(root, [
    { path: "AGENTS.md", content },
    { path: "./AGENTS.md", content },
    { path: "sub/../AGENTS.md", content },
    { path: join(root, "AGENTS.md"), content },
  ]);

  assert.equal(files.length, 1);
});

test("a symlinked project root does not reintroduce the duplicate", async () => {
  const root = project({ "AGENTS.md": "# Root\n" });
  const alias = join(mkdtempSync(join(tmpdir(), "pi-brain-s1-alias-")), "project");
  symlinkSync(root, alias, "dir");
  const content = readFileSync(join(root, "AGENTS.md"), "utf8");

  const files = await loadAgents(alias, [{ path: "AGENTS.md", content }]);

  assert.equal(files.length, 1);
});

test("a symlink alias of a discovered file collapses to its target", async () => {
  const root = project({ "AGENTS.md": "# Root\n" });
  symlinkSync("AGENTS.md", join(root, "AGENTS.alias.md"));
  const content = readFileSync(join(root, "AGENTS.alias.md"), "utf8");

  const files = await loadAgents(root, [{ path: "AGENTS.alias.md", content }]);

  assert.equal(files.length, 1);
  assert.equal(realpathSync(files[0]!.path), realpathSync(join(root, "AGENTS.md")));
});

test("distinct files, scoped instructions and routed documents are preserved", async () => {
  const root = project({
    "AGENTS.md": "# Root\n",
    "app/AGENTS.md": "# App scope\n",
    ".ai/context/TECH_STACK.md": "# Stack\n",
    ".ai/memory/lessons.md": "# Lessons\n",
  });
  const read = (relative: string): { path: string; content: string } => ({
    path: relative,
    content: readFileSync(join(root, relative), "utf8"),
  });

  const files = await loadAgents(root, [
    read("AGENTS.md"),
    read("app/AGENTS.md"),
    read(".ai/context/TECH_STACK.md"),
    read(".ai/memory/lessons.md"),
  ]);

  assert.equal(files.length, 4);
  assert.deepEqual(
    new Set(files.map((file) => file.content)),
    new Set(["# Root\n", "# App scope\n", "# Stack\n", "# Lessons\n"]),
  );
  assert.equal(
    new Set(files.map((file) => realpathSync(absolute(root, file.path)))).size,
    files.length,
    "each canonical path appears at most once",
  );
});

test("discovered scoped AGENTS.md files remain distinct", async () => {
  const root = project({
    "AGENTS.md": "# Root\n",
    "app/AGENTS.md": "# App scope\n",
  });

  const files = await loadAgents(join(root, "app"));
  const contents = files.map((file) => file.content);

  assert.ok(contents.includes("# Root\n"), "ancestor context is preserved");
  assert.ok(contents.includes("# App scope\n"), "cwd-scoped context is preserved");
  assert.equal(
    new Set(files.map((file) => realpathSync(file.path))).size,
    files.length,
    "distinct paths are not collapsed",
  );
});

test("conflicting content for one path is resolved deterministically and reported", async () => {
  const root = project({ "AGENTS.md": "# Discovered\n" });
  const originalWrite = process.stderr.write;
  let stderr = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const files = await loadAgents(root, [{ path: "AGENTS.md", content: "# Injected\n" }]);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.content, "# Injected\n", "explicit injection wins by contract");
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.match(stderr, /context conflict/);
  assert.match(stderr, /request\.contextFiles content wins over discovered file content/);
});

test("the pure merge reports both hashes for a same-path conflict", () => {
  const merged = dedupeAgentsFiles(
    "/repo",
    [
      { path: "/repo/AGENTS.md", content: "discovered\n" },
      { path: "docs/other.md", content: "other\n" },
    ],
    [{ path: "AGENTS.md", content: "injected\n" }],
  );

  assert.equal(merged.files.length, 2);
  assert.equal(merged.files[0]?.content, "injected\n");
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0]?.winner, "injected");
  assert.equal(merged.conflicts[0]?.loser, "discovered");
  assert.notEqual(merged.conflicts[0]?.winnerSha256, merged.conflicts[0]?.loserSha256);
});

test("an identical first injection claims precedence over a later injection", () => {
  const merged = dedupeAgentsFiles(
    "/repo",
    [{ path: "/repo/AGENTS.md", content: "A\n" }],
    [
      // Same bytes as the discovery: it still owns the slot as an injection.
      { path: "AGENTS.md", content: "A\n" },
      { path: "AGENTS.md", content: "B\n" },
    ],
  );

  assert.equal(merged.files.length, 1);
  assert.equal(merged.files[0]?.content, "A\n", "the first injection wins");
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0]?.winner, "injected");
  assert.equal(merged.conflicts[0]?.loser, "injected");
});

/** Root AGENTS.md plus a nested one, reachable through a symlink to sub/. */
function symlinkTraversalFixture(): { root: string; rootContent: string; nestedContent: string } {
  const root = project({
    "AGENTS.md": "# Root\n",
    "nested/AGENTS.md": "# Nested\n",
    "nested/sub/.keep": "",
  });
  symlinkSync("nested/sub", join(root, "alias"), "dir");
  return { root, rootContent: "# Root\n", nestedContent: "# Nested\n" };
}

test("a symlink followed by .. keeps the nested file distinct (relative path)", () => {
  const { root, rootContent, nestedContent } = symlinkTraversalFixture();
  const merged = dedupeAgentsFiles(
    root,
    [
      { path: "AGENTS.md", content: rootContent },
      { path: "nested/AGENTS.md", content: nestedContent },
    ],
    // The filesystem reads alias -> nested/sub, then .. -> nested, so this is
    // nested/AGENTS.md; a lexical resolve would wrongly target the root file.
    [{ path: "alias/../AGENTS.md", content: nestedContent }],
  );

  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.files.length, 2);
  assert.deepEqual(
    merged.files.map((file) => file.content),
    [rootContent, nestedContent],
  );
  assert.equal(
    canonicalAgentsPath(root, "alias/../AGENTS.md"),
    realpathSync.native(join(root, "nested", "AGENTS.md")),
  );
});

test("a symlink followed by .. keeps the nested file distinct (absolute path)", () => {
  const { root, rootContent, nestedContent } = symlinkTraversalFixture();
  const absoluteAlias = `${root}/alias/../AGENTS.md`;
  const merged = dedupeAgentsFiles(
    root,
    [
      { path: "AGENTS.md", content: rootContent },
      { path: "nested/AGENTS.md", content: nestedContent },
    ],
    [{ path: absoluteAlias, content: nestedContent }],
  );

  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.files.length, 2);
  assert.deepEqual(
    merged.files.map((file) => file.content),
    [rootContent, nestedContent],
  );
  assert.equal(
    canonicalAgentsPath(root, absoluteAlias),
    realpathSync.native(join(root, "nested", "AGENTS.md")),
  );
});
