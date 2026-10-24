/**
 * U16 — measure what a main Pi session discovers after `pi install .`.
 *
 * Loads the installed package with Pi's own runtime and prints one JSON
 * document. It never prompts the model, so no provider request is made.
 *
 * Filesystem effects: the Pi SDK may create or update `auth.json` and
 * `models-store.json` in the agent directory passed as the second argument (or
 * via PI_CODING_AGENT_DIR). The script itself writes nothing. Always pass a
 * disposable agent directory: when the agent directory is the repository, those
 * runtime files appear at the repository root. See `U16-2026-10-24.md` for the
 * exact commands and the interpretation.
 *
 * Usage:
 *   node docs/evals/pi-skill-load/measure.mjs <cwd> <agent-dir>
 *
 * Required environment for an isolated run:
 *   HOME=<temp>/home
 *   PI_CODING_AGENT_DIR=<temp>/agent
 *   PI_OFFLINE=1
 *
 * Set PI_U16_APPROVE_PROJECT=1 to model an approved consumer project (needed
 * for the project-local duplicate experiment; a neutral project is unaffected).
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cwdArg = process.argv[2] ?? ".";
const agentDirArg = process.argv[3] ?? process.env.PI_CODING_AGENT_DIR;
if (!agentDirArg) {
  console.error("usage: node docs/evals/pi-skill-load/measure.mjs <cwd> <agent-dir>");
  process.exit(2);
}
const cwd = resolve(cwdArg);
const agentDir = resolve(agentDirArg);

const piRoot = join(repo, "node_modules/@earendil-works/pi-coding-agent");
const piPkg = JSON.parse(readFileSync(join(piRoot, "package.json"), "utf8"));
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import(
  pathToFileURL(join(piRoot, "dist/index.js"))
);
const { formatSkillsForPrompt } = await import(
  pathToFileURL(join(piRoot, "dist/core/skills.js"))
);
const { resolveProfile, listProfiles } = await import(pathToFileURL(join(repo, "src/profiles.ts")));
const { selectSkills } = await import(pathToFileURL(join(repo, "src/skill-router.ts")));

const bytes = (text) => Buffer.byteLength(text, "utf8");
const round = (n) => Number(n.toFixed(1));

const settingsManager =
  process.env.PI_U16_APPROVE_PROJECT === "1"
    ? SettingsManager.create(cwd, agentDir, { projectTrusted: true })
    : undefined;
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
await loader.reload();
const { skills, diagnostics } = loader.getSkills();
const visible = skills.filter((skill) => !skill.disableModelInvocation);
const section = formatSkillsForPrompt(skills);

// The real main-session prompt, built by Pi from this loader. The session is
// never prompted, so no provider request or token usage occurs.
const { session } = await createAgentSession({
  cwd,
  agentDir,
  resourceLoader: loader,
  settingsManager,
  sessionManager: SessionManager.inMemory(),
});
const prompt = session.systemPrompt;
session.dispose();

const bySource = {};
for (const skill of skills) {
  const key = `${skill.sourceInfo.source}|${skill.sourceInfo.scope}|${skill.sourceInfo.origin}`;
  bySource[key] ??= { skills: 0, descriptionChars: 0, descriptionBytes: 0 };
  bySource[key].skills++;
  bySource[key].descriptionChars += skill.description.length;
  bySource[key].descriptionBytes += bytes(skill.description);
}

const descriptionGroups = new Map();
for (const skill of visible) {
  descriptionGroups.set(skill.description, [
    ...(descriptionGroups.get(skill.description) ?? []),
    skill.name,
  ]);
}

const perSkill = skills
  .map((skill) => ({
    name: skill.name,
    descriptionChars: skill.description.length,
    descriptionBytes: bytes(skill.description),
    disableModelInvocation: skill.disableModelInvocation,
    filePath: skill.filePath,
    source: skill.sourceInfo.source,
    scope: skill.sourceInfo.scope,
    origin: skill.sourceInfo.origin,
  }))
  .sort((left, right) => right.descriptionBytes - left.descriptionBytes);

const available = new Set(skills.map((skill) => skill.name));
const allVisibleBytes = visible.reduce((total, skill) => total + bytes(skill.description), 0);

const profiles = listProfiles(join(repo, "profiles")).map((profile) => {
  const resolved = resolveProfile(join(repo, "profiles"), profile);
  const matched = resolved.skills
    .map((name) => visible.find((skill) => skill.name === name))
    .filter(Boolean);
  const descriptionBytes = matched.reduce(
    (total, skill) => total + bytes(skill.description),
    0,
  );
  const projectedBlock = formatSkillsForPrompt(matched);
  const projectedBlockBytes = bytes(projectedBlock);
  return {
    profile,
    listedSkills: resolved.skills.length,
    visibleSkills: matched.length,
    missingFromDiscovery: resolved.skills.filter((name) => !available.has(name)),
    descriptionChars: matched.reduce((total, skill) => total + skill.description.length, 0),
    descriptionBytes,
    shareOfAllVisibleDescriptions: round((descriptionBytes / allVisibleBytes) * 100),
    projectedSkillBlockBytes: projectedBlockBytes,
    projectedSkillBlockChars: projectedBlock.length,
    blockReductionBytes: bytes(section) - projectedBlockBytes,
    blockReductionPercent: round((1 - projectedBlockBytes / bytes(section)) * 100),
  };
});

const roles = ["planner", "developer", "reviewer", "security-reviewer", "tester"];
const childRouting = {};
for (const profile of ["nodejs", "nextjs", "laravel", "frontend", "astro"]) {
  childRouting[profile] = {};
  for (const role of roles) {
    const selection = selectSkills(join(repo, "profiles"), profile, role, available);
    const injected = selection.skills
      .map((name) => skills.find((skill) => skill.name === name))
      .filter(Boolean);
    const injectedVisible = injected.filter((skill) => !skill.disableModelInvocation);
    const block = formatSkillsForPrompt(injected);
    childRouting[profile][role] = {
      selectedSkills: selection.skills.length,
      promptVisibleSkills: injectedVisible.length,
      disabledSelected: injected
        .filter((skill) => skill.disableModelInvocation)
        .map((skill) => skill.name),
      descriptionChars: injectedVisible.reduce(
        (total, skill) => total + skill.description.length,
        0,
      ),
      descriptionBytes: injectedVisible.reduce(
        (total, skill) => total + bytes(skill.description),
        0,
      ),
      skillBlockBytes: bytes(block),
    };
  }
}

console.log(
  JSON.stringify(
    {
      runtime: {
        piVersion: piPkg.version,
        piRoot,
        repo,
        cwd,
        agentDir,
        settings: JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")),
      },
      parent: {
        discoveredSkills: skills.length,
        promptVisibleSkills: visible.length,
        disabledModelInvocation: skills
          .filter((skill) => skill.disableModelInvocation)
          .map((skill) => skill.name),
        descriptionChars: visible.reduce((total, skill) => total + skill.description.length, 0),
        descriptionBytes: allVisibleBytes,
        allDiscoveredDescriptionBytes: skills.reduce(
          (total, skill) => total + bytes(skill.description),
          0,
        ),
        skillBlockBytes: bytes(section),
        skillBlockChars: section.length,
        skillBlockOverheadBytes: bytes(section) - allVisibleBytes,
        promptBytes: bytes(prompt),
        promptChars: prompt.length,
        promptSkillEntries: (prompt.match(/<skill>/g) ?? []).length,
        promptContainsExactSkillBlock: prompt.includes(section),
        bySource,
        diagnostics,
        duplicateDescriptions: [...descriptionGroups.entries()]
          .filter(([, names]) => names.length > 1)
          .map(([description, names]) => ({ names, description })),
      },
      perSkill,
      profiles,
      childRouting,
    },
    null,
    2,
  ),
);
