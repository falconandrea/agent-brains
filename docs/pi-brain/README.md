# pi-brain

Local multi-agent workflow harness for [Pi](https://pi.dev), built on top of the
`agent-brains` canonical skill store.

`/feature <idea>` runs: plan → tri-state approval gate → developer agent →
deterministic checks → independent reviewer agent (different model) → bounded
fix loop → summary. **It never commits.**

Pi-brain is part of the repository's canonical `main` branch and coexists with
the OpenCode/Codex setup managed through `setup.sh`.

---

## Status

| | |
|---|---|
| Pi-free logic (profiles, stack, context routing, verification, tri-state gate, review loop, run lock, workflow) | implemented, 212 tests green |
| Pi SDK layer (`src/pi/`, `extensions/pi-brain.ts`) | typechecked against pi-coding-agent 0.84.2, **exercised by real runs since 2026-08-21** |
| Spike proving the Pi APIs | **passed 2026-08-17 on 0.84.2** — all checks, see [SPIKE.md](./SPIKE.md) |
| Real `/feature` runs | several completed end-to-end (2026-08-21 → 2026-08-23): gates, ask_user mid-run, review rounds, classified warnings, run-state log persisted and read back via `/flow log` |

Follow-up work on Pi plugins, context hygiene and skill improvements is tracked
in the [plugin adoption roadmap](../plans/pi-plugin-adoption-roadmap.md), which
is the source of truth for the next action.

The spike proves every Pi primitive pi-brain uses (including `ask_user` mid-run).
Real runs have since covered the whole pipeline on real features.

---

## Install (once Pi is installed)

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
cd /path/to/agent-brains
npm install                      # devDeps + the Pi peer deps
pi install .                     # or: pi install -l . inside a project
```

Then, in any project:

```bash
cd ~/projects/my-app
pi
> /stack                    # what pi-brain thinks this project is
> /feature Add organization invitations
> /flow status              # what's running
> /flow stop                # cancel
> /flow log-all             # persisted runs in this repo
> /flow resume <runId>      # continue an interrupted run from its log
```

The plan gate offers **Approve and implement**, **Revise with notes**, and
**Cancel**. A revision sends one free-form note set plus the current PRD/tasks
back to the same planner in the same run and feature directory. At most two
non-empty revisions are allowed; invalid planner output is rejected without
changing the last valid artifacts. Headless runs default to **Cancel**.

`/flow resume` replays `.pi/pi-brain/runs/<runId>.jsonl` and re-enters at the
first incomplete phase (develop / verify / review) with counters, usage and the
original git baseline restored. Runs that ended before the spec gate, runs
already completed, and pre-resume logs without a persisted baseline are refused
with a reason. If the working diff changed since an interrupted review, it asks
restart-vs-resume first.

## Configure roles → models

`~/.pi/agent/pi-brain/config.json` (global) or `.pi/pi-brain.json` (per project,
wins). Configuration layers are merged in this order: built-in defaults, global
config, project config, then workflow overrides. The project file does not need
to repeat the global settings; specify only what you want to change:

```json
{
  "roles": {
    "planner":   { "provider": "openrouter", "thinking": "medium" },
    "developer": { "provider": "zai", "model": "glm-4.6", "thinking": "high" },
    "reviewer":  { "provider": "openai-codex", "model": "gpt-5-codex", "thinking": "high", "readOnly": true }
  },
  "stack": "laravel",
  "maxReviewRounds": 2,
  "verify": ["./vendor/bin/pest --compact", "./vendor/bin/pint --test"],
  "verifyTimeoutMs": 300000
}
```

### Verification timeout

Each verification command runs under a finite timeout so a hung test or a
watch-mode script can never hold the workflow — and through it the repository
lock — until someone intervenes. `verifyTimeoutMs` sets the per-command limit
in milliseconds:

- default **600000** (10 minutes); allowed range 1000–3600000 (1s–1h);
- a missing key keeps the default (existing configs need no change); an
  invalid value (non-integer, out of range) falls back to the default with a
  warning naming the bounds;
- a timed-out command reports exit code **124** with output identifying the
  command and the limit, counts as a blocking failure, and goes back to the
  developer like any failing check;
- termination kills the command's whole process group (SIGTERM, then SIGKILL
  after a 5s grace for anything trapping the signal) and the result is
  reported once the tree is confirmed gone. The one edge case that cannot be
  confirmed — a survivor stuck in uninterruptible sleep, which no signal can
  kill — is reported as such ("could not be confirmed dead — check for
  leftover processes") after a bounded wait, instead of claiming a clean
  termination, so the workflow never proceeds — or releases the repository
  lock — under a false guarantee. The group kill is a
  POSIX mechanism; on platforms without it, only the direct shell is killed —
  the same guarantee the pre-timeout code gave. pi-brain runs verification
  through `bash`, so POSIX systems are the supported configuration.

Role settings are merged per role and per field. For example, this project
override changes only the reviewer's reasoning level while inheriting its
provider, model, and `readOnly` value from the global config:

```json
{
  "roles": {
    "reviewer": { "thinking": "xhigh" }
  }
}
```

### Frozen verification inputs

Verification commands are resolved **once at run start** and persisted on the
`workflow.started` event together with the manifest script sections they run
through and a digest of those sections. Before every verify —
first run, fix rounds, and resumed runs alike — the live scripts are diffed
against that baseline: any changed, added or removed script key ends the run
`needs_human` before a single command executes, with the reason naming the
changed keys. The scan perimeter is persisted with the freeze and re-resolved
at each check, so **a manifest created during the run** (a nested
`package.json` that did not exist at start) is caught too, not just edits to
the ones already frozen. `/flow resume` replays the persisted commands and
baseline, so editing `.pi/pi-brain.json` (or a manifest) while a run is
interrupted cannot rewrite what verify executes. Logs written before this
feature resume as before — commands re-resolved from the current config — with
a one-line notice that the script check is inactive for that run. A log whose
persisted freeze is present but corrupt (wrong shape, a perimeter that is not
`root`/`tree`, or a digest that does not bind to its scripts) is refused
outright instead of silently resuming unprotected.

The script sections are frozen **wholesale**, not per named key: npm, pnpm,
yarn and bun execute `pre<script>`/`post<script>` hooks automatically and
scripts commonly call other scripts, so key-scoped freezing would leave the
easy bypass open. The cost: even an unrelated script edit escalates to a
human — restoring the scripts or starting a new run is the way forward.

Which manifests are frozen:

- **Stack-resolved commands** (pi-brain's own resolution): the ecosystem's
  root manifest — `package.json` for every node primary (npm, pnpm, yarn and
  bun all execute package.json scripts through `<pm> run <key>`),
  `composer.json` for Laravel.
- **Explicit `verify` config: the whole reachable perimeter.** Explicit
  commands are arbitrary shell, and no tokenizer can prove which manifest they
  reach: `true && npm run test`, `sh -c '…'`, `cd frontend && pnpm test`,
  `npm --prefix frontend run test` and `yarn workspace … run …` each defeat a
  token heuristic, and the `cd`/`--prefix`/workspace forms execute a
  **subfolder** manifest the root snapshot never saw. So both root manifests
  **plus every nested `package.json`/`composer.json`** in the tree are frozen.
  The perimeter is remembered on the freeze and re-scanned before each verify,
  so a manifest **created mid-run** is a change too. Manifests that do not
  exist at freeze time are snapshotted as empty sections, so their creation is
  a detected change, not a silent pass.

Known limits of the freeze perimeter:

- **Excluded from the scan:** `node_modules`, `vendor`, `.git`, `.pi`,
  `bower_components` and symlinked directories. They can hold thousands of
  manifests (unbounded), and a command that deliberately executes a script
  from inside one is outside the perimeter.
- **Refused rather than truncated:** above 200 manifests the freeze is not
  built at all; the run ends `needs_human` with the count, because an
  incompletely frozen perimeter cannot be verified safely.
- **Script bodies are not resolved:** what a script **body** executes (other
  files, `node_modules/.bin`, `vendor/bin`) is neither resolved nor frozen — a
  swapped test-runner binary is invisible to this check, and the
  repository-state digest (U3) does **not** close that gap either: it
  snapshots git state (HEAD, refs, `.git/config`, hooks), not arbitrary
  working-tree files.

The freeze lives in the run log under `.pi/`, which the developer's write
guard already refuses to touch.

### Repository-state invariant

The no-commit/no-ref/no-config/no-hook invariant is backed by detection: at
run start pi-brain digests **HEAD (commit and symbolic ref), every ref, the
repository's git config and every git hook** and persists the digest on
`workflow.started`. The digest is re-checked **after every developer pass**
(develop and each fix round, plus the interruption window on a resumed pass)
and **after every verify** — any difference ends the run `needs_human` before
a single reviewer token is spent, with a reason naming what to inspect
(`git reflog`, `git diff`). A hook planted in `.git/hooks/`, a commit, a
branch, a tag, a stash or a config edit behind the reviewer's back all stop
the run; ordinary working-tree edits — the developer's legitimate output —
do not.

How it reads the state:

- The git dir is resolved through git itself (`rev-parse --git-dir` and
  `--git-common-dir`), so **linked worktrees** work: there `.git` is a *file*,
  and config plus hooks live in the main repository's common dir, which the
  digest watches from every worktree. A per-worktree `config.worktree` is
  digested on its own.
- A configured `core.hooksPath` (any config scope) relocates hook execution;
  that location is digested as well, and changing the setting itself is
  already a config change. An **absent** hooks location — no setting, or a
  path that does not exist yet — is a readable state (a hook cannot run from
  there, and creating the path later is a detected change); a location that
  exists but cannot be enumerated is a read failure, not a silent skip.
- A hook's **permission bits** are part of the state: making a planted file
  executable (`0644` → `0755`) activates it without changing a byte of its
  content, and the digest must not miss that.
- **Unreadable is never unchanged**: if the state cannot be read — at
  baseline or at any re-check — the run ends `needs_human` instead of
  comparing against a made-up value. "Read as absent" and "could not read"
  are kept strictly apart: only a genuinely missing config or hook is a
  state, every other read error propagates — including a path that exists
  but sits behind an **inaccessible parent directory**, which must not read
  as absent. At baseline nothing has started yet, so no partial run is
  logged.

`/flow resume` compares against the **original persisted digest**, never a
fresh baseline: a commit made while the run was interrupted is caught at the
first re-check. Logs written before this feature carry no digest; those runs
resume **without** the repository-state check and say so in a one-line notice
— compatibility, not protection. The practical cost: a legitimate human
commit mid-run also stops the run with `needs_human`; that is intended — the
reviewer's diff baseline is stale from that moment anyway.

Known limits:

- The digest covers git metadata only: HEAD, refs, config, hooks. Swapped
  working-tree files (e.g. a test-runner binary) are **not** detected here —
  the verify-input freeze covers manifests, and nothing yet covers arbitrary
  files a script body executes.
- Pseudo-refs such as `ORIG_HEAD`, `MERGE_HEAD` and `FETCH_HEAD` are not
  hashed; anything that matters to them moves HEAD or a real ref as well.
- Detection, not prevention: a push that already happened cannot be undone by
  spotting it afterwards.

Providers come from Pi (`/login`). pi-brain never reads or writes `auth.json`.
JSON rather than YAML on purpose: keeps the package dependency-free.

### What to commit under `.pi/`

| Path | Commit? | Why |
|---|---|---|
| `.pi/pi-brain.json` | yes | project config: stack, verify commands, role overrides — shared with the repo |
| `.pi/pi-brain.lock` | no (gitignore) | runtime state of the current run, machine-local |
| `.pi/pi-brain/runs/` | no (gitignore) | per-run audit logs (`<runId>.jsonl`), machine-local history |

Consuming projects should add:

```gitignore
.pi/pi-brain.lock
.pi/pi-brain/
```

## Layout

```
extensions/pi-brain.ts     command registration + wiring (Pi)
src/pi/                    the ONLY code that touches the Pi SDK
src/                       everything else — no Pi, unit-tested
  ports.ts                 HumanInput / VerifyRunner / GitService / events
  agent.ts                 AgentRunner interface + FakeAgentRunner
  context-router.ts        which .ai/ docs each role/task actually needs
  run-lock.ts              one writing run per repository
  workflows/feature.ts     the deterministic state machine
profiles/*.list            skill lists per stack; setup.sh ships the same lists to OpenCode
.agents/skills/            canonical skill store shared by Pi and OpenCode
spike/                     capability spike, run before trusting src/pi/
```

## Add things

- **skill** → new dir in `.agents/skills/`, add its name to one or more
  `profiles/*.list`. Nothing else.
- **profile** → new `profiles/<name>.list`, compose with `@include`.
- **role policy** (which skills a role sees) → `ROLE_POLICIES` in
  `src/skill-router.ts`.
- **workflow** → a module under `src/workflows/` exporting a `run(deps, input)`
  function, plus a `pi.registerCommand` in the extension.

## Test

```bash
npm install     # devDeps + the Pi peer deps (pinned by package-lock.json)
npm test        # node --test with Node's type stripping
npm run typecheck
```

Both are clean as of pi-coding-agent **0.84.2**, the version `package-lock.json`
pins and the one `src/pi/` was typechecked against. `erasableSyntaxOnly` is on in
`tsconfig.json` (no parameter properties, no enums, no namespaces) so Node can
strip types without a build step.

## Safety

Pi extensions and skills run with your full user permissions. Review before
installing anything third-party. pi-brain never commits, never force-pushes, and
records a git baseline so pre-existing dirty files are not attributed to the
workflow.
