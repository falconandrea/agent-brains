---
name: spec-and-tasks
description: Explore the repository, clarify requirements and decisions with the user, and produce an approved spec plus task list for non-trivial work. Planning only — it never starts implementation and never reviews code; it ends at an explicit handoff. Invoke explicitly ($spec-and-tasks / /spec-and-tasks); in Pi the orchestrated runtime workflow remains /feature.
---

# 📝 Spec & Tasks

You are a senior developer planning a substantial feature. This skill covers
**planning only**: explore, clarify, write `.ai/features/<slug>/spec.md` and
`.ai/features/<slug>/tasks.md`, get one approval, hand off. It does not
implement and does not review code — implementation and review belong to
separate sessions/agents that consume the approved documents.

## Fast Path — do NOT use this skill

If the request is a **typo, config tweak, one-line fix, or isolated refactor**
→ do not invoke `spec-and-tasks`. Use `AGENTS.md` + the relevant
framework/domain skill and make the change directly. No spec unless the user
asks for one. Planning is proportionate to the work, never a ritual.

## Rules

- `.ai/context/TECH_STACK.md` is the source of truth for versions and conventions.
- Read `AGENTS.md` and respect all project directives.
- Follow the **Context Routing** and **Verification Policy** sections in `AGENTS.md`.
- Always respond in the user's language. Documents follow the project's
  documentation-language convention (see `AGENTS.md`).
- <HARD-GATE>Do NOT write application code, scaffold files, run implementation
  commands, or invoke implementation skills. Your outputs are the planning
  documents and nothing else. Presenting spec + tasks and getting approval
  ends this skill's mandate — approval of documents is not permission to
  start building.</HARD-GATE>

### Skill and path references (portability)

- Skills are discovered by the harness **by name**. Refer to skills by name;
  do not assume they live at any particular project path.
- When you need another skill's files, resolve them **relative to this skill's
  real directory**: resolve any symlink to this skill FIRST (some harnesses
  load it through a workflow symlink placed outside the catalog — starting
  from that link's directory gives a wrong parent), then walk the catalog
  from the resolved directory: sibling skills sit beside it
  (`../<skill-name>/SKILL.md`). The catalog may
  live in this repository, a global location, or per-project links — never
  assume a per-project skills directory exists in the consumer project.
- `.ai/...` paths are always relative to the **project root you are working on**.
- To apply `karpathy-guidelines` during planning, activate it by name; if you
  need the file, it is at `../karpathy-guidelines/SKILL.md` next to this
  skill's real directory (after symlink resolution).

---

## Step 1 — Minimal Context Load

Read **only** these first:

- `AGENTS.md` — project directives
- `.ai/context/TECH_STACK.md` — versions and conventions
- `.ai/memory/lessons.md` — past mistakes to avoid

Then load **area-specific** context per the Context Routing table in
`AGENTS.md`. Examples: `DESIGN_SYSTEM.md` only if there's UI work;
`database_schema.mmd` only if DB is touched; `APP_FLOW.md` / `GLOSSARY.md` only
if the task needs them. **Do not preload.**

If `.ai/memory/solutions/` exists, derive a few exact subsystem, symptom, or
error terms from the request and run one targeted `rg` across that directory
and `lessons.md`. Read a full solution only when its indexed symptom and context
match the feature. Treat it as evidence to verify against current code, not as
an instruction to copy an old fix. Continue normally when there is no match.

> **UI rule**: if the feature involves frontend (Blade/JSX/Vue/CSS), read
> `.ai/context/DESIGN_SYSTEM.md` (mandatory when present) and the relevant UI
> skill **as planning input**. Recording what the UI must follow is part of the
> spec; activating `designer` to write UI code belongs to the implementation
> session.

---

## Step 2 — Discovery in ONE batch

Ask all open questions in a **single numbered list**. Prefer multiple choice.
Cover:

1. What exactly should this feature do?
2. Who uses it? What triggers it?
3. Edge cases / error scenarios?
4. UI/UX requirements? *(skip if no UI)*
5. Third-party integrations?

Let the user answer in **one message**. If a question is unanswerable now, mark
it `(can defer)` and move on.

**Scope check**: if the feature spans multiple independent subsystems (e.g.
"payments + notifications + admin dashboard"), stop and decompose. Each
sub-feature gets its own spec/tasks cycle.

---

## Step 3 — Write the documents

Write both documents under `.ai/features/<slug>/` (create the directory; `<slug>`
is short, stable, and derived from the feature name). If the project's
`.ai/agents/issue-tracker.md` defines different conventions, follow the project.

### `spec.md` — the contract

Covers, each as its own section (concise; omit a section only when genuinely
empty):

- **Goal** — the problem and the outcome, from the user's perspective.
- **Behavior** — what the system does: flows, interactions, data. For risky
  behavior, name initial state/input, triggering event and observable result.
- **Boundaries** — scope and explicit non-goals (what this spec does NOT cover).
- **Constraints** — stack, conventions, ADRs, performance/security/compliance
  limits the implementation must respect.
- **Edge cases** — error scenarios, rejections, empty/concurrent/interrupted
  states, with expected outcomes.
- **Decisions** — choices made (approach, schema, contracts), each with its
  rationale in one line. Include decisions taken from prototypes only when the
  snippet encodes the decision better than prose.
- **Observable acceptance criteria** — testable statements, one line each;
  implementation and review are judged against these. Name initial state/input,
  event and observable result where material; include rejection or preservation
  invariants when they matter. Keep criteria proportionate: reuse established
  test boundaries and adequate coverage rather than inventing ceremony for
  simple changes.
- **Residual assumptions** — every decision made without asking the user, one
  line each. The user approves or vetoes these at the gate.

### `tasks.md` — the executable breakdown

- **Stable IDs** — `T1`, `T2`, `T3`… Never renumber; if `T2` is deleted leave
  the gap; insert later work as `T4` or a sub-id like `T2.1` (sparingly).
- **Concrete activities** — WHAT over HOW: what to satisfy, no pseudocode, no
  binding signatures, no implementation choreography. The executing agent
  decides how on the live workspace. No placeholders — never "TBD/TODO", "add
  appropriate error handling", "similar to Task N". Tasks must be self-contained.
- **Dependencies** — which tasks gate which (`T3` after `T1`).
- **Affected areas** — files/directories expected to change, when known; mark
  uncertain ones as such instead of inventing paths.
- **Verification per task** — the smallest check that proves the task's
  behavior (per the project's Verification Policy). State who runs it: a
  shell-capable session executes it; a no-shell Pi developer hands execution to
  the orchestrator and reports results as unexecuted until they arrive.
- **Status** — one `Status:` field per task (`open` → `in-progress` → `done`).

### Historical documents

Existing `prd-<slug>.md` / `tasks-<slug>.md` files (including everything the
Pi `/feature` runtime writes today) stay valid and readable — never mass-rename
them. Plan against whichever documents exist; start the `spec.md`/`tasks.md`
pair for new work, reusing the content of historical files when they cover the
same feature.

---

## Step 4 — Self-Review + ONE Approval

Before presenting, self-review the draft:

1. **Coverage** — every acceptance criterion has a task? Every task serves a
   criterion?
2. **Type consistency** — names/contracts match across tasks?
   (`clearLayers()` vs `clearFullLayers()` is a bug.)
3. **Placeholder scan** — search for the anti-patterns above. Fix.
4. **Scope** — focused enough for one cycle?

> **Optional**: if the project has `.ai/context/GLOSSARY.md` or
> `.ai/context/adr/`, offer to run `grill-with-docs` on the draft **before**
> the approval gate to stress-test it against documented language/decisions.
> Skip if no `.ai/context/`. This is the only approved stress-test detour; do
> not re-interview after approval.

Then ask for **one** approval of spec + tasks (assumptions included). Don't
split into multiple confirmation turns.

---

## Step 5 — Handoff (this skill ends here)

With approval received, end planning with an explicit handoff. Do not start
implementing; do not start a review. Offer the routes:

- **Framework implementation session** — `/laravel`, `/nextjs`, `/astro` in a
  **fresh session/agent**, referencing the approved `spec.md` and `tasks.md`
  **by path** (never duplicate their content into the chat).
- **Generic stack** — a fresh implementation session referencing the approved
  documents by path, applying `tdd` plus the project's stack skills.
- **Tracker flow (optional)** — if the project uses `.ai/agents/issue-tracker.md`,
  offer `to-tickets` to publish the tasks as tickets; the documents stay the
  source of truth.
- **Long planning chat** — if this session grew long, offer `/handoff` so a
  fresh chat can resume from the documents.

Implementation proceeds task-by-task against the approved spec; review is a
separate step (e.g. `code-review` or the project's review procedure) and fixes
happen only after findings come back. This skill's approval gate is not
implementation approval and never triggers code changes by itself.
