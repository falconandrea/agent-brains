#!/usr/bin/env node
/**
 * S1 benefit A/B experiment (C4): does context deduplication produce a
 * MEASURABLE cost/latency benefit? Controlled same-tree comparison — no
 * runtime option is added, this file IS the experimental harness.
 *
 * CORRECTED 2026-10-26 (review P1): the first version of this harness gated
 * a RELOADED loader but passed a DIFFERENT, unreloaded instance to
 * createAgentSession — and Pi SDK 0.84.2 does not reload a caller-supplied
 * loader. Both arms therefore received the same prompt with ZERO injected
 * context; that run is invalidated (kept under runs/ as
 * 2026-10-26-ab-dedup-raw.json, superseded). This version:
 *   - builds ONE loader per call, reloads IT, audits THAT instance, and
 *     passes THAT instance to createAgentSession;
 *   - after session creation and BEFORE session.prompt(), gates the ACTUAL
 *     system prompt: branch A must contain exactly 2 copies of the AGENTS.md
 *     content, branch B exactly 1; with both branches observed, everything
 *     outside those copies must be byte-identical (remainder equality), and
 *     every call of the same branch must produce the identical prompt.
 * A gate failure aborts (exit 3) before any token is spent.
 *
 * Branch A = previous behavior (pre-S1, commit fb66860): injected files are
 *   APPENDED after discovered files, so the root AGENTS.md enters the child
 *   prompt twice.
 * Branch B = S1 behavior (production, commit cf5af8f + the loader-load fix):
 *   the exported production buildResourceLoader() — loaded via the same
 *   reload-before-session contract the fixed PiAgentRunner.run() uses.
 *
 * Both branches share the harness's identical session construction
 * (createAgentSession + SessionManager.inMemory + one shared ModelRuntime,
 * the production resolveTools read-only allowlist [read,grep/find/ls],
 * skills: [], no custom tools) and the production usage fold
 * (usageFromAgentEnds). A and B differ in EXACTLY the loader's
 * agentsFilesOverride.
 *
 * Usage:
 *   node run-ab-dedup.mjs <projectDir> <agentDir> \
 *     [--model provider/id] [--pairs N] [--out results.json]
 *     [--audit-only | --gate-only]
 *
 * Environment contract (same isolation rules as run-baseline.mjs):
 * - PI_CODING_AGENT_DIR (or the <agentDir> argument) MUST point at a
 *   disposable agent directory; the script refuses to run without it.
 * - The model catalog must be an INDEPENDENT COPY, not a symlink (exit 2).
 * - Credentials come from the AMBIENT environment (e.g. ZAI_API_KEY) and are
 *   never recorded.
 * - --audit-only: no session, no model call; audits both branch loaders.
 *   --gate-only: real sessions are created and the full gate (loader audit +
 *     system prompt) runs, but session.prompt() is NEVER called — fully
 *     offline evidence that the manipulation holds before spending tokens.
 *
 * Order: pairs alternate AB, BA, AB, BA, ... so branch order is balanced and
 * provider-side prompt-cache warm-up cannot systematically favor one branch.
 * Every call: fresh in-memory session on the SAME fixture directory;
 * per-call timestamps recorded so cross-run cache effects can be read off
 * the data (within-call rounds always re-send the conversation).
 *
 * Output: one JSON document (stdout or --out) with the full configuration,
 * provenance (commit, cleanliness, node), per-call audits, prompt gates,
 * usage, tool traces, verbatim answers and keyword checks, plus a derived
 * summary. Answers are stored VERBATIM; no credential is ever recorded.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const positional = [];
let modelArg = process.env.PI_S2_MODEL ?? "zai/glm-5.2";
let outPath = null;
let pairs = 4;
let mode = "run"; // run | audit-only | gate-only
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--model") modelArg = args[++i];
  else if (args[i] === "--out") outPath = args[++i];
  else if (args[i] === "--pairs") pairs = Number.parseInt(args[++i], 10);
  else if (args[i] === "--audit-only") mode = "audit-only";
  else if (args[i] === "--gate-only") mode = "gate-only";
  else positional.push(args[i]);
}
const [projectDirArg, agentDirArg] = positional;

const agentDir = agentDirArg ?? process.env.PI_CODING_AGENT_DIR;
if (!projectDirArg || !agentDir) {
  console.error(
    "usage: run-ab-dedup.mjs <projectDir> <agentDir> [--model provider/id] [--pairs N] [--out file] [--audit-only|--gate-only]",
  );
  console.error("The agent dir must be disposable (the SDK writes its state files there).");
  process.exit(2);
}
if (agentDir === "" || resolve(agentDir) === resolve(".")) {
  console.error("run-ab-dedup.mjs: refusing an agent dir that resolves to the current directory");
  process.exit(2);
}
if (!Number.isInteger(pairs) || pairs < 1) {
  console.error(`run-ab-dedup.mjs: --pairs must be a positive integer, got '${pairs}'`);
  process.exit(2);
}
process.env.PI_CODING_AGENT_DIR = resolve(agentDir);

// Isolation guard (same rule as run-baseline.mjs): a symlinked catalog is
// writable through to the personal store. Require an independent copy.
const storePath = join(resolve(agentDir), "models-store.json");
if (existsSync(storePath) && lstatSync(storePath).isSymbolicLink()) {
  console.error(
    "run-ab-dedup.mjs: models-store.json in the agent dir is a symlink; " +
      "copy the catalog instead (the SDK store is writable and must not reach personal state).",
  );
  process.exit(2);
}

const projectDir = resolve(projectDirArg);
const [provider, ...rest] = modelArg.split("/");
const modelId = rest.join("/");
if (!provider || !modelId) {
  console.error(`run-ab-dedup.mjs: --model must be provider/id, got '${modelArg}'`);
  process.exit(2);
}

/**
 * The context-overlap fixture, byte-identical to run-baseline.mjs so this
 * experiment stays comparable with the S2 baseline artifacts (the fixture
 * file hashes recorded there must match the ones recorded here).
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

const PROMPT =
  "Using this project's instructions, state the canonical retry limit and the required marker. " +
  "Then read src/limits.ts and report MAX_BATCH_SIZE and the file that defines it. " +
  "Name concrete files and values. Read the files directly; do not guess.";

function createOverlapFixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-s1ab-overlap-"));
  for (const [path, content] of Object.entries(OVERLAP_FIXTURE)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

const fixtureDir = createOverlapFixture();
const injectedContextFiles = [
  { path: "AGENTS.md", content: readFileSync(join(fixtureDir, "AGENTS.md"), "utf8") },
];
const AGENTS_CONTENT = injectedContextFiles[0].content;
const MARKER = "FIXTURE-AGENTS-MARKER";

// Imports AFTER PI_CODING_AGENT_DIR is set (same ordering as run-baseline.mjs).
const { DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, createAgentSession } =
  await import("@earendil-works/pi-coding-agent");
const { buildResourceLoader, guardedWriteTools, resolveTools } = await import(
  "../../../src/pi/pi-agent-runner.ts"
);
const { usageFromAgentEnds } = await import("../../../src/usage.ts");

/**
 * Branch A's loader: replicates the production construction but replaces only
 * the agentsFilesOverride with the pre-S1 append line, quoted verbatim from
 * commit fb66860 — the previous behavior this experiment needs. Construction
 * only; the caller reloads the returned instance.
 */
function preS1LoaderFor(cwd, contextFiles) {
  const extra = contextFiles;
  return new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    noExtensions: true, // child constraint, same as the production builder
    skillsOverride: (base) => ({
      skills: base.skills.filter((s) => [].includes(s.name)), // skills: [] — same filter as production
      diagnostics: base.diagnostics,
    }),
    agentsFilesOverride: (base) => ({ agentsFiles: [...base.agentsFiles, ...extra] }), // pre-S1 (fb66860)
  });
}

/**
 * Build the loader for a branch, LOAD it (reload-before-session, the fixed
 * production contract), and return THE instance the session must use:
 * B = the exported production buildResourceLoader (S1 dedup);
 * A = the pre-S1 append construction above.
 */
async function loadedLoaderFor(branch, cwd, contextFiles) {
  const loader =
    branch === "B"
      ? buildResourceLoader({ cwd, skills: [], contextFiles })
      : preS1LoaderFor(cwd, contextFiles);
  await loader.reload();
  return loader;
}

function canonical(project, path) {
  const abs = resolve(project, path);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

/**
 * Deterministic audit of a LOADED loader instance (same logic as
 * run-baseline.mjs): what the session will receive from THIS instance.
 */
function auditLoadedContext(loader, project) {
  const projectReal = realpathSync(project);
  const agentsFiles = loader.getAgentsFiles().agentsFiles;
  const counts = new Map();
  const bytes = new Map();
  for (const file of agentsFiles) {
    const key = canonical(project, file.path);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    bytes.set(key, file.content.length);
  }
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1);
  const loadedBytes = agentsFiles.reduce((sum, file) => sum + file.content.length, 0);
  const duplicateBytes = duplicated.reduce(
    (sum, [path, count]) => sum + (bytes.get(path) ?? 0) * (count - 1),
    0,
  );
  return {
    branch: null, // filled by caller
    agentsFileEntries: agentsFiles.length,
    uniquePaths: counts.size,
    duplicatePaths: duplicated.map(([path, count]) => ({
      path: relative(projectReal, path) || path,
      count,
    })),
    duplicateBytes,
    loadedBytes,
    effectiveBytes: loadedBytes - duplicateBytes,
  };
}

// Mechanical gates: must hold before any token is spent.
const EXPECTED_AUDIT = {
  A: { agentsFileEntries: 2, duplicateBytes: 220, loadedBytes: 440 },
  B: { agentsFileEntries: 1, duplicateBytes: 0, loadedBytes: 220 },
};
const EXPECTED_PROMPT_COPIES = { A: 2, B: 1 };

function failGate(message) {
  console.error(`run-ab-dedup.mjs: GATE FAILURE — ${message}`);
  console.error("Refusing to spend tokens on a mis-configured branch (exit 3).");
  process.exit(3);
}

function gateAudit(branch, audit) {
  const expected = EXPECTED_AUDIT[branch];
  for (const [key, value] of Object.entries(expected)) {
    if (audit[key] !== value) {
      failGate(
        `branch ${branch} loader audit: expected ${key}=${value}, got ${audit[key]} (${JSON.stringify(audit)})`,
      );
    }
  }
}

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * Rendered context block (verified against Pi 0.84.2 system-prompt.js):
 * `<project_instructions path="${path}">\n${content}\n</project_instructions>\n\n`.
 * The DISCOVERED entry renders with its ABSOLUTE path; the INJECTED entry
 * keeps the supplied (relative) path — so branch A's second copy differs
 * from B's kept copy by the path attribute inside the wrapper. The
 * remainder/equality gates therefore strip whole rendered blocks, and the
 * expected A−B length delta is exactly one block rendered with the injected
 * relative path.
 */
const renderBlock = (path, content) =>
  `<project_instructions path="${path}">\n${content}\n</project_instructions>\n\n`;
const BLOCK_RE = /<project_instructions path="([^"]*)">\n[\s\S]*?\n<\/project_instructions>\n\n/g;
const INJECTED_PATH = injectedContextFiles[0].path; // "AGENTS.md"
const EXPECTED_AB_LENGTH_DELTA = renderBlock(INJECTED_PATH, AGENTS_CONTENT).length;

/** First system prompt observed per branch (evidence + cross-branch checks). */
const firstPrompt = { A: null, B: null };

/**
 * Gate the ACTUAL system prompt of the created session, BEFORE the call.
 * - the AGENTS.md CONTENT must appear exactly the expected number of times;
 * - it may only appear inside <project_instructions> blocks (block count and
 *   marker count must match the content copies; each block contains the marker);
 * - everything OUTSIDE those rendered blocks must be byte-identical across
 *   branches (remainder equality) once both are observed, and the A−B prompt
 *   length delta must equal exactly one block rendered with the injected path;
 * - every call of the same branch must produce a byte-identical prompt.
 */
function gatePrompt(branch, systemPrompt) {
  const contentCopies = occurrences(systemPrompt, AGENTS_CONTENT);
  const markerCopies = occurrences(systemPrompt, MARKER);
  const blocks = [...systemPrompt.matchAll(BLOCK_RE)];
  const stripped = systemPrompt.replace(BLOCK_RE, "");
  const record = {
    branch,
    contentCopies,
    markerCopies,
    instructionsBlocks: blocks.length,
    blockPaths: blocks.map((m) => m[1]),
    promptLength: systemPrompt.length,
    promptSha256: sha256(systemPrompt),
    remainderSha256: sha256(stripped),
    sameBranchDeterministic: null,
    crossBranchRemainderEqual: null,
    crossBranchLengthDelta: null,
  };

  if (contentCopies !== EXPECTED_PROMPT_COPIES[branch]) {
    failGate(
      `branch ${branch} system prompt: expected ${EXPECTED_PROMPT_COPIES[branch]} copies of AGENTS.md content, got ${contentCopies}`,
    );
  }
  if (markerCopies !== contentCopies) {
    failGate(
      `branch ${branch} system prompt: marker appears ${markerCopies}x but content ${contentCopies}x (marker must exist only inside the injected copies)`,
    );
  }
  if (blocks.length !== contentCopies) {
    failGate(
      `branch ${branch} system prompt: ${blocks.length} <project_instructions> blocks for ${contentCopies} content copies`,
    );
  }
  if (!blocks.every((m) => m[0].includes(MARKER))) {
    failGate(`branch ${branch} system prompt: a <project_instructions> block without the marker`);
  }

  const first = firstPrompt[branch];
  if (first === null) {
    firstPrompt[branch] = { record, text: systemPrompt };
  } else {
    record.sameBranchDeterministic = record.promptSha256 === first.record.promptSha256;
    if (!record.sameBranchDeterministic) {
      failGate(`branch ${branch} system prompt differs from the first same-branch prompt`);
    }
  }
  const other = firstPrompt[branch === "A" ? "B" : "A"];
  if (other !== null) {
    record.crossBranchRemainderEqual = record.remainderSha256 === other.record.remainderSha256;
    record.crossBranchLengthDelta = record.promptLength - other.record.promptLength;
    if (!record.crossBranchRemainderEqual) {
      failGate("system prompts of A and B differ outside the rendered AGENTS.md blocks");
    }
    const expectedDelta =
      branch === "A" ? EXPECTED_AB_LENGTH_DELTA : -EXPECTED_AB_LENGTH_DELTA;
    if (record.crossBranchLengthDelta !== expectedDelta) {
      failGate(
        `A/B prompt length delta ${record.crossBranchLengthDelta} != one rendered block with the injected path (${expectedDelta})`,
      );
    }
  }
  return record;
}

/** Verbatim from PiAgentRunner's lastAssistantText (not exported). */
function lastAssistantText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter(
        (part) =>
          typeof part === "object" && part !== null && part.type === "text" && typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text !== "") return text;
  }
  return "";
}

/**
 * Deterministic keyword checks against the grading key (retry limit 7, marker
 * FIXTURE-AGENTS-MARKER, MAX_BATCH_SIZE = 42 in src/limits.ts). An aid for
 * review, not the final grade — the report grades every answer.
 */
function keywordCheck(answer) {
  return {
    retryLimit7: /retry\s+limit[^.\n]{0,60}?\b7\b/i.test(answer),
    marker: answer.includes("FIXTURE-AGENTS-MARKER"),
    maxBatchSize42: /MAX_BATCH_SIZE[^.\n]{0,80}?\b42\b/.test(answer),
    limitsTs: answer.includes("src/limits.ts"),
  };
}

/**
 * One call: create the session from a freshly LOADED branch loader, gate the
 * loader audit and the ACTUAL system prompt, then (mode "run") prompt.
 * Replicates PiAgentRunner.run()'s session construction for a read-only role
 * with no custom tools, differing ONLY in resourceLoader. A hard 10-minute
 * abort guards against a hung call.
 */
async function runOne(modelRuntime, branch, label, mode) {
  const loader = await loadedLoaderFor(branch, fixtureDir, injectedContextFiles);
  const audit = auditLoadedContext(loader, fixtureDir);
  audit.branch = branch;
  gateAudit(branch, audit); // gate 1: THE instance the session will use

  const customTools = guardedWriteTools({ readOnly: true, cwd: fixtureDir, tools: undefined }, projectDir);
  const model = modelRuntime.getModel(provider, modelId);
  if (!model) {
    console.error(`run-ab-dedup.mjs: model '${provider}/${modelId}' is unknown to Pi (getModel)`);
    process.exit(3);
  }
  const requestShaped = {
    runId: label,
    role: "reviewer",
    cwd: fixtureDir,
    prompt: PROMPT,
    model: { provider, model: modelId },
    skills: [],
    readOnly: true,
    contextFiles: injectedContextFiles,
  };
  const { session } = await createAgentSession({
    cwd: fixtureDir,
    sessionManager: SessionManager.inMemory(fixtureDir),
    modelRuntime,
    resourceLoader: loader, // THE gated instance
    model,
    customTools,
    tools: resolveTools(requestShaped, customTools),
  });

  // Gate 2: the actual system prompt, before any token is spent.
  const promptGate = gatePrompt(branch, session.systemPrompt);

  if (mode === "gate-only") {
    session.dispose();
    return { label, branch, mode, loaderAudit: audit, promptGate };
  }

  const agentEndBatches = [];
  const toolCalls = {};
  const readPaths = [];
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      const name = event.toolName ?? "unknown";
      toolCalls[name] = (toolCalls[name] ?? 0) + 1;
      if (name === "read" && typeof event.args?.path === "string" && event.args.path !== "") {
        readPaths.push(event.args.path);
      }
    } else if (event.type === "agent_end") {
      agentEndBatches.push(event.messages);
    }
  });

  const hardTimeout = setTimeout(() => void session.abort(), 10 * 60 * 1000);
  const startedAt = new Date();
  const wallStart = Date.now();
  let usage;
  let aborted = false;
  try {
    await session.prompt(PROMPT);
  } catch (err) {
    if ((err && err.name === "AbortError") || session.messages === undefined) aborted = true;
    else throw err;
  } finally {
    usage = { ...(usageFromAgentEnds(agentEndBatches) ?? {}), elapsedMs: Date.now() - wallStart };
    clearTimeout(hardTimeout);
    unsubscribe();
    session.dispose();
  }
  const endedAt = new Date();
  const answer = lastAssistantText(session.messages);
  const readCounts = {};
  for (const p of readPaths) readCounts[p] = (readCounts[p] ?? 0) + 1;

  return {
    label,
    branch,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    wallClockMs: Date.now() - wallStart,
    loaderAudit: audit,
    promptGate,
    usage: usage ?? null,
    agentEndBatches: agentEndBatches.length,
    aborted,
    answerChars: answer.length,
    answer,
    toolCalls,
    readCounts,
    keywordCheck: keywordCheck(answer),
  };
}

function gitInfo() {
  try {
    const commit = execSync("git rev-parse HEAD", { cwd: projectDir, encoding: "utf8" }).trim();
    const subject = execSync("git log -1 --format=%s", { cwd: projectDir, encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { cwd: projectDir, encoding: "utf8" }).trim();
    return { commit, subject, cleanTree: dirty === "", dirtyNotes: dirty === "" ? null : dirty.split("\n") };
  } catch (err) {
    return { error: String(err) };
  }
}

const report = {
  experiment:
    "S1 benefit A/B (C4), CORRECTED after review P1: duplicated context (A, pre-S1 fb66860 append) vs deduplicated context (B, production buildResourceLoader); gates run on the SAME loaded loader instance passed to the session and on the ACTUAL system prompt before the call",
  recordedAtStart: new Date().toISOString(),
  model: `${provider}/${modelId}`,
  mode,
  harness: "docs/evals/pi-usage/run-ab-dedup.mjs (experimental; no runtime option added)",
  sessionConstruction:
    "replicates PiAgentRunner.run() for a read-only role (no custom tools, no skills); the loader is LOADED (reload) before createAgentSession — the P1 fix contract; branch B uses the exported production buildResourceLoader, branch A only replaces agentsFilesOverride with the pre-S1 append; shared ModelRuntime",
  provenance: { ...gitInfo(), node: process.version, projectDir },
  config: {
    pairs,
    orderPattern: "pair p odd: A then B; pair p even: B then A (alternating)",
    prompt: PROMPT,
    injectedContextFiles: injectedContextFiles.map((f) => ({ path: f.path, sha256: sha256(f.content) })),
    fixture: {
      purpose: "context-overlap (S1 instrument), byte-identical to run-baseline.mjs",
      files: Object.entries(OVERLAP_FIXTURE).map(([path, content]) => ({
        path,
        bytes: Buffer.byteLength(content, "utf8"),
        sha256: sha256(content),
      })),
    },
    expectedAudit: EXPECTED_AUDIT,
    expectedPromptCopies: EXPECTED_PROMPT_COPIES,
    expectedAbPromptLengthDelta: EXPECTED_AB_LENGTH_DELTA,
    isolation:
      "disposable HOME and Pi agent dir; independent catalog copy (symlink refused); ambient credentials only; one shared fixture directory for every call; fresh in-memory session per call",
  },
  calls: [],
};

if (mode === "audit-only") {
  const audits = {};
  for (const branch of ["A", "B"]) {
    const loader = await loadedLoaderFor(branch, fixtureDir, injectedContextFiles);
    const audit = auditLoadedContext(loader, fixtureDir);
    audit.branch = branch;
    gateAudit(branch, audit);
    audits[branch] = audit;
  }
  report.auditsOnly = audits;
} else {
  const modelRuntime = await ModelRuntime.create();
  for (let pair = 1; pair <= pairs; pair += 1) {
    const order = pair % 2 === 1 ? ["A", "B"] : ["B", "A"];
    for (let slot = 0; slot < order.length; slot += 1) {
      const branch = order[slot];
      const label = `s1ab-p${pair}-${branch}`;
      console.error(`[run-ab-dedup] pair ${pair} slot ${slot + 1}: branch ${branch} (${label})`);
      const call = await runOne(modelRuntime, branch, label, mode);
      call.pair = pair;
      call.slot = slot + 1;
      report.calls.push(call);
      if (mode === "run") {
        console.error(
          `[run-ab-dedup]   done: input=${call.usage?.input ?? "?"} output=${call.usage?.output ?? "?"} cacheRead=${call.usage?.cacheRead ?? "?"} cost=${call.usage?.cost ?? "?"} elapsedMs=${call.usage?.elapsedMs ?? "?"} aborted=${call.aborted}`,
        );
      }
    }
  }

  // Evidence: one full system prompt per branch (no secrets; tool docs only).
  report.promptEvidence = {
    note: "first system prompt observed per branch; gates verified contentCopies and cross-branch remainder equality on every call",
    A: firstPrompt.A ? { ...firstPrompt.A.record, text: firstPrompt.A.text } : null,
    B: firstPrompt.B ? { ...firstPrompt.B.record, text: firstPrompt.B.text } : null,
  };

  if (mode === "run") {
    // Derived summary (transparent arithmetic over the recorded calls).
    const metrics = ["input", "output", "cacheRead", "cacheWrite", "cost", "elapsedMs", "wallClockMs"];
    const pick = (call, m) => (m === "wallClockMs" ? call.wallClockMs : call.usage?.[m]);
    const stats = (values) => {
      const vs = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
      if (vs.length === 0) return null;
      const mean = vs.reduce((s, v) => s + v, 0) / vs.length;
      const median =
        vs.length % 2 === 1 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2;
      return { n: vs.length, mean, median, min: vs[0], max: vs[vs.length - 1] };
    };
    const byBranch = {};
    for (const branch of ["A", "B"]) {
      const calls = report.calls.filter((c) => c.branch === branch);
      byBranch[branch] = Object.fromEntries(metrics.map((m) => [m, stats(calls.map((c) => pick(c, m)))]));
    }
    const pairedDeltas = []; // B - A within each pair, execution order preserved
    for (let pair = 1; pair <= pairs; pair += 1) {
      const a = report.calls.find((c) => c.pair === pair && c.branch === "A");
      const b = report.calls.find((c) => c.pair === pair && c.branch === "B");
      pairedDeltas.push(
        Object.fromEntries(
          metrics.map((m) => [m, { a: pick(a, m), b: pick(b, m), delta: pick(b, m) - pick(a, m) }]),
        ),
      );
    }
    report.summary = {
      note: "derived from calls[]; small deltas are NOT significance claims — see the report",
      byBranch,
      pairedDeltas,
    };
  }
}

report.recordedAtEnd = new Date().toISOString();
const json = JSON.stringify(report, null, 2);
if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, json, "utf8");
} else {
  console.log(json);
}
