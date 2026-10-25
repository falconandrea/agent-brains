#!/usr/bin/env node
/**
 * S2 (C4) usage baseline: drive REAL exploration tasks through the SAME
 * PiAgentRunner the /feature workflow uses, and record per-call usage
 * (provider/model, tokens, cache, SDK-exposed cost, elapsed), tool calls and
 * per-file reads/rereads. The S1 comparison reruns this exact protocol after
 * the context deduplication change.
 *
 * Usage:
 *   node docs/evals/pi-usage/run-baseline.mjs <projectDir> <agentDir> \
 *     [--model provider/id] [--out results.json] [--task id] [--audit-only]
 *
 * Environment contract (same isolation rules as the U16 measure script):
 * - PI_CODING_AGENT_DIR (or the <agentDir> argument) MUST point at a
 *   disposable agent directory: the SDK keeps its auth.json/models-store.json
 *   state there. The script refuses to run without it, so nothing is ever
 *   written into this repository.
 * - The model catalog must be an INDEPENDENT COPY in the disposable agent
 *   dir, not a symlink: the SDK store is writable, and a catalog update could
 *   otherwise reach the personal file through the link. The script refuses a
 *   symlinked models-store.json (exit 2).
 * - Provider credentials come from the AMBIENT environment (e.g.
 *   ZAI_API_KEY); they are used for the real calls and never recorded.
 * - Tasks are read-only: the runner gets the read/grep/find/ls allowlist and
 *   no skills. The first three tasks use no injected context (raw multi-file
 *   exploration by direct reads); the overlap task deliberately injects a
 *   file the loader ALSO discovers, so the S1 duplication is measured before
 *   and after the dedup change.
 *
 * Output: one JSON document (stdout, or --out) with per-task usage, tool
 * counts, read paths, context-overlap audit and the answer text. Answers are
 * stored VERBATIM (the full response, which may quote repository code) so the
 * grading can be checked; they are not a transcript of the files the model
 * read. No credentials are ever recorded.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const positional = [];
let modelArg = process.env.PI_S2_MODEL ?? "zai/glm-5.2";
let outPath = null;
let auditOnly = false;
const onlyTasks = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--model") modelArg = args[++i];
  else if (args[i] === "--out") outPath = args[++i];
  else if (args[i] === "--task") onlyTasks.push(args[++i]);
  else if (args[i] === "--audit-only") auditOnly = true;
  else positional.push(args[i]);
}
const [projectDirArg, agentDirArg] = positional;

const agentDir = agentDirArg ?? process.env.PI_CODING_AGENT_DIR;
if (!projectDirArg || !agentDir) {
  console.error("usage: run-baseline.mjs <projectDir> <agentDir> [--model provider/id] [--out file] [--task id] [--audit-only]");
  console.error("The agent dir must be disposable (the SDK writes its state files there).");
  process.exit(2);
}
if (agentDir === "" || resolve(agentDir) === resolve(".")) {
  console.error("run-baseline.mjs: refusing an agent dir that resolves to the current directory");
  process.exit(2);
}
process.env.PI_CODING_AGENT_DIR = resolve(agentDir);

// Isolation guard (standards review, S2): a symlinked catalog is writable
// through to the personal store. Require an independent copy.
const storePath = join(resolve(agentDir), "models-store.json");
if (existsSync(storePath) && lstatSync(storePath).isSymbolicLink()) {
  console.error(
    "run-baseline.mjs: models-store.json in the agent dir is a symlink; " +
      "copy the catalog instead (the SDK store is writable and must not reach personal state).",
  );
  process.exit(2);
}

const projectDir = resolve(projectDirArg);
const [provider, ...rest] = modelArg.split("/");
const modelId = rest.join("/");
if (!provider || !modelId) {
  console.error(`run-baseline.mjs: --model must be provider/id, got '${modelArg}'`);
  process.exit(2);
}

/**
 * Deterministic fixture for the context-overlap task (S1 instrument).
 * The root AGENTS.md is discovered by DefaultResourceLoader AND injected via
 * request.contextFiles, exactly the duplication S1 removes. The source file
 * gives the model something to read directly, so reads/rereads are measured
 * too.
 */
const OVERLAP_FIXTURE = {
  "AGENTS.md":
    "# Fixture instructions\n\n" +
    "- This project's canonical retry limit is 7 attempts.\n" +
    "- Always cite the marker FIXTURE-AGENTS-MARKER when quoting these instructions.\n" +
    "- Prefer direct reads of the source files named in a request.\n",
  "src/limits.ts":
    "// Fixture source file for the S2/S1 context-overlap measurement.\n" +
    "export const MAX_BATCH_SIZE = 42;\n\n" +
    "export function retryLimit(): number {\n" +
    "  return 7;\n" +
    "}\n",
  "README.md":
    "# Overlap fixture\n\n" +
    "A tiny project whose root AGENTS.md is both discovered and injected by the\n" +
    "Pi resource loader. Used to measure context deduplication, not product code.\n",
};

function createOverlapFixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-s2-overlap-"));
  for (const [path, content] of Object.entries(OVERLAP_FIXTURE)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

// Representative multi-file exploration tasks with DIRECT reads (S2 protocol).
// Grading keys live in the S2 report; answers are judged against the known
// repository state at the measured commit.
const TASKS = [
  {
    id: "config-flow",
    project: "repo",
    prompt:
      "In this repository, find where the verification timeout (verifyTimeoutMs) is configured, defaulted and enforced. " +
      "Answer with: (1) the config file and keys involved, (2) the source file that reads and validates it, " +
      "(3) the component that enforces it at runtime and what happens on timeout, (4) the bounds and fallback values. " +
      "Name concrete files and values. Read the files directly; do not guess.",
  },
  {
    id: "resume-protocol",
    project: "repo",
    prompt:
      "In this repository, describe the run-resume protocol of the pi-brain /flow resume command: " +
      "(1) which run-log event types the replay reads and what state each contributes, " +
      "(2) which conditions refuse a resume, (3) how the re-entry phase is chosen, " +
      "(4) how token usage of the interrupted run is carried into the resumed run. " +
      "Name the source files and the concrete event names. Read the files directly; do not guess.",
  },
  {
    id: "usage-path",
    project: "repo",
    prompt:
      "In this repository, trace how token usage of one agent call flows into the persisted workflow.outcome event: " +
      "list every module boundary it crosses (runner, workflow, launcher, run log) and what transformation each applies, " +
      "including which usage fields exist today (tokens, cache, cost, elapsed) and where missing data is kept distinct from zeros. " +
      "Name concrete files. Read the files directly; do not guess.",
  },
  {
    id: "context-overlap",
    project: "overlap",
    // The S1-sensitive case: AGENTS.md is discovered by the loader AND routed
    // through contextFiles. This task measures the duplication and its cost.
    injectContextFiles: ["AGENTS.md"],
    prompt:
      "Using this project's instructions, state the canonical retry limit and the required marker. " +
      "Then read src/limits.ts and report MAX_BATCH_SIZE and the file that defines it. " +
      "Name concrete files and values. Read the files directly; do not guess.",
  },
];

const selectedTasks = onlyTasks.length > 0 ? TASKS.filter((task) => onlyTasks.includes(task.id)) : TASKS;
if (selectedTasks.length !== (onlyTasks.length || TASKS.length)) {
  console.error(`run-baseline.mjs: unknown --task id in '${onlyTasks.join(", ")}'`);
  process.exit(2);
}

const { PiAgentRunner, buildResourceLoader } = await import("../../../src/pi/pi-agent-runner.ts");

function canonical(project, path) {
  const abs = resolve(project, path);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

/**
 * Audit the loader input for this task: how many agents-files entries the
 * child would receive, how many are the SAME canonical path (discovered +
 * injected), and how many bytes that duplicates. Uses the exported production
 * loader builder so before/after S1 runs measure the real wiring.
 */
async function auditContext(project, contextFiles) {
  const projectReal = realpathSync(project);
  const loader = buildResourceLoader({ cwd: project, skills: [], ...(contextFiles ? { contextFiles } : {}) });
  await loader.reload();
  const agentsFiles = loader.getAgentsFiles().agentsFiles;
  const counts = new Map();
  const bytes = new Map();
  for (const file of agentsFiles) {
    const key = canonical(project, file.path);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    bytes.set(key, file.content.length);
  }
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1);
  const duplicatePaths = duplicated.map(([path, count]) => ({
    path: relative(projectReal, path) || path,
    count,
  }));
  const duplicateBytes = duplicated.reduce(
    (sum, [path, count]) => sum + (bytes.get(path) ?? 0) * (count - 1),
    0,
  );
  const loadedBytes = agentsFiles.reduce((sum, file) => sum + file.content.length, 0);
  return {
    agentsFileEntries: agentsFiles.length,
    uniquePaths: counts.size,
    duplicatePaths,
    duplicateBytes,
    loadedBytes,
    effectiveBytes: loadedBytes - duplicateBytes,
    filePaths: agentsFiles.map((file) => relative(projectReal, canonical(project, file.path)) || file.path),
  };
}

const overlapDir = createOverlapFixture();
const fixtureFiles = Object.entries(OVERLAP_FIXTURE).map(([path, content]) => ({
  path,
  bytes: Buffer.byteLength(content, "utf8"),
  sha256: createHash("sha256").update(content).digest("hex"),
}));

// Tool-trace collector (S2 instrumentation): counts per tool and per read
// path, so the report can show rereads. Only path/pattern pass through —
// never tool payloads.
const toolTrace = {
  current: null,
  sink(event) {
    if (event.type !== "tool" || toolTrace.current === null) return;
    const task = toolTrace.current;
    task.toolCalls[event.detail ?? "unknown"] = (task.toolCalls[event.detail ?? "unknown"] ?? 0) + 1;
    if (event.detail === "read" && event.args?.path) task.readPaths.push(event.args.path);
  },
};

// Audit every task up front (no model call): this is the before/after S1
// check and also documents what the child receives.
const audits = {};
for (const task of selectedTasks) {
  const project = task.project === "overlap" ? overlapDir : projectDir;
  const contextFiles = (task.injectContextFiles ?? []).map((path) => ({
    path,
    content: readFileSync(join(project, path), "utf8"),
  }));
  audits[task.id] = await auditContext(project, contextFiles);
}

const report = {
  recordedAt: new Date().toISOString(),
  model: `${provider}/${modelId}`,
  runner: "PiAgentRunner (src/pi/pi-agent-runner.ts)",
  protocol: "S2 direct-reads baseline; same tasks/scripts rerun for S1",
  taskFilter: onlyTasks.length > 0 ? onlyTasks : null,
  fixture: { purpose: "context-overlap (S1 instrument)", files: fixtureFiles },
  contextAudits: audits,
  tasks: [],
};

if (!auditOnly) {
  const runner = await PiAgentRunner.create({
    cwd: projectDir,
    onEvent: (event) => toolTrace.sink(event),
  });

  for (const task of selectedTasks) {
    const project = task.project === "overlap" ? overlapDir : projectDir;
    const contextFiles = (task.injectContextFiles ?? []).map((path) => ({
      path,
      content: readFileSync(join(project, path), "utf8"),
    }));
    const trace = { toolCalls: {}, readPaths: [] };
    toolTrace.current = trace;
    const startedAt = Date.now();
    const result = await runner.run({
      runId: `s2-${task.id}`,
      role: "reviewer", // read-only exploration role
      cwd: project,
      prompt: task.prompt,
      model: { provider, model: modelId },
      skills: [], // raw exploration: no skill injection
      ...(contextFiles.length > 0 ? { contextFiles } : {}),
      readOnly: true,
    });
    toolTrace.current = null;
    const wallMs = Date.now() - startedAt;

    const readCounts = {};
    for (const p of trace.readPaths) readCounts[p] = (readCounts[p] ?? 0) + 1;
    report.tasks.push({
      task: task.id,
      project: task.project,
      model: `${provider}/${modelId}`,
      injectedContextFiles: task.injectContextFiles ?? [],
      contextAudit: audits[task.id],
      usage: result.usage ?? null,
      wallClockMs: wallMs,
      aborted: result.aborted,
      answerChars: result.text.length,
      answer: result.text,
      toolCalls: trace.toolCalls,
      readCounts,
    });
  }
}

const json = JSON.stringify(report, null, 2);
if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, json, "utf8");
} else {
  console.log(json);
}
