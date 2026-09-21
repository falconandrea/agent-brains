# A2 — karpathy-guidelines on Diff A — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  the working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (present by design; this run was instructed
  not to read it — not a clean-HEAD tree; see [README.md](README.md))
- Evaluated range: `96c639b..763387a`
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens skill: `.agents/skills/karpathy-guidelines/SKILL.md`
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install, no formatters). Only read files and run read-only inspection commands (git show, git diff, git log, ls, etc.).

Your lens: the `karpathy-guidelines` skill. First read /Users/andreafalcon/dev/agent-brains/.agents/skills/karpathy-guidelines/SKILL.md, then apply its three sections (1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes) as review criteria against the target diff. Judge the change the diff introduced: minimum code that solves the problem, no speculative features/generalizations/abstractions, no unrequested configurability, complexity that could be reduced, and scope discipline.

Do NOT read these files (independence requirement): extra/skills/ponytail-review/**, .agents/skills/simplify/SKILL.md, .agents/skills/code-review/SKILL.md, docs/evals/**.

Target diff (implementation-heavy): commit range 96c639b..763387a ("Add read-only context audit skill"). Obtain it with:
- git diff 96c639b..763387a
- git show 763387a --stat
You may read any repo file in the current working tree for context, and `git show <sha>:<path>` to read file versions at the range ends.

Deliverable (final message, plain text):
1. Findings, one per item: path | line/range (in the new file version) | guideline violated (quote the short rule) | proposed deletion/replacement or simplification | estimated net line change.
2. Mark each finding actionable (yes | needs-confirmation | no).
3. Note any false-positive risk in your own findings.
4. "Out-of-lens observations" ONLY if you noticed correctness/security/performance/spec issues — list separately, marked out of scope.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

FINDINGS (karpathy-guidelines lens: 1 Think Before Coding, 2 Simplicity First, 3 Surgical Changes)

F1. .agents/skills/context-audit/scripts/context-audit.mjs | 9, 73–74, 185–186 (+ context-audit.d.mts:29–31) | "No unrequested configurability. Keep APIs and structures lean." | The `--adr-dir` CLI flag and `options.adrDir` parameter have zero consumers: SKILL.md:71 invokes `node context-audit.mjs <project-root>` only, all six tests call `auditProject(root)` with no options, and `ADR_CANDIDATES` already auto-detects. Delete flag parsing, the `explicit` param in `findAdrDir`, and the options arg in both files. | net −12 | actionable: yes

F2. .agents/skills/context-audit/scripts/context-audit.mjs | 25–28, 108–123 (+ tests/context-audit.test.ts:118–137) | "Write the minimum code that solves the problem. Avoid speculative features, generalizations, or abstractions for single-use code." | The 8-entry ADR guess-list (`docs/adrs`, `adr`, `adrs`, `docs/decisions`, `decisions`…) plus the role-overwrite/dedup branch and its 20-line dedicated test exist to serve layouts no artifact uses: `templates/.ai/context/` scaffolds no `adr/` dir and this repo has no `docs/adr`. Trim candidates to the two documented conventions (`docs/adr`, `.ai/context/adr(s)`) and, if the `.ai/context/adr(s)` candidates are dropped, delete the dedup branch and test. | net 0 to −25 (depending on decision) | actionable: needs-confirmation

F3. .agents/skills/context-audit/scripts/context-audit.mjs | 16–19 | "Write the minimum code that solves the problem." | `EXCLUDED_DIRS` hardcodes 14 dir names spanning Rust/Nuxt/Next/Turbo etc. stacks this repo never uses; the walk only needs `node_modules`, `.git` (optionally `dist`, `coverage`) for correct AGENTS.md discovery here. Trim the list. | net −2 | actionable: needs-confirmation

F4. .agents/skills/context-audit/scripts/context-audit.mjs | 99, 111–123 | "Write the minimum code that solves the problem." | Dead generality: `checked.push({from, target, resolved, exists})` builds objects but only `.length` is ever returned (and `exists` surfaces nowhere); `addFile` returns `{entry, text}` but no caller reads `.entry` (only `.text` at 151–152). Replace with a plain counter; return just the text. | net −3 | actionable: yes

F5. tests/unit.test.ts | 152–162 | "Write the minimum code that solves the problem." | New dedicated test largely duplicates the existing role-exclusion test at 149–151, which this same diff already extended with `"context-audit"` in the banned list. Only two assertions are new signal (presence in `common.list`, absence from `missing`). Fold those into the existing test. | net −8 | actionable: needs-confirmation

F6. .agents/skills/context-audit/SKILL.md | 168–174 (cf. 11–23; evals/README.md:117–124) | "If a solution takes 200 lines but could be done in 50, rewrite and simplify it." | The read-only / no-false-finding contract is stated three times (Invariants, Failure modes, eval Failure signals). Failure modes restates Invariants negatively; drop it and keep the eval rubric. | net −7 | actionable: needs-confirmation

F7. docs/plans/pi-plugin-adoption-roadmap.md | R0.3 status block (~lines 157–178 new) | "Match the existing codebase style." | The R0.3 completion note is ~22 dense lines; R0.1/R0.2 status blocks in the same file are 4–6 lines. Compress to status/date, artifact locations, verification commands, eval caveat. | net −15 | actionable: needs-confirmation

F8. .agents/skills/context-audit/SKILL.md | 148–164 | "No unrequested configurability." | The mandated output taxonomy (stable `CA-n` IDs, 3 severities, 6 categories, exactly-5-section report) exceeds the roadmap acceptance ("reports actionable findings with source paths"). Zero runtime cost and the evals score against it, so at most soften to a suggested shape. | net 0 | actionable: no (record for the record; keep unless maintainers want leaner)

FALSE-POSITIVE RISK (my own findings)
- F2/F3: `profiles/common.list` labels context-audit a generic cross-stack skill, so broad dir/candidate knowledge is arguably core product, not speculation. The dedup branch is 5 lines guarding a real double-count bug if `.ai/context/adrs` ever exists.
- F6: repeated constraints are a standard prompt-engineering emphasis technique for LLM-consumed skill docs; removal could measurably weaken behavior (exactly what CA-1..CA-4 score).
- F1: the flag is plausibly "for future eval fixtures", but nothing in-repo uses it — classic YAGNI either way; deleting is easily reversible.
- Overall the script is close to minimal for its stated job (no 200→50 rewrite available); the findings trim speculative breadth, and F4 is the only certain dead code.

OUT-OF-LENS OBSERVATIONS (correctness/performance only; out of scope for this lens)
- O1: MD_LINK regex (context-audit.mjs:83) cannot match link targets containing spaces or parentheses (`[x](my file.md)`, Wikipedia-style `(disambiguation)`), silently underreporting unresolved candidates.
- O2: the CLI entry `main()` (183–198) has no test coverage at all; only `auditProject` is tested (usage/error branches untested).
- O3: `files[]` ordering is readdirSync-order for `.ai/context`/`.ai/features`/ADR walks (only `findScopedAgents` sorts) — platform-dependent output order; harmless now, flaky for future snapshot-style assertions.
- O4: `readFileSync(abs, "utf8")` on every inventoried file means one non-UTF8/binary `.md` aborts the entire audit; a per-file guard would be more robust.
