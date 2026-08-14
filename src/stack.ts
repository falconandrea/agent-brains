/**
 * Stack detection from deterministic repository evidence.
 *
 * Config override always wins (`stack:` in .pi/pi-brain.json). Detection is
 * pure filesystem logic — no LLM, no Pi API — so it is unit-testable against
 * fixture directories.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ProjectStack {
  /** Profile name to load, e.g. "laravel" | "astro" | "nextjs" | "nodejs". */
  primary: string;
  frameworks: string[];
  languages: string[];
  packageManagers: string[];
  capabilities: string[];
  /** 0..1 — below `LOW_CONFIDENCE` the workflow should ask the user. */
  confidence: number;
  evidence: string[];
}

export const LOW_CONFIDENCE = 0.6;

const has = (root: string, ...rel: string[]): boolean =>
  rel.some((r) => existsSync(join(root, r)));

function readJson(root: string, file: string): Record<string, unknown> | null {
  const path = join(root, file);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deps(pkg: Record<string, unknown> | null): Record<string, string> {
  if (!pkg) return {};
  return {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  };
}

function globExists(root: string, prefix: string): boolean {
  try {
    return readdirSync(root).some((f) => f.startsWith(prefix));
  } catch {
    return false;
  }
}

function detectPackageManagers(root: string): string[] {
  const pm: string[] = [];
  if (has(root, "pnpm-lock.yaml")) pm.push("pnpm");
  if (has(root, "yarn.lock")) pm.push("yarn");
  if (has(root, "bun.lockb", "bun.lock")) pm.push("bun");
  if (has(root, "package-lock.json")) pm.push("npm");
  if (pm.length === 0 && has(root, "package.json")) pm.push("npm");
  if (has(root, "composer.json")) pm.push("composer");
  return pm;
}

export function detectStack(root: string): ProjectStack {
  const evidence: string[] = [];
  const frameworks: string[] = [];
  const languages: string[] = [];
  const capabilities: string[] = [];

  const pkg = readJson(root, "package.json");
  const nodeDeps = deps(pkg);
  const composer = readJson(root, "composer.json");
  const composerDeps = {
    ...((composer?.require as Record<string, string>) ?? {}),
    ...((composer?.["require-dev"] as Record<string, string>) ?? {}),
  };

  if (pkg) languages.push("javascript");
  if (has(root, "tsconfig.json")) languages.push("typescript");
  if (composer) languages.push("php");

  // --- Laravel -------------------------------------------------------------
  let laravelScore = 0;
  if ("laravel/framework" in composerDeps) {
    laravelScore += 0.6;
    evidence.push("composer.json requires laravel/framework");
  }
  if (has(root, "artisan")) {
    laravelScore += 0.3;
    evidence.push("artisan present");
  }
  if (has(root, "bootstrap/app.php")) {
    laravelScore += 0.2;
    evidence.push("bootstrap/app.php present");
  }

  // --- Astro ---------------------------------------------------------------
  let astroScore = 0;
  if ("astro" in nodeDeps) {
    astroScore += 0.6;
    evidence.push("package.json depends on astro");
  }
  if (globExists(root, "astro.config")) {
    astroScore += 0.3;
    evidence.push("astro.config.* present");
  }
  if (has(root, "src/pages")) astroScore += 0.1;

  // --- Next.js -------------------------------------------------------------
  let nextScore = 0;
  if ("next" in nodeDeps) {
    nextScore += 0.6;
    evidence.push("package.json depends on next");
  }
  if (globExists(root, "next.config")) {
    nextScore += 0.3;
    evidence.push("next.config.* present");
  }
  if (has(root, "app", "pages", "src/app", "src/pages")) nextScore += 0.1;

  // --- secondary capabilities ---------------------------------------------
  if ("livewire/livewire" in composerDeps) frameworks.push("livewire");
  if ("livewire/volt" in composerDeps) frameworks.push("volt");
  if ("pestphp/pest" in composerDeps) capabilities.push("pest");
  if ("phpstan/phpstan" in composerDeps || "larastan/larastan" in composerDeps)
    capabilities.push("phpstan");
  if ("laravel/pint" in composerDeps) capabilities.push("pint");
  if ("tailwindcss" in nodeDeps) frameworks.push("tailwind");
  if ("react" in nodeDeps) frameworks.push("react");
  if ("vitest" in nodeDeps) capabilities.push("vitest");
  if ("jest" in nodeDeps) capabilities.push("jest");
  if ("playwright" in nodeDeps || "@playwright/test" in nodeDeps)
    capabilities.push("playwright");
  if (has(root, "prisma/schema.prisma")) capabilities.push("prisma");
  if (has(root, "drizzle.config.ts")) capabilities.push("drizzle");

  const candidates: Array<[string, number, string]> = [
    ["laravel", laravelScore, "laravel"],
    ["astro", astroScore, "astro"],
    ["nextjs", nextScore, "next"],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  const winner = candidates[0]!;

  if (winner[1] >= 0.6) {
    frameworks.unshift(winner[2]);
    return {
      primary: winner[0],
      frameworks,
      languages,
      packageManagers: detectPackageManagers(root),
      capabilities,
      confidence: Math.min(1, winner[1]),
      evidence,
    };
  }

  if (pkg) {
    evidence.push("package.json present, no stronger framework match");
    return {
      primary: "nodejs",
      frameworks,
      languages,
      packageManagers: detectPackageManagers(root),
      capabilities,
      confidence: languages.includes("typescript") ? 0.7 : 0.55,
      evidence,
    };
  }

  evidence.push("no recognised manifest found");
  return {
    primary: "common",
    frameworks,
    languages,
    packageManagers: detectPackageManagers(root),
    capabilities,
    confidence: 0.2,
    evidence,
  };
}
