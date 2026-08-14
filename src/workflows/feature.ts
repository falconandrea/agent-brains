/**
 * `/feature` — the primary workflow (spec §11).
 *
 * Deterministic orchestration: code decides the transitions, models only do the
 * work. Everything it needs arrives through ports, so the whole thing runs in a
 * unit test with fakes.
 *
 *   discover -> clarify -> spec (hard gate) -> develop -> verify -> review -> loop -> final
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

export type FeatureOutcome =
  | { status: "completed"; summary: string; files: string[]; review: ReviewResult }
  | { status: "needs_human"; reason: string; review?: ReviewResult }
  | { status: "cancelled"; at: string };

export async function runFeatureWorkflow(
  deps: FeatureDeps,
  description: string,
  runId: string,
): Promise<FeatureOutcome> {
  const { human, events, config } = deps;
  events.emit({ type: "workflow.started", runId, workflow: "feature" });

  // --- Phase A: discovery --------------------------------------------------
  events.emit({ type: "phase.started", runId, phase: "discover" });
  const stack = await resolveStack(deps);
  const baseline = await deps.git.baseline(deps.cwd);
  human.notify(`stack: ${stack.primary} (${stack.frameworks.join(", ") || "no framework"})`);

  // --- Phase B+C: planner, then hard approval gate -------------------------
  events.emit({ type: "phase.started", runId, phase: "spec" });
  const planner = selectSkills(deps.profilesDir, stack.primary, "planner", deps.availableSkills);
  const plannerCfg = roleConfig(config, "planner");
  events.emit({
    type: "agent.started",
    runId,
    role: "planner",
    model: modelLabel(plannerCfg.provider, plannerCfg.model),
  });

  const slug = slugify(description);
  const featureDir = join(deps.cwd, ".ai", "features", slug);

  const plan = await deps.agents.run({
    runId,
    role: "planner",
    cwd: deps.cwd,
    prompt: PLANNER_PROMPT({ description, stack, featureDir, slug }),
    model: plannerCfg,
    skills: planner.skills,
    tools: ["read", "grep", "find", "ls"],
    contextFiles: routeContext({ cwd: deps.cwd, role: "planner", task: description, stack }).files,
    signal: deps.signal,
  });
  events.emit({ type: "agent.completed", runId, role: "planner" });

  const prdPath = join(featureDir, `prd-${slug}.md`);
  const tasksPath = join(featureDir, `tasks-${slug}.md`);
  if (!existsSync(prdPath) || !existsSync(tasksPath)) {
    // The planner is read-only by design, so it returns the docs as text and
    // the orchestrator is what writes them.
    mkdirSync(featureDir, { recursive: true });
    const { prd, tasks } = splitPlannerOutput(plan.text);
    writeFileSync(prdPath, prd, "utf8");
    writeFileSync(tasksPath, tasks, "utf8");
  }

  const approved = await human.confirm({
    message: `Approve the plan for '${slug}' and start implementation?`,
    detail: `${prdPath}\n${tasksPath}`,
    defaultValue: false,
  });
  if (!approved) return { status: "cancelled", at: "spec approval" };

  // --- Phase D..G: develop / verify / review loop --------------------------
  const developerCfg = roleConfig(config, "developer");
  const reviewerCfg = roleConfig(config, "reviewer");
  const devSkills = selectSkills(deps.profilesDir, stack.primary, "developer", deps.availableSkills);
  const revSkills = selectSkills(deps.profilesDir, stack.primary, "reviewer", deps.availableSkills);

  // The task text drives context routing, so include the tasks file: a plan
  // that mentions migrations pulls the schema in even if the one-line request
  // never said "database".
  const taskText = `${description}\n${read(tasksPath)}`;
  const devContext = routeContext({ cwd: deps.cwd, role: "developer", task: taskText, stack }).files;
  const reviewContext = routeContext({
    cwd: deps.cwd,
    role: "reviewer",
    task: taskText,
    stack,
    maxChars: 20_000,
  }).files;

  let round = 0;
  let fixes: ReviewIssue[] = [];
  let previousBlockingIds = new Set<string>();
  let previousPatch = "";
  let lastReview: ReviewResult | undefined;

  for (;;) {
    if (deps.signal?.aborted) return { status: "cancelled", at: `round ${round}` };

    // developer
    events.emit({ type: "phase.started", runId, phase: round === 0 ? "develop" : `fix #${round}` });
    events.emit({
      type: "agent.started",
      runId,
      role: "developer",
      model: modelLabel(developerCfg.provider, developerCfg.model),
    });
    await deps.agents.run({
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
      contextFiles: devContext,
      signal: deps.signal,
    });
    events.emit({ type: "agent.completed", runId, role: "developer" });

    // deterministic verification BEFORE spending reviewer tokens (§24)
    events.emit({ type: "phase.started", runId, phase: "verify" });
    const commands = resolveVerifyCommands(deps.cwd, stack, config.verify);
    const results = await deps.verifier.run(commands, deps.signal);
    for (const r of results)
      events.emit({ type: "command.completed", runId, command: r.command, exitCode: r.exitCode });

    const blockingFailures = results.filter(
      (r, i) => r.exitCode !== 0 && (commands[i]?.blocking ?? true),
    );
    events.emit({ type: "verification.completed", runId, passed: blockingFailures.length === 0 });

    if (blockingFailures.length > 0) {
      if (round >= config.maxReviewRounds)
        return { status: "needs_human", reason: "verification keeps failing" };
      round += 1;
      fixes = blockingFailures.map((f, i) => ({
        id: `verify-${round}-${i}`,
        severity: "blocking" as const,
        category: "tests" as const,
        problem: `\`${f.command}\` exited ${f.exitCode}:\n${tail(f.output)}`,
      }));
      continue; // back to the developer — the reviewer is NOT called
    }

    // review
    round += 1;
    events.emit({ type: "phase.started", runId, phase: `review #${round}` });
    const diff = await deps.git.diffSince(baseline);
    events.emit({
      type: "agent.started",
      runId,
      role: "reviewer",
      model: modelLabel(reviewerCfg.provider, reviewerCfg.model),
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
      }),
      model: reviewerCfg,
      skills: revSkills.skills,
      readOnly: reviewerCfg.readOnly ?? true,
      resultTool: REVIEW_TOOL,
      contextFiles: reviewContext,
      signal: deps.signal,
    });
    events.emit({ type: "agent.completed", runId, role: "reviewer" });

    const validated = validateReviewResult(raw.structured);
    if (!validated.ok) {
      // One repair attempt, then escalate (§34).
      return {
        status: "needs_human",
        reason: `reviewer returned an invalid result: ${validated.errors.join("; ")}`,
      };
    }
    lastReview = validated.value;
    events.emit({
      type: "review.completed",
      runId,
      verdict: lastReview.verdict,
      round,
    });

    const decision = decideNextRound(
      lastReview,
      round,
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
      };
    }
    if (decision.action === "escalate") {
      events.emit({ type: "workflow.completed", runId, status: "needs_human" });
      return { status: "needs_human", reason: decision.reason, review: lastReview };
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

export function slugify(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
}

/** Planner returns `## PRD` and `## TASKS` sections; split them for writing. */
export function splitPlannerOutput(text: string): { prd: string; tasks: string } {
  const marker = /^#{1,3}\s*TASKS\b/im;
  const match = marker.exec(text);
  if (!match) return { prd: text, tasks: "# Tasks\n\n_(planner returned no task section)_\n" };
  return { prd: text.slice(0, match.index).trim(), tasks: text.slice(match.index).trim() };
}
