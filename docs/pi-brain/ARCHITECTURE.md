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
Replacing a *stale* one is check-then-act, so it runs under a marker file whose
name encodes the inode of the exact lock being replaced: two processes seeing the
same stale lock contend for the same marker and only one can create it. The
marker deliberately never expires on a timer — a timed expiry is what makes
takeover racy, because a paused taker wakes up and installs its lock after
someone else already took over. A marker left by a crash is reported with the
path to delete. Release is bound to the inode captured at acquisition, so a run
that stalled past the TTL cannot delete its successor's lock. Residual, accepted:
inode reuse could defeat the identity checks.

**Skill routing.** `stack → profile → role policy → skill names →
skillsOverride` on the child's resource loader. A Laravel skill never reaches an
Astro developer.

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

- Everything under `src/pi/` is unverified until the spike passes.
- The `ask_user`-mid-child-run path may need `mode: "deferred"` (see SPIKE.md).
- No `/setup`, `/review`, `/bugfix` yet — phase 2.
- Submodules are not supported. Their inner diff cannot be included, so a run
  that finds any submodule dirty, moved or uninitialised escalates to
  needs_human before a reviewer is called. Detection asks each submodule
  directly with `git status --porcelain`, because `git submodule status` only
  reports the recorded commit and shows a leading space while the submodule's
  working tree is dirty.
- No worktrees. Concurrent writing runs on the same repo are blocked by a
  lockfile, not isolated.
- Run state is appended via `pi.appendEntry` but there is no resume UX.
- Per-agent token usage is captured from `agent_end` but not yet surfaced in a
  run summary.
