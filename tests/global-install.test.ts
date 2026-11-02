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
  readlinkSync,
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
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /CONFLICT \(preserved\): react-doctor/);
    assert.match(result.stdout, /CONFLICT \(preserved\): OpenCode \/spec-and-tasks command/);
    assert.match(result.stdout, /RESULT: INCOMPLETE/);
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
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /RESULT: INCOMPLETE/);
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
    assert.notEqual(install.status, 0, `${install.stdout}\n${install.stderr}`);
    assert.match(install.stdout, /RESULT: INCOMPLETE/);
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

const agentLinks = (home: string): string[] => {
  const path = join(home, ".config", "opencode", "agents");
  return existsSync(path) ? readdirSync(path).filter((name) => lstatSync(join(path, name)).isSymbolicLink()) : [];
};
const piSettings = (home: string): string => {
  const path = join(home, ".pi", "agent", "settings.json");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

test("apply installs the seven agent adapters idempotently and reports COMPLETE", () => {
  const home = fixture();
  try {
    const first = run(home, ["--apply"]);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.match(first.stdout, /LINKED: OpenCode agent astro\.md|ALREADY LINKED: OpenCode agent astro\.md/);
    assert.equal(agentLinks(home).length, 7);
    assert.ok(lstatSync(join(home, ".config", "opencode", "agents", "spec-and-tasks.md")).isSymbolicLink());
    const second = run(home, ["--apply"]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(second.stdout, /ALREADY LINKED: OpenCode agent astro\.md/);
    assert.equal(agentLinks(home).length, 7);
    assert.match(second.stdout, /RESULT: COMPLETE/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a pre-existing Pi registration is preserved and never owned by the manifest", () => {
  const home = fixture();
  try {
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    const foreign = join(home, "foreign-package");
    mkdirSync(foreign);
    const before = `{\n  "packages": [\n    "${ROOT}",\n    "${foreign}"\n  ]\n}\n`;
    writeFileSync(join(home, ".pi", "agent", "settings.json"), before);
    const result = run(home, ["--apply"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /ALREADY REGISTERED: Pi package/);
    assert.match(result.stdout, /RESULT: COMPLETE/);
    assert.equal(piSettings(home), before, "pre-existing settings must stay byte-identical");
    const manifest = readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8");
    assert.doesNotMatch(manifest, /settings\.json/, "unowned registration must not enter the manifest");
    const rollback = run(home, ["--rollback"]);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.equal(piSettings(home), before, "rollback must not touch a registration it does not own");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("apply registers Pi through its package manager and rollback removes only that entry", () => {
  const home = fixture();
  try {
    const result = run(home, ["--apply"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /REGISTERED: Pi package/);
    assert.match(piSettings(home), /packages/);
    const foreign = join(home, "foreign-package");
    mkdirSync(foreign);
    // Simulate a concurrent edit: a foreign registration is added after ours.
    const manifest = JSON.parse(piSettings(home)) as { packages: string[] };
    manifest.packages.push(foreign);
    writeFileSync(join(home, ".pi", "agent", "settings.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const rollback = run(home, ["--rollback"]);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.match(rollback.stdout, /REMOVED: Pi package registration/);
    const after = JSON.parse(piSettings(home)) as { packages: string[] };
    assert.deepEqual(after.packages, [foreign], "only the owned registration may be removed");
    assert.equal(existsSync(join(home, ".agents", "skills", "spec-and-tasks")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("missing pi executable yields INCOMPLETE and a rerun completes the registration", () => {
  const home = fixture();
  const bin = join(home, "empty-bin");
  try {
    mkdirSync(bin);
    // Standard tool dirs without the Homebrew prefix that hosts `pi`.
    const noPi = { ...process.env, PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin` };
    const first = run(home, ["--apply"], noPi);
    assert.notEqual(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.match(first.stdout, /INCOMPLETE: pi executable not found/);
    assert.match(first.stdout, /RESULT: INCOMPLETE/);
    assert.ok(lstatSync(join(home, ".agents", "skills", "spec-and-tasks")).isSymbolicLink(), "file links still install");
    const manifest = readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8");
    assert.doesNotMatch(manifest, /settings\.json/, "no Pi ownership is recorded without a registration");
    const second = run(home, ["--apply"]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(second.stdout, /REGISTERED: Pi package/);
    assert.match(second.stdout, /RESULT: COMPLETE/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("occupied and dangling agent destinations are preserved untouched", () => {
  const home = fixture();
  try {
    const agents = join(home, ".config", "opencode", "agents");
    mkdirSync(agents, { recursive: true });
    const occupied = join(agents, "start.md");
    writeFileSync(occupied, "foreign agent content stays intact\n");
    const dangling = join(agents, "laravel.md");
    symlinkSync(join(home, "nowhere", "missing.md"), dangling);
    const result = run(home, ["--apply"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /CONFLICT \(preserved\): OpenCode agent start\.md/);
    assert.match(result.stdout, /CONFLICT \(preserved\): OpenCode agent laravel\.md/);
    assert.equal(readFileSync(occupied, "utf8"), "foreign agent content stays intact\n");
    assert.ok(lstatSync(dangling).isSymbolicLink());
    assert.equal(readlinkSync(dangling), join(home, "nowhere", "missing.md"));
    const installed = join(agents, "astro.md");
    assert.ok(lstatSync(installed).isSymbolicLink(), "non-conflicting agents still install");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("an old-format manifest stays readable and a rerun adds the new resources", () => {
  const home = fixture();
  try {
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    mkdirSync(join(home, ".config", "opencode", "commands"), { recursive: true });
    const skillName = "spec-and-tasks";
    const skillSource = join(ROOT, ".agents", "skills", skillName);
    const commandSource = join(ROOT, "adapters", "opencode", "commands", "spec-and-tasks.md");
    symlinkSync(skillSource, join(home, ".agents", "skills", skillName));
    symlinkSync(commandSource, join(home, ".config", "opencode", "commands", "spec-and-tasks.md"));
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"),
      `.agents/skills/${skillName}\t${skillSource}\n` +
      `.config/opencode/commands/spec-and-tasks.md\t${commandSource}\n`,
    );
    const result = run(home, ["--apply"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /ALREADY LINKED: spec-and-tasks/);
    assert.equal(agentLinks(home).length, 7, "rerun must add the agent adapters");
    const manifest = readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8");
    assert.match(manifest, /\.config\/opencode\/agents\/astro\.md/);
    const doctor = run(home, ["--doctor"]);
    assert.equal(doctor.status, 0, `${doctor.stdout}\n${doctor.stderr}`);
    const rollback = run(home, ["--rollback"]);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.equal(existsSync(join(home, ".config", "opencode", "agents")), false);
    assert.equal(existsSync(join(home, ".agents", "skills", skillName)), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a moved checkout is detected and left unmutated", () => {
  const home = fixture();
  const oldCheckout = join(home, "old-checkout");
  try {
    mkdirSync(join(oldCheckout, ".agents", "skills"), { recursive: true });
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const skillName = "spec-and-tasks";
    const oldSource = join(oldCheckout, ".agents", "skills", skillName);
    mkdirSync(oldSource, { recursive: true });
    writeFileSync(join(oldSource, "SKILL.md"), "old checkout skill\n");
    symlinkSync(oldSource, join(home, ".agents", "skills", skillName));
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"),
      `.agents/skills/${skillName}\t${oldSource}\n`,
    );
    const manifestBefore = readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8");
    for (const mode of ["--apply", "--rollback"] as const) {
      const result = run(home, [mode]);
      assert.notEqual(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout + result.stderr, /CHECKOUT RELOCATED/);
    }
    const doctor = run(home, ["--doctor"]);
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /CHECKOUT RELOCATED/);
    assert.equal(readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8"), manifestBefore);
    assert.ok(lstatSync(join(home, ".agents", "skills", skillName)).isSymbolicLink());
    assert.equal(readFileSync(join(oldSource, "SKILL.md"), "utf8"), "old checkout skill\n");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("doctor reports an obsolete managed source and a missing managed Pi registration", () => {
  const home = fixture();
  try {
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const staleName = "spec-and-tasks";
    const staleSource = join(ROOT, ".agents", "skills", staleName);
    symlinkSync(staleSource, join(home, ".agents", "skills", staleName));
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"),
      `.config/opencode/agents/start.md\t${join(ROOT, "adapters", "opencode", "agents", "start.md")}\n` +
      `${join(home, ".pi", "agent", "settings.json")}\tpi-package:${ROOT}\n`,
    );
    const doctor = run(home, ["--doctor"]);
    assert.notEqual(doctor.status, 0, doctor.stdout);
    assert.match(doctor.stdout, /managed Pi registration missing/);
    // The agent link for start.md does not exist either; manifest link check must fire.
    assert.match(doctor.stdout, /installer link missing or changed: \.config\/opencode\/agents\/start\.md/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("the documented relocation recovery ends in a successful reinstallation", () => {
  const home = fixture();
  const oldCheckout = join(home, "old-checkout");
  try {
    mkdirSync(join(oldCheckout, ".agents", "skills"), { recursive: true });
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const skillName = "spec-and-tasks";
    const oldSource = join(oldCheckout, ".agents", "skills", skillName);
    mkdirSync(oldSource, { recursive: true });
    writeFileSync(join(oldSource, "SKILL.md"), "old checkout skill\n");
    symlinkSync(oldSource, join(home, ".agents", "skills", skillName));
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"),
      `.agents/skills/${skillName}\t${oldSource}\n`,
    );
    // Step 0: apply is refused and prints the complete procedure.
    const refused = run(home, ["--apply"]);
    assert.notEqual(refused.status, 0);
    const guidance = refused.stdout + refused.stderr;
    assert.match(guidance, /CHECKOUT RELOCATED/);
    assert.match(guidance, /Archive the stale manifest/);
    assert.match(guidance, /--apply/);
    // Steps 2-3 from the printed procedure: remove old links, archive manifest.
    unlinkSync(join(home, ".agents", "skills", skillName));
    renameSync(
      join(home, ".agents", ".agent-brains-global-manifest"),
      join(home, ".agents", ".agent-brains-global-manifest.relocated.test"),
    );
    // Step 4: reinstallation from the new checkout succeeds.
    const reapplied = run(home, ["--apply"]);
    assert.equal(reapplied.status, 0, `${reapplied.stdout}\n${reapplied.stderr}`);
    assert.match(reapplied.stdout, /RESULT: COMPLETE/);
    assert.ok(lstatSync(join(home, ".agents", "skills", "spec-and-tasks")).isSymbolicLink());
    const manifest = readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8");
    assert.match(manifest, new RegExp(escapeRegExp(join(ROOT, ".agents", "skills", "spec-and-tasks"))));
    assert.equal(existsSync(join(oldSource, "SKILL.md")), true, "old checkout content is never touched");
    const doctor = run(home, ["--doctor"]);
    assert.equal(doctor.status, 0, `${doctor.stdout}\n${doctor.stderr}`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("apply reports INCOMPLETE for obsolete managed sources without pruning", () => {
  const home = fixture();
  try {
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const gone = "vanished-skill";
    // Link exists (dangling) and the manifest records the now-absent catalog path.
    symlinkSync(join(ROOT, ".agents", "skills", gone), join(home, ".agents", "skills", gone));
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"),
      `.agents/skills/${gone}\t${join(ROOT, ".agents", "skills", gone)}\n`,
    );
    const result = run(home, ["--apply"]);
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /OBSOLETE \(kept/);
    assert.match(result.stdout, /RESULT: INCOMPLETE/);
    assert.ok(lstatSync(join(home, ".agents", "skills", gone)).isSymbolicLink(),
      "obsolete resources are never pruned automatically");
    // Doctor reports the same obsolete state for manual removal.
    const doctor = run(home, ["--doctor"]);
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /OBSOLETE: managed source is missing/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("an XDG_CONFIG_HOME override redirects the OpenCode root and is reported", () => {
  const home = fixture();
  try {
    const xdg = join(home, "xdg");
    mkdirSync(xdg, { recursive: true });
    const env = { ...process.env, XDG_CONFIG_HOME: xdg };
    const preview = run(home, [], env);
    assert.match(preview.stdout,
      /OpenCode config root: \S*xdg\/opencode \(XDG_CONFIG_HOME override in effect\)/);
    const result = run(home, ["--apply"], env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /RESULT: COMPLETE/);
    assert.ok(lstatSync(join(xdg, "opencode", "agents", "astro.md")).isSymbolicLink(),
      "agents install under the override root OpenCode actually reads");
    assert.ok(lstatSync(join(xdg, "opencode", "commands", "spec-and-tasks.md")).isSymbolicLink());
    assert.equal(existsSync(join(home, ".config", "opencode")), false,
      "nothing is silently installed into an unused location");
    const manifest = readFileSync(join(home, ".agents", ".agent-brains-global-manifest"), "utf8");
    assert.match(manifest, /^xdg\/opencode\/agents\/astro\.md\t/m);
    const rollback = run(home, ["--rollback"], env);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.equal(existsSync(join(xdg, "opencode", "agents")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("apply and rollback refuse symlinked OpenCode parents under XDG", () => {
  const home = fixture();
  try {
    const xdg = join(home, "xdg");
    const external = join(home, "external-opencode");
    mkdirSync(join(external, "commands"), { recursive: true });
    mkdirSync(join(external, "agents"), { recursive: true });
    mkdirSync(xdg, { recursive: true });
    // $XDG_CONFIG_HOME/opencode is a symlink into another directory tree:
    // writing "through" it would mutate content the installer does not own.
    symlinkSync(external, join(xdg, "opencode"));
    const env = { ...process.env, XDG_CONFIG_HOME: xdg };

    const apply = run(home, ["--apply"], env);
    assert.notEqual(apply.status, 0, `${apply.stdout}\n${apply.stderr}`);
    assert.match(apply.stderr, /refusing to write through symlinked directory/);
    assert.equal(existsSync(join(external, "commands", "spec-and-tasks.md")), false,
      "no command may be written through the symlinked parent");
    assert.equal(readdirSync(join(external, "agents")).length, 0,
      "no agent may be written through the symlinked parent");
    assert.equal(existsSync(join(home, ".agents")), false,
      "apply aborts before any mutation");

    // Rollback refuses the same way and leaves every destination untouched.
    const commandSource = join(ROOT, "adapters", "opencode", "commands", "spec-and-tasks.md");
    const agentSource = join(ROOT, "adapters", "opencode", "agents", "astro.md");
    symlinkSync(commandSource, join(external, "commands", "spec-and-tasks.md"));
    symlinkSync(agentSource, join(external, "agents", "astro.md"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    writeFileSync(join(home, ".agents", ".agent-brains-global-manifest"),
      `xdg/opencode/commands/spec-and-tasks.md\t${commandSource}\n` +
      `xdg/opencode/agents/astro.md\t${agentSource}\n`,
    );
    const rollback = run(home, ["--rollback"], env);
    assert.notEqual(rollback.status, 0, `${rollback.stdout}\n${rollback.stderr}`);
    assert.match(rollback.stderr, /refusing to write through symlinked directory/);
    assert.ok(lstatSync(join(external, "commands", "spec-and-tasks.md")).isSymbolicLink(),
      "owned link outside the tree is untouched after refusal");
    assert.ok(lstatSync(join(external, "agents", "astro.md")).isSymbolicLink());
    assert.ok(existsSync(join(home, ".agents", ".agent-brains-global-manifest")),
      "manifest is untouched after refusal");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("repeat rollback after a completed rollback is a safe no-op", () => {
  const home = fixture();
  try {
    assert.equal(run(home, ["--apply"]).status, 0);
    assert.equal(run(home, ["--rollback"]).status, 0);
    const second = run(home, ["--rollback"]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /No installer manifest/);
    assert.deepEqual(readdirSync(join(home, ".agents", "skills")), [], "owned links are gone; the empty directory stays");
    assert.equal(existsSync(join(home, ".pi")), true, "Pi settings dir is not removed wholesale");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
