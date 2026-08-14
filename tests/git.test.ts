/**
 * The reviewer judges from this patch, so these tests are about what would
 * otherwise reach it silently wrong: renames, deletions, odd filenames,
 * pre-existing dirt, and files the user was already editing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RealGitService } from "../src/shell.ts";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-brain-git-"));
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir });
  run("init", "-q", "-b", "main");
  run("config", "user.email", "t@example.com");
  run("config", "user.name", "t");
  run("config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "existing.txt"), "one\n");
  writeFileSync(join(dir, "to-rename.txt"), "keep me\n");
  writeFileSync(join(dir, "to-delete.txt"), "delete me\n");
  run("add", ".");
  run("commit", "-qm", "base");
  return dir;
}

const git = new RealGitService();

test("new files reach the patch, not just the file list", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);

  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "new-model.ts"), "export const invitation = 1;\n");
  writeFileSync(join(dir, "existing.txt"), "one\ntwo\n");

  const { patch, files } = await git.diffSince(baseline);
  assert.ok(files.includes("src/new-model.ts"));
  assert.match(patch, /invitation/);
  assert.match(patch, /\+two/);
});

test("a rename is reported as a rename, not as an orphan addition", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);

  execFileSync("git", ["mv", "to-rename.txt", "renamed.txt"], { cwd: dir });

  const { patch, files } = await git.diffSince(baseline);
  assert.ok(files.includes("renamed.txt"));
  assert.match(patch, /rename from to-rename\.txt/);
  assert.match(patch, /rename to renamed\.txt/);
  assert.ok(!patch.includes("/dev/null"), "must not look like a fresh file");
});

test("a deletion appears in the patch", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);

  rmSync(join(dir, "to-delete.txt"));

  const { patch, files } = await git.diffSince(baseline);
  assert.ok(files.includes("to-delete.txt"));
  assert.match(patch, /deleted file/);
  assert.match(patch, /-delete me/);
});

test("the workflow's edit to an already-dirty file is included, the user's is not", async () => {
  const dir = initRepo();
  // the user was mid-edit when /feature started
  writeFileSync(join(dir, "existing.txt"), "one\nUSER EDIT\n");
  const baseline = await git.baseline(dir);
  assert.equal(baseline.capturedWorkingTree, true);

  // the agent then appends to that same file
  writeFileSync(join(dir, "existing.txt"), "one\nUSER EDIT\nAGENT EDIT\n");

  const { patch } = await git.diffSince(baseline);
  assert.match(patch, /\+AGENT EDIT/);
  assert.ok(!/^\+USER EDIT/m.test(patch), "the user's own work must not be attributed to the run");
});

test("pre-existing untracked files stay out, new ones come in", async () => {
  const dir = initRepo();
  mkdirSync(join(dir, "scratch"), { recursive: true });
  writeFileSync(join(dir, "scratch", "private.txt"), "my notes\n");

  const baseline = await git.baseline(dir);
  assert.ok(baseline.preexistingUntracked.includes("scratch/private.txt"));

  writeFileSync(join(dir, "created-by-agent.txt"), "agent output\n");

  const { patch, files } = await git.diffSince(baseline);
  assert.deepEqual(files, ["created-by-agent.txt"]);
  assert.ok(!patch.includes("my notes"), "private scratch content must not be sent to a model");
});

test("filenames with trailing spaces and newlines survive", async () => {
  const dir = initRepo();
  const weird = "trailing \nnewline.txt";
  writeFileSync(join(dir, "spaced name.txt"), "a\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "weird"], { cwd: dir });

  const baseline = await git.baseline(dir);
  writeFileSync(join(dir, "spaced name.txt"), "a\nb\n");
  writeFileSync(join(dir, weird), "brand new\n");

  const { patch, files } = await git.diffSince(baseline);
  assert.ok(files.includes("spaced name.txt"), `got ${JSON.stringify(files)}`);
  assert.ok(files.includes(weird), `got ${JSON.stringify(files)}`);
  assert.match(patch, /\+b/);
  assert.match(patch, /brand new/);
});

test("a clean tree diffs against HEAD", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);
  assert.equal(baseline.capturedWorkingTree, false);
  assert.equal(baseline.baseCommit, baseline.headSha);

  const { patch, files } = await git.diffSince(baseline);
  assert.deepEqual(files, []);
  assert.equal(patch, "");
});

test("a git failure surfaces instead of degrading to an empty patch", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);
  await assert.rejects(
    () => git.diffSince({ ...baseline, baseCommit: "0000000000000000000000000000000000000000" }),
    /git diff .* failed/,
  );
});
