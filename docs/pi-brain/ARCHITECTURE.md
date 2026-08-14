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

**Skill routing.** `stack → profile → role policy → skill names →
skillsOverride` on the child's resource loader. A Laravel skill never reaches an
Astro developer.

**Profiles stay `.list`.** Same files `setup.sh` uses on `main`. The spec sketched
YAML; converting would have broken the OpenCode path for no gain.

**Config is JSON.** Zero dependencies. Swap `loadFile()` in `src/config.ts` if
YAML ever becomes worth a dep.

**Git safety.** A baseline (branch, HEAD, already-dirty files) is captured before
any writing phase, and pre-existing changes are excluded from the diff so they
are never attributed to — or reverted by — the workflow. Nothing is committed.

## Known gaps

- Everything under `src/pi/` is unverified until the spike passes.
- The `ask_user`-mid-child-run path may need `mode: "deferred"` (see SPIKE.md).
- No `/setup`, `/review`, `/bugfix` yet — phase 2.
- No worktrees; one writing workflow per repo at a time, no lockfile yet.
- Run state is appended via `pi.appendEntry` but there is no resume UX.
- Token/cost reporting is not wired; add it if Pi exposes usage on `agent_end`.
