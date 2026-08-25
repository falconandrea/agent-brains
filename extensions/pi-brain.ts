/**
 * pi-brain extension entry point.
 *
 * Registers the commands and wires the ports. Everything below the ports is
 * Pi-free and unit-tested; this file plus src/pi/* are the only Pi surface.
 * Typechecked against @earendil-works/pi-coding-agent 0.84.2, NEVER RUN — see
 * docs/pi-brain/SPIKE.md.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

import { loadConfig } from "../src/config.ts";
import { detectStack } from "../src/stack.ts";
import { listProfiles, resolveProfile } from "../src/profiles.ts";
import { RealGitService, ShellVerifyRunner } from "../src/shell.ts";
import { acquireRunLock, describeLock, type AcquireResult } from "../src/run-lock.ts";
import { PiHumanInput, UserDismissedError } from "../src/pi/human-input.ts";
import { PiAgentRunner } from "../src/pi/pi-agent-runner.ts";
import { runFeatureWorkflow, type FeatureOutcome, type UsageByRole } from "../src/workflows/feature.ts";
import { replayRunLog, validateResumePreconditions, hasPatchChanged, askResumeWithChangedDiff, type Refusal } from "../src/workflows/resume.ts";
import type { WorkflowEvent } from "../src/ports.ts";
import { RunLog, readRunLog, listRunIds } from "../src/run-log.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(PACKAGE_ROOT, "profiles");
const SKILLS_DIR = join(PACKAGE_ROOT, ".agents", "skills");

/**
 * Only directories holding a SKILL.md count: Pi skips loose `.md` files at the
 * root of `.agents/skills/`, so a couple of legacy ones are invisible to it.
 */
function availableSkills(): Set<string> {
  if (!existsSync(SKILLS_DIR)) return new Set<string>();
  return new Set(
    readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(
        (d) =>
          (d.isDirectory() || d.isSymbolicLink()) &&
          existsSync(join(SKILLS_DIR, d.name, "SKILL.md")),
      )
      .map((d) => d.name),
  );
}

/**
 * Pi can be opened anywhere inside a repository. Config, the lock, the git
 * baseline and .ai/ artefacts must all agree on ONE root, or two terminals in
 * different subdirectories will both think they hold the lock.
 */
function repoRootOf(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return cwd; // not a git repo: degrade to the current directory
  }
}

interface ActiveRun {
  runId: string;
  workflow: string;
  phase: string;
  status: string;
  events: WorkflowEvent[];
  abort: AbortController;
}

export default function piBrain(pi: ExtensionAPI): void {
  let active: ActiveRun | null = null;

  // -- /feature --------------------------------------------------------------
  pi.registerCommand("feature", {
    description: "Plan -> develop -> verify -> independent review, for one feature",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (active?.status === "running") {
        ctx.ui.notify(`pi-brain is already running ${active.workflow} (${active.phase}).`, "warning");
        return;
      }
      const description = args.trim();
      if (description === "") {
        ctx.ui.notify("Usage: /feature <what you want built>", "warning");
        return;
      }

      const cwd = repoRootOf(ctx.cwd);
      const { config, warnings } = loadConfig(cwd);
      for (const warning of warnings) ctx.ui.notify(`pi-brain config: ${warning}`, "warning");
      const runId = `run-${Date.now().toString(36)}`;
      const abort = new AbortController();
      const runLog = RunLog.open(cwd, runId);
      const run: ActiveRun = {
        runId,
        workflow: "feature",
        phase: "starting",
        status: "running",
        events: [],
        abort,
      };
      active = run;

      // Always resolve the LIVE ctx — captured ones go stale in Pi.
      const human = new PiHumanInput(() => ctx, "live");

      let agents;
      try {
        agents = await PiAgentRunner.create({
          cwd,
          askUser: (q) => human.askFromChild(q),
          onEvent: (e) => human.status(`${e.role}: ${e.type}${e.detail ? ` ${e.detail}` : ""}`),
        });
      } catch (err) {
        active = null;
        ctx.ui.notify(`pi-brain: could not start the agent runtime — ${(err as Error).message}`, "error");
        return;
      }

      // Another Pi terminal may already be writing in this repo (spec §21).
      let lock;
      try {
        lock = acquireRunLock(cwd, { runId, workflow: "feature" });
      } catch (err) {
        active = null;
        ctx.ui.notify(`pi-brain: cannot create the run lock in ${cwd}/.pi — ${(err as Error).message}`, "error");
        return;
      }
      if (!lock.ok) {
        // No "run anyway": one writer per repository is an invariant, not a
        // preference. Two agents editing the same tree corrupt each other's
        // work, and the reviewer's evidence along with it.
        active = null;
        ctx.ui.notify(lockRefusal(lock), "warning");
        return;
      }

      const events = {
        emit(event: WorkflowEvent) {
          run.events.push(event);
          pi.appendEntry("pi-brain.event", event); // pi-side history (unreliable — see run-log.ts)
          runLog.append(event); // OUR audit trail: survives crashes and scrolling
          if (event.type === "phase.started") {
            run.phase = event.phase;
            human.status(`${run.workflow}: ${event.phase}`);
          }
        },
      };

      // Run detached: awaiting here would hold Pi's command loop hostage for
      // the whole pipeline and /flow status|log|stop could never answer.
      void (async () => {
        try {
          const outcome = await runFeatureWorkflow(
            {
              cwd,
              profilesDir: PROFILES_DIR,
              availableSkills: availableSkills(),
              config,
              agents,
              human,
              verifier: new ShellVerifyRunner(cwd),
              git: new RealGitService(),
              events,
              signal: abort.signal,
            },
            description,
            runId,
          );
          run.status = outcome.status;
          // Persist the full outcome — review findings included — before any
          // TUI rendering can lose it (IDEAS.md run-state escalation).
          events.emit({
            type: "workflow.outcome",
            runId,
            status: outcome.status,
            ...("reason" in outcome && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
            ...("summary" in outcome && outcome.summary !== undefined ? { summary: outcome.summary } : {}),
            ...("files" in outcome && outcome.files !== undefined ? { files: outcome.files } : {}),
            ...("review" in outcome && outcome.review !== undefined
              ? {
                  review: {
                    verdict: outcome.review.verdict,
                    summary: outcome.review.summary,
                    issues: outcome.review.issues.map((i) => ({
                      id: i.id,
                      severity: i.severity,
                      category: i.category,
                      problem: i.problem,
                      ...(i.file !== undefined ? { file: i.file } : {}),
                      ...(i.line !== undefined ? { line: i.line } : {}),
                      ...(i.recommendation !== undefined ? { recommendation: i.recommendation } : {}),
                    })),
                  },
                }
              : {}),
            usage: Object.fromEntries(
              Object.entries(outcome.usage).map(([role, u]) => [
                role,
                { input: u?.input ?? 0, output: u?.output ?? 0 },
              ]),
            ),
          });
          ctx.ui.notify(renderOutcome(outcome), outcome.status === "completed" ? "info" : "warning");
          if (config.notifications.bell) process.stdout.write("\x07"); // terminal bell
        } catch (err) {
          run.status = err instanceof UserDismissedError ? "cancelled" : "failed";
          const message = (err as Error).message;
          events.emit({ type: "workflow.failed", runId, error: message });
          ctx.ui.notify(`pi-brain: ${message}`, "error");
        } finally {
          lock.release();
          human.status(undefined);
        }
      })();
      ctx.ui.notify(`pi-brain: ${runId} started — /flow status, /flow log, /flow stop.`);
    },
  });

  // -- /flow -----------------------------------------------------------------
  pi.registerCommand("flow", {
    description: "pi-brain run status: status | log | stop",
    getArgumentCompletions: () => {
      return [
        { value: "status", label: "status", description: "current phase and run id" },
        { value: "log", label: "log", description: "event trace for this run (persisted)" },
        { value: "log-all", label: "log-all", description: "all persisted runs in this repo" },
        { value: "stop", label: "stop", description: "cancel the active run" },
        { value: "resume", label: "resume", description: "resume an interrupted /feature run" },
      ];
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/);

      // Handle resume separately — it doesn't require an active run
      if (subcommand === "resume") {
        const runId = rest[0];
        if (!runId) {
          ctx.ui.notify("Usage: /flow resume <runId>", "warning");
          return;
        }
        await handleResume(runId, ctx, pi, () => active);
        return;
      }

      if (!active) {
        ctx.ui.notify("pi-brain: no run in this session.");
        return;
      }
      switch (subcommand || "status") {
        case "stop":
          active.abort.abort();
          active.status = "cancelled";
          ctx.ui.notify("pi-brain: cancelling…", "warning");
          return;
        case "log": {
          // Read from the persisted run log (survives scrolling/crashes), not
          // from the in-memory buffer.
          const events = readRunLog(repoRootOf(ctx.cwd), active.runId);
          ctx.ui.notify(
            events.length > 0
              ? events.map(describe).join("\n")
              : active.events.map(describe).join("\n") || "(no events yet)",
          );
          return;
        }
        case "log-all": {
          // Every persisted run in this repo, newest first, one summary line each.
          const root = repoRootOf(ctx.cwd);
          const ids = listRunIds(root);
          if (ids.length === 0) {
            ctx.ui.notify("pi-brain: no persisted runs in this repo.");
            return;
          }
          const lines: string[] = [];
          for (const id of ids) {
            const events = readRunLog(root, id);
            const outcome = events.find((e): e is Extract<WorkflowEvent, { type: "workflow.outcome" }> => e.type === "workflow.outcome");
            const lastReview = [...events]
              .reverse()
              .find((e): e is Extract<WorkflowEvent, { type: "review.completed" }> => e.type === "review.completed");
            lines.push(
              [
                id,
                outcome
                  ? `outcome=${outcome.status}${outcome.reason ? ` (${outcome.reason.slice(0, 80)})` : ""}`
                  : lastReview
                    ? `last=${lastReview.verdict}`
                    : "in-progress-or-interrupted",
              ].join("  "),
            );
          }
          ctx.ui.notify(lines.join("\n"));
          return;
        }
        default: {
          // Live usage folded from agent.completed events (per-call deltas).
          const live: UsageByRole = {};
          for (const event of active.events) {
            if (event.type !== "agent.completed" || !event.usage) continue;
            const current = live[event.role] ?? { input: 0, output: 0 };
            current.input += event.usage.input;
            current.output += event.usage.output;
            live[event.role] = current;
          }
          const usageLine = renderUsage(live);
          ctx.ui.notify(
            [
              `pi-brain ${active.workflow} [${active.status}] phase=${active.phase} run=${active.runId}`,
              usageLine,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }
      }
    },
  });

  // -- /flow resume helper --------------------------------------------------
  async function handleResume(
    runId: string,
    ctx: ExtensionCommandContext,
    pi: ExtensionAPI,
    getActive: () => ActiveRun | null,
  ): Promise<void> {
    const cwd = repoRootOf(ctx.cwd);
    const events = readRunLog(cwd, runId);
    if (events.length === 0) {
      ctx.ui.notify(`pi-brain: unknown run ${runId}`, "warning");
      return;
    }

    // Replay the log to get resume state or refusal
    const replay = replayRunLog(events);
    if (!replay.ok) {
      ctx.ui.notify(`pi-brain: cannot resume ${runId} — ${refusalMessage(replay.refusal)}`, "warning");
      return;
    }

    const state = replay.state;

    // Check if there's already an active run
    if (getActive()?.status === "running") {
      ctx.ui.notify("pi-brain: another run is active in this session. Use /flow stop first.", "warning");
      return;
    }

    const { config, warnings } = loadConfig(cwd);
    for (const warning of warnings) ctx.ui.notify(`pi-brain config: ${warning}`, "warning");

    const abort = new AbortController();

    // Replay guarantees events[0] is workflow.started; description and the
    // original baseline are what the artifacts lookup and diff reconstruction
    // hang on — without them the resume cannot be honest.
    const started = events[0] as Extract<WorkflowEvent, { type: "workflow.started" }>;
    const description = started.description;
    if (!description) {
      ctx.ui.notify(`pi-brain: cannot resume ${runId} — missing description in log`, "warning");
      return;
    }
    if (!started.baseline) {
      ctx.ui.notify(`pi-brain: cannot resume ${runId} — missing baseline in log (old format)`, "warning");
      return;
    }

    // diffSince consumes only repoRoot and baseCommit; branch/headSha are
    // informational and the original values were never persisted.
    const baseline = {
      repoRoot: cwd,
      branch: "resumed",
      headSha: "unknown",
      baseCommit: started.baseline,
    };

    // Validate preconditions
    const preconditionFailure = await validateResumePreconditions({
      cwd,
      description,
      git: new RealGitService(),
      baseline,
    });
    if (preconditionFailure) {
      ctx.ui.notify(`pi-brain: cannot resume ${runId} — ${refusalMessage(preconditionFailure)}`, "warning");
      return;
    }

    // Acquire lock
    let lock;
    try {
      lock = acquireRunLock(cwd, { runId, workflow: "feature" });
    } catch (err) {
      ctx.ui.notify(`pi-brain: cannot create the run lock in ${cwd}/.pi — ${(err as Error).message}`, "error");
      return;
    }
    if (!lock.ok) {
      ctx.ui.notify(lockRefusal(lock), "warning");
      return;
    }

    // Check for changed diff if resuming at review phase
    if (state.phase.startsWith("review #") && state.interruptedPatchSha) {
      const git = new RealGitService();
      const diff = await git.diffSince(baseline);
      if (hasPatchChanged(diff.patch, state.interruptedPatchSha)) {
        const human = new PiHumanInput(() => ctx, "live");
        const shouldResume = await askResumeWithChangedDiff(human);
        if (!shouldResume) {
          ctx.ui.notify(`pi-brain: resume aborted by user`, "warning");
          lock.release();
          return;
        }
      }
    }

    // Create agents
    let agents;
    try {
      agents = await PiAgentRunner.create({
        cwd,
        askUser: (q) => new PiHumanInput(() => ctx, "live").askFromChild(q),
        onEvent: (e) => new PiHumanInput(() => ctx, "live").status(`${e.role}: ${e.type}${e.detail ? ` ${e.detail}` : ""}`),
      });
    } catch (err) {
      lock.release();
      ctx.ui.notify(`pi-brain: could not start the agent runtime — ${(err as Error).message}`, "error");
      return;
    }

    const human = new PiHumanInput(() => ctx, "live");

    // Open the audit log only once every refusal path is past: a refused
    // resume must not append anything to the run's log.
    const runLog = RunLog.open(cwd, runId);

    // Set up the active run
    const run: ActiveRun = {
      runId,
      workflow: "feature",
      phase: state.phase,
      status: "running",
      events: [],
      abort,
    };
    (active as ActiveRun) = run;

    const eventsSink = {
      emit(event: WorkflowEvent) {
        run.events.push(event);
        pi.appendEntry("pi-brain.event", event);
        runLog.append(event);
        if (event.type === "phase.started") {
          run.phase = event.phase;
          human.status(`${run.workflow}: ${event.phase}`);
        }
      },
    };

    // Emit workflow.resumed event
    eventsSink.emit({ type: "workflow.resumed", runId, phase: state.phase });

    // Run detached
    void (async () => {
      try {
        const outcome = await runFeatureWorkflow(
          {
            cwd,
            profilesDir: PROFILES_DIR,
            availableSkills: availableSkills(),
            config,
            agents,
            human,
            verifier: new ShellVerifyRunner(cwd),
            git: new RealGitService(),
            events: eventsSink,
            signal: abort.signal,
          },
          description,
          runId,
          // The persisted baseline is part of the resume state: without it
          // the workflow would re-baseline and hide the interrupted work.
          { ...state, baseline },
        );
        run.status = outcome.status;
        eventsSink.emit({
          type: "workflow.outcome",
          runId,
          status: outcome.status,
          ...("reason" in outcome && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
          ...("summary" in outcome && outcome.summary !== undefined ? { summary: outcome.summary } : {}),
          ...("files" in outcome && outcome.files !== undefined ? { files: outcome.files } : {}),
          ...("review" in outcome && outcome.review !== undefined
            ? {
                review: {
                  verdict: outcome.review.verdict,
                  summary: outcome.review.summary,
                  issues: outcome.review.issues.map((i) => ({
                    id: i.id,
                    severity: i.severity,
                    category: i.category,
                    problem: i.problem,
                    ...(i.file !== undefined ? { file: i.file } : {}),
                    ...(i.line !== undefined ? { line: i.line } : {}),
                    ...(i.recommendation !== undefined ? { recommendation: i.recommendation } : {}),
                  })),
                },
              }
            : {}),
          usage: Object.fromEntries(
            Object.entries(outcome.usage).map(([role, u]) => [
              role,
              { input: u?.input ?? 0, output: u?.output ?? 0 },
            ]),
          ),
        });
        ctx.ui.notify(renderOutcome(outcome), outcome.status === "completed" ? "info" : "warning");
        if (config.notifications.bell) process.stdout.write("\x07");
      } catch (err) {
        run.status = err instanceof UserDismissedError ? "cancelled" : "failed";
        const message = (err as Error).message;
        eventsSink.emit({ type: "workflow.failed", runId, error: message });
        ctx.ui.notify(`pi-brain: ${message}`, "error");
      } finally {
        lock.release();
        human.status(undefined);
      }
    })();
    ctx.ui.notify(`pi-brain: ${runId} resumed from ${state.phase} — /flow status, /flow log, /flow stop.`);
  }

  function refusalMessage(refusal: Refusal): string {
    switch (refusal.type) {
      case "empty_log":
        return "run log not found";
      case "not_feature_workflow":
        return `not a feature workflow (it's ${refusal.workflow})`;
      case "missing_workflow_started":
        return "log missing workflow.started event";
      case "missing_baseline":
        return "log missing baseline (old format, cannot resume)";
      case "gate_not_approved":
        return "spec gate was not approved";
      case "terminal_outcome":
        return `run already ended with status: ${refusal.outcome}`;
      case "missing_artifacts":
        return "PRD or tasks files are missing or have wrong marker";
      case "unresolvable_baseline":
        return "baseline commit is no longer accessible";
      default:
        return "unknown refusal";
    }
  }

  // -- /stack ----------------------------------------------------------------
  pi.registerCommand("stack", {
    description: "Show the detected project stack, or inspect a skill profile",
    getArgumentCompletions: () =>
      listProfiles(PROFILES_DIR).map((p) => ({ value: p, label: p, description: "skill profile" })),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const name = args.trim();
      if (name !== "") {
        const resolved = resolveProfile(PROFILES_DIR, name);
        const installed = availableSkills();
        const missing = resolved.skills.filter((s) => !installed.has(s));
        ctx.ui.notify(
          [
            `profile ${name} → ${resolved.skills.length} skills (includes: ${resolved.includes.join(", ")})`,
            resolved.skills.join(", "),
            missing.length > 0 ? `not installed: ${missing.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return;
      }
      const stack = detectStack(repoRootOf(ctx.cwd));
      ctx.ui.notify(
        [
          `stack:      ${stack.primary} (${Math.round(stack.confidence * 100)}%)`,
          `frameworks: ${stack.frameworks.join(", ") || "-"}`,
          `evidence:   ${stack.evidence.join("; ") || "-"}`,
          `override:   set "stack" in .pi/pi-brain.json`,
        ].join("\n"),
      );
    },
  });
}

function lockRefusal(lock: Extract<AcquireResult, { ok: false }>): string {
  switch (lock.reason) {
    case "held":
      return (
        `pi-brain: another session already owns this repository — ${describeLock(lock.heldBy)}. ` +
        `Wait for it to finish, or run /flow stop in that terminal.`
      );
    case "held_stale":
      return (
        `pi-brain: ${describeLock(lock.heldBy)} still owns this repository and has held it for a ` +
        `long time. Stop that Pi session first (pid ${lock.heldBy.pid}) — the lock is then taken ` +
        `over automatically. Delete ${lock.lockFile} by hand only if that process no longer exists.`
      );
    case "takeover_in_progress":
      return (
        `pi-brain: another session is claiming this repository's abandoned lock. Try again in a ` +
        `moment; if no other Pi session is running, delete ${lock.markerPath}.`
      );
  }
}

function describe(event: WorkflowEvent): string {
  switch (event.type) {
    case "phase.started":
      return `● ${event.phase}`;
    case "agent.started":
      return `  ${event.role} → ${event.model}${event.skills?.length ? ` [${event.skills.join(", ")}]` : ""}`;
    case "agent.completed":
      return `  ${event.role} done${event.usage ? ` (${fmtTokens(event.usage.input)} in / ${fmtTokens(event.usage.output)} out)` : ""}`;
    case "command.completed":
      return `  ${event.exitCode === 0 ? "✓" : "✗"} ${event.command}`;
    case "review.completed":
      return [
        `  review #${event.round}: ${event.verdict}`,
        ...(event.issues && event.issues.length > 0
          ? event.issues.map((i) => `    ${i.id} [${i.severity}] ${i.problem}`)
          : []),
      ].join("\n");
    case "workflow.outcome": {
      const usageLine =
        event.usage && Object.keys(event.usage).length > 0
          ? `\n  tokens: ${Object.entries(event.usage)
              .map(([role, u]) => `${role} ${u.input}/${u.output}`)
              .join(" · ")}`
          : "";
      const reviewLine =
        event.review && event.review.issues.length > 0
          ? `\n  review issues: ${event.review.issues.map((i) => `${i.id}[${i.severity}]`).join(", ")}`
          : "";
      return `■ outcome: ${event.status}${event.reason ? ` — ${event.reason}` : ""}${event.summary ? `\n  ${event.summary}` : ""}${usageLine}${reviewLine}`;
    }
    default:
      return `  ${event.type}`;
  }
}

/** 1234 → "1.2k", 250 → "250" — compact enough for a status line. */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** "planner 1.2k/0.4k · developer 8.9k/2.1k · total 10.1k/2.5k" (in/out). */
function renderUsage(usage: UsageByRole): string {
  const roles = Object.entries(usage);
  if (roles.length === 0) return "";
  const parts = roles.map(([role, u]) => `${role} ${fmtTokens(u!.input)}/${fmtTokens(u!.output)}`);
  const total = roles.reduce(
    (acc, [, u]) => ({ input: acc.input + u!.input, output: acc.output + u!.output }),
    { input: 0, output: 0 },
  );
  parts.push(`total ${fmtTokens(total.input)}/${fmtTokens(total.output)}`);
  return `tokens in/out: ${parts.join(" · ")}`;
}

function renderOutcome(outcome: FeatureOutcome): string {
  const usageLine = renderUsage(outcome.usage);
  switch (outcome.status) {
    case "completed":
      return [
        `✓ FEATURE COMPLETE — ${outcome.files.length} files changed, no commit created.`,
        outcome.summary,
        outcome.review.issues.length > 0
          ? `${outcome.review.issues.length} non-blocking note(s) left by the reviewer.`
          : "",
        usageLine,
        "Inspect with: git diff",
      ]
        .filter(Boolean)
        .join("\n");
    case "needs_human":
      return ["⚠ NEEDS HUMAN — " + outcome.reason, usageLine, "Full findings: /flow log", "Past runs: /flow log-all"]
        .filter(Boolean)
        .join("\n");
    default:
      return `cancelled at ${outcome.at}`;
  }
}
