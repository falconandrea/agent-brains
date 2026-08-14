/**
 * ContextRouter (spec §31) — progressive context loading.
 *
 * Decides the *minimum* set of `.ai/` documents a given role needs for a given
 * task, instead of dumping the whole directory into every prompt. Pure logic:
 * inputs are a description, a role, a stack and the files that exist.
 *
 * Rule of thumb encoded here: always-on context is small and cheap
 * (AGENTS.md, TECH_STACK, lessons); everything else must be *earned* by the
 * task actually touching that area.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Role } from "./skill-router.ts";
import type { ProjectStack } from "./stack.ts";

export interface ContextFile {
  path: string;
  content: string;
}

export type Aspect = "ui" | "database" | "api" | "auth" | "product";

export interface ContextSelection {
  files: ContextFile[];
  /** Aspects detected in the task description. */
  aspects: Aspect[];
  /** Requested but absent — useful for a "you may want to write this" hint. */
  absent: string[];
}

const ALWAYS = ["AGENTS.md", ".ai/context/TECH_STACK.md", ".ai/memory/lessons.md"];

/** Deliberately excluded unless an aspect asks for them: ROADMAP, all ADRs, PRD. */
const BY_ASPECT: Record<Aspect, string[]> = {
  ui: [".ai/context/DESIGN_SYSTEM.md", ".ai/context/APP_FLOW.md"],
  database: [".ai/context/database_schema.mmd"],
  api: [".ai/context/APP_FLOW.md"],
  auth: [".ai/context/APP_FLOW.md"],
  product: [".ai/context/PRD.md", ".ai/context/PROJECT.md", ".ai/context/GLOSSARY.md"],
};

/** Word-boundary matched, so "database" does not fire on "databases of clients". */
const ASPECT_PATTERNS: Record<Aspect, RegExp> = {
  ui: /\b(ui|ux|page|pages|screen|screens|component|components|form|forms|layout|design|style|styling|css|responsive|modal|button|frontend|view|views|blade|livewire)\b/i,
  database:
    /\b(database|db|schema|migration|migrations|table|tables|column|columns|model|models|query|queries|index|foreign key|seeder|eloquent|prisma|drizzle)\b/i,
  api: /\b(api|endpoint|endpoints|route|routes|rest|graphql|webhook|webhooks|controller|controllers|payload|request|response)\b/i,
  auth: /\b(auth|authentication|authorization|login|signup|sign-up|session|sessions|token|tokens|permission|permissions|role|roles|invite|invitation|invitations|sso|oauth)\b/i,
  product: /\b(user|users|customer|customers|flow|onboarding|pricing|plan|plans|billing|subscription|notification|notifications|email|emails)\b/i,
};

/** Roles that always get product/context documents, whatever the task says. */
const ROLE_EXTRA: Partial<Record<Role, Aspect[]>> = {
  planner: ["product"],
};

/**
 * The developer already receives the approved PRD inline in its prompt, so the
 * product documents would be duplicated context. Same for the reviewer, which
 * judges against the spec it is given, not against the roadmap.
 */
const ROLE_DENIED: Partial<Record<Role, Aspect[]>> = {
  developer: ["product"],
  reviewer: ["product"],
  tester: ["product"],
  "security-reviewer": ["product"],
};

export function detectAspects(description: string): Aspect[] {
  return (Object.keys(ASPECT_PATTERNS) as Aspect[]).filter((a) =>
    ASPECT_PATTERNS[a].test(description),
  );
}

export interface RouteContextInput {
  cwd: string;
  role: Role;
  /** The feature description, and any task text already produced. */
  task: string;
  stack: ProjectStack;
  /** Extra relative paths a caller already knows it needs (e.g. the PRD). */
  extra?: string[];
  /** Cap on total characters loaded; oldest-priority files are dropped first. */
  maxChars?: number;
}

export function routeContext(input: RouteContextInput): ContextSelection {
  const denied = new Set(ROLE_DENIED[input.role] ?? []);
  const aspects = detectAspects(input.task).filter((a) => !denied.has(a));
  const all = new Set<Aspect>([...aspects, ...(ROLE_EXTRA[input.role] ?? [])]);

  const wanted: string[] = [...ALWAYS];
  for (const aspect of all) wanted.push(...BY_ASPECT[aspect]);
  if (all.has("database")) wanted.push(...adrsMatching(input.cwd, input.task));
  wanted.push(...(input.extra ?? []));

  const seen = new Set<string>();
  const files: ContextFile[] = [];
  const absent: string[] = [];
  let budget = input.maxChars ?? 60_000;

  for (const rel of wanted) {
    if (seen.has(rel)) continue;
    seen.add(rel);

    const abs = join(input.cwd, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      absent.push(rel);
      continue;
    }
    const content = readFileSync(abs, "utf8");
    if (content.trim() === "") continue;
    if (content.length > budget) continue; // keep priority order, skip what won't fit
    budget -= content.length;
    files.push({ path: rel, content });
  }

  return { files, aspects: [...all], absent };
}

/**
 * ADRs are only loaded when the task words overlap the ADR filename — loading
 * every decision record is exactly the waste this router exists to prevent.
 */
function adrsMatching(cwd: string, task: string): string[] {
  const dir = join(cwd, ".ai", "context", "adr");
  if (!existsSync(dir)) return [];
  const words = new Set(
    task
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) =>
      f
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .some((part) => words.has(part)),
    )
    .map((f) => join(".ai", "context", "adr", f));
}
