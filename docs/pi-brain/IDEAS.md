# pi-brain ideas

Nothing here is decided. Each idea earns code only after a spike or trial
proves it. These notes exist so a future session does not re-derive them.

## Housekeeping: translate Italian artifacts to English

**Status:** DONE 2026-08-23 (commit `5eb67ee`) — the workflow improvement plan
is now English. No other Italian docs surfaced in repo artifacts.

`docs/plans/agent-workflow-improvements.md` (504 lines, the W0–W5 workflow
plan for main) predates the English-artifacts convention and was written in
Italian on explicit user request. Translate to English before merging to
main. Convention recap: repo docs/artifacts = English; conversation with the
user = user's language. Check also for any other Italian docs that slipped
into the repo (search-flights is a separate project — its Italian docs are
correct, that repo's convention is Italian).

## DONE: skill-router refactor — intersection, not union

**Status:** implemented 2026-08-21 (commit trail in git). Kept for context.

Routing is now category-based intersection: `SKILL_CATEGORIES` maps each
skill to one category (planning / review / testing / debugging / craft /
operational / stack; unknown skills default to "craft" so new technical
skills flow without table edits), `ROLE_CATEGORIES` declares what each role
admits (planner: planning+craft+stack; developer: testing+debugging+craft+
stack; reviewer: review+craft+stack), and a skill reaches a role only when
its category is admitted AND the stack profile contains it. UI/design skills
are pinned to "stack" so they reach roles only via frontend profiles.
Operational skills (setup included — it drives a whole session, not a child)
never reach any pipeline role. `always` lists are gone.

## Pre-merge hardening (2026-08-25, external review fix-then-merge set)

Applied before the pi-brain → main merge, from an independent external
review: developer runs with NO shell (tool allowlist, prompt-only rules are
not enforcement — a real incident had the developer commit anyway); reviewer
readOnly is a code invariant, not config; approved PRD/tasks content is
frozen via sha256 in a `spec.approved` event and re-verified every loop
iteration (tamper → needs_human); ignore-rule changes in the diff are
annotated to the reviewer prompt; post-lock resume paths are try/catch with
best-effort lock release; RunLog.open heals a torn final line; a resumed
verify re-observation does not consume a retry; an approved/needs_human
review without outcome events reconstructs the terminal outcome instead of
inventing a fix round; invalid reviewer output escalates immediately
(documented against SPEC §34's dropped repair-attempt promise).

**Residual risks, accepted:** logs written before the spec freeze resume
without a tamper check; ignore-rule concealment is surfaced to the reviewer,
not structurally prevented (a snapshot that force-includes newly-ignored
files would be the full fix); the developer without bash gets test feedback
only through the deterministic verify loop, which may cost one extra fix
round per run. Revisit only on observed abuse.

## Developer committed despite the prohibition (2026-08-25)

**Observation, once.** During the dashboard feature in search-flights the
developer agent created two git commits mid-run (`feat: playwright anti-bot
resilience...`, `feat: static HTML price dashboard...`), ignoring the
explicit "Do NOT create git commits" rule in DEVELOPER_PROMPT. No damage: the
commits were local-only and the snapshot-to-snapshot diff still showed the
reviewer everything (it caught the unapproved anti-bot slice inside those
commits). Cleaned up by squashing before push.

**Why it matters:** the no-commit rule is prompt-only — a soft contract the
model can violate. The reviewer reviews the diff, not git history, so nothing
in the pipeline detects or prevents it.

**Cheap deterministic options if it recurs:** (1) run the developer with a
PATH-shimmed `git` that allows read-only subcommands and rejects commit/tag/
push; (2) have the workflow assert `git log` head-sha unchanged after each
developer pass and fail the run deterministically. No decision yet — single
occurrence, recorded for the pattern.

## Run-state log — validated in the field (2026-08-23)

Operational note closing the loop on the 2026-08-22 escalation: a completed
`/feature` run (booking deep links, search-flights) exercised the full
pipeline — 2 review rounds, classified findings, per-role usage — and
everything survived TUI scrolling via `/flow log`. The owned audit trail
works; the two-incident data-loss gap is closed.

**New observation for the review-loop design:** the same run ended
`completed` with a warning finding (TEST-DEDiCATED-MISSING-HREF) that the
reviewer repeated unchanged in both rounds and the developer never
implemented. Root cause verified in code, not a model failure: by design
`decideNextRound` (`src/review.ts`) forwards **blocking** issues only to the
fix round, so warnings never reach the developer's prompt — round 2 had zero
blocking issues and the loop completed, correctly surfacing the warning in
the outcome for the human. Two cheap deterministic options if we want more:
(1) carry unresolved warnings into the fix prompt marked as non-blocking
("address if legitimate"), so they are not silently dropped; (2) treat a
finding that maps to an explicitly required task in the approved tasks file
as blocking. No decision yet — single occurrence.

## Triage orchestrator (entry router)

**Status:** idea. Not designed, not spiked.

**The problem.** `/feature` is a pipeline: right for medium-large tasks, too
much ceremony for a typo or a one-line fix. Fresh contexts per phase cost more
tokens than one conversational session doing the fix directly.

**The idea.** The user chats with one orchestrator (cheap model, short prompt).
Per request it picks one of three routes:

- **direct** — it does the small fix itself, conversational, no artifacts;
- **pipeline** — hands off to `/feature` (deterministic state machine);
- **subagent** — spawns a single child with a specific model/skill profile for
  bounded delegation.

**Why this is not the banned "LLM manager".** ARCHITECTURE.md rules out models
deciding phase transitions *inside* a workflow. This is one routing decision at
entry, before deterministic code takes over. Routing in front, determinism
behind.

**Open questions before building anything.**

1. **Escape hatch.** A "quick" fix that turns out cross-cutting must escalate
   mid-flight to the pipeline without losing work. Mechanism unknown.
2. **Who holds the conversation.** If the orchestrator keeps chatting after a
   direct fix, its context grows and defeats the token goal. Maybe: after a
   direct route it stays; after a pipeline route it only summarizes.
3. **Where triage lives in Pi.** System prompt of the main session (soft,
   model-decided) vs an extension intercepting free-form prompts (hard, needs
   API support — unknown whether Pi allows it). Check against the extension
   docs before designing further.
4. **Routing quality vs explicit commands.** Is a misroute worse than making
   the user type `/feature` vs `/quick`? Cheap first version: explicit
   commands, orchestrator only when that proves annoying.
5. **Token accounting must exist first.** Per-run usage is a known gap; without
   it we cannot prove the orchestrator saves anything.

**Precedent.** Same proportionality principle as the graduated-planning phase
in the agent-workflow improvements plan on `main` (process depth proportional
to task size) — here applied at the entry point instead of inside the feature
flow.

## Third reviewer provider (Gemini)

**Status:** blocked on Pi support. Not actionable now.

The user has a Google subscription with recent Gemini models, but Pi has no
`gemini`/`google` provider authenticated (models-store: zai, openrouter only).
If Pi adds it, a third provider is interesting for *reviewer diversity* —
independent reviews are more valuable when the reviewer runs on a different
provider's training distribution, and today both planner and developer sit on
zai. Revisit when the provider exists in Pi.

## Rate limits (GLM 5h window)

Operational note, not a design item. The GLM subscription rate-limits in 5h
windows. pi-brain defaults (maxReviewRounds 2, maxVerifyRetries 2) bound a run
to a handful of developer turns, so a single `/feature` fits comfortably;
hitting the limit mid-run fails the run cleanly (Pi error) and the run can be
retried when the window resets. No mitigation worth building until observed.

## Plan amendment at the gate (edit before approving)

**Status:** idea, raised 2026-08-21 after the first real gates. Not built.

**The gap.** The gate is binary today: approve the PRD/tasks as written, or
cancel the whole run and re-ask /feature (planner re-asks questions, pays
full planner tokens again, may produce a *different* plan). There is no way
to say "good plan, but change these three things and go". The natural human
workflow — review, annotate, amend, then approve — is missing.

**Design space (to be decided):**

1. **Reject-with-notes (minimal).** Third gate option "reject with notes":
   the notes become planner input, the planner revises the SAME run (PRD v2
   written to the same feature dir), gate re-asked. Bounded to 1-2 amendment
   rounds like the review loop. Cheapest to build: reuses the review-round
   plumbing, no new UX.
2. **Editor gate.** Gate opens `ctx.ui.editor` preloaded with the PRD; the
   user edits freely; the diff (or the full text) becomes either (a) the
   authoritative PRD directly, or (b) input to the planner for a revision
   pass that reconciles tasks with the edited PRD. Direct-edit is simpler
   but lets tasks and PRD drift apart; revision-pass keeps them consistent.
3. **Annotation mode.** User replies freeform at the gate ("approve IF you
   change Q5's assumption to X"); the planner applies amendments and
   re-submits. Risk: freeform parsing of conditions is exactly the kind of
   fuzzy contract the deterministic-orchestration principle avoids.

**Open questions.**
- Should amendments be recorded in the artifact (a "Amendments" section) so
  the reviewer later knows which parts were human-specified? (Probably yes —
  the reviewer judges against the spec; provenance matters.)
- Interaction with the ask_user findings: the gate amendment is a SECOND
  human checkpoint; do sequential dialogs from the background workflow
  survive an editor dialog? (The serialization lock should handle it, but
  editor + notify interplay is untested.)
- Does an amended plan reset the "approve or veto Assumptions" semantics?
  (Amended assumptions should move from "assumptions" to "decisions".)

**Recommendation (not yet decided): start with option 1** — reject-with-notes
reuses the most machinery, creates no new dialog types, and matches how the
review loop already works. Options 2/3 build on it if notes prove too
coarse. Trigger to build: the first real gate where the user actually wants
to amend (has not happened yet — both gates so far were clean approvals).

## Plan reviewer (spec review before the gate)

**Status:** idea, deferred until a run actually fails from a bad PRD. Raised
2026-08-21 after the user asked "should codex review the plan too?".

**The idea.** planner (glm) → spec review (codex, readOnly, structured
verdict) → planner fix round (bound: 1) → human gate → develop → …

**Why deferred.** Spec quality has not been an observed failure mode (the
human gate catches plan issues today, with veto on Assumptions); it doubles
codex budget pressure (the quota already killed a run once); and codex on
both plan-review and dev-review re-correlates "rules" with their enforcement
— the exact coupling the reviewer-independence principle exists to avoid.

**Cheaper alternatives when the need appears.**
1. Deterministic PRD lint before the gate (zero tokens): required sections
   present, acceptance criteria countable/testable, tasks reference real
   files, no "TBD" assumptions. Fits the project philosophy: code decides,
   models work.
2. `/flow review-plan` on demand: send the PRD to the reviewer model only
   when the human gate suspects something — pay for plan review per use,
   not per run.

## Resume mode for interrupted runs

**Status:** IMPLEMENTED 2026-08-25 (`/flow resume <runId>`, src/workflows/resume.ts).
Kept for design context.

**Status:** idea, well-supported by existing pieces. Triggered by the first
real need: a run that died at review because the reviewer provider's quota
was exhausted (2026-08-18) forced a full restart, planner questions included.

**What already exists.** Every workflow event is persisted via
`pi.appendEntry` (survives crashes); the developer's state IS the uncommitted
diff on disk; verify/review recompute diff and read PRD/TASKS fresh each
round. So resume is mostly *skipping phases whose events are already logged*.

**Correction (2026-08-21): do NOT trust `pi.appendEntry` for durability.**
A fully successful run (review rounds included) left ZERO trace in
`~/.pi/agent/sessions` — pi never flushed the session to disk on exit. The
event sink must own its persistence: append events to a pi-brain-owned
`.pi/pi-brain/runs/<runId>.jsonl` in addition to (or instead of)
`pi.appendEntry`. This also makes `/flow log` trivially readable after a
crash and decouples resume from pi's session lifecycle.

**Escalation (2026-08-22, now PRIORITY): same gap lost real data a second
time.** A `needs_human` outcome (max review rounds) rendered its full
reviewer findings in a TUI notify; the user accidentally scrolled it away
with `/flow log` and NOTHING persisted — not the outcome, not the review
issues, not the token usage. The run-state file is not just resume
infrastructure: it is the audit trail (outcomes, review issues per round,
per-role usage) that `/flow log` should read from and that survives TUI
scrolling, crashes and unflushed sessions. Design note: `ReviewResult`
(issues included) should be emitted in the `review.completed` event, so the
persisted log is self-sufficient for post-mortems.

**Design sketch.** `/flow resume <runId>`:
1. Replay the event log for that runId → last completed phase, review round,
   verify retry counter.
2. Re-validate preconditions: lock acquirable, baseline still resolvable,
   PRD/tasks files still present with our marker.
3. Re-enter at the first uncompleted phase. If the interrupted phase was
   review, the reviewer runs against the current diff — no need to replay
   anything the diff already captures.
4. If the diff changed since interruption (user edited), warn and offer
   restart-vs-resume: a resume over foreign edits hands the reviewer a diff
   the developer never made.

**Open questions.** Should the spec gate be re-asked on resume after spec?
(Probably not — it was approved; the event log can record the approval.)
What if the resumed run's config changed (different reviewer model)?
(Probably fine — roles resolve per run, not per phase.)

## Ecosystem packages evaluated (2026-08-18)

**ask_user UIs — same architectural wall for all.** [pi-ask-user]
(https://github.com/edlsh/pi-ask-user), [pi-ask](https://github.com/eko24ive/pi-ask)
(tabbed forms, per-option notes, review tab — best ask UX around) and
rpiv-ask-user-question all register their tool at extension level for the
*main* session. pi-brain children built via `createAgentSession` cannot see
extension tools, so none helps the workflow. Our bridge (serialization lock +
per-decision selects + freeform escape) covers it; see ARCHITECTURE.md. If Pi
ever exposes extension tools to child sessions, adopt pi-ask and delete the
hand-rolled dialogs.

**rpiv-warp — worth trying independently.** [rpiv-mono]
(https://github.com/juicesharp/rpiv-mono) ships `rpiv-warp`: Warp terminal
notifications when Pi needs input. Orthogonal to pi-brain (main-session UX),
and the user runs Pi inside Warp — a plain `pi install npm:@juicesharp/rpiv-warp`
away if wanted. No integration work in this repo.

**rpiv-web-tools — relevant if children ever need the web.** Pi has no built-in
web tool and pi-brain children have none; research-flavored roles (planner on
an unfamiliar domain) might benefit from search/fetch. Same wall as above for
children (extension-level tool), but as a *main-session* install it just gives
the user's ordinary pi sessions web search. Keep in mind for the triage
orchestrator idea: if its "research" route ever materializes, web tools for
children become a real requirement and we would wire a custom tool through
pi-agent-runner rather than install the extension.

