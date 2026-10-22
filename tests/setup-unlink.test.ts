/**
 * Integration tests for the setup.sh / unlink.sh safety contract (F1/F2/F5 in
 * the code-review follow-ups PRD):
 *
 * - only symlinks whose resolved destination is inside this repository's
 *   canonical store (or its .agents / .agents/workflows / .opencode) are
 *   removed or refreshed — foreign links survive setup AND unlink;
 * - a profile manifest is resolved and validated BEFORE anything is mutated,
 *   so an invalid profile leaves an existing installation intact;
 * - real files/directories occupying a skill path are preserved, never given a
 *   nested symlink, and never counted as installed;
 * - repeated setup and profile switches stay functional.
 *
 * Everything runs inside a temporary workspace: the scripts are copied into a
 * fixture "agent-brains" repository with its own tiny skill store and
 * profiles. Neither this repository nor any real linked project is touched.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let workspace: string;
let fixture: string;
let store: string; // fixture/.agents/skills — the canonical skill store
let foreignStore: string; // a skill store the "user" manages independently

/** lstat-based symlink check that treats a missing path as "not a symlink". */
const isSymlink = (p: string): boolean => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
const linkDest = (p: string): string => readlinkSync(p);
const real = (p: string): string => realpathSync(p);
/** Remove a symlink (unlink — rmSync refuses symlinks that point to directories). */
const rmLink = (p: string): void => {
  unlinkSync(p);
};

const makeSkill = (base: string, name: string, body: string): void => {
  mkdirSync(join(base, name), { recursive: true });
  writeFileSync(join(base, name, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`);
};

before(() => {
  workspace = mkdtempSync(join(tmpdir(), "agent-brains-setup-"));
  fixture = join(workspace, "agent-brains-fixture");
  mkdirSync(fixture, { recursive: true });
  cpSync(join(ROOT, "setup.sh"), join(fixture, "setup.sh"));
  cpSync(join(ROOT, "unlink.sh"), join(fixture, "unlink.sh"));

  store = join(fixture, ".agents", "skills");
  for (const name of ["alpha", "beta", "gamma"]) makeSkill(store, name, `canonical ${name}`);
  mkdirSync(join(fixture, ".agents", "workflows"), { recursive: true });
  writeFileSync(join(fixture, ".agents", "workflows", "feature.md"), "# workflow\n");
  mkdirSync(join(fixture, ".opencode"), { recursive: true });
  writeFileSync(join(fixture, ".opencode", "opencode.json"), "{}\n");

  const profiles = join(fixture, "profiles");
  mkdirSync(profiles, { recursive: true });
  writeFileSync(join(profiles, "p-one.list"), "alpha\nbeta\n");
  writeFileSync(join(profiles, "p-two.list"), "@include shared\ngamma\n");
  writeFileSync(join(profiles, "shared.list"), "alpha\n");
  writeFileSync(join(profiles, "bad-include.list"), "@include does-not-exist\nalpha\n");
  writeFileSync(join(profiles, "bad-entry.list"), "../outside\nalpha\n");
  writeFileSync(join(profiles, "cycle-a.list"), "@include cycle-b\nalpha\n");
  writeFileSync(join(profiles, "cycle-b.list"), "@include cycle-a\nbeta\n");

  foreignStore = join(workspace, "foreign-skills");
  makeSkill(foreignStore, "foreign-skill", "user-managed");
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

const run = (script: string, args: string[]): RunResult => {
  const res = spawnSync("bash", [join(fixture, script), ...args], { encoding: "utf8" });
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
};

const setup = (project: string, profile?: string): RunResult =>
  run("setup.sh", profile === undefined ? [project] : [project, profile]);

const unlink = (project: string, scope?: string): RunResult =>
  run("unlink.sh", scope === undefined ? [project] : [project, scope]);

const newProject = (name: string): string => {
  const p = join(workspace, name);
  mkdirSync(p, { recursive: true });
  return p;
};

const foreignSkillLink = (project: string, name = "foreign-skill"): void => {
  mkdirSync(join(project, ".agents", "skills"), { recursive: true });
  symlinkSync(join(foreignStore, name), join(project, ".agents", "skills", name));
};

// ---------------------------------------------------------------------------

test("setup.sh and unlink.sh pass bash -n", () => {
  for (const script of ["setup.sh", "unlink.sh"]) {
    const res = spawnSync("bash", ["-n", join(fixture, script)], { encoding: "utf8" });
    assert.equal(res.status, 0, `${script} syntax error:\n${res.stderr}`);
  }
});

test("curated setup links profile skills, workflows and .opencode", () => {
  const project = newProject("basic");
  const res = setup(project, "p-one");

  assert.equal(res.status, 0, res.stderr);
  assert.equal(linkDest(join(project, ".agents", "skills", "alpha")), real(join(store, "alpha")));
  assert.equal(linkDest(join(project, ".agents", "skills", "beta")), real(join(store, "beta")));
  assert.ok(!existsSync(join(project, ".agents", "skills", "gamma")));
  assert.ok(isSymlink(join(project, ".agents", "workflows")));
  assert.ok(isSymlink(join(project, ".opencode")));
  assert.match(res.stdout, /2 skills linked/);
});

test("setup preserves foreign skill symlinks, including one occupying a profile skill name", () => {
  const project = newProject("foreign-skills");
  foreignSkillLink(project);
  // a foreign link that occupies a name the profile wants to install
  symlinkSync(join(foreignStore, "foreign-skill"), join(project, ".agents", "skills", "alpha"));

  const res = setup(project, "p-one");
  assert.equal(res.status, 0, res.stderr);

  const skills = join(project, ".agents", "skills");
  assert.equal(linkDest(join(skills, "alpha")), join(foreignStore, "foreign-skill"), "foreign alpha must not be replaced");
  assert.equal(linkDest(join(skills, "foreign-skill")), join(foreignStore, "foreign-skill"));
  assert.equal(linkDest(join(skills, "beta")), real(join(store, "beta")));
  assert.match(res.stdout, /alpha.*foreign/i);
  // only the correctly linked beta counts as installed
  assert.match(res.stdout, /1 skills linked/);
});

test("setup preserves a foreign .agents/workflows symlink", () => {
  const project = newProject("foreign-workflows");
  const foreignWorkflows = join(workspace, "foreign-workflows");
  mkdirSync(foreignWorkflows, { recursive: true });
  writeFileSync(join(foreignWorkflows, "custom.md"), "# custom\n");
  mkdirSync(join(project, ".agents"), { recursive: true });
  symlinkSync(foreignWorkflows, join(project, ".agents", "workflows"));

  const res = setup(project, "p-one");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(linkDest(join(project, ".agents", "workflows")), foreignWorkflows, "foreign workflows link must survive");
  assert.ok(existsSync(join(foreignWorkflows, "custom.md")));
});

test("setup and unlink preserve a foreign whole-dir .agents symlink", () => {
  const project = newProject("foreign-agents");
  const foreignAgents = join(workspace, "foreign-agents-dir");
  mkdirSync(join(foreignAgents, "skills"), { recursive: true });
  symlinkSync(foreignAgents, join(project, ".agents"));

  const curated = setup(project, "p-one");
  assert.notEqual(curated.status, 0, "curated setup must refuse a foreign .agents symlink");
  assert.ok(isSymlink(join(project, ".agents")), ".agents link itself must survive");
  assert.equal(linkDest(join(project, ".agents")), foreignAgents);
  assert.ok(!existsSync(join(foreignAgents, "skills", "alpha")), "nothing may be written through the foreign link");

  const full = setup(project, "full");
  assert.equal(full.status, 0, full.stderr);
  assert.ok(isSymlink(join(project, ".agents")), "full setup must not replace a foreign .agents link");
  assert.equal(linkDest(join(project, ".agents")), foreignAgents);

  const un = unlink(project);
  assert.equal(un.status, 0, un.stderr);
  assert.ok(isSymlink(join(project, ".agents")), "unlink must keep a foreign .agents link");
  assert.equal(linkDest(join(project, ".agents")), foreignAgents);
});

test("invalid profiles fail before any mutation", () => {
  for (const profile of ["no-such-profile", "bad-include", "bad-entry", "cycle-a"]) {
    const project = newProject(`invalid-${profile}`);
    const res = setup(project, profile);
    assert.notEqual(res.status, 0, `${profile} must fail`);
    assert.ok(!existsSync(join(project, ".opencode")), `${profile}: no .opencode may be created`);
    assert.ok(!existsSync(join(project, ".agents")), `${profile}: no .agents may be created`);
  }
});

test("an invalid manifest leaves an existing installation intact", () => {
  const project = newProject("invalid-after-install");
  assert.equal(setup(project, "p-one").status, 0);

  const res = setup(project, "bad-include");
  assert.notEqual(res.status, 0, "bad-include must fail");

  const skills = join(project, ".agents", "skills");
  assert.equal(linkDest(join(skills, "alpha")), real(join(store, "alpha")), "existing managed links must survive");
  assert.equal(linkDest(join(skills, "beta")), real(join(store, "beta")));
  assert.ok(isSymlink(join(project, ".agents", "workflows")), "workflows link must survive");
  assert.ok(isSymlink(join(project, ".opencode")), ".opencode link must survive");
});

test("repeated setup is idempotent and keeps foreign links", () => {
  const project = newProject("idempotent");
  foreignSkillLink(project);
  assert.equal(setup(project, "p-one").status, 0);

  const res = setup(project, "p-one");
  assert.equal(res.status, 0, res.stderr);
  const skills = join(project, ".agents", "skills");
  assert.equal(linkDest(join(skills, "alpha")), real(join(store, "alpha")));
  assert.equal(linkDest(join(skills, "beta")), real(join(store, "beta")));
  assert.equal(linkDest(join(skills, "foreign-skill")), join(foreignStore, "foreign-skill"));
  assert.match(res.stdout, /2 skills linked/);
});

test("profile switches refresh managed links and preserve foreign ones", () => {
  const project = newProject("switch");
  foreignSkillLink(project);
  assert.equal(setup(project, "p-one").status, 0);
  assert.equal(setup(project, "p-two").status, 0);

  const skills = join(project, ".agents", "skills");
  assert.equal(linkDest(join(skills, "alpha")), real(join(store, "alpha")));
  assert.ok(!existsSync(join(skills, "beta")), "stale managed link must be removed by the switch");
  assert.equal(linkDest(join(skills, "gamma")), real(join(store, "gamma")));
  assert.equal(linkDest(join(skills, "foreign-skill")), join(foreignStore, "foreign-skill"));

  assert.equal(setup(project, "p-one").status, 0);
  assert.ok(existsSync(join(skills, "beta")));
  assert.ok(!existsSync(join(skills, "gamma")));
  assert.equal(linkDest(join(skills, "foreign-skill")), join(foreignStore, "foreign-skill"));
});

test("relative symlink destinations are resolved for ownership", () => {
  const project = newProject("relative");
  assert.equal(setup(project, "p-one").status, 0);
  const skills = join(project, ".agents", "skills");

  // a relative link INTO the canonical store is ours: refreshed by setup…
  // (both endpoints are made physical first, so the relative target resolves
  // through the real filesystem rather than through the /var symlink)
  rmLink(join(skills, "beta"));
  symlinkSync(relative(real(skills), real(join(store, "beta"))), join(skills, "beta"));
  assert.equal(setup(project, "p-one").status, 0);
  assert.equal(linkDest(join(skills, "beta")), real(join(store, "beta")), "managed relative link must be refreshed");

  // …and removed by unlink.
  rmLink(join(skills, "beta"));
  symlinkSync(relative(real(skills), real(join(store, "beta"))), join(skills, "beta"));
  assert.equal(unlink(project).status, 0);
  assert.ok(!existsSync(join(skills, "beta")), "managed relative link must be unlinked");

  // a relative FOREIGN link survives both.
  mkdirSync(skills, { recursive: true });
  symlinkSync(relative(skills, join(foreignStore, "foreign-skill")), join(skills, "rel-foreign"));
  assert.equal(setup(project, "p-one").status, 0);
  assert.ok(isSymlink(join(skills, "rel-foreign")));
  assert.equal(unlink(project).status, 0);
  assert.ok(isSymlink(join(skills, "rel-foreign")), "foreign relative link must survive unlink");
});

test("unlink removes only managed links and keeps directories that hold foreign content", () => {
  const project = newProject("unlink-mixed");
  foreignSkillLink(project);
  assert.equal(setup(project, "p-one").status, 0);

  const res = unlink(project);
  assert.equal(res.status, 0, res.stderr);
  const skills = join(project, ".agents", "skills");
  assert.ok(!existsSync(join(skills, "alpha")));
  assert.ok(!existsSync(join(skills, "beta")));
  assert.equal(linkDest(join(skills, "foreign-skill")), join(foreignStore, "foreign-skill"));
  assert.ok(existsSync(skills), "skills dir must be kept while it holds a foreign link");
  assert.ok(existsSync(join(project, ".agents")), ".agents must be kept while non-empty");
  assert.ok(!isSymlink(join(project, ".agents", "workflows")), "managed workflows link must be removed");
  assert.ok(!existsSync(join(project, ".opencode")), "managed .opencode link must be removed");
});

test("unlink preserves a foreign .opencode symlink", () => {
  const project = newProject("unlink-opencode");
  const foreignOpencode = join(workspace, "foreign-opencode");
  mkdirSync(foreignOpencode, { recursive: true });
  symlinkSync(foreignOpencode, join(project, ".opencode"));

  const res = unlink(project, "opencode");
  assert.equal(res.status, 0, res.stderr);
  assert.ok(isSymlink(join(project, ".opencode")));
  assert.equal(linkDest(join(project, ".opencode")), foreignOpencode);
});

test("a real directory occupying a skill path is preserved, not nested-linked, not counted", () => {
  const project = newProject("conflict-dir");
  const localSkill = join(project, ".agents", "skills", "alpha");
  mkdirSync(localSkill, { recursive: true });
  writeFileSync(join(localSkill, "SKILL.md"), "--- user-owned ---\n");

  const res = setup(project, "p-one");
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!isSymlink(localSkill), "local directory must stay a real directory");
  assert.ok(!existsSync(join(localSkill, "alpha")), "no nested alpha/alpha symlink may be created");
  assert.equal(readFileSync(join(localSkill, "SKILL.md"), "utf8"), "--- user-owned ---\n");
  assert.equal(linkDest(join(project, ".agents", "skills", "beta")), real(join(store, "beta")));
  assert.match(res.stdout, /alpha.*(directory|real|exists)/i);
  assert.match(res.stdout, /1 skills linked/);

  // repeated setup stays stable
  const again = setup(project, "p-one");
  assert.equal(again.status, 0, again.stderr);
  assert.ok(!isSymlink(localSkill));
  assert.ok(!existsSync(join(localSkill, "alpha")));
});

test("a real file occupying a skill path is preserved", () => {
  const project = newProject("conflict-file");
  const localSkill = join(project, ".agents", "skills", "alpha");
  mkdirSync(dirname(localSkill), { recursive: true });
  writeFileSync(localSkill, "user file\n");

  const res = setup(project, "p-one");
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!isSymlink(localSkill));
  assert.equal(readFileSync(localSkill, "utf8"), "user file\n");
  assert.match(res.stdout, /1 skills linked/);
});

test("profile switches preserve local content occupying skill paths", () => {
  const project = newProject("switch-conflict");
  const localSkill = join(project, ".agents", "skills", "alpha");
  mkdirSync(localSkill, { recursive: true });
  writeFileSync(join(localSkill, "SKILL.md"), "--- user-owned ---\n");

  assert.equal(setup(project, "p-two").status, 0);
  assert.ok(!isSymlink(localSkill));
  assert.equal(readFileSync(join(localSkill, "SKILL.md"), "utf8"), "--- user-owned ---\n");
  assert.equal(linkDest(join(project, ".agents", "skills", "gamma")), real(join(store, "gamma")));

  assert.equal(setup(project, "p-one").status, 0);
  assert.ok(!isSymlink(localSkill));
  assert.equal(readFileSync(join(localSkill, "SKILL.md"), "utf8"), "--- user-owned ---\n");
  assert.equal(linkDest(join(project, ".agents", "skills", "beta")), real(join(store, "beta")));
});

test("switching curated → full replaces only fully-managed dirs with the whole-dir symlink", () => {
  const managedOnly = newProject("to-full-managed");
  assert.equal(setup(managedOnly, "p-one").status, 0);
  assert.equal(setup(managedOnly, "full").status, 0);
  assert.ok(isSymlink(join(managedOnly, ".agents")));
  assert.equal(linkDest(join(managedOnly, ".agents")), real(join(fixture, ".agents")));
  assert.equal(unlink(managedOnly).status, 0);
  assert.ok(!existsSync(join(managedOnly, ".agents")));

  // A dir holding foreign content cannot be converted: the curated
  // installation must be left INTACT (no managed link removed) and the
  // command must fail rather than silently skip the whole-dir link.
  const withForeign = newProject("to-full-foreign");
  foreignSkillLink(withForeign);
  assert.equal(setup(withForeign, "p-one").status, 0);
  const res = setup(withForeign, "full");
  assert.notEqual(res.status, 0, "blocked conversion must fail, not skip with success");
  assert.ok(!isSymlink(join(withForeign, ".agents")), "must not create the whole-dir link over a real dir");
  const skills = join(withForeign, ".agents", "skills");
  assert.equal(linkDest(join(skills, "alpha")), real(join(store, "alpha")), "curated links must survive");
  assert.equal(linkDest(join(skills, "beta")), real(join(store, "beta")), "curated links must survive");
  assert.equal(linkDest(join(skills, "foreign-skill")), join(foreignStore, "foreign-skill"));
  assert.ok(isSymlink(join(withForeign, ".agents", "workflows")), "workflows link must survive");
  assert.match(`${res.stdout}\n${res.stderr}`, /left intact/i);
});

test("repeated full setup never traverses a foreign symlinked .agents", () => {
  const project = newProject("full-foreign-traverse");
  const foreignAgents = join(workspace, "foreign-agents-traverse");
  // the foreign dir holds a link INTO our canonical store: it lives in
  // content we do not own, so nothing may remove it — not even setup full
  // run repeatedly over the symlinked .agents
  mkdirSync(join(foreignAgents, "skills"), { recursive: true });
  symlinkSync(join(store, "alpha"), join(foreignAgents, "skills", "alpha"));

  symlinkSync(foreignAgents, join(project, ".agents"));
  for (let i = 0; i < 2; i++) {
    const res = setup(project, "full");
    assert.equal(res.status, 0, res.stderr);
    assert.ok(isSymlink(join(project, ".agents")));
    assert.equal(linkDest(join(project, ".agents")), foreignAgents);
    assert.ok(isSymlink(join(foreignAgents, "skills", "alpha")), "links inside the foreign dir must survive");
  }
});

test("repeated full setup leaves the canonical store untouched", () => {
  // a symlink inside the store pointing back into the store (as created by
  // skill managers): a repeated full setup must not sweep the store itself
  const alias = join(store, "store-alias");
  symlinkSync(join(store, "alpha"), alias);
  try {
    const project = newProject("full-store-safe");
    assert.equal(setup(project, "full").status, 0);
    assert.equal(setup(project, "full").status, 0, "second run traversed .agents into the store");
    assert.ok(isSymlink(alias), "symlinks inside the canonical store must survive");
    assert.ok(existsSync(join(alias, "SKILL.md")), "alias must still resolve");
  } finally {
    rmLink(alias);
  }
});

test("hidden managed links are included in the curated→full conversion", () => {
  const project = newProject("to-full-hidden");
  assert.equal(setup(project, "p-one").status, 0);
  const skills = join(project, ".agents", "skills");
  // a hidden symlink into the canonical store is attributable to
  // agent-brains: if validation counts it as removable, cleanup must too —
  // otherwise links get removed, full is skipped, and the command succeeds
  symlinkSync(join(store, "alpha"), join(skills, ".alias"));

  const res = setup(project, "full");
  assert.equal(res.status, 0, res.stderr);
  assert.ok(isSymlink(join(project, ".agents")), "conversion must complete, not half-happen");
  assert.equal(linkDest(join(project, ".agents")), real(join(fixture, ".agents")));
});

test("hidden links are refreshed/unlinked like visible ones (managed removed, foreign kept)", () => {
  const project = newProject("hidden-refresh");
  assert.equal(setup(project, "p-one").status, 0);
  const skills = join(project, ".agents", "skills");
  symlinkSync(join(store, "alpha"), join(skills, ".h-managed"));
  symlinkSync(join(foreignStore, "foreign-skill"), join(skills, ".h-foreign"));

  assert.equal(setup(project, "p-two").status, 0);
  assert.ok(!existsSync(join(skills, ".h-managed")), "hidden managed link must be removed by the profile switch");
  assert.ok(isSymlink(join(skills, ".h-foreign")), "hidden foreign link must survive setup");

  symlinkSync(join(store, "alpha"), join(skills, ".h-managed2"));
  assert.equal(unlink(project).status, 0);
  assert.ok(!existsSync(join(skills, ".h-managed2")), "hidden managed link must be unlinked");
  assert.ok(isSymlink(join(skills, ".h-foreign")), "hidden foreign link must survive unlink");
});

test("a real file at .agents/skills blocks the curated→full conversion before any removal", () => {
  const project = newProject("to-full-skills-file");
  assert.equal(setup(project, "p-one").status, 0);
  const skills = join(project, ".agents", "skills");
  for (const name of ["alpha", "beta"]) rmLink(join(skills, name));
  rmSync(skills, { recursive: true });
  writeFileSync(skills, "user file\n");

  const res = setup(project, "full");
  assert.notEqual(res.status, 0, "must fail, not skip with success");
  assert.equal(readFileSync(skills, "utf8"), "user file\n", "the local file must be preserved");
  assert.ok(!isSymlink(join(project, ".agents")), "no whole-dir link over a real dir");
  assert.ok(isSymlink(join(project, ".agents", "workflows")), "managed workflows link must survive");
  assert.match(`${res.stdout}\n${res.stderr}`, /left intact/i);
});

test("curated setup refuses .agents or .agents/skills real files before any mutation", () => {
  const skillsFile = newProject("curated-skills-file");
  mkdirSync(join(skillsFile, ".agents"), { recursive: true });
  writeFileSync(join(skillsFile, ".agents", "skills"), "x\n");
  const r1 = setup(skillsFile, "p-one");
  assert.notEqual(r1.status, 0);
  assert.equal(readFileSync(join(skillsFile, ".agents", "skills"), "utf8"), "x\n");
  assert.ok(!existsSync(join(skillsFile, ".opencode")), "must fail before linking anything");

  const agentsFile = newProject("curated-agents-file");
  writeFileSync(join(agentsFile, ".agents"), "x\n");
  const r2 = setup(agentsFile, "p-one");
  assert.notEqual(r2.status, 0);
  assert.equal(readFileSync(join(agentsFile, ".agents"), "utf8"), "x\n");
  assert.ok(!existsSync(join(agentsFile, ".opencode")), "must fail before linking anything");
});

test("full conversion of a skills → canonical-store symlink works without .agents/workflows", () => {
  // second fixture repository WITHOUT .agents/workflows: removal of the
  // whole-store skills link must not depend on workflows presence
  const fx2 = join(workspace, "fixture-no-workflows");
  mkdirSync(fx2, { recursive: true });
  cpSync(join(ROOT, "setup.sh"), join(fx2, "setup.sh"));
  cpSync(join(ROOT, "unlink.sh"), join(fx2, "unlink.sh"));
  const store2 = join(fx2, ".agents", "skills");
  for (const name of ["alpha", "beta"]) makeSkill(store2, name, `fx2 ${name}`);
  mkdirSync(join(fx2, ".opencode"), { recursive: true });
  writeFileSync(join(fx2, ".opencode", "opencode.json"), "{}\n");
  mkdirSync(join(fx2, "profiles"), { recursive: true });
  writeFileSync(join(fx2, "profiles", "p-one.list"), "alpha\nbeta\n");

  const project = newProject("full-no-workflows");
  mkdirSync(join(project, ".agents"), { recursive: true });
  symlinkSync(store2, join(project, ".agents", "skills"));

  const res = spawnSync("bash", [join(fx2, "setup.sh"), project, "full"], { encoding: "utf8" });
  assert.equal(res.status ?? -1, 0, res.stderr ?? "");
  assert.ok(isSymlink(join(project, ".agents")), "conversion must replace the real dir with the whole-dir link");
  assert.equal(linkDest(join(project, ".agents")), real(join(fx2, ".agents")));
});

test("switching full → curated removes the managed whole-dir link and installs the profile", () => {
  const project = newProject("from-full");
  assert.equal(setup(project, "full").status, 0);
  assert.equal(setup(project, "p-one").status, 0);
  assert.ok(!isSymlink(join(project, ".agents")));
  assert.equal(linkDest(join(project, ".agents", "skills", "alpha")), real(join(store, "alpha")));
  assert.equal(linkDest(join(project, ".agents", "skills", "beta")), real(join(store, "beta")));
});

test("opencode-only setup warns about the .agents dependency and names the exact command", () => {
  const project = newProject("opencode-warning");
  const res = setup(project, "opencode");

  assert.equal(res.status, 0, res.stderr);
  assert.ok(isSymlink(join(project, ".opencode")), ".opencode must still be linked");
  assert.ok(!existsSync(join(project, ".agents")), "opencode-only must not link .agents");
  assert.match(res.stdout, /\.agents\/workflows/);
  assert.match(res.stdout, /setup\.sh.*" full/);
  assert.match(res.stdout, new RegExp(`"${real(project).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" full`));

  // Other profiles keep their existing behaviour (no opencode-only warning
  // body, even when the run itself is not labelled "opencode-only").
  const curated = setup(newProject("profile-no-warning"), "p-one");
  assert.equal(curated.status, 0, curated.stderr);
  assert.doesNotMatch(
    curated.stdout,
    /The OpenCode agent pointers|NOT linked in this mode|To link \.agents too/,
  );
});

test("setup adds Pi runtime ignore entries exactly once across repeated runs", () => {
  const project = newProject("gitignore-pi-runtime");
  writeFileSync(join(project, ".gitignore"), "node_modules\n");

  for (let i = 0; i < 2; i++) {
    const res = setup(project, "p-one");
    assert.equal(res.status, 0, res.stderr);
  }

  const lines = readFileSync(join(project, ".gitignore"), "utf8").split(/\r?\n/);
  assert.ok(lines.includes("node_modules"), "existing entries must be preserved");
  for (const entry of [".pi/pi-brain.lock", ".pi/pi-brain/"]) {
    assert.equal(
      lines.filter((line) => line === entry).length,
      1,
      `${entry} must appear exactly once`,
    );
  }
});

test("setup separates new .gitignore entries when the file lacks a trailing newline", () => {
  const project = newProject("gitignore-no-final-newline");
  writeFileSync(join(project, ".gitignore"), ".opencode\n.agents");

  for (let i = 0; i < 2; i++) {
    const res = setup(project, "p-one");
    assert.equal(res.status, 0, res.stderr);
  }

  const lines = readFileSync(join(project, ".gitignore"), "utf8").split(/\r?\n/);
  assert.ok(lines.includes(".opencode"), ".opencode must remain an exact entry");
  assert.ok(lines.includes(".agents"), ".agents must remain an exact entry");
  assert.ok(
    !lines.some((line) => line.startsWith(".agents.pi/")),
    "a new entry must not be concatenated to the previous last line",
  );
  for (const entry of [".pi/pi-brain.lock", ".pi/pi-brain/"]) {
    assert.equal(
      lines.filter((line) => line === entry).length,
      1,
      `${entry} must appear exactly once`,
    );
  }
});
