---
name: context-audit
description: Read-only audit of the project context hierarchy — AGENTS.md files, .ai/context, .ai/features, ADRs, .ai/memory/lessons.md and progress.md. Use it whenever the user asks to audit context or documentation hygiene, find stale claims, doc/code contradictions, duplicate sources of truth, broken references, or context bloat — even without naming the skill. Reports findings with evidence; never modifies files. Remediation requires a separate explicit user instruction.
---

# Context Audit

Audit the project's context hierarchy and report actionable problems. You are a
diagnostician: you read and report, you never remediate inside this skill.

## Invariants

- **Read-only by construction.** Do not edit, create, delete or rewrite any
  project file. Do not fix links, prune `lessons.md`, update `progress.md`,
  generate an ADR, run formatters or autofix commands, or stage/commit/push.
- An audit request is **not** remediation permission.
- Allowed commands: filesystem reads, search, and read-only Git history
  (`git log`, `git show`, `git blame`, `git ls-files`). No mutating subcommand.
- Report in chat. Do not write the report into the repository unless the user
  separately asks for exactly that.
- After the report you may propose a remediation plan, but each change needs a
  separate, explicit user instruction. Approval of one correction never
  authorizes unrelated corrections.

## Authority model

Audit against this ownership table (from `templates/AGENTS.md`):

| Fact type | Owner |
|---|---|
| Stable instructions and policy | `AGENTS.md` |
| Product, architecture, domain, stack, design system, ADRs | `.ai/context/` |
| Approved feature requirements and tasks | `.ai/features/<feature>/` |
| Reusable project-specific lessons | `.ai/memory/lessons.md` |
| Current phase, active task, blockers, next actions | `.ai/memory/progress.md` |
| Session narrative | Active session or Pi JSONL — never canonical docs |
| Implementation facts | Code, tests, configuration, migrations, database schema |

Conflict precedence: current user request and approved feature spec → project
`AGENTS.md` → scoped context and ADRs → curated lessons → session history.
Code and database artifacts remain authoritative for implementation facts: when
documentation disagrees with them, the artifact wins and the document is the
finding.

## When to invoke

- The user asks explicitly (`$context-audit` / `/context-audit`).
- The user asks for a context/docs hygiene check, a staleness review, or wants
  to know whether documentation can be trusted before a feature.

## Process

### 1. Discover context by topology

Inspect, when present: root and scoped `AGENTS.md` files; `.ai/context/`;
`.ai/features/`; `.ai/memory/progress.md`; `.ai/memory/lessons.md`; the
project's established ADR location; and the implementation sources needed to
verify the specific claims you encounter. Never preload the whole repository.

Exclude dependencies, build output, caches, generated artifacts and session
logs, unless a finding specifically concerns them.

A missing optional file is not an error. Report a missing file only when an
operational instruction or link requires it.

### 2. Run the mechanical helper

Run the bundled script for the deterministic part of the inventory:

```bash
node .agents/skills/context-audit/scripts/context-audit.mjs <project-root>
```

It reports file inventory, line/byte counts, lesson-entry counts, progress
completed markers, and unresolved Markdown link candidates as JSON. It is
strictly read-only. It does **not** classify references, decide contradictions,
or apply thresholds — those judgments stay with you and must be evidenced.

### 3. Classify every reference candidate

For each link or path mention the helper surfaces, classify it before
reporting:

1. **Operational path or Markdown link** — an instruction that depends on the
   target resolving. Expected to resolve; report if broken.
2. **Template/example placeholder** — validate only against its documented
   role (e.g. `[DATE]` in a scaffold is not a defect).
3. **Historical or descriptive mention** — a dated research note or changelog
   naming a file that no longer exists. Not a broken reference.
4. **Non-canonical research** — `docs/research/` and similar material is
   evidence and rationale, never current project truth. A divergence between
   research and code is not itself a finding.
5. **Session history** — searchable evidence, never canonical authority.

Every broken-reference finding must quote the evidence that makes the
reference operational (the instruction or duty that relies on it). When no
such evidence exists, the reference is not reported.

### 4. Verify staleness and contradictions with evidence

File age alone is only a signal. Report a stale claim only with concrete
conflicting or superseding evidence, such as: a documented dependency/version
differing from the active manifest or lockfile; progress claiming work is
active or pending when the roadmap or implementation proves otherwise; an ADR
or context statement contradicted by current code/configuration; a lesson whose
referenced artifact no longer exists or whose rule no longer applies.

Separate three levels and never present inference as fact:

- **verified contradiction** — both sides evidenced by paths/lines;
- **likely stale, needs confirmation** — strong signal, incomplete evidence;
- **age-only observation** — old but uncontradicted; list under healthy checks
  or limitations, not as findings.

### 5. Check duplicate authority

Flag multiple documents claiming to be the source of truth for the same fact
type, or volatile state repeated in stable policy files (e.g. current status
in `AGENTS.md`, a copied skill catalog or workflow tutorial). Each finding must
identify the fact type, both competing locations, the owner under the table
above, and the evidence that both currently claim authority.

Do not flag legitimate cross-references or summaries that clearly defer to the
canonical owner ("see `.ai/memory/progress.md` for current status" is healthy).

### 6. Check growth

Use transparent heuristics and state the threshold used for each signal.
Suggested review signals (tune per project, never report as automatic defects):

| File | Review signal |
|---|---|
| `AGENTS.md` | > 150 lines or > 8 KB, or contains a skill catalog / workflow tutorial |
| `lessons.md` | > 50 entries (the documented gardener threshold) or > 15 KB |
| `progress.md` | > 80 lines, > 20 completed items, or multi-session completed history |
| single `.ai/context/` file | > 400 lines (consider splitting) |
| any auto-loaded file | unexplained large growth since the previous audit (Git history) |

### 7. Check lessons against the admission rule

`lessons.md` may hold only non-obvious, project-specific knowledge an agent
could not cheaply recover from code or standard documentation. Flag entries
that appear obsolete (dead refs), generic (framework trivia), duplicated, or
unsupported by live references — but **do not prune**. Rewriting `lessons.md`
belongs to `lessons-gardener` after a separate explicit invocation and
approval; do not duplicate its workflow here.

## Output contract

Produce a concise Markdown report in chat with exactly these sections:

1. **Audit scope** — inspected paths; excluded paths; missing optional inputs;
   important limitations (what was not verified and why).
2. **Summary** — counts by category and severity; an explicit "no findings"
   when appropriate.
3. **Findings** — each with: stable ID (`CA-n`); severity `high` / `medium` /
   `low`; category (`broken-reference`, `contradiction`, `stale-claim`,
   `duplicate-authority`, `growth`, `lessons-hygiene`); the claim or problem;
   canonical owner; evidence with file paths and line numbers where possible;
   why it matters; suggested remediation; certainty `verified` or
   `needs confirmation`.
4. **Healthy checks** — important invariants inspected and found clean.
5. **Proposed next actions** — prioritized fixes, then an explicit reminder
   that no files were changed.

Do not report a finding without source evidence. Do not give vague advice.

## Failure modes

This skill fails its contract if it modifies any file during the audit,
reports a historical mention as a broken operational reference, reports age as
proof of staleness, treats research or session history as canonical, invents
a finding without evidence, or performs a remediation without a separate
explicit user instruction.
