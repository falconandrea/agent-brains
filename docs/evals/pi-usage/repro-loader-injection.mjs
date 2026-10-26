// P1 reproduction (offline, no provider call, no session.prompt()):
// does a child session built the way PiAgentRunner.run() builds it actually
// receive context files and skills in its system prompt?
//
// Usage: node docs/evals/pi-usage/repro-loader-injection.mjs <repoDir>
// Paths checked:
//  1. EXACT pre-fix runner behavior: buildResourceLoader() result passed to
//     createAgentSession WITHOUT reload() — the runner's construction at the
//     time of the invalid A/B.
//  2. The same loader reloaded BEFORE createAgentSession (the fix).
//  3. The pre-S1 append loader (A branch) reloaded — two copies expected.
//  4. What reload() would activate besides context/skills in THIS repo when
//     extensions are not disabled (child-constraint check).
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "p1-repro-"));
const home = join(root, "home");
const agentDir = join(root, "agent");
const project = join(root, "project");
mkdirSync(home, { recursive: true });
mkdirSync(agentDir, { recursive: true });
mkdirSync(join(project, ".agents", "skills", "selected-skill"), { recursive: true });
mkdirSync(join(project, ".agents", "skills", "unselected-skill"), { recursive: true });

process.env.HOME = home;
process.env.PI_CODING_AGENT_DIR = agentDir;

const AGENTS_MD =
  "# Fixture instructions\n\n" +
  "- This project's canonical retry limit is 7 attempts.\n" +
  "- Always cite the marker FIXTURE-AGENTS-MARKER when quoting these instructions.\n";
writeFileSync(join(project, "AGENTS.md"), AGENTS_MD, "utf8");
writeFileSync(
  join(project, ".agents", "skills", "selected-skill", "SKILL.md"),
  "---\nname: selected-skill\ndescription: SELECTED-SKILL-MARKER handles selected work\n---\n\nbody\n",
  "utf8",
);
writeFileSync(
  join(project, ".agents", "skills", "unselected-skill", "SKILL.md"),
  "---\nname: unselected-skill\ndescription: UNSELECTED-SKILL-MARKER handles other work\n---\n\nbody\n",
  "utf8",
);

const { DefaultResourceLoader, ModelRuntime, SessionManager, createAgentSession, getAgentDir } =
  await import("@earendil-works/pi-coding-agent");
const { buildResourceLoader, resolveTools } = await import("../../../src/pi/pi-agent-runner.ts");

const model = { provider: "offline", id: "offline-stub" };
const modelRuntime = await ModelRuntime.create();

async function systemPromptOf(loader, cwd) {
  const requestShaped = {
    runId: "p1-repro",
    role: "reviewer",
    cwd,
    prompt: "unused",
    skills: ["selected-skill"],
    readOnly: true,
    contextFiles: [{ path: "AGENTS.md", content: readFileSync(join(cwd, "AGENTS.md"), "utf8") }],
  };
  const { session } = await createAgentSession({
    cwd,
    sessionManager: SessionManager.inMemory(cwd),
    modelRuntime,
    resourceLoader: loader,
    model,
    customTools: [],
    tools: resolveTools(requestShaped, []),
  });
  const prompt = session.systemPrompt;
  session.dispose();
  return prompt;
}

const request = {
  cwd: project,
  skills: ["selected-skill"],
  contextFiles: [{ path: "AGENTS.md", content: AGENTS_MD }],
};
const count = (s, needle) => s.split(needle).length - 1;

// 1. pre-fix runner behavior: loader passed unreloaded
const p1 = await systemPromptOf(buildResourceLoader(request), project);
console.log("[1] unreloaded loader (pre-fix run() behavior):");
console.log("    context marker copies:", count(p1, "FIXTURE-AGENTS-MARKER"), "(expected by S2 audit: 1)");
console.log("    selected skill present:", p1.includes("SELECTED-SKILL-MARKER"));
console.log("    unselected skill present:", p1.includes("UNSELECTED-SKILL-MARKER"));
console.log("    has project_context block:", p1.includes("<project_context>"));

// 2. the fix: reload before createAgentSession
const loaded = buildResourceLoader(request);
await loaded.reload();
const p2 = await systemPromptOf(loaded, project);
console.log("[2] reloaded loader (the fix):");
console.log("    context marker copies:", count(p2, "FIXTURE-AGENTS-MARKER"));
console.log("    selected skill present:", p2.includes("SELECTED-SKILL-MARKER"));
console.log("    unselected skill present:", p2.includes("UNSELECTED-SKILL-MARKER"));
console.log("    has project_context block:", p2.includes("<project_context>"));

// 3. pre-S1 append loader (A branch), reloaded
const appended = new DefaultResourceLoader({
  cwd: project,
  agentDir: getAgentDir(),
  skillsOverride: (base) => ({ skills: base.skills.filter((s) => request.skills.includes(s.name)), diagnostics: base.diagnostics }),
  agentsFilesOverride: (base) => ({ agentsFiles: [...base.agentsFiles, ...request.contextFiles] }),
});
await appended.reload();
const p3 = await systemPromptOf(appended, project);
console.log("[3] pre-S1 append loader, reloaded (A branch):");
console.log("    context marker copies:", count(p3, "FIXTURE-AGENTS-MARKER"));

// 4. what reload() activates in THIS repo without noExtensions
const repoLoader = buildResourceLoader({ cwd: process.argv[2], skills: [] });
await repoLoader.reload();
const ext = repoLoader.getExtensions().extensions.map((e) => e.path ?? e.name ?? String(e));
console.log("[4] repo cwd, no noExtensions guard:");
console.log("    extensions activated:", JSON.stringify(ext));
console.log("    skills discovered:", repoLoader.getSkills().skills.length);
