/**
 * Unit tests for the Pi-free logic. Run: `npm test` (node --test, no deps).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProfile, listProfiles } from "../src/profiles.ts";
import { detectStack } from "../src/stack.ts";
import { resolveVerifyCommands } from "../src/verify.ts";
import { selectSkills } from "../src/skill-router.ts";
import { decideNextRound, validateReviewResult, type ReviewResult } from "../src/review.ts";
import { normalizeConfig, DEFAULT_CONFIG, type PiBrainConfig } from "../src/config.ts";
import { slugify, splitPlannerOutput } from "../src/workflows/feature.ts";

const PROFILES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");
const fixture = (): string => mkdtempSync(join(tmpdir(), "pi-brain-"));

// --- profiles ---------------------------------------------------------------

test("resolveProfile expands @include, dedups and drops .md suffixes", () => {
  const laravel = resolveProfile(PROFILES_DIR, "laravel");
  assert.ok(laravel.skills.includes("laravel"));
  assert.ok(laravel.skills.includes("code-review"), "should inherit from common");
  assert.ok(laravel.includes.includes("common"));
  assert.equal(new Set(laravel.skills).size, laravel.skills.length, "no duplicates");
  assert.ok(!laravel.skills.some((s) => s.endsWith(".md")));
});

test("every profile in profiles/ resolves", () => {
  for (const p of listProfiles(PROFILES_DIR)) {
    assert.ok(resolveProfile(PROFILES_DIR, p).skills.length > 0, `${p} is empty`);
  }
});

// --- stack detection --------------------------------------------------------

test("detects Laravel from composer + artisan", () => {
  const root = fixture();
  writeFileSync(
    join(root, "composer.json"),
    JSON.stringify({ require: { "laravel/framework": "^12", "pestphp/pest": "^3" } }),
  );
  writeFileSync(join(root, "artisan"), "#!/usr/bin/env php");
  const stack = detectStack(root);
  assert.equal(stack.primary, "laravel");
  assert.ok(stack.confidence >= 0.6);
  assert.ok(stack.capabilities.includes("pest"));
});

test("detects Astro over generic node", () => {
  const root = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { astro: "^5" } }));
  writeFileSync(join(root, "astro.config.mjs"), "export default {}");
  assert.equal(detectStack(root).primary, "astro");
});

test("falls back to nodejs when no framework matches", () => {
  const root = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { fastify: "^5" } }));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  const stack = detectStack(root);
  assert.equal(stack.primary, "nodejs");
  assert.ok(stack.languages.includes("typescript"));
});

// --- verification -----------------------------------------------------------

test("Laravel verification prefers pest and adds configured tools", () => {
  const root = fixture();
  writeFileSync(join(root, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^12" } }));
  writeFileSync(join(root, "artisan"), "");
  const stack = detectStack(root);
  stack.capabilities.push("pest", "pint");
  const cmds = resolveVerifyCommands(root, stack, []);
  assert.match(cmds[0]!.command, /pest/);
  assert.ok(cmds.some((c) => c.command.includes("pint")));
  assert.equal(cmds.find((c) => c.command.includes("pint"))!.blocking, false);
});

test("configured commands win over detection", () => {
  const root = fixture();
  const stack = detectStack(root);
  const cmds = resolveVerifyCommands(root, stack, ["make ci"]);
  assert.deepEqual(cmds.map((c) => c.command), ["make ci"]);
});

test("node verification falls back to tsc when no typecheck script", () => {
  const root = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  const cmds = resolveVerifyCommands(root, detectStack(root), []);
  assert.ok(cmds.some((c) => c.command === "npx tsc --noEmit"));
});

// --- skill routing ----------------------------------------------------------

const AVAILABLE_SKILLS = (() => {
  const set = new Set(resolveProfile(PROFILES_DIR, "full").skills);
  for (const s of [
    "code-review",
    "karpathy-guidelines",
    "verification-before-completion",
    "feature",
    "grilling",
    "product-thinking",
    "to-spec",
    "research",
    "simplify",
    "tdd",
    "diagnosing-bugs",
    "handoff",
    "start",
    "setup",
    "to-tickets",
    "lessons-gardener",
    "long-horizon-brief",
    "improve-codebase-architecture",
  ]) {
    set.add(s);
  }
  return set;
})();

test("each role gets only its categories: developer plans nothing, reviewer reviews", () => {
  const dev = selectSkills(PROFILES_DIR, "nodejs", "developer", AVAILABLE_SKILLS);
  const rev = selectSkills(PROFILES_DIR, "nodejs", "reviewer", AVAILABLE_SKILLS);
  const plan = selectSkills(PROFILES_DIR, "nodejs", "planner", AVAILABLE_SKILLS);

  assert.ok(!dev.skills.includes("feature"), "planning must not reach the developer");
  assert.ok(!dev.skills.includes("grilling"), "planning must not reach the developer");
  assert.ok(!dev.skills.includes("product-thinking"), "planning must not reach the developer");
  assert.ok(!rev.skills.includes("feature"), "planning must not reach the reviewer");
  assert.ok(!plan.skills.includes("code-review"), "review must not reach the planner");
  assert.ok(!plan.skills.includes("simplify"), "review must not reach the planner");
  assert.ok(rev.skills.includes("code-review"), "the reviewer judges code");
  assert.ok(dev.skills.includes("tdd"), "the developer tests");
  assert.ok(dev.skills.includes("diagnosing-bugs"), "the developer debugs");
});

test("no operational skill reaches any pipeline role", () => {
  for (const role of ["planner", "developer", "reviewer", "tester", "security-reviewer"] as const) {
    const sel = selectSkills(PROFILES_DIR, "full", role, AVAILABLE_SKILLS);
    for (const banned of ["handoff", "start", "setup", "to-tickets", "lessons-gardener", "long-horizon-brief", "improve-codebase-architecture"]) {
      assert.ok(!sel.skills.includes(banned), `${banned} must not reach ${role}`);
    }
  }
});

test("stack skills flow to every role but only within the profile", () => {
  const available = new Set([...resolveProfile(PROFILES_DIR, "laravel").skills, ...AVAILABLE_SKILLS]);
  const dev = selectSkills(PROFILES_DIR, "laravel", "developer", available);
  const rev = selectSkills(PROFILES_DIR, "laravel", "reviewer", available);
  assert.ok(dev.skills.includes("laravel-best-practices"), "stack knowledge reaches the developer");
  assert.ok(rev.skills.includes("laravel-best-practices"), "stack knowledge reaches the reviewer");

  const nodeDev = selectSkills(PROFILES_DIR, "nodejs", "developer", available);
  assert.ok(!nodeDev.skills.some((s) => s.startsWith("laravel")), "no laravel skills in a nodejs project");
  assert.ok(!nodeDev.skills.includes("livewire-development"));
});

test("astro developer gets no laravel skills", () => {
  const available = new Set([
    ...resolveProfile(PROFILES_DIR, "astro").skills,
    ...resolveProfile(PROFILES_DIR, "laravel").skills,
  ]);
  const dev = selectSkills(PROFILES_DIR, "astro", "developer", available);
  assert.ok(!dev.skills.some((s) => s.startsWith("laravel")));
  assert.ok(!dev.skills.includes("livewire-development"));
});

// --- review schema + loop ---------------------------------------------------

const review = (over: Partial<ReviewResult> = {}): ReviewResult => ({
  verdict: "changes_requested",
  summary: "s",
  issues: [{ id: "R1", severity: "blocking", category: "bug", problem: "boom" }],
  ...over,
});

test("validateReviewResult rejects malformed payloads", () => {
  assert.equal(validateReviewResult(null).ok, false);
  assert.equal(validateReviewResult({ verdict: "lgtm", summary: "x", issues: [] }).ok, false);
  assert.equal(validateReviewResult(review()).ok, true);
});

test("approved review completes the loop", () => {
  const d = decideNextRound(review({ verdict: "approved", issues: [] }), 1, 2, new Set(), true);
  assert.equal(d.action, "complete");
});

test("warnings alone do not block completion", () => {
  const r = review({
    verdict: "changes_requested",
    issues: [{ id: "W1", severity: "warning", category: "standards", problem: "meh" }],
  });
  assert.equal(decideNextRound(r, 1, 2, new Set(), true).action, "complete");
});

test("max rounds escalates instead of looping", () => {
  assert.equal(decideNextRound(review(), 2, 2, new Set(), true).action, "escalate");
});

test("same blocking issue with no new diff escalates as no-progress", () => {
  const d = decideNextRound(review(), 1, 3, new Set(["R1"]), false);
  assert.equal(d.action, "escalate");
  assert.match((d as { reason: string }).reason, /no progress/);
});

test("needs_human always escalates", () => {
  assert.equal(decideNextRound(review({ verdict: "needs_human" }), 1, 5, new Set(), true).action, "escalate");
});

// --- misc -------------------------------------------------------------------

test("slugify produces a short kebab slug", () => {
  assert.equal(slugify("Add organization invitations with email acceptance"), "add-organization-invitations-with-email-acceptance");
});

test("splitPlannerOutput separates TITLE, PRD and TASKS", () => {
  const out = splitPlannerOutput(
    "preamble noise\n## TITLE\nPlaywright Flight Provider\n\n## PRD\nbody\n\n## TASKS\n- T1 do it",
  );
  assert.equal(out.title, "Playwright Flight Provider");
  assert.match(out.prd, /body/);
  assert.match(out.tasks, /T1/);
  assert.ok(!out.prd.includes("T1"));
  assert.ok(!out.prd.includes("TITLE"));
});

test("splitPlannerOutput without a TITLE falls back to null", () => {
  const out = splitPlannerOutput("## PRD\nbody\n\n## TASKS\n- T1 do it");
  assert.equal(out.title, null);
  assert.match(out.prd, /body/);
  assert.match(out.tasks, /T1/);
});

// --- config validation ------------------------------------------------------

test("non-numeric budgets fall back to the defaults instead of looping forever", () => {
  const raw = {
    ...DEFAULT_CONFIG,
    maxReviewRounds: "many",
    maxVerifyRetries: -1,
  } as unknown as PiBrainConfig;

  const { config, warnings } = normalizeConfig(raw);

  assert.equal(config.maxReviewRounds, DEFAULT_CONFIG.maxReviewRounds);
  assert.equal(config.maxVerifyRetries, DEFAULT_CONFIG.maxVerifyRetries);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /maxReviewRounds/);
});

test("an absurdly large budget is capped", () => {
  const { config } = normalizeConfig({ ...DEFAULT_CONFIG, maxReviewRounds: 9999 });
  assert.equal(config.maxReviewRounds, DEFAULT_CONFIG.maxReviewRounds);
});

test("autoCommit can never be turned on from config", () => {
  const { config } = normalizeConfig({ ...DEFAULT_CONFIG, autoCommit: true } as unknown as PiBrainConfig);
  assert.equal(config.autoCommit, false);
});

test("a valid config passes through without warnings", () => {
  const { config, warnings } = normalizeConfig({
    ...DEFAULT_CONFIG,
    maxReviewRounds: 3,
    verify: ["make ci"],
    verbosity: "verbose",
  });
  assert.deepEqual(warnings, []);
  assert.equal(config.maxReviewRounds, 3);
  assert.deepEqual(config.verify, ["make ci"]);
});

test("a review that says approved while listing blocking issues is not approved", () => {
  const inconsistent: ReviewResult = {
    verdict: "approved",
    summary: "lgtm",
    issues: [{ id: "R9", severity: "blocking", category: "security", problem: "token logged" }],
  };
  const decision = decideNextRound(inconsistent, 1, 2, new Set(), true);
  assert.equal(decision.action, "fix");
});
