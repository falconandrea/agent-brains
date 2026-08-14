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
import { acquireRunLock, describeLock } from "../src/run-lock.ts";
import { PiHumanInput, UserDismissedError } from "../src/pi/human-input.ts";
import { PiAgentRunner } from "../src/pi/pi-agent-runner.ts";
import { runFeatureWorkflow, type FeatureOutcome } from "../src/workflows/feature.ts";
import type { WorkflowEvent } from "../src/ports.ts";

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
      const lock = acquireRunLock(cwd, { runId, workflow: "feature" });
      if (!lock.ok) {
        const proceed = await ctx.ui.confirm(
          "pi-brain: this repository is already locked",
          `${describeLock(lock.heldBy)}\n\nRun anyway? Two agents writing at once will conflict.`,
        );
        if (!proceed) {
          active = null;
          return;
        }
      }

      const events = {
        emit(event: WorkflowEvent) {
          run.events.push(event);
          pi.appendEntry("pi-brain.event", event); // survives a crash (§20)
          if (event.type === "phase.started") {
            run.phase = event.phase;
            human.status(`${run.workflow}: ${event.phase}`);
          }
        },
      };

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
        ctx.ui.notify(renderOutcome(outcome), outcome.status === "completed" ? "info" : "warning");
        if (config.notifications.bell) process.stdout.write("\x07"); // terminal bell
      } catch (err) {
        run.status = err instanceof UserDismissedError ? "cancelled" : "failed";
        const message = (err as Error).message;
        events.emit({ type: "workflow.failed", runId, error: message });
        ctx.ui.notify(`pi-brain: ${message}`, "error");
      } finally {
        if (lock.ok) lock.release();
        human.status(undefined);
      }
    },
  });

  // -- /flow -----------------------------------------------------------------
  pi.registerCommand("flow", {
    description: "pi-brain run status: status | log | stop",
    getArgumentCompletions: () =>
      [
        { value: "status", label: "status", description: "current phase and run id" },
        { value: "log", label: "log", description: "event trace for this run" },
        { value: "stop", label: "stop", description: "cancel the active run" },
      ],
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (!active) {
        ctx.ui.notify("pi-brain: no run in this session.");
        return;
      }
      switch (args.trim() || "status") {
        case "stop":
          active.abort.abort();
          active.status = "cancelled";
          ctx.ui.notify("pi-brain: cancelling…", "warning");
          return;
        case "log":
          ctx.ui.notify(active.events.map(describe).join("\n") || "(no events yet)");
          return;
        default:
          ctx.ui.notify(
            `pi-brain ${active.workflow} [${active.status}] phase=${active.phase} run=${active.runId}`,
          );
      }
    },
  });

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

function describe(event: WorkflowEvent): string {
  switch (event.type) {
    case "phase.started":
      return `● ${event.phase}`;
    case "agent.started":
      return `  ${event.role} → ${event.model}`;
    case "command.completed":
      return `  ${event.exitCode === 0 ? "✓" : "✗"} ${event.command}`;
    case "review.completed":
      return `  review #${event.round}: ${event.verdict}`;
    default:
      return `  ${event.type}`;
  }
}

function renderOutcome(outcome: FeatureOutcome): string {
  switch (outcome.status) {
    case "completed":
      return [
        `✓ FEATURE COMPLETE — ${outcome.files.length} files changed, no commit created.`,
        outcome.summary,
        outcome.review.issues.length > 0
          ? `${outcome.review.issues.length} non-blocking note(s) left by the reviewer.`
          : "",
        "Inspect with: git diff",
      ]
        .filter(Boolean)
        .join("\n");
    case "needs_human":
      return `⚠ NEEDS HUMAN — ${outcome.reason}`;
    default:
      return `cancelled at ${outcome.at}`;
  }
}
