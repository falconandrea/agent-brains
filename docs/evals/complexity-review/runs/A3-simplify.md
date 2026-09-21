# A3 — simplify on Diff A — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  the working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (present by design; this run was instructed
  not to read it — not a clean-HEAD tree; see [README.md](README.md))
- Evaluated range: `96c639b..763387a`
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens skill: `.agents/skills/simplify/SKILL.md` (report-only dry run)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install, no formatters, no test runs). Only read files and run read-only inspection commands (git show, git diff, git log, ls, etc.). This is the `simplify` skill executed in REPORT-ONLY dry-run mode: describe what you would clean up; change nothing.

Your lens: the `simplify` skill. First read /Users/andreafalcon/dev/agent-brains/.agents/skills/simplify/SKILL.md, then walk its passes over the target diff: (1) mechanical lint/format — report only obvious formatting deviations you can prove from the diff, do not run formatters; (2) dead code & import pruning — unused imports/variables/private helpers, leftover debug statements introduced by the diff; (3) AI comment clean-pass — comments describing WHAT code does when identifiers already say it; (4) verification gate — do NOT run tests; just note which commands would apply.

Do NOT read these files (independence requirement): extra/skills/ponytail-review/**, .agents/skills/karpathy-guidelines/SKILL.md, .agents/skills/code-review/SKILL.md, docs/evals/**.

Target diff (implementation-heavy): commit range 96c639b..763387a ("Add read-only context audit skill"). Obtain it with:
- git diff 96c639b..763387a
- git show 763387a --stat
You may read repo files in the working tree, and `git show <sha>:<path>` for versions at the range ends.

Deliverable (final message, plain text):
1. Findings, one per item: path | line/range (new file version) | pass (lint-format | dead-code | comment-noise | other) | proposed removal/change | estimated net line deletion.
2. Mark each finding actionable (yes | needs-confirmation | no).
3. Note any false-positive risk in your own findings (e.g. comment that actually explains WHY; "unused" symbol that is re-exported).
4. "Out-of-lens observations" ONLY if you noticed correctness/security/performance/spec issues — list separately, marked out of scope.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

All checks complete. Working tree matches HEAD 763387a (only an untracked eval artifact outside the diff, not read).

=====================================================================
simplify REPORT-ONLY dry-run — range 96c639b..763387a ("Add read-only context audit skill")
=====================================================================

Context for pass 1: the repo configures no formatter/linter (package.json has only `test` and `typecheck`; no .prettierrc/eslint/biome present). Repo style itself tolerates packed arrays and long lines (e.g. tests/unit.test.ts:152, tests/context-audit.test.ts:50), so the packed `EXCLUDED_DIRS`/`ADR_CANDIDATES` arrays (context-audit.mjs:16-19, 25-28) are consistent with existing style — not reported as deviations.

FINDINGS

1. .agents/skills/context-audit/scripts/context-audit.mjs | 87, 99, 103 | dead-code | `checked` array accumulates full objects `{from, target, resolved, exists}` but only `checked.length` is ever consumed (l.103); replace with a counter (`let checked = 0; checked++`), drop the object construction at l.99. | net −2 lines | actionable: yes

2. .agents/skills/context-audit/scripts/context-audit.mjs | 111-123 | dead-code | `addFile` returns `{ entry, text }` but no caller ever reads `.entry` from the return — loop callers (l.125-127, 130-132, 136-138, 146-148) discard the return; `lessons`/`progress` (l.141-142) use only `.text`/truthiness. Return `text` directly (`string | null`); callers become `lessons ?? ""` / `Boolean(lessons)` unchanged. | net −3 lines | actionable: yes

3. .agents/skills/context-audit/scripts/context-audit.mjs | 83 | dead-code | `MD_LINK` capture group 1 `(!?)` is never read (only `match[2]` used); make it non-capturing `(?:!?)` (group numbering for group 2 is unaffected). | net 0 lines | actionable: yes

4. .agents/skills/context-audit/scripts/context-audit.mjs | 38-44 | dead-code (borderline) | `metrics()` is a single-use helper (only caller l.119); inlining into `addFile` would save ~5 lines. Single-use ≠ unused — stylistic call. | net −5 lines | actionable: needs-confirmation

5. tests/unit.test.ts | 158-167 | dead-code (borderline) | New test overlaps the updated "no operational skill reaches any pipeline role" test (l.149-156, which now bans `context-audit` at l.152). Distinctness: the new test exercises the real `common` profile and the `missing` list, but the `!sel.skills.includes("context-audit")` assertion at l.164 is near-duplicate coverage. Keeping the test is defensible; only the l.164 assertion is arguably redundant. | net −1 line | actionable: needs-confirmation

Pass 1 (lint-format): no findings — no project formatter exists, and diff formatting matches ambient repo style (nothing provable to "fix").
Pass 3 (comment-noise): no findings — all comments introduced by the diff are WHY/contract comments: the .mjs header (l.2-10) documents the read-only contract, l.21-22 explains why `.agents/skills` is excluded (dependency tree, not authored context), l.108-110 explains the dedup/role-precedence design; tests/context-audit.test.ts:105-106 explains the non-obvious `checked === 3` fixture accounting. None describe WHAT identifiers already say. No debug statements (`console.log`/`dd`/etc.) introduced anywhere in the diff.

False-positive risks (self-review):
- Finding 2: `entry` in the return is not exported, not typed in context-audit.d.mts (only `auditProject` is), and no test touches `addFile`; risk is low but any out-of-tree consumer of the .mjs would notice the return shape change.
- Finding 5: the two tests use different profiles (`full` + synthetic AVAILABLE_SKILLS vs real `common`), so the "duplication" is only partial — deleting l.164 loses real-profile coverage.
- I explicitly did NOT flag the header block comment (l.2-10) as noise: it states the usage contract and the never-classifies guarantee (a WHY), which the skill says to keep.

Verification gate (commands that would apply — NOT run per read-only mandate):
- `npm test` (node --test 'tests/**/*.test.ts') — covers tests/context-audit.test.ts and tests/unit.test.ts
- `npm run typecheck` (tsc --noEmit) — d.mts/.mjs import typing
- No pint/phpstan/eslint equivalents exist for this repo.

OUT-OF-LENS observations (marked out of scope):
- Perf (minor): context-audit.mjs:114 — `readFileSync` runs before the map lookup at l.115, so every ADR stored under `.ai/context/adr(s)` is read twice per audit (once as "context", once as "adr"); `collectLinks` (l.91) then reads each inventoried file a third time. Harmless at this scale.
- Correctness nuance: l.57 `EXCLUDED_DIRS` matches by directory name at any depth, so a project-authored dir named `out`, `tmp`, `logs`, `target`, etc. containing an AGENTS.md would be silently skipped — heuristic, acceptable, but undocumented in the header. Conversely `EXCLUDED_PATHS` only excludes root-level `.agents/skills`; nested ones (e.g. `packages/x/.agents/skills`) are not excluded, slightly narrower than the l.21-22 comment implies.
- Spec note (informational): `MD_LINK` won't match targets containing whitespace or angle-bracket `<...>` links; the script's contract says it surfaces "candidates" for agent classification, so this is a documented limitation, not a defect.
- All paths referenced by the new docs (templates/AGENTS.md, scripts/context-audit.mjs, evals/README.md) exist; no broken references introduced.

Bottom line: the diff is already lean — total actionable cleanup is ~5 net line deletions plus one zero-line regex tweak; findings 4-5 are judgment calls.
