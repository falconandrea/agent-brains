# pi-brain ideas

Nothing here is decided. Each idea earns code only after a spike or trial
proves it. These notes exist so a future session does not re-derive them.

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

## Resume mode for interrupted runs

**Status:** idea, well-supported by existing pieces. Triggered by the first
real need: a run that died at review because the reviewer provider's quota
was exhausted (2026-08-18) forced a full restart, planner questions included.

**What already exists.** Every workflow event is persisted via
`pi.appendEntry` (survives crashes); the developer's state IS the uncommitted
diff on disk; verify/review recompute diff and read PRD/TASKS fresh each
round. So resume is mostly *skipping phases whose events are already logged*.

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

