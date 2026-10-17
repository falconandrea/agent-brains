/**
 * The reviewer judges from this patch, so these tests are about what would
 * otherwise reach it silently wrong: renames, deletions, odd filenames,
 * pre-existing dirt, and files the user was already editing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, chmodSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RealGitService, submodulePath } from "../src/shell.ts";

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

  const { patch, files } = await git.diffSince(baseline);
  assert.deepEqual(files, []);
  assert.equal(patch, "");
});

test("changes to .git/info/exclude are visible even though Git does not track the file", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);
  const exclude = join(dir, ".git", "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n# changed by pi-brain test\n`, "utf8");

  const diff = await git.diffSince(baseline);
  assert.equal(diff.ignoreRulesChanged, true);
});

test("a git failure surfaces instead of degrading to an empty patch", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);
  await assert.rejects(
    () => git.diffSince({ ...baseline, baseCommit: "0000000000000000000000000000000000000000" }),
    /git diff .* failed/,
  );
});

test("a pre-existing untracked file stays out even after the agent stages it", async () => {
  const dir = initRepo();
  writeFileSync(join(dir, "private-notes.txt"), "SECRET USER NOTES\n");

  const baseline = await git.baseline(dir);

  // the agent runs `git add -A` as part of its work — the file becomes tracked
  execFileSync("git", ["add", "-A"], { cwd: dir });
  writeFileSync(join(dir, "agent-file.txt"), "agent output\n");

  const { patch, files } = await git.diffSince(baseline);
  assert.ok(!patch.includes("SECRET USER NOTES"), "content must never reach the reviewer");
  assert.ok(!files.includes("private-notes.txt"));
  assert.ok(files.includes("agent-file.txt"));
});

test("a conflicted index does not silently fall back to a HEAD diff", async () => {
  const dir = initRepo();
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir });

  // build a real merge conflict
  run("checkout", "-q", "-b", "other");
  writeFileSync(join(dir, "existing.txt"), "other side\n");
  run("commit", "-qam", "other");
  run("checkout", "-q", "main");
  writeFileSync(join(dir, "existing.txt"), "main side\n");
  run("commit", "-qam", "main");
  try {
    run("merge", "other");
  } catch {
    // expected: conflict
  }

  const baseline = await git.baseline(dir);
  const { patch } = await git.diffSince(baseline);
  assert.equal(patch, "", "a conflicted tree that nobody touched yields no diff");
});

test("a repository with no submodules reports none", async () => {
  const dir = initRepo();
  const baseline = await git.baseline(dir);
  const { dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, []);
});

/** Parent repo with a real submodule at vendor/child. */
function initRepoWithSubmodule(): { parent: string; child: string } {
  const child = mkdtempSync(join(tmpdir(), "pi-brain-sub-"));
  const runChild = (...args: string[]) => execFileSync("git", args, { cwd: child });
  runChild("init", "-q", "-b", "main");
  runChild("config", "user.email", "t@example.com");
  runChild("config", "user.name", "t");
  writeFileSync(join(child, "code.txt"), "child code\n");
  runChild("add", ".");
  runChild("commit", "-qm", "child base");

  const parent = initRepo();
  execFileSync(
    "git",
    ["-c", "protocol.file.allow=always", "submodule", "add", "-q", child, "vendor/child"],
    { cwd: parent },
  );
  execFileSync("git", ["commit", "-qm", "add submodule"], { cwd: parent });
  return { parent, child };
}

test("uncommitted work INSIDE a submodule is detected", async () => {
  const { parent } = initRepoWithSubmodule();
  const baseline = await git.baseline(parent);

  // git submodule status still shows a leading space for this
  writeFileSync(join(parent, "vendor", "child", "code.txt"), "child code\nEDITED BY AGENT\n");

  const { patch, dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, ["vendor/child"]);
  assert.ok(!patch.includes("EDITED BY AGENT"), "the edit genuinely is not in the patch");
});

test("a clean submodule is not reported", async () => {
  const { parent } = initRepoWithSubmodule();
  const baseline = await git.baseline(parent);
  writeFileSync(join(parent, "existing.txt"), "one\ntwo\n");

  const { dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, []);
});

test("a submodule moved to another commit is reported", async () => {
  const { parent, child } = initRepoWithSubmodule();
  const baseline = await git.baseline(parent);

  writeFileSync(join(child, "code.txt"), "child v2\n");
  execFileSync("git", ["commit", "-qam", "child v2"], { cwd: child });
  execFileSync("git", ["-c", "protocol.file.allow=always", "pull", "-q"], {
    cwd: join(parent, "vendor", "child"),
  });

  const { dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, ["vendor/child"]);
});

test("submodule paths containing spaces are parsed whole", () => {
  assert.equal(
    submodulePath(" 1234567890abcdef vendor/child space (heads/main)"),
    "vendor/child space",
  );
  assert.equal(submodulePath("+1234567890abcdef vendor/child (heads/main)"), "vendor/child");
  assert.equal(submodulePath("-1234567890abcdef vendor/child"), "vendor/child");
  assert.equal(submodulePath(""), null);
});

test("a submodule at a path with spaces still escalates instead of crashing", async () => {
  const child = mkdtempSync(join(tmpdir(), "pi-brain-sub-"));
  const runChild = (...args: string[]) => execFileSync("git", args, { cwd: child });
  runChild("init", "-q", "-b", "main");
  runChild("config", "user.email", "t@example.com");
  runChild("config", "user.name", "t");
  writeFileSync(join(child, "code.txt"), "child code\n");
  runChild("add", ".");
  runChild("commit", "-qm", "child base");

  const parent = initRepo();
  execFileSync(
    "git",
    ["-c", "protocol.file.allow=always", "submodule", "add", "-q", child, "vendor/child space"],
    { cwd: parent },
  );
  execFileSync("git", ["commit", "-qm", "add submodule"], { cwd: parent });

  const baseline = await git.baseline(parent);
  writeFileSync(join(parent, "vendor", "child space", "code.txt"), "edited\n");

  const { dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, ["vendor/child space"]);
});

test("a new file in a submodule is detected even with showUntrackedFiles=no", async () => {
  const { parent } = initRepoWithSubmodule();
  // a project that hides untracked files from git status
  execFileSync("git", ["config", "status.showUntrackedFiles", "no"], {
    cwd: join(parent, "vendor", "child"),
  });

  const baseline = await git.baseline(parent);
  writeFileSync(join(parent, "vendor", "child", "brand-new.txt"), "invisible?\n");

  const { patch, dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, ["vendor/child"], "must not be hidden by user config");
  assert.ok(!patch.includes("invisible?"));
});

test("assume-unchanged inside a submodule cannot hide the agent's edit", async () => {
  const { parent } = initRepoWithSubmodule();
  const sub = join(parent, "vendor", "child");
  // the classic way to make git status lie about a tracked file
  execFileSync("git", ["update-index", "--assume-unchanged", "code.txt"], { cwd: sub });

  const baseline = await git.baseline(parent);
  writeFileSync(join(sub, "code.txt"), "child code\nEDITED BEHIND GIT STATUS\n");

  const { patch, dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, ["vendor/child"], "status lies; the snapshot does not");
  assert.ok(!patch.includes("EDITED BEHIND GIT STATUS"));
});

test("assume-unchanged in the PARENT repo cannot hide the agent's edit either", async () => {
  const dir = initRepo();
  execFileSync("git", ["update-index", "--assume-unchanged", "existing.txt"], { cwd: dir });

  const baseline = await git.baseline(dir);
  writeFileSync(join(dir, "existing.txt"), "one\nEDITED BEHIND GIT STATUS\n");

  const { patch, files } = await git.diffSince(baseline);
  assert.ok(files.includes("existing.txt"));
  assert.match(patch, /EDITED BEHIND GIT STATUS/);
});

test("skip-worktree inside a submodule cannot hide it either", async () => {
  const { parent } = initRepoWithSubmodule();
  const sub = join(parent, "vendor", "child");
  execFileSync("git", ["update-index", "--skip-worktree", "code.txt"], { cwd: sub });

  const baseline = await git.baseline(parent);
  writeFileSync(join(sub, "code.txt"), "hidden edit\n");

  const { dirtySubmodules } = await git.diffSince(baseline);
  assert.deepEqual(dirtySubmodules, ["vendor/child"]);
});

// -- repository-state digest (U3, F1/F2) --------------------------------------
//
// The digest backs the no-commit/no-ref/no-config/no-hook invariant: whatever
// git metadata an agent could move behind the reviewer's diff must change it,
// and ordinary working-tree edits (the developer's legitimate output) must not.

test("an untouched repository keeps the same state digest", async () => {
  const dir = initRepo();
  const first = await git.repoStateDigest(dir);
  assert.equal(await git.repoStateDigest(dir), first);
});

test("a new commit changes the state digest", async () => {
  const dir = initRepo();
  const before = await git.repoStateDigest(dir);
  writeFileSync(join(dir, "another.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "new"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(dir), before);
});

test("a new branch changes the state digest", async () => {
  const dir = initRepo();
  const before = await git.repoStateDigest(dir);
  execFileSync("git", ["branch", "side"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(dir), before);
});

test("a new tag changes the state digest", async () => {
  const dir = initRepo();
  const before = await git.repoStateDigest(dir);
  execFileSync("git", ["tag", "v1"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(dir), before);
});

test("switching branch changes the state digest even without a new commit", async () => {
  const dir = initRepo();
  execFileSync("git", ["branch", "side"], { cwd: dir });
  const before = await git.repoStateDigest(dir);
  // refs/heads/main and refs/heads/side both exist and point at the same
  // commit: only HEAD's symbolic target moves.
  execFileSync("git", ["checkout", "-q", "side"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(dir), before);
});

test("a git config change changes the state digest", async () => {
  const dir = initRepo();
  const before = await git.repoStateDigest(dir);
  execFileSync("git", ["config", "user.email", "other@example.com"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(dir), before);
});

test("hook creation, edition and removal each change the state digest", async () => {
  const dir = initRepo();
  const hook = join(dir, ".git", "hooks", "pre-commit");
  const before = await git.repoStateDigest(dir);

  writeFileSync(hook, "#!/bin/sh\nexit 0\n");
  const created = await git.repoStateDigest(dir);
  assert.notEqual(created, before, "a planted hook is a state change");

  writeFileSync(hook, "#!/bin/sh\necho hijacked\n");
  const edited = await git.repoStateDigest(dir);
  assert.notEqual(edited, created, "editing the hook's content is a state change");

  rmSync(hook);
  assert.notEqual(await git.repoStateDigest(dir), edited);
  assert.equal(await git.repoStateDigest(dir), before, "removal restores the baseline state");
});

test("a hook becoming executable changes the state digest even with identical content (P1 regression)", async () => {
  const dir = initRepo();
  const hook = join(dir, ".git", "hooks", "pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 0\n"); // planted but inert: not executable
  const inert = await git.repoStateDigest(dir);
  assert.equal(await git.repoStateDigest(dir), inert, "stable read while the mode is unchanged");

  chmodSync(hook, 0o755); // same bytes, but git will now actually run it
  const active = await git.repoStateDigest(dir);
  assert.notEqual(active, inert, "activation must not be invisible to the digest");

  chmodSync(hook, 0o644); // deactivation is a state change too
  assert.notEqual(await git.repoStateDigest(dir), active);
});

test("an unreadable hook file fails closed instead of digesting a marker (P1 regression)", async () => {
  const dir = initRepo();
  const hook = join(dir, ".git", "hooks", "pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 0\n");
  chmodSync(hook, 0o000);
  await assert.rejects(() => git.repoStateDigest(dir));
});

test("an unreadable .git/config fails closed instead of digesting a marker (P1 regression)", async () => {
  const dir = initRepo();
  chmodSync(join(dir, ".git", "config"), 0o000);
  await assert.rejects(() => git.repoStateDigest(dir));
});

test("a core.hooksPath that exists but cannot be listed fails closed (P1 regression)", async () => {
  const dir = initRepo();
  const hooksDir = join(dir, "locked-hooks");
  mkdirSync(hooksDir);
  execFileSync("git", ["config", "core.hooksPath", "locked-hooks"], { cwd: dir });
  chmodSync(hooksDir, 0o000); // exists, but its contents cannot be enumerated
  await assert.rejects(() => git.repoStateDigest(dir));
});

test("a core.hooksPath pointing at a file fails closed (P1 regression)", async () => {
  const dir = initRepo();
  writeFileSync(join(dir, "hooksfile"), "x\n");
  execFileSync("git", ["config", "core.hooksPath", "hooksfile"], { cwd: dir });
  await assert.rejects(() => git.repoStateDigest(dir));
});

test("a nonexistent core.hooksPath is a stable state, and populating it later is detected", async () => {
  const dir = initRepo();
  execFileSync("git", ["config", "core.hooksPath", "not-yet"], { cwd: dir });
  const before = await git.repoStateDigest(dir);
  assert.equal(await git.repoStateDigest(dir), before, "absent hooks location is a readable state");

  mkdirSync(join(dir, "not-yet"));
  writeFileSync(join(dir, "not-yet", "pre-commit"), "#!/bin/sh\nexit 0\n");
  assert.notEqual(await git.repoStateDigest(dir), before, "creating the location with a hook is detected");
});

test("a core.hooksPath behind an inaccessible parent directory fails closed (P2 regression)", async () => {
  const dir = initRepo();
  const privateDir = join(dir, "private");
  mkdirSync(join(privateDir, "hooks"), { recursive: true });
  execFileSync("git", ["config", "core.hooksPath", "private/hooks"], { cwd: dir });
  chmodSync(privateDir, 0o000); // the hooks may exist, but we cannot even traverse to them
  await assert.rejects(() => git.repoStateDigest(dir));
});

test("a config.worktree behind an inaccessible parent directory fails closed (P2 regression)", async () => {
  const dir = initRepo();
  const privateDir = join(dir, "private");
  mkdirSync(privateDir, { recursive: true });
  const target = join(privateDir, "config.worktree");
  writeFileSync(target, "[core]\n\tbare = false\n");
  symlinkSync(target, join(dir, ".git", "config.worktree"));
  chmodSync(privateDir, 0o000); // the file exists, but its parent cannot be traversed
  await assert.rejects(() => git.repoStateDigest(dir));
});

test("ordinary working-tree edits do NOT change the state digest", async () => {
  const dir = initRepo();
  const before = await git.repoStateDigest(dir);
  writeFileSync(join(dir, "existing.txt"), "one\nedited by the developer\n");
  writeFileSync(join(dir, "brand-new-untracked.txt"), "untracked\n");
  assert.equal(await git.repoStateDigest(dir), before);
});

test("hooks at a configured core.hooksPath are digested too", async () => {
  const dir = initRepo();
  const hooksDir = join(dir, "custom-hooks");
  mkdirSync(hooksDir);
  execFileSync("git", ["config", "core.hooksPath", "custom-hooks"], { cwd: dir });
  const before = await git.repoStateDigest(dir);

  writeFileSync(join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 0\n");
  assert.notEqual(await git.repoStateDigest(dir), before, "a hook outside .git/hooks must not be invisible");
});

test("the state digest reads shared state correctly from a linked worktree", async () => {
  const dir = initRepo();
  // In a linked worktree .git is a FILE: the digest must resolve the git dir
  // and the common dir through git itself, never join(.git, ...).
  const wt = mkdtempSync(join(tmpdir(), "pi-brain-wtw-"));
  execFileSync("git", ["worktree", "add", wt, "-b", "wt-branch"], { cwd: dir });
  const before = await git.repoStateDigest(wt);
  assert.equal(await git.repoStateDigest(wt), before, "stable read inside the worktree");

  // a commit in the MAIN repository moves a shared ref
  writeFileSync(join(dir, "from-main.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "main moved"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(wt), before, "shared refs are seen from the worktree");

  // config lives in the common dir
  const afterMainCommit = await git.repoStateDigest(wt);
  execFileSync("git", ["config", "user.email", "wt@example.com"], { cwd: dir });
  assert.notEqual(await git.repoStateDigest(wt), afterMainCommit, "common config is seen from the worktree");

  // hooks live in the common dir too
  const afterConfig = await git.repoStateDigest(wt);
  writeFileSync(join(dir, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 0\n");
  assert.notEqual(await git.repoStateDigest(wt), afterConfig, "common hooks are seen from the worktree");

  // the worktree's own commit moves both its HEAD and a shared ref
  const afterHooks = await git.repoStateDigest(wt);
  writeFileSync(join(wt, "from-wt.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: wt });
  execFileSync("git", ["commit", "-qm", "wt moved"], { cwd: wt });
  assert.notEqual(await git.repoStateDigest(wt), afterHooks);

  // a plain edit inside the worktree is still not git state
  const afterWtCommit = await git.repoStateDigest(wt);
  writeFileSync(join(wt, "from-wt.txt"), "edited\n");
  assert.equal(await git.repoStateDigest(wt), afterWtCommit);
});

test("a repository with no commits digests, and its first commit changes the digest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-brain-empty-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  const before = await git.repoStateDigest(dir);
  writeFileSync(join(dir, "a.txt"), "a\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "first"],
    { cwd: dir },
  );
  assert.notEqual(await git.repoStateDigest(dir), before);
});

test("an unreadable repository state fails closed instead of reading as stable", async () => {
  const notARepo = mkdtempSync(join(tmpdir(), "pi-brain-norepo-"));
  await assert.rejects(() => git.repoStateDigest(notARepo), /failed/);
});
