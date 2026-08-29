/**
 * `/feature` — the primary workflow (spec §11).
 *
 * Deterministic orchestration: code decides the transitions, models only do the
 * work. Everything it needs arrives through ports, so the whole thing runs in a
 * unit test with fakes.
 *
 *   discover -> clarify -> spec (hard gate) -> develop -> verify -> review -> loop -> final
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { AgentRunner } from "../agent.ts";
import type {
  GitService,
  HumanInput,
  VerifyRunner,
  WorkflowEventSink,
  GitBaseline,
} from "../ports.ts";
import type { PiBrainConfig } from "../config.ts";
import { roleConfig } from "../config.ts";
import { detectStack, LOW_CONFIDENCE, type ProjectStack } from "../stack.ts";
import { resolveVerifyCommands } from "../verify.ts";
import { selectSkills } from "../skill-router.ts";
import { routeContext } from "../context-router.ts";
import {
  decideNextRound,
  validateReviewResult,
  type ReviewIssue,
  type ReviewResult,
} from "../review.ts";
import { REVIEW_TOOL, PLANNER_PROMPT, DEVELOPER_PROMPT, REVIEWER_PROMPT } from "./feature-prompts.ts";
import type { WorkflowEvent } from "../ports.ts";

export interface FeatureDeps {
  cwd: string;
  profilesDir: string;
  availableSkills: ReadonlySet<string>;
  config: PiBrainConfig;
  agents: AgentRunner;
  human: HumanInput;
  verifier: VerifyRunner;
  git: GitService;
  events: WorkflowEventSink;
  signal?: AbortSignal;
}

export interface UsageTotals {
  input: number;
  output: number;
  cost?: number;
}

/** Cumulative token usage per role over the whole run. */
export type UsageByRole = Partial<Record<string, UsageTotals>>;

export type FeatureOutcome =
  | { status: "completed"; summary: string; files: string[]; review: ReviewResult; usage: UsageByRole }
  | { status: "needs_human"; reason: string; review?: ReviewResult; usage: UsageByRole }
  | { status: "cancelled"; at: string; usage: UsageByRole };

/**
 * State reconstructed by resume mode from a persisted event log.
 * When present, the workflow enters the developer/verify/review loop
 * at the first incomplete phase with seeded counters and usage.
 */
export interface ResumeState {
  /** The phase the run re-enters at ("develop", "fix #N", "verify", or "review #N"). */
  phase: string;
  /** True only when a failed verification event was persisted after the last verify phase. */
  verifyRetryBanked?: boolean;
  /** Reconstructed loop counters from the log. */
  reviewRound: number;
  verifyRetries: number;
  developerRuns: number;
  /** Blocking issues from the last completed review. */
  fixes: ReviewIssue[];
  /** Blocking issue ids from the last completed review, for no-progress detection. */
  previousBlockingIds: Set<string>;
  /** The last review result, if any. */
  lastReview?: ReviewResult;
  /** Cumulative token usage reconstructed from agent.completed events in the log. */
  usage: UsageByRole;
  /** The patch sha recorded when the interrupted review phase started (if applicable). */
  interruptedPatchSha?: string;
  /**
   * Content hashes of the approved PRD/tasks, replayed from the spec.approved
   * event. Absent for logs predating the spec freeze: those resumed runs get
   * no tamper check (documented residual).
   */
  spec?: { prdSha: string; tasksSha: string };
  /**
   * The ORIGINAL git baseline persisted in workflow.started. Without it a
   * resumed run would re-baseline from the current tree and hand the reviewer
   * a diff missing everything the interrupted develop phase wrote.
   */
  baseline?: GitBaseline;
}

/** Built-in tools the developer is allowed: everything except bash. */
export const DEVELOPER_TOOLS = ["read", "grep", "find", "ls", "edit", "write"] as const;

/** sha256 of a file's content; empty string when unreadable. */
const fileSha = (path: string): string => {
  try {
    return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex");
  } catch {
    return "";
  }
};

export async function runFeatureWorkflow(
  deps: FeatureDeps,
  description: string,
  runId: string,
  resume?: ResumeState,
): Promise<FeatureOutcome> {
  const { human, events, config, git } = deps;

  // --- Phase A: discovery (must happen before workflow.started for resume mode) --
  const stack = await resolveStack(deps);
  // A resumed run MUST keep the ORIGINAL baseline: a fresh snapshot would
  // swallow everything the interrupted develop phase already wrote.
  const baseline = resume?.baseline ?? (await git.baseline(deps.cwd));
  human.notify(`stack: ${stack.primary} (${stack.frameworks.join(", ") || "no framework"})`);

  // In resume mode, workflow.started was already emitted — skip it.
  if (!resume) {
    events.emit({
      type: "workflow.started",
      runId,
      workflow: "feature",
      description,
      stack: { primary: stack.primary, frameworks: stack.frameworks },
      baseline: baseline.baseCommit,
      ...(baseline.ignoreRulesDigest !== undefined
        ? { ignoreRulesDigest: baseline.ignoreRulesDigest }
        : {}),
    });
  }

  // Token accounting: every agent result folds in here and ships with the
  // outcome, whatever way the run ends. A missing usage (fake runners, a
  // provider that reports nothing) simply does not add.
  // In resume mode, we seed with reconstructed usage from the log.
  const usage: UsageByRole = resume ? { ...resume.usage } : {};
  const recordUsage = (role: string, u?: { input?: number; output?: number; cost?: number }): void => {
    if (u === undefined) return;
    const input = u.input ?? 0;
    const output = u.output ?? 0;
    const cost = u.cost;
    if (input === 0 && output === 0 && cost === undefined) return;
    const current = usage[role] ?? { input: 0, output: 0 };
    current.input += input;
    current.output += output;
    if (cost !== undefined) current.cost = (current.cost ?? 0) + cost;
    usage[role] = current;
  };

  // --- Phase A: discovery --------------------------------------------------
  if (!resume) events.emit({ type: "phase.started", runId, phase: "discover" });

  // --- Phase B+C: planner, then hard approval gate -------------------------
  // Skip planner and spec in resume mode - they were already completed.
  let prdPath: string;
  let tasksPath: string;
  let specGuard: { prdSha: string; tasksSha: string } | undefined;
  if (!resume) {
    events.emit({ type: "phase.started", runId, phase: "spec" });
    const planner = selectSkills(deps.profilesDir, stack.primary, "planner", deps.availableSkills);
    const plannerCfg = roleConfig(config, "planner");
    events.emit({
      type: "agent.started",
      runId,
      role: "planner",
      model: modelLabel(plannerCfg.provider, plannerCfg.model),
      skills: planner.skills,
    });

    const plan = await deps.agents.run({
      runId,
      role: "planner",
      cwd: deps.cwd,
      prompt: PLANNER_PROMPT({ description, stack }),
      model: plannerCfg,
      skills: planner.skills,
      tools: ["read", "grep", "find", "ls"],
      contextFiles: routeContext({ cwd: deps.cwd, role: "planner", task: description, stack }).files,
      signal: deps.signal,
    });
    events.emit({
      type: "agent.completed",
      runId,
      role: "planner",
      ...(plan.usage ? { usage: { input: plan.usage.input ?? 0, output: plan.usage.output ?? 0 } } : {}),
    });
    recordUsage("planner", plan.usage);
    if (plan.aborted || deps.signal?.aborted) return { status: "cancelled", at: "planning", usage };

    // The planner is read-only by design: it returns the documents as text and the
    // orchestrator writes them. Always write this run's output — reusing files
    // left by an earlier, possibly rejected, run would hand the developer a plan
    // the user never approved. The slug comes from the planner's English TITLE
    // (falling back to the raw description); a rerun of the same request reuses
    // its earlier directory, found via the description marker — which also
    // covers reruns whose TITLE gets worded differently.
    const { title, prd, tasks } = splitPlannerOutput(plan.text);
    if (!hasValidTaskList(tasks)) {
      return {
        status: "needs_human",
        reason: "planner returned no valid granular TASKS section; the plan cannot be approved safely",
        usage,
      };
    }
    const slug = findExistingFeatureSlug(deps.cwd, description) ?? featureSlug(deps.cwd, title ?? description);
    const featureDir = join(deps.cwd, ".ai", "features", slug);
    prdPath = join(featureDir, `prd-${slug}.md`);
    tasksPath = join(featureDir, `tasks-${slug}.md`);
    mkdirSync(featureDir, { recursive: true });
    const marker = descriptionMarker(description);
    writeFileSync(prdPath, `${marker}\n${prd}`, "utf8");
    writeFileSync(tasksPath, `${marker}\n${tasks}`, "utf8");

    const approved = await human.confirm({
      message: `Approve the plan for '${slug}' and start implementation?`,
      detail: `${prdPath}\n${tasksPath}`,
      defaultValue: false,
    });
    if (!approved) {
      return { status: "cancelled", at: "spec approval", usage };
    }
    // Freeze the approved content: the hashes persist in the event log so a
    // later mutation of PRD/tasks (e.g. by the developer making its own work
    // look conformant) is detected before any agent trusts the files again.
    specGuard = { prdSha: fileSha(prdPath), tasksSha: fileSha(tasksPath) };
    events.emit({ type: "spec.approved", runId, ...specGuard });
  } else {
    // In resume mode, re-locate the PRD/tasks files from the description marker.
    const slug = findExistingFeatureSlug(deps.cwd, description);
    if (!slug) {
      return {
        status: "needs_human",
        reason: "resume: cannot find PRD/tasks files with the description marker",
        usage,
      };
    }
    const featureDir = join(deps.cwd, ".ai", "features", slug);
    prdPath = join(featureDir, `prd-${slug}.md`);
    tasksPath = join(featureDir, `tasks-${slug}.md`);
    // Hashes replayed from the log's spec.approved event; absent for logs
    // predating the freeze (no tamper check for those runs).
    specGuard = resume?.spec;
  }

  // --- Phase D..G: develop / verify / review loop --------------------------
  const developerCfg = roleConfig(config, "developer");
  const reviewerCfg = roleConfig(config, "reviewer");
  if (reviewerCfg.readOnly === false) {
    human.notify("pi-brain: roles.reviewer.readOnly=false is ignored — the reviewer is read-only by design.");
  }
  const devSkills = selectSkills(deps.profilesDir, stack.primary, "developer", deps.availableSkills);
  const revSkills = selectSkills(deps.profilesDir, stack.primary, "reviewer", deps.availableSkills);

  // The task text drives context routing, so include the tasks file: a plan
  // that mentions migrations pulls the schema in even if the one-line request
  // never said "database".
  const taskText = `${description}\n${read(tasksPath)}`;
  // Re-read every round: the developer may have edited the schema or the design
  // system, and the reviewer must not be handed a stale copy alongside a diff
  // that contains the new one.
  const devContext = () =>
    routeContext({ cwd: deps.cwd, role: "developer", task: taskText, stack }).files;
  const reviewContext = () =>
    routeContext({ cwd: deps.cwd, role: "reviewer", task: taskText, stack, maxChars: 20_000 }).files;

  // Two independent budgets: a run that keeps failing its own test suite must
  // not silently burn the review budget and finish without ever being reviewed.
  let reviewRound = resume?.reviewRound ?? 0;
  let verifyRetries = resume?.verifyRetries ?? 0;
  let developerRuns = resume?.developerRuns ?? 0;
  let fixes: ReviewIssue[] = resume?.fixes ?? [];
  let previousBlockingIds = resume?.previousBlockingIds ?? new Set<string>();
  let previousPatch = ""; // Reset on resume: we can't recover the historical patch
  let lastReview: ReviewResult | undefined = resume?.lastReview;

  // Resume re-entry: `entry` names the phase the run re-enters at. It gates
  // ONLY the first loop pass — developer/verify are skipped when the log
  // proves a previous pass already completed them — and is consumed
  // immediately, so every later iteration is the standard
  // develop → verify → review loop. Without the consumption, the name
  // matching below can never align on the second pass and the loop spins
  // forever without ever calling an agent.
  let entry = resume?.phase;
  // A resumed run that re-enters at verify re-observes a failure the original
  // run already counted (and already banked the fix for): that re-observation
  // must not consume a second retry from the budget.
  let resumedVerifyPending = resume?.phase === "verify" && resume.verifyRetryBanked === true;

  const specWasModified = (): boolean =>
    specGuard !== undefined &&
    (fileSha(prdPath) !== specGuard.prdSha || fileSha(tasksPath) !== specGuard.tasksSha);

  const stopForSpecTamper = (): FeatureOutcome => {
    events.emit({ type: "workflow.completed", runId, status: "needs_human" });
    return {
      status: "needs_human",
      reason:
        "the approved PRD/tasks were modified after the gate (content hash mismatch) — " +
        "restore them or re-run /feature",
      review: lastReview,
      usage,
    };
  };

  for (;;) {
    if (deps.signal?.aborted) return { status: "cancelled", at: `round ${reviewRound}`, usage };
    const resumeEntry = entry;
    entry = undefined;

    // Spec tamper guard: the PRD/tasks on disk must still hash to what the
    // user approved at the gate. A mutation means some agent (or human) edited
    // the spec the reviewer would judge against — never proceed on it.
    if (specWasModified()) return stopForSpecTamper();

    // developer
    const phaseName = developerRuns === 0 ? "develop" : `fix #${developerRuns}`;
    // On a resumed pass, skip the developer when the entry point is past it
    // (interrupted during verify or review: that work is already on disk).
    if (resumeEntry === undefined || !(resumeEntry === "verify" || resumeEntry.startsWith("review #"))) {
      events.emit({
        type: "phase.started",
        runId,
        phase: phaseName,
      });
      developerRuns += 1;
      events.emit({
        type: "agent.started",
        runId,
        role: "developer",
        model: modelLabel(developerCfg.provider, developerCfg.model),
        skills: devSkills.skills,
      });
      const devRun = await deps.agents.run({
        runId,
        role: "developer",
        cwd: deps.cwd,
        prompt: DEVELOPER_PROMPT({
          prd: read(prdPath),
          tasks: read(tasksPath),
          stack,
          fixes,
        }),
        model: developerCfg,
        skills: devSkills.skills,
        // No shell for the developer, ever: the no-commit/no-push invariant
        // must be enforced by the tool allowlist, not by the prompt (a real
        // incident showed prompt-only rules get ignored). Test feedback
        // arrives deterministically from the verify phase below.
        tools: [...DEVELOPER_TOOLS],
        contextFiles: devContext(),
        signal: deps.signal,
      });
      events.emit({
        type: "agent.completed",
        runId,
        role: "developer",
        ...(devRun.usage ? { usage: { input: devRun.usage.input ?? 0, output: devRun.usage.output ?? 0 } } : {}),
      });
      recordUsage("developer", devRun.usage);
      if (devRun.aborted || deps.signal?.aborted) return { status: "cancelled", at: "development", usage };
    }

    // The developer has write access to the repository. Check again before
    // verification/review so a same-round PRD/TASKS mutation cannot become the
    // contract against which the reviewer judges the code.
    if (specWasModified()) return stopForSpecTamper();

    // deterministic verification BEFORE spending reviewer tokens (§24)
    // On a resumed pass, skip the checks only when re-entering straight at
    // review: the interrupted review round never consumed fresh results, and
    // the diff — not the verify output — is what the reviewer judges.
    let results: { command: string; exitCode: number; output: string }[] = [];
    if (resumeEntry === undefined || !resumeEntry.startsWith("review #")) {
      events.emit({ type: "phase.started", runId, phase: "verify" });
      const commands = resolveVerifyCommands(deps.cwd, stack, config.verify);
      results = await deps.verifier.run(commands, deps.signal);
      for (const r of results)
        events.emit({ type: "command.completed", runId, command: r.command, exitCode: r.exitCode });

      const blockingFailures = results.filter(
        (r, i) => r.exitCode !== 0 && (commands[i]?.blocking ?? true),
      );
      events.emit({ type: "verification.completed", runId, passed: blockingFailures.length === 0 });
      if (blockingFailures.length === 0) resumedVerifyPending = false; // only the first observation is free

      if (blockingFailures.length > 0) {
        if (resumedVerifyPending) {
          // This failure was already counted before the crash and its fix was
          // already banked: re-observing it must not double-charge the budget.
          resumedVerifyPending = false;
        } else {
          if (verifyRetries >= config.maxVerifyRetries) {
            return {
              status: "needs_human",
              reason: `verification still failing after ${verifyRetries} developer retries: ${blockingFailures
                .map((f) => f.command)
                .join(", ")}`,
              usage,
            };
          }
          verifyRetries += 1;
        }
        fixes = blockingFailures.map((f, i) => ({
          id: `verify-${verifyRetries}-${i}`,
          severity: "blocking" as const,
          category: "tests" as const,
          problem: `\`${f.command}\` exited ${f.exitCode}:\n${tail(f.output)}`,
        }));
        continue; // back to the developer — the reviewer is NOT called
      }
    }

    // A human can also edit the approved documents while verification runs.
    // Do not let that race reach the reviewer.
    if (specWasModified()) return stopForSpecTamper();

    // review
    reviewRound += 1;
    const diff = await deps.git.diffSince(baseline);
    // diffSince yields while it snapshots the tree. A human (or another
    // process) can mutate the approved documents during that await, so check
    // once more before building the reviewer context.
    if (specWasModified()) return stopForSpecTamper();
    const patchSha = createHash("sha256").update(diff.patch).digest("hex");
    events.emit({ type: "phase.started", runId, phase: `review #${reviewRound}`, patchSha });

    // Deterministic escalation, before a single reviewer token is spent: the
    // reviewer cannot see inside a submodule, so nothing may approve that code.
    if (diff.dirtySubmodules.length > 0) {
      events.emit({ type: "workflow.completed", runId, status: "needs_human" });
      return {
        status: "needs_human",
        reason:
          `dirty submodules (${diff.dirtySubmodules.join(", ")}) — their contents cannot be ` +
          `included in the diff, so no reviewer can see them. Review those by hand.`,
        review: lastReview,
        usage,
      };
    }
    // Ignore-rule evasion: files created under ignore rules added DURING the
    // run are invisible to the snapshot diff — the reviewer must know the
    // rules changed so it can judge whether the change hides work (a legit
    // .gitignore edit is common; concealment is the risk).
    const ignoreRulesChanged = diff.ignoreRulesChanged === true || diff.files.some(
      (f) => f === ".gitignore" || f.endsWith("/.gitignore") || f === ".git/info/exclude",
    );
    if (ignoreRulesChanged) {
      human.notify(
        "pi-brain: ignore rules changed during the run — the reviewer has been told to scrutinize it.",
      );
    }

    events.emit({
      type: "agent.started",
      runId,
      role: "reviewer",
      model: modelLabel(reviewerCfg.provider, reviewerCfg.model),
      skills: revSkills.skills,
    });

    const raw = await deps.agents.run({
      runId,
      role: "reviewer",
      cwd: deps.cwd,
      prompt: REVIEWER_PROMPT({
        prd: read(prdPath),
        tasks: read(tasksPath),
        stack,
        diff: diff.patch,
        files: diff.files,
        verification: results,
        ignoreRulesChanged,
      }),
      model: reviewerCfg,
      skills: revSkills.skills,
      // Read-only is an INVARIANT of the reviewer role, not a config option:
      // config values are honored everywhere else, but a reviewer that can
      // write cannot be an independent reviewer (and could forge the spec
      // tamper guard).
      readOnly: true,
      resultTool: REVIEW_TOOL,
      contextFiles: reviewContext(),
      signal: deps.signal,
    });
    events.emit({
      type: "agent.completed",
      runId,
      role: "reviewer",
      ...(raw.usage ? { usage: { input: raw.usage.input ?? 0, output: raw.usage.output ?? 0 } } : {}),
    });
    recordUsage("reviewer", raw.usage);
    if (raw.aborted || deps.signal?.aborted) return { status: "cancelled", at: `review #${reviewRound}`, usage };
    // The reviewer is read-only, but the human may edit the approved
    // documents while it is running. Do not accept a verdict that was made
    // against one spec and persist an outcome for another.
    if (specWasModified()) return stopForSpecTamper();

    const validated = validateReviewResult(raw.structured);
    if (!validated.ok) {
      // Invalid structured output escalates immediately — no auto-repair
      // attempt (decision recorded against SPEC §34's "repaired/retried
      // once": a reviewer that cannot fill one schema reliably will not fill
      // a repair prompt better, and the human sees the raw errors instead).
      return {
        status: "needs_human",
        reason: `reviewer returned an invalid result: ${validated.errors.join("; ")}`,
        usage,
      };
    }
    lastReview = validated.value;
    events.emit({
      type: "review.completed",
      runId,
      verdict: lastReview.verdict,
      round: reviewRound,
      summary: lastReview.summary,
      files: diff.files,
      issues: lastReview.issues.map((i) => ({
        id: i.id,
        severity: i.severity,
        category: i.category,
        problem: i.problem,
        ...(i.file !== undefined ? { file: i.file } : {}),
        ...(i.line !== undefined ? { line: i.line } : {}),
        ...(i.recommendation !== undefined ? { recommendation: i.recommendation } : {}),
      })),
    });

    const decision = decideNextRound(
      lastReview,
      reviewRound,
      config.maxReviewRounds,
      previousBlockingIds,
      diff.patch !== previousPatch,
    );

    if (decision.action === "complete") {
      events.emit({ type: "workflow.completed", runId, status: "completed" });
      return {
        status: "completed",
        summary: lastReview.summary,
        files: diff.files,
        review: lastReview,
        usage,
      };
    }
    if (decision.action === "escalate") {
      events.emit({ type: "workflow.completed", runId, status: "needs_human" });
      return { status: "needs_human", reason: decision.reason, review: lastReview, usage };
    }

    fixes = decision.issues;
    previousBlockingIds = new Set(decision.issues.map((i) => i.id));
    previousPatch = diff.patch;
  }
}

// ---------------------------------------------------------------------------

async function resolveStack(deps: FeatureDeps): Promise<ProjectStack> {
  if (deps.config.stack) {
    return {
      primary: deps.config.stack,
      frameworks: [],
      languages: [],
      packageManagers: [],
      capabilities: [],
      confidence: 1,
      evidence: ["configured in .pi/pi-brain.json"],
    };
  }
  const detected = detectStack(deps.cwd);
  if (detected.confidence >= LOW_CONFIDENCE) return detected;

  const chosen = await deps.human.select({
    message: `Stack detection is uncertain (${detected.primary}, ${Math.round(detected.confidence * 100)}%). Which profile should I load?`,
    options: ["laravel", "nextjs", "astro", "nodejs", "common"].map((p) => ({
      label: p,
      value: p,
    })),
  });
  return { ...detected, primary: chosen, confidence: 1, evidence: [...detected.evidence, "user choice"] };
}

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "");


const modelLabel = (provider?: string, model?: string): string =>
  `${provider ?? "default"}/${model ?? "default"}`;

const tail = (s: string, lines = 40): string => s.split("\n").slice(-lines).join("\n");

export const DESCRIPTION_MARKER = "<!-- pi-brain:feature ";

export const descriptionMarker = (description: string): string =>
  `${DESCRIPTION_MARKER}${JSON.stringify(description)} -->`;

/**
 * Two different requests can share the first six slug words. Reusing the
 * directory would silently overwrite an unrelated feature's documents, so a
 * collision with a *different* description gets a numeric suffix.
 */
export function featureSlug(cwd: string, description: string): string {
  const base = slugify(description);
  const marker = descriptionMarker(description);
  for (let n = 1; n < 100; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const dir = join(cwd, ".ai", "features", slug);
    // EVERY document we would write must be absent or ours. Checking only the
    // PRD would let a hand-written task file be overwritten.
    const documents = [join(dir, `prd-${slug}.md`), join(dir, `tasks-${slug}.md`)];
    const existing = documents.filter((f) => existsSync(f));
    if (existing.length === 0) return slug; // free
    if (existing.length === documents.length && existing.every((f) => read(f).startsWith(marker))) {
      return slug; // our own earlier run of this same feature
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * A rerun of the same request must land in its earlier directory even when
 * the planner words the English TITLE differently this time. Every artifact
 * starts with the description marker, so scan for ours.
 */
function findExistingFeatureSlug(cwd: string, description: string): string | null {
  const root = join(cwd, ".ai", "features");
  if (!existsSync(root)) return null;
  const marker = descriptionMarker(description);
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    const prd = join(dir, `prd-${entry}.md`);
    if (existsSync(prd) && readFileSync(prd, "utf8").startsWith(marker)) return entry;
  }
  return null;
}

export function slugify(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
}

/**
 * Planner returns `## TITLE`, `## PRD` and `## TASKS` sections; split them for
 * writing. Anything before the `## TITLE`/`## PRD` heading (conversational
 * preamble the model was told not to emit) never reaches the artifact files.
 * A missing or empty TITLE yields null and the caller falls back to the raw
 * description for the slug.
 */
export function splitPlannerOutput(text: string): { title: string | null; prd: string; tasks: string } {
  const titleMatch = /^#{1,3}\s*TITLE\b\s*\n?/im.exec(text);
  const afterTitle = titleMatch ? text.slice(titleMatch.index + titleMatch[0].length) : text;
  const prdStart = /^#{1,3}\s*PRD\b/im.exec(afterTitle);
  const title = titleMatch
    ? afterTitle.slice(0, prdStart?.index ?? afterTitle.length).trim()
    : null;
  const body = prdStart ? afterTitle.slice(prdStart.index) : afterTitle;
  const marker = /^#{1,3}\s*TASKS\b/im;
  const match = marker.exec(body);
  if (!match) {
    return { title, prd: body, tasks: "# Tasks\n\n_(planner returned no task section)_\n" };
  }
  return { title, prd: body.slice(0, match.index).trim(), tasks: body.slice(match.index).trim() };
}

/** A plan must contain at least one stable task id before the human gate. */
export function hasValidTaskList(tasks: string): boolean {
  if (!/^#{1,3}\s*TASKS\b/im.test(tasks)) return false;
  const ids = [...tasks.matchAll(/^\s*(?:[-*]|\d+[.)])\s*(T\d+)\b/gim)].map((m) => m[1]!.toUpperCase());
  return ids.length > 0 && new Set(ids).size === ids.length;
}
