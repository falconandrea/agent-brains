# pi-brain architecture

One rule holds the design together: **only `src/pi/` and `extensions/` may import
Pi.** Pi's docs are unversioned and the API moves; everything else must survive
that.

```
/feature (extensions/pi-brain.ts)
  └─ runFeatureWorkflow (src/workflows/feature.ts)   ← deterministic, Pi-free
       ├─ AgentRunner        → PiAgentRunner  (src/pi/pi-agent-runner.ts)
       ├─ HumanInput         → PiHumanInput   (src/pi/human-input.ts)
       ├─ VerifyRunner       → ShellVerifyRunner (src/shell.ts, child_process)
       ├─ GitService         → RealGitService    (src/shell.ts)
       └─ WorkflowEventSink  → pi.appendEntry + ctx.ui.setStatus
```

Swap every port for a fake and the whole workflow runs in a unit test with no
model, no network and no Pi — that is what `tests/feature-workflow.test.ts` does.

## Decisions worth remembering

**Deterministic orchestration.** Code decides the phase transitions; models only
do the work inside a phase. No LLM manager.

**Roles are not models.** `src/config.ts` maps role → provider/model/thinking.
No model id appears in core logic.

**Curated context per role.** The reviewer never receives the developer's
conversation — only PRD, tasks, diff, changed files and verification results
(`REVIEWER_PROMPT`). The developer receives only actionable findings on a fix
round.

**Deterministic checks before the reviewer.** A failing blocking check goes
straight back to the developer; the reviewer is not called at all. Tokens are
only spent on a green tree.

**Structured review, not prose.** Pi has no JSON response mode, so the reviewer
gets one tool — `submit_review` — and must call it. `validateReviewResult`
rejects anything malformed and the run escalates instead of guessing.

**Bounded loop.** `decideNextRound` is a pure function: approved → complete,
`needs_human` → escalate, max rounds → escalate, same blocking IDs with an
unchanged diff → escalate as no-progress. It cannot loop forever.

**Context routing.** `src/context-router.ts` loads three always-on documents
plus whatever the task words earn: a UI task gets `DESIGN_SYSTEM.md`, a database
task gets the schema and *only the ADRs whose filename matches the task*. The
developer and reviewer never get product docs — they already have the approved
PRD inline. `ROADMAP.md` is never loaded.

**One writer per repo.** Node's fs exposes no `flock`, so `src/run-lock.ts` is
built entirely on exclusive create. Acquiring a free lock is a `link()` — atomic.

The property that makes release safe is that **a lock is only ever taken over
when its owning process is gone**. A live run therefore cannot be superseded, so
its own unlink can only ever remove its own file — there is no check-then-unlink
window to lose. A live owner that has held the lock past the TTL is *reported*
(`held_stale`, with the pid and the file to delete), never overridden, precisely
because overriding it is what would reintroduce that race.

Replacing an abandoned lock is still check-then-act, so it runs under a marker
file whose name encodes the inode of the exact lock being replaced: two processes
seeing the same dead lock contend for the same marker and only one can create it.
The marker never expires on a timer — a timed expiry is what lets a paused taker
wake up and install its lock after someone else already took over. A marker left
by a crash is reported with the path to delete. Release additionally verifies the
inode captured at acquisition, as defence in depth against hand-edited locks.

There is **no "run anyway"**: a refused lock refuses the run. One writer per
repository is an invariant, not a preference — two agents editing one tree
corrupt each other's work and the reviewer's evidence with it. Both known
limitations fail in the safe direction: a recycled PID makes a dead owner look
alive (the run is refused until the user clears it), and inode reuse could defeat
the identity checks.

**Skill routing.** `stack → profile → category filter → skill names →
skillsOverride` on the child's resource loader. Every skill maps to one
category (`SKILL_CATEGORIES` in src/skill-router.ts); every role admits a set
of categories (`ROLE_CATEGORIES`); a skill reaches a role only when its
category is admitted AND the stack profile contains it. So a Laravel skill
never reaches an Astro developer, a planning skill never reaches the
developer/reviewer, and operational/session skills (handoff, start, setup…)
never reach any pipeline child.

**Profiles stay `.list`.** Same files `setup.sh` uses on `main`. The spec sketched
YAML; converting would have broken the OpenCode path for no gain.

**Config is JSON.** Zero dependencies. Swap `loadFile()` in `src/config.ts` if
YAML ever becomes worth a dep.

**Git safety.** The whole working tree — tracked modifications *and* untracked
files — is snapshotted into a commit object twice: at baseline and again when
the diff is requested. Snapshotting writes through a throwaway `GIT_INDEX_FILE`,
so the user's index and working tree are never touched, and `git add -A` there
honours `.gitignore`. Diffing snapshot-to-snapshot gives, correctly and for free:
only the run's own changes, proper rename and delete records, no filename
parsing (NUL-separated lists throughout), and pre-existing dirt cancelled on both
sides — including an untracked file the run later stages, whose content still
never reaches a model. A git failure raises rather than degrading to an empty
patch, and dirty submodules stop the run instead of letting the reviewer approve
code it was never shown. Nothing is committed.

## Known gaps

- `src/pi/` primitives are proven by the spike (2026-08-17, 0.84.2). The
  `/feature` pipeline's spec phase (planner → PRD/TASKS → gate) has run
  against real models (2026-08-18, glm-5.3 planner); developer → verify →
  reviewer have not yet.
- The `ask_user`-mid-child-run path **works** for a single dialog (spike
  check 4). Two failure modes surfaced on 2026-08-18 (runs against
  search-flights, Pi 0.84.2):
  1. **Lost sequential dialog.** A `ctx.ui.*` dialog fired from the detached
     workflow while another was open/closing never rendered — status line
     showed `planner: tool ask_user`, no dialog, zero CPU, no open sockets,
     promise pending forever (run run-msyr18rk).
  2. **Single-pick dead end.** `ctx.ui.select` allows choosing exactly one
     row with no freeform escape, so a planner that batches Q1..Qn × A/B/C
     options into one `ask_user` is unanswerable.

  Bridge mitigations (src/pi/human-input.ts): every dialog is chained through
  a serialization lock (at most one in flight), option batches larger than 3
  are routed to freeform `ctx.ui.input` with the options inlined in the
  message (answerable as "1: A, 2: B"), and every child-question select gets a
  trailing "Other — type your answer" row that opens a chained input — the
  user must never have to type a workflow answer into the main chat, where it
  wakes the main agent instead of reaching the child. With the lock in place,
  role prompts mandate ONE decision per ask_user call (2-3 options each),
  asked sequentially — the batched Q1..Qn single call is explicitly banned.
  Known residual risk: if the TUI ever loses a dialog anyway, the lock queues
  all later dialogs behind the dead promise — `/flow stop` is the escape
  hatch. `mode: "deferred"` remains the fallback.
- Typed chat input during a run lands in the MAIN session and wakes the main
  agent, which knows nothing about the workflow and starts investigating it
  (observed 2026-08-18: a "1: A, …" answer typed in chat instead of the
  dialog produced several minutes of main-agent detective work — pure token
  burn; the workflow itself correctly stayed at its gate). Open fix ideas:
  surface "workflow running — answer dialogs, not chat" guidance, or have the
  extension answer main-session questions about runs cheaply.
- [pi-ask-user](https://github.com/edlsh/pi-ask-user) and
  [pi-ask](https://github.com/eko24ive/pi-ask) (tabbed multi-question forms,
  per-option notes, review tab — the best ask UX in the ecosystem) were
  evaluated and rejected for now: both register their tool at the extension
  level for the *main* session, while pi-brain's children are built via
  `createAgentSession` with explicit `customTools` and cannot see other
  extensions' tools; importing their internals would couple us to unexported,
  version-sensitive code (pi-ask-user's own issue #17 documents the
  dual-module-instance class of bugs). Revisit if Pi ever exposes extension
  tools to child sessions — at that point adopt pi-ask and drop the bridge's
  hand-rolled dialogs.
- No `/setup`, `/review`, `/bugfix` yet — phase 2.
- Submodules are not supported. Their inner diff cannot be included, so a run
  that finds any submodule dirty, moved or uninitialised escalates to
  needs_human before a reviewer is called. Detection asks each submodule
  directly with `git status --porcelain`, because `git submodule status` only
  reports the recorded commit and shows a leading space while the submodule's
  working tree is dirty.
- No worktrees. Concurrent writing runs on the same repo are blocked by a
  lockfile, not isolated.
- Run state is appended to a pi-brain-owned audit trail at
  `.pi/pi-brain/runs/<runId>.jsonl` (src/run-log.ts): every workflow event,
  the final `workflow.outcome` (status, reason, review issues, per-role
  usage), best-effort writes that never kill a run, torn-final-line
  tolerance. `/flow log` reads from this file and `/flow log-all` lists every
  persisted run. This exists BECAUSE `pi.appendEntry` proved unreliable —
  two incidents (2026-08-21/22) of completed runs leaving no session trace
  and a lost needs_human outcome with all its review findings. Resume UX on
  top of this log is still missing (IDEAS.md).
- Per-agent token usage is captured from `agent_end`, aggregated per role in
  the workflow (`UsageByRole`) and surfaced in the final summary and
  `/flow status` (live, folded from `agent.completed` events). Caveat:
  `pi.appendEntry` durability is NOT guaranteed — a completed run left no
  session trace on disk (2026-08-21); the persisted-usage story belongs to
  the run-state file planned in IDEAS.md (resume mode).
