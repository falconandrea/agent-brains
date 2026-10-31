import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "install-global-skills.sh");

const fixture = (): string => mkdtempSync(join(tmpdir(), "agent-brains-global-"));
const run = (
  home: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
  script = SCRIPT,
) => spawnSync("/bin/bash", [script, ...args, "--home", home], {
  encoding: "utf8",
  env,
});
const skillLinks = (home: string): string[] => {
  const path = join(home, ".agents", "skills");
  return existsSync(path) ? readdirSync(path).filter((name) => lstatSync(join(path, name)).isSymbolicLink()) : [];
};

test("global installer defaults to a read-only preview", () => {
  const home = fixture();
  try {
    const result = run(home);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Mode: preview \(read-only\)/);
    assert.match(result.stdout, /LINK: spec-and-tasks/);
    assert.equal(existsSync(join(home, ".agents")), false);
    assert.equal(existsSync(join(home, ".config")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("global installer preserves colliding personal skills and existing OpenCode commands", () => {
  const home = fixture();
  try {
    const skillDir = join(home, ".agents", "skills", "react-doctor");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "personal skill stays intact\n");
    const command = join(home, ".config", "opencode", "commands", "spec-and-tasks.md");
    mkdirSync(dirname(command), { recursive: true });
    writeFileSync(command, "personal command stays intact\n");
    const result = run(home, ["--apply"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CONFLICT \(preserved\): react-doctor/);
    assert.match(result.stdout, /CONFLICT \(preserved\): OpenCode \/spec-and-tasks command/);
    assert.equal(readFileSync(join(skillDir, "SKILL.md"), "utf8"), "personal skill stays intact\n");
    assert.equal(readFileSync(command, "utf8"), "personal command stays intact\n");
    assert.ok(lstatSync(join(home, ".agents", "skills", "spec-and-tasks")).isSymbolicLink());
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("global installer skips a name already defined in OpenCode's higher-priority global skills", () => {
  const home = fixture();
  try {
    const duplicate = join(home, ".config", "opencode", "skills", "react-doctor");
    mkdirSync(duplicate, { recursive: true });
    writeFileSync(join(duplicate, "SKILL.md"), "existing OpenCode copy\n");
    const preview = run(home);
    assert.match(preview.stdout, /CONFLICT \(OpenCode duplicate; preserved\): react-doctor/);
    assert.equal(existsSync(join(home, ".agents")), false);
    const result = run(home, ["--apply"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(home, ".agents", "skills", "react-doctor")), false);
    assert.equal(readFileSync(join(duplicate, "SKILL.md"), "utf8"), "existing OpenCode copy\n");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("global installer is idempotent and leaves unrelated personal content in place", () => {
  const home = fixture();
  try {
    const personal = join(home, ".agents", "skills", "my-private-skill");
    mkdirSync(personal, { recursive: true });
    writeFileSync(join(personal, "SKILL.md"), "personal content\n");
    assert.equal(run(home, ["--apply"]).status, 0);
    const firstCount = skillLinks(home).length;
    const second = run(home, ["--apply"]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /ALREADY LINKED: spec-and-tasks/);
    assert.equal(skillLinks(home).length, firstCount);
    assert.equal(readFileSync(join(personal, "SKILL.md"), "utf8"), "personal content\n");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("rollback removes only unchanged installer links and preserves changed paths", () => {
  const home = fixture();
  try {
    assert.equal(run(home, ["--apply"]).status, 0);
    const changed = join(home, ".agents", "skills", "spec-and-tasks");
    unlinkSync(changed);
    mkdirSync(changed);
    writeFileSync(join(changed, "SKILL.md"), "user replacement\n");
    const result = run(home, ["--rollback"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PRESERVED \(changed since install\): \.agents\/skills\/spec-and-tasks/);
    assert.equal(readFileSync(join(changed, "SKILL.md"), "utf8"), "user replacement\n");
    assert.equal(existsSync(join(home, ".config", "opencode", "commands", "spec-and-tasks.md")), false);
    assert.equal(existsSync(join(home, ".agents", ".agent-brains-global-manifest")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("doctor reports duplicates and checks manifest link state", () => {
  const home = fixture();
  try {
    const openCodeDuplicate = join(home, ".config", "opencode", "skills", "react-doctor");
    mkdirSync(openCodeDuplicate, { recursive: true });
    writeFileSync(join(openCodeDuplicate, "SKILL.md"), "separate copy\n");
    const before = run(home, ["--doctor"]);
    assert.notEqual(before.status, 0);
    assert.match(before.stdout, /DUPLICATE: OpenCode 'react-doctor' conflicts with the canonical catalog/);
    const install = run(home, ["--apply"]);
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);
    const installed = join(home, ".agents", "skills", "spec-and-tasks");
    assert.ok(existsSync(installed), `${install.stdout}\n${install.stderr}`);
    unlinkSync(installed);
    mkdirSync(installed);
    writeFileSync(join(installed, "SKILL.md"), "replacement\n");
    const after = run(home, ["--doctor"]);
    assert.notEqual(after.status, 0);
    assert.match(after.stdout, /installer link/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("failed manifest mv rolls back every created link and leaves rollback a no-op", () => {
  const home = fixture();
  const bin = join(home, "fault-bin");
  const fakeMv = join(bin, "mv");
  try {
    mkdirSync(bin);
    writeFileSync(fakeMv, "#!/bin/sh\nexit 73\n");
    chmodSync(fakeMv, 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
    const failed = run(home, ["--apply"], env);
    assert.notEqual(failed.status, 0);
    assert.equal(skillLinks(home).length, 0, `${failed.stdout}\n${failed.stderr}`);
    assert.equal(existsSync(join(home, ".agents", ".agent-brains-global-manifest")), false);
    assert.equal(readdirSync(join(home, ".agents")).some((name) => name.includes(".tmp.")), false);
    const rollback = run(home, ["--rollback"]);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.match(rollback.stdout, /No installer manifest/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("rollback refuses symlinked parents before touching external links or manifest", () => {
  const home = fixture();
  const external = join(home, "external");
  const externalAgents = join(external, ".agents");
  const externalSkills = join(externalAgents, "skills");
  const skillName = "spec-and-tasks";
  const skillSource = join(ROOT, ".agents", "skills", skillName);
  const externalSkill = join(externalSkills, skillName);
  const externalManifest = join(externalAgents, ".agent-brains-global-manifest");
  const command = join(home, ".config", "opencode", "commands", "spec-and-tasks.md");
  try {
    mkdirSync(externalSkills, { recursive: true });
    mkdirSync(dirname(command), { recursive: true });
    symlinkSync(skillSource, externalSkill);
    symlinkSync(join(ROOT, "adapters", "opencode", "commands", "spec-and-tasks.md"), command);
    writeFileSync(externalManifest,
      `.agents/skills/${skillName}\t${skillSource}\n` +
      `.config/opencode/commands/spec-and-tasks.md\t${join(ROOT, "adapters", "opencode", "commands", "spec-and-tasks.md")}\n`,
    );
    const replacedAgents = join(home, ".agents.original");
    mkdirSync(replacedAgents);
    symlinkSync(externalAgents, join(home, ".agents"));
    const result = run(home, ["--rollback"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to write through symlinked directory/);
    assert.ok(lstatSync(externalSkill).isSymbolicLink());
    assert.ok(existsSync(externalManifest));
    assert.ok(lstatSync(command).isSymbolicLink());
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("invalid manifest is rejected before rollback removes any listed link", () => {
  const home = fixture();
  const agents = join(home, ".agents");
  const skills = join(agents, "skills");
  const skillName = "spec-and-tasks";
  const skillSource = join(ROOT, ".agents", "skills", skillName);
  const skillLink = join(skills, skillName);
  const command = join(home, ".config", "opencode", "commands", "spec-and-tasks.md");
  const commandSource = join(ROOT, "adapters", "opencode", "commands", "spec-and-tasks.md");
  const manifest = join(agents, ".agent-brains-global-manifest");
  try {
    mkdirSync(skills, { recursive: true });
    mkdirSync(dirname(command), { recursive: true });
    symlinkSync(skillSource, skillLink);
    symlinkSync(commandSource, command);
    const contents = `.agents/skills/${skillName}\t${skillSource}\n../../outside\t${skillSource}\n`;
    writeFileSync(manifest, contents);
    const result = run(home, ["--rollback"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid manifest path/);
    assert.ok(lstatSync(skillLink).isSymbolicLink());
    assert.ok(lstatSync(command).isSymbolicLink());
    assert.equal(readFileSync(manifest, "utf8"), contents);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("missing home reports the intended validation error", () => {
  const home = fixture();
  try {
    rmSync(home, { recursive: true, force: true });
    const result = run(home, ["--doctor"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ERROR: home directory does not exist/);
    assert.doesNotMatch(result.stderr, /fail: command not found/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("doctor counts an invalid manifest and returns failure with no other findings", () => {
  const root = fixture();
  const repo = join(root, "minimal-repo");
  const home = join(root, "home");
  const script = join(repo, "install-global-skills.sh");
  try {
    const skills = join(repo, ".agents", "skills", "alpha");
    mkdirSync(skills, { recursive: true });
    mkdirSync(join(repo, "profiles"), { recursive: true });
    mkdirSync(join(repo, "src"), { recursive: true });
    mkdirSync(join(home, ".agents"), { recursive: true });
    copyFileSync(SCRIPT, script);
    writeFileSync(join(skills, "SKILL.md"), "---\nname: alpha\ndescription: fixture\n---\n");
    writeFileSync(join(repo, "profiles", "common.list"), "alpha\n");
    writeFileSync(join(repo, "src", "skill-router.ts"), "const SKILL_CATEGORIES = {\n};\n");
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "../../escape\t/invalid/source\n");

    const result = run(home, ["--doctor"], process.env, script);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /invalid manifest path/);
    assert.match(result.stdout, /FAIL: installer manifest is invalid/);
    assert.match(result.stdout, /Result: 1 issue\(s\) found/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
