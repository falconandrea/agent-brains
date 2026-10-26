/**
 * P1 regression (2026-10-26 review): a child session built the way
 * PiAgentRunner.run() builds it must actually RECEIVE the routed context
 * files and the router-selected skills in its system prompt.
 *
 * With Pi SDK 0.84.2, createAgentSession() reloads a DefaultResourceLoader
 * only when it constructs the loader itself; a caller-supplied loader is
 * used as-is, and an unreloaded loader reports zero agents-files, zero
 * skills and zero extensions. Before the fix, run() passed exactly such a
 * loader, so every child session ran with NO injected context and NO skills:
 * the loader-level audits were true but measured a component the session
 * never consumed, and the 2026-10-26 S1 A/B compared two identical prompts.
 *
 * Offline by construction: sessions are created and disposed,
 * session.prompt() is never called, the model is a stub with an offline
 * provider id, and HOME / the Pi agent dir are disposable empties — no auth,
 * no network, no provider.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";

import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  type DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type { AgentRunRequest } from "../src/agent.ts";
import { buildLoadedResourceLoader, buildResourceLoader, resolveTools } from "../src/pi/pi-agent-runner.ts";

// Keep discovery away from personal Pi state and unrelated global skills.
// Set in before()/restored in after(): module-scope assignment would run
// before the tests execute, and restoring `undefined` coerces to the string
// "undefined", pointing the SDK at a literal ./undefined directory.
const disposableHome = mkdtempSync(join(tmpdir(), "pi-brain-inject-home-"));
const disposableAgentDir = mkdtempSync(join(tmpdir(), "pi-brain-inject-agent-"));
const previousHome = process.env.HOME;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

before(() => {
  process.env.HOME = disposableHome;
  process.env.PI_CODING_AGENT_DIR = disposableAgentDir;
});

after(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
});

const AGENTS_CONTENT =
  "# Fixture instructions\n\n" +
  "- This project's canonical retry limit is 7 attempts.\n" +
  "- Always cite the marker FIXTURE-AGENTS-MARKER when quoting these instructions.\n";

const project = mkdtempSync(join(tmpdir(), "pi-brain-inject-project-"));
for (const [path, content] of [
  ["AGENTS.md", AGENTS_CONTENT],
  [
    join(".agents", "skills", "selected-skill", "SKILL.md"),
    "---\nname: selected-skill\ndescription: SELECTED-SKILL-MARKER handles selected work\n---\n\nSelected skill body.\n",
  ],
  [
    join(".agents", "skills", "unselected-skill", "SKILL.md"),
    "---\nname: unselected-skill\ndescription: UNSELECTED-SKILL-MARKER handles other work\n---\n\nUnselected skill body.\n",
  ],
] as const) {
  const absolute = join(project, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

const request: AgentRunRequest = {
  runId: "injection-test",
  role: "reviewer",
  cwd: project,
  prompt: "unused — session.prompt() is never called",
  skills: ["selected-skill"],
  readOnly: true,
  contextFiles: [{ path: "AGENTS.md", content: AGENTS_CONTENT }],
};

const model = { provider: "offline", id: "offline-stub" } as unknown as Model<never>;

async function systemPromptOf(loader: DefaultResourceLoader) {
  const { session } = await createAgentSession({
    cwd: project,
    sessionManager: SessionManager.inMemory(project),
    modelRuntime: await ModelRuntime.create(),
    resourceLoader: loader,
    model,
    customTools: [],
    tools: resolveTools({ ...request, tools: undefined }, []),
  });
  const prompt = session.systemPrompt;
  session.dispose();
  return prompt;
}

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

test("the runner's session receives routed context and selected skills (the P1)", async () => {
  // The production entry point run() passes to createAgentSession since the
  // fix. Before the fix, run() passed buildResourceLoader(request) unloaded;
  // the same assertions against that construction fail with 0 context copies
  // (saved evidence: runs/2026-10-26-p1-test-failing.txt) — the audit
  // reloaded its own loader instance, the session did not.
  const loader = await buildLoadedResourceLoader(request);
  const prompt = await systemPromptOf(loader);

  // Context: the AGENTS.md is discovered AND routed through contextFiles;
  // S1 dedup must leave exactly ONE copy in the real session prompt.
  assert.equal(occurrences(prompt, "FIXTURE-AGENTS-MARKER"), 1);
  assert.ok(prompt.includes("<project_context>"));
  assert.ok(prompt.includes(AGENTS_CONTENT));

  // Skills: the selected one is advertised, the unselected one is not.
  assert.ok(prompt.includes("SELECTED-SKILL-MARKER"));
  assert.ok(!prompt.includes("UNSELECTED-SKILL-MARKER"));

  // Child constraint: even a fully loaded loader must not activate
  // extensions (in production the agent dir registers the pi-brain package,
  // whose ./extensions would give children workflow commands and extension
  // tools inside a workflow-owned child session).
  assert.equal(loader.getExtensions().extensions.length, 0);
});

test("an unloaded loader injects nothing — the trap this regression pins", async () => {
  // Documented SDK behavior: without reload(), every getter is empty and the
  // session prompt carries neither context nor skills. This is what every
  // pre-fix child session (and both arms of the invalid 2026-10-26 A/B)
  // actually received.
  const loader = buildResourceLoader(request);
  const prompt = await systemPromptOf(loader);

  assert.equal(occurrences(prompt, "FIXTURE-AGENTS-MARKER"), 0);
  assert.ok(!prompt.includes("<project_context>"));
  assert.ok(!prompt.includes("SELECTED-SKILL-MARKER"));
  assert.ok(!prompt.includes("UNSELECTED-SKILL-MARKER"));
});
