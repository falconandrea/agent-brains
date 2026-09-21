# A1 — ponytail-review on Diff A — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  the working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (the lens under test, present by design — this
  is not a clean-HEAD tree; see [README.md](README.md))
- Evaluated range: `96c639b..763387a`
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens skill: `extra/skills/ponytail-review/SKILL.md`
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install, no formatters). Only read files and run read-only inspection commands (git show, git diff, git log, ls, etc.).

Your lens: the `ponytail-review` skill. First read /Users/andreafalcon/dev/agent-brains/extra/skills/ponytail-review/SKILL.md and follow it exactly as your review procedure.

Do NOT read these files (independence requirement): .agents/skills/karpathy-guidelines/SKILL.md, .agents/skills/simplify/SKILL.md, .agents/skills/code-review/SKILL.md, docs/evals/**.

Target diff (implementation-heavy): commit range 96c639b..763387a ("Add read-only context audit skill"). Obtain it with:
- git diff 96c639b..763387a
- git show 763387a --stat
You may read any repo file in the current working tree to verify reuse claims, and `git show 96c639b:<path>` / `git show 763387a:<path>` to read file versions at the range ends.

Deliverable (final message, plain text):
1. Your report in the skill's own output format: one line per finding with tag (delete/reuse/stdlib/native/yagni/shrink), location (path:line or line range), what to cut, what replaces it; `needs-confirmation:` lines for assumption-dependent findings; final `net: -N lines possible.` or `Lean already. Ship.`
2. A structured per-finding list: path | line/range | tag | actionable (yes | needs-confirmation | no) | estimated net deletion (lines) | false-positive risk you see in your own finding.
3. An "out-of-lens observations" section ONLY if you noticed correctness/security/performance/spec issues — list them separately and mark them out of your scope.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

All verification complete. Here is the review.

---

## Ponytail review — 96c639b..763387a ("Add read-only context audit skill")

```
yagni: .agents/skills/context-audit/scripts/context-audit.mjs:185-187 (+ :9, :74, :106, :144, :197; scripts/context-audit.d.mts:27-30) — the --adr-dir flag / options.adrDir param has no caller: SKILL.md documents only `node context-audit.mjs <project-root>`, tests never pass it, evals never mention it. Cut the flag parsing, the `explicit` branch in findAdrDir, the options param and the d.mts options signature; replacement: nothing (ADR_CANDIDATES auto-detection already covers every documented case).
shrink: .agents/skills/context-audit/scripts/context-audit.mjs:87,99,103 — `checked` array accumulates {from,target,resolved,exists} objects only to return `checked.length`. Replace with `let checked = 0; … checked += 1;` (same output, 2 lines shorter, no throwaway objects).
shrink: .agents/skills/context-audit/SKILL.md:168-174 — "Failure modes" section restates the Invariants (L13-23), the evidence rule (L95-97) and the certainty levels (L108-113) of the same file; evals/README.md:117-124 already carries the scoring copy. Cut the section; replacement: nothing (the invariants it echoes are the contract).
shrink: tests/unit.test.ts:152 — the `"context-audit"` entry in the generic banned list is fully subsumed by the dedicated test at L158-166, which asserts the same exclusion for the same five roles plus common.list membership and the missing-list case. Cut the one entry; keep the dedicated test. (Minimal smoke tests are the floor — this is pure assertion duplication, not coverage.)
needs-confirmation: .agents/skills/context-audit/scripts/context-audit.mjs:16-28,46-71 — hand-rolled recursive walk with a 14-entry EXCLUDED_DIRS denylist + EXCLUDED_PATHS duplicates what `git ls-files` (already on the skill's own allowed-command list) provides with ignore semantics. Verify first: audits must run on non-git roots and untracked trees — the test fixtures are mkdtemp dirs that are not git repos, so the walk is load-bearing for them.
needs-confirmation: .agents/skills/context-audit/SKILL.md:29-37 — ownership table is a copy of templates/AGENTS.md rows (duplicate authority, the very pattern this skill flags). Could be a one-line pointer. Verify first: skills are injected as standalone context, so an inline table may be deliberate self-containment.
needs-confirmation: .agents/skills/context-audit/scripts/context-audit.d.mts:1-31 — the whole hand-maintained declaration file exists only so `tests/context-audit.test.ts` can import the .mjs under `tsc --noEmit`. Writing the helper as .ts (repo already runs node --test on .ts) would delete it. Verify first: the skill must stay runnable as plain `node …context-audit.mjs` on consumer projects without type stripping.

net: -20 lines possible. (≈−54 more if the three confirmations hold.)
```

## Per-finding structure

| path | line/range | tag | actionable | est. net deletion | false-positive risk |
|---|---|---|---|---|---|
| .agents/skills/context-audit/scripts/context-audit.mjs | 185-187 (+9, 74, 106, 144, 197) + d.mts 27-30 | yagni | yes | ~9 | Low-moderate: a future consumer could want explicit ADR override – but no spec, doc, or test references it today |
| .agents/skills/context-audit/scripts/context-audit.mjs | 87, 99, 103 | shrink | yes | ~2 | Low: output identical (only `checked` count is consumed) |
| .agents/skills/context-audit/SKILL.md | 168-174 | shrink | yes | 7 | Moderate: prompt-engineering repetition is sometimes intentional reinforcement for LLM consumers |
| tests/unit.test.ts | 152 | shrink | yes | 1 | Low: entry costs 1 line and documents the generic invariant; cutting it relies on the dedicated test staying |
| .agents/skills/context-audit/scripts/context-audit.mjs | 16-28, 46-71 | native | needs-confirmation | ~25 | High: tmpdir test fixtures are not git repos; untracked files (fresh .ai/ before first commit) would be missed by git ls-files |
| .agents/skills/context-audit/SKILL.md | 29-37 | shrink | needs-confirmation | ~9 | High: standalone skill prompts plausibly must be self-contained |
| .agents/skills/context-audit/scripts/context-audit.d.mts | 1-31 | delete | needs-confirmation | ~31 | High: .mjs is the portable distribution format for the skill store; a .ts helper breaks `node …mjs` portability |

## Out-of-lens observations (not complexity; outside my scope)

- `context-audit.mjs` `walk()` yields filesystem order; only `findScopedAgents` sorts, so the `files` inventory and `unresolved` link order are platform-dependent — JSON output is not deterministic across machines (correctness/stability nit).
- `MD_LINK` (`[^)\s]+`) and the manual `resolved`/`exists` double-`resolve` can mis-parse link targets containing spaces or `<…>` angle form; also `d.mts` must be manually kept in sync with the `.mjs` shapes since `checkJs` is off (drift risk).
- I could not independently re-verify the roadmap's "npm test 203/203" claim, as running the test suite executes code and was outside my read-only constraint.

No files were created, edited, or deleted; no mutating commands were run.
