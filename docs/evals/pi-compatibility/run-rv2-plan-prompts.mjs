#!/usr/bin/env node
/**
 * RV2 paired planner-prompt comparison (2026-11-13): CURRENT vs CANDIDATE
 * /feature planner prompts over identical real-provider cells.
 *
 * PRE-DECLARED PROTOCOL (fixed before the first call; do not retune after
 * seeing results):
 * - Arms: "current" = prompts imported from <treeRoot> (a clean HEAD
 *   worktree), "candidate" = prompts imported from the working tree that
 *   carries the RV2 change. Both arms share this script, the validator
 *   module, the fixtures, the agent dir and the ambient credentials.
 * - Models: zai/glm-5.2 thinking medium (the C4 historical planner,
 *   docs/evals/pi-usage/FEATURE-E2E-2026-10-27.md) and
 *   openai-codex/gpt-5.6-sol thinking high (the 2026-11-13 real-TUI pilot
 *   planner, REAL-TUI-2026-11-13.md).
 * - Cases (paired, one planner call per cell, ONE attempt, no manual retry):
 *     retry-c4    : the exact C4 fixture request whose two real outputs
 *                   were rejected for a missing literal ## TITLE.
 *     hello-scope : the exact real-TUI pilot request whose valid plan
 *                   produced the artifact-scope review conflict.
 *     revision    : PLAN_REVISION_PROMPT with fixed plan + notes; the output
 *                   must stay contract-valid with the stable TITLE.
 * - Isolation: PI_CODING_AGENT_DIR must be a disposable directory (refused
 *   otherwise). No routed skills, no injected context files: this isolates
 *   the prompt variable (the C4 missing-TITLE failure occurred with and
 *   without delivered context/skills). Planner tools: read/grep/find/ls.
 * - Budget: 12 calls total; abort remaining cells if cumulative SDK-reported
 *   cost exceeds $1.50. SDK cost is an estimate, not billing.
 * - No credentials are ever read into results: only prompt sha256, the raw
 *   output text, validation verdicts, usage and elapsed time are recorded.
 *
 * Usage:
 *   node run-rv2-plan-prompts.mjs <treeRoot> <agentDir> <outDir> <armName>
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [treeRootArg, agentDirArg, outDirArg, armArg] = process.argv.slice(2);
// --only is a SETUP-AID filter (e.g. a pre-run transport smoke into a scratch
// outDir); the recorded run passes no filter and covers every cell once.
const only = (() => {
  const i = process.argv.indexOf("--only");
  return i === -1 ? null : process.argv[i + 1]?.split(",") ?? null;
})();
if (!treeRootArg || !agentDirArg || !outDirArg || !armArg) {
  console.error("usage: run-rv2-plan-prompts.mjs <treeRoot> <agentDir> <outDir> <armName> [--only model/case,...]");
  process.exit(2);
}
const treeRoot = resolve(treeRootArg);
const agentDir = resolve(agentDirArg);
const outDir = resolve(outDirArg);
const arm = armArg;

const personalAgentDir = resolve(join(homedir(), ".pi", "agent"));
if (agentDir === personalAgentDir) {
  console.error("run-rv2-plan-prompts.mjs: refusing the personal agent dir; use a disposable copy.");
  process.exit(2);
}
process.env.PI_CODING_AGENT_DIR = agentDir;

const prompts = await import(pathToFileURL(join(treeRoot, "src/workflows/feature-prompts.ts")).href);
const feature = await import(pathToFileURL(join(treeRoot, "src/workflows/feature.ts")).href);
const { PiAgentRunner } = await import(
  pathToFileURL(join(treeRoot, "src/pi/pi-agent-runner.ts")).href
);

const STACK = {
  primary: "nodejs",
  frameworks: [],
  languages: [],
  packageManagers: [],
  capabilities: [],
  confidence: 1,
  evidence: ["rv2 eval fixture"],
};

/** Exact historical inputs (verbatim; see the C4 report and the pilot PRD marker). */
const RETRY_C4_DESCRIPTION =
  "Add an optional maxDelayMs parameter to retryDelay(attempt, baseMs = 100). Omitting it must preserve existing results exactly. When supplied it must be a finite nonnegative number; otherwise throw RangeError. Return Math.min(the existing exponential delay, maxDelayMs), including a zero cap. Preserve the existing attempt and baseMs validation and error types. Add focused node:test tests and document the API in README.md. No dependencies, no other API changes, no commit or push. This is a disposable evaluation fixture; keep scope to this contract and use the existing npm test command.";
const HELLO_SCOPE_DESCRIPTION =
  'Create hello.txt containing exactly hello followed by one newline. Keep the existing check.test.js and AGENTS.md unchanged. No dependencies, refactors, commits or pushes. Use the configured verification node check.test.js. This is a tiny compatibility pilot; keep the plan and implementation minimal.';

const REVISION_INPUT = {
  description: HELLO_SCOPE_DESCRIPTION,
  stack: STACK,
  title: "Add hello.txt fixture",
  prd:
    "Problem: the compatibility check expects a root-level hello.txt that is absent.\n" +
    "Scope: add hello.txt containing exactly `hello\\n`; verify with `node check.test.js`.\n" +
    "Out of scope: changes to check.test.js or AGENTS.md; dependencies; commits.\n" +
    "Acceptance criteria:\n" +
    "- hello.txt exists at the repository root with content exactly `hello\\n`.\n" +
    "- node check.test.js exits 0 from the repository root.\n" +
    "- check.test.js and AGENTS.md remain unchanged.\n" +
    "- The implementation changes no files other than hello.txt.\n" +
    "Assumptions: verification runs from the repository root.",
  tasks:
    "## TASKS\n- T1 — Write hello.txt with content `hello\\n`. Files: `hello.txt`.\n" +
    "- T2 — Run the verifier. Files: `check.test.js`.",
  notes:
    "Also add a one-line README section documenting hello.txt. Keep everything else unchanged.",
};

const MODELS = [
  { id: "zai-glm-5.2", provider: "zai", model: "glm-5.2", thinking: "medium" },
  { id: "openai-codex-gpt-5.6-sol", provider: "openai-codex", model: "gpt-5.6-sol", thinking: "high" },
];

/** Fixture cwd per case: hello cases get the faithful minimal pilot fixture. */
const FIXTURES = {
  "retry-c4": join(outDir, "fixtures", "retry"),
  "hello-scope": join(outDir, "fixtures", "hello"),
  revision: join(outDir, "fixtures", "hello"),
};

const COST_CAP_USD = 1.5;
let cumulativeCost = 0;

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function buildPrompt(caseId) {
  if (caseId === "retry-c4") return prompts.PLANNER_PROMPT({ description: RETRY_C4_DESCRIPTION, stack: STACK });
  if (caseId === "hello-scope") return prompts.PLANNER_PROMPT({ description: HELLO_SCOPE_DESCRIPTION, stack: STACK });
  return prompts.PLAN_REVISION_PROMPT(REVISION_INPUT);
}

const runner = await PiAgentRunner.create({ cwd: outDir });

const results = [];
const skipped = [];

for (const m of MODELS) {
  for (const caseId of ["retry-c4", "hello-scope", "revision"]) {
    const cell = `${arm}/${m.id}/${caseId}`;
    if (only && !only.includes(`${m.id}/${caseId}`) && !only.includes(caseId) && !only.includes(m.id)) {
      continue;
    }
    if (cumulativeCost >= COST_CAP_USD) {
      skipped.push({ cell, reason: `cost cap ${COST_CAP_USD} reached` });
      continue;
    }
    const prompt = buildPrompt(caseId);
    const started = Date.now();
    let entry = { arm, model: m, case: caseId, promptSha256: sha256(prompt) };
    try {
      const result = await runner.run({
        runId: `rv2-${arm}-${m.id}-${caseId}`,
        role: "planner",
        cwd: FIXTURES[caseId],
        prompt,
        model: { provider: m.provider, model: m.model, thinking: m.thinking },
        skills: [],
        tools: ["read", "grep", "find", "ls"],
        contextFiles: [],
      });
      const validation = feature.validatePlannerOutput(result.text);
      entry = {
        ...entry,
        aborted: result.aborted,
        output: result.text,
        validation,
        usage: result.usage ?? null,
        elapsedMs: Date.now() - started,
      };
      if (result.usage && typeof result.usage.cost === "number") {
        cumulativeCost += result.usage.cost;
      }
    } catch (err) {
      entry = { ...entry, error: String(err && err.message ? err.message : err), elapsedMs: Date.now() - started };
    }
    results.push(entry);
    const verdict = entry.error
      ? `ERROR: ${entry.error}`
      : entry.aborted
        ? "ABORTED"
        : entry.validation?.valid
          ? "VALID"
          : `REJECTED: ${entry.validation?.reason}`;
    const cost = entry.usage && typeof entry.usage.cost === "number" ? `$${entry.usage.cost.toFixed(6)}` : "n/a";
    console.log(`${cell}: ${verdict} (${cost}, ${entry.elapsedMs} ms)`);
    const cellDir = join(outDir, "runs", arm, m.id);
    mkdirSync(cellDir, { recursive: true });
    writeFileSync(join(cellDir, `${caseId}.json`), JSON.stringify(entry, null, 2) + "\n");
  }
}

writeFileSync(join(outDir, `summary-${arm}.json`), JSON.stringify({ arm, results, skipped, cumulativeCost }, null, 2) + "\n");
console.log(`arm ${arm} done: ${results.length} cells, ${skipped.length} skipped, cumulative cost $${cumulativeCost.toFixed(6)}`);
