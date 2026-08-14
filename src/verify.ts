/**
 * Deterministic verification (spec §5 phase E, §24): resolve the cheapest
 * strong-signal checks for a project, run them before spending reviewer tokens.
 *
 * Resolution order: explicit config -> detected stack + capabilities -> package
 * scripts. Commands are returned, not executed, so resolution stays unit-testable.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectStack } from "./stack.ts";

export interface VerifyCommand {
  label: string;
  command: string;
  /** A failing `blocking` check goes back to the developer before review. */
  blocking: boolean;
}

function packageScripts(root: string): Record<string, string> {
  const path = join(root, "package.json");
  if (!existsSync(path)) return {};
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8")) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function runner(stack: ProjectStack): string {
  const pm = stack.packageManagers.find((p) => p !== "composer") ?? "npm";
  return pm === "npm" ? "npm run" : `${pm} run`;
}

export function resolveVerifyCommands(
  root: string,
  stack: ProjectStack,
  configured: string[] = [],
): VerifyCommand[] {
  if (configured.length > 0) {
    return configured.map((command, i) => ({ label: `check ${i + 1}`, command, blocking: true }));
  }

  const out: VerifyCommand[] = [];

  if (stack.primary === "laravel") {
    out.push({
      label: "tests",
      command: stack.capabilities.includes("pest")
        ? "./vendor/bin/pest --compact"
        : "php artisan test",
      blocking: true,
    });
    if (stack.capabilities.includes("pint"))
      out.push({ label: "format", command: "./vendor/bin/pint --test", blocking: false });
    if (stack.capabilities.includes("phpstan"))
      out.push({ label: "static analysis", command: "./vendor/bin/phpstan analyse", blocking: true });
    return out;
  }

  const scripts = packageScripts(root);
  const run = runner(stack);

  if (scripts.test) out.push({ label: "tests", command: `${run} test`, blocking: true });
  if (scripts.lint) out.push({ label: "lint", command: `${run} lint`, blocking: false });

  if (stack.primary === "astro") {
    out.push({ label: "astro check", command: "npx astro check", blocking: true });
  } else if (scripts.typecheck) {
    out.push({ label: "typecheck", command: `${run} typecheck`, blocking: true });
  } else if (existsSync(join(root, "tsconfig.json"))) {
    out.push({ label: "typecheck", command: "npx tsc --noEmit", blocking: true });
  }

  return out;
}
