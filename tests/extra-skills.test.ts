/**
 * Structural invariants for the R0.4 ponytail-review pilot skill (extra/skills).
 * The skill must stay an explicit-only, attributed, MIT-licensed extra that is
 * never wired into profiles, routing or setup. Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = join(ROOT, "extra", "skills", "ponytail-review");

test("ponytail-review exists under extra/skills with SKILL.md, LICENSE and policy file", () => {
  assert.ok(existsSync(join(SKILL_DIR, "SKILL.md")), "SKILL.md must exist");
  assert.ok(existsSync(join(SKILL_DIR, "LICENSE")), "LICENSE must exist");
  assert.ok(existsSync(join(SKILL_DIR, "agents", "openai.yaml")), "agents/openai.yaml must exist");
});

test("SKILL.md frontmatter declares name, description, MIT license and OpenCode V2 autoinvoke guard", () => {
  const content = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  const match = content.match(/^---\n(.*?)\n---/s);
  assert.ok(match, "frontmatter present");
  const fm = match[1]!;
  assert.match(fm, /^name:\s*ponytail-review$/m);
  assert.match(fm, /^description:/m);
  assert.match(fm, /^license:\s*MIT$/m);
  // Anchored under metadata's two-space indent: must not match prose mentions
  // of the same key elsewhere in the frontmatter (e.g. the adaptation note).
  assert.match(fm, /^ {2}opencode\/autoinvoke:\s*false$/m);
});

test("agents/openai.yaml is exactly the explicit-only policy file", () => {
  const yaml = readFileSync(join(SKILL_DIR, "agents", "openai.yaml"), "utf8");
  assert.equal(yaml, "policy:\n  allow_implicit_invocation: false\n");
});

test("LICENSE is the complete pinned upstream MIT license text", () => {
  const expected = `MIT License

Copyright (c) 2026 DietrichGebert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  assert.equal(readFileSync(join(SKILL_DIR, "LICENSE"), "utf8"), expected);
});

test("SKILL.md retains upstream attribution: repository URL and exact commit", () => {
  const content = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  assert.match(content, /github\.com\/DietrichGebert\/ponytail/);
  assert.match(content, /356918eba965ee1eac64bd3a7f0dd02108350de5/);
  assert.match(content, /MIT/i);
});

test("ponytail-review is absent from every profile manifest", () => {
  // Raw scan rather than resolveProfile on purpose: it must catch the name even
  // where an @include chain would (or would not) surface it. Commented mentions
  // are deliberately skipped — a comment is not an activation.
  const profiles = readdirSync(join(ROOT, "profiles")).filter((f) => f.endsWith(".list"));
  assert.ok(profiles.length > 0);
  for (const f of profiles) {
    const lines = readFileSync(join(ROOT, "profiles", f), "utf8").split("\n");
    for (const line of lines) {
      const name = line.trim().replace(/^@include\s+/, "");
      if (name.startsWith("#")) continue;
      assert.notEqual(name, "ponytail-review", `${f} must not list ponytail-review`);
    }
  }
});

test("ponytail-review is absent from skill routing and setup", () => {
  const router = readFileSync(join(ROOT, "src", "skill-router.ts"), "utf8");
  assert.ok(!router.includes("ponytail"), "skill-router.ts must not mention ponytail");
  const setup = readFileSync(join(ROOT, "setup.sh"), "utf8");
  assert.ok(!setup.includes("ponytail"), "setup.sh must not mention ponytail");
});
