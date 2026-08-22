# pi-brain ideas

Nothing here is decided. Each idea earns code only after a spike or trial
proves it. These notes exist so a future session does not re-derive them.

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

