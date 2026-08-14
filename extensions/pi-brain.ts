/**
 * pi-brain extension entry point.
 *
 * Registers the commands and wires the ports. Everything below the ports is
 * Pi-free and unit-tested; this file and src/pi/* are the only Pi surface.
 *
 * NOT YET RUN AGAINST A REAL PI INSTALL — see docs/pi-brain/SPIKE.md.
 */

import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../src/config.ts";
import { detectStack } from "../src/stack.ts";
import { listProfiles, resolveProfile } from "../src/profiles.ts";
import { RealGitService, ShellVerifyRunner } from "../src/shell.ts";
import { PiHumanInput, type PiUiContext } from "../src/pi/human-input.ts";
import { PiAgentRunner } from "../src/pi/pi-agent-runner.ts";
import { runFeatureWorkflow, type FeatureOutcome } from "../src/workflows/feature.ts";
import type { WorkflowEvent } from "../src/ports.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(PACKAGE_ROOT, "profiles");
const SKILLS_DIR = join(PACKAGE_ROOT, ".agents", "skills");

const availableSkills = (): Set<string> =>
  existsSync(SKILLS_DIR)
    ? new Set(readdirSync(SKILLS_DIR, { withFileTypes: true }).map((d) => d.name))
    : new Set<string>();

interface ActiveRun {
  runId: string;
  workflow: string;
  phase: string;
  status: string;
  events: WorkflowEvent[];
  abort: AbortController;
}

export default function piBrain(pi: any): void {
  let active: ActiveRun | null = null;

  // -- /feature --------------------------------------------------------------
  pi.registerCommand("feature", {
    description: "Run the plan -> develop -> verify -> review workflow for a feature",
    handler: async (args: string, ctx: any) => {
      if (active && active.status === "running") {
        ctx.ui.notify(`A workflow is already running: ${active.workflow} (${active.phase}).`);
        return;
      }
      const description = args.trim();
      if (description === "") {
        ctx.ui.notify("Usage: /feature <what you want built>");
        return;
      }

      const cwd = ctx.cwd ?? process.cwd();
      const config = loadConfig(cwd);
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
      const human = new PiHumanInput(() => ctx as PiUiContext, "live");

      const agents = await PiAgentRunner.create({
        cwd,
        askUser: (q) => human.askFromChild(q),
        onEvent: (e) => ctx.ui.setStatus?.(`${e.role}: ${e.type}${e.detail ? ` ${e.detail}` : ""}`),
      });

      const events = {
        emit(event: WorkflowEvent) {
          run.events.push(event);
          pi.appendEntry("pi-brain.event", event); // survives a crash (§20)
          if (event.type === "phase.started") {
            run.phase = event.phase;
            ctx.ui.setStatus?.(`pi-brain: ${event.phase}`);
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
        ctx.ui.notify(renderOutcome(outcome, config.notifications.bell));
      } catch (err) {
        run.status = "failed";
        events.emit({ type: "workflow.failed", runId, error: (err as Error).message });
        ctx.ui.notify(`pi-brain failed: ${(err as Error).message}`);
      }
    },
  });

  // -- /flow -----------------------------------------------------------------
  pi.registerCommand("flow", {
    description: "pi-brain run status: /flow status | /flow log | /flow stop",
    getArgumentCompletions: () => ["status", "log", "stop"],
    handler: async (args: string, ctx: any) => {
      const sub = args.trim() || "status";
      if (!active) {
        ctx.ui.notify("pi-brain: no run in this session.");
        return;
      }
      if (sub === "stop") {
        active.abort.abort();
        active.status = "cancelled";
        ctx.ui.notify("pi-brain: cancelling…");
        return;
      }
      if (sub === "log") {
        ctx.ui.notify(active.events.map((e) => `· ${e.type}`).join("\n"));
        return;
      }
      ctx.ui.notify(
        `pi-brain ${active.workflow} [${active.status}] phase=${active.phase} run=${active.runId}`,
      );
    },
  });

  // -- /stack ----------------------------------------------------------------
  pi.registerCommand("stack", {
    description: "Show the detected project stack, or list available profiles",
    getArgumentCompletions: () => listProfiles(PROFILES_DIR),
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd ?? process.cwd();
      const name = args.trim();
      if (name !== "") {
        const resolved = resolveProfile(PROFILES_DIR, name);
        ctx.ui.notify(
          `profile ${name} -> ${resolved.skills.length} skills\n${resolved.skills.join(", ")}`,
        );
        return;
      }
      const stack = detectStack(cwd);
      ctx.ui.notify(
        [
          `stack:      ${stack.primary} (${Math.round(stack.confidence * 100)}%)`,
          `frameworks: ${stack.frameworks.join(", ") || "-"}`,
          `evidence:   ${stack.evidence.join("; ")}`,
          `override:   set "stack" in .pi/pi-brain.json`,
        ].join("\n"),
      );
    },
  });
}

function renderOutcome(outcome: FeatureOutcome, bell: boolean): string {
  const bellChar = bell ? "" : "";
  if (outcome.status === "completed") {
    return `${bellChar}✓ FEATURE COMPLETE — ${outcome.files.length} files changed. No commit created.\n${outcome.summary}`;
  }
  if (outcome.status === "needs_human") {
    return `${bellChar}⚠ NEEDS HUMAN — ${outcome.reason}`;
  }
  return `cancelled at ${outcome.at}`;
}
