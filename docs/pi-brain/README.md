# pi-brain

Local multi-agent workflow harness for [Pi](https://pi.dev), built on top of the
`agent-brains` canonical skill store.

`/feature <idea>` runs: plan → your approval → developer agent → deterministic
checks → independent reviewer agent (different model) → bounded fix loop →
summary. **It never commits.**

This lives on the `pi-brain` branch. `main` is unchanged and still serves
OpenCode/Codex through `setup.sh`.

---

## Status

| | |
|---|---|
| Pi-free logic (profiles, stack, context routing, verification, review loop, run lock, workflow) | implemented, 46 tests green |
| Pi SDK layer (`src/pi/`, `extensions/pi-brain.ts`) | typechecked against pi-coding-agent 0.84.2, **never executed end-to-end** |
| Spike proving the Pi APIs | **passed 2026-08-17 on 0.84.2** — all checks, see [SPIKE.md](./SPIKE.md) |

The spike proves every Pi primitive pi-brain uses (including `ask_user` mid-run).
`src/pi/` itself still has not run a real `/feature` — that is the next step.

---

## Install (once Pi is installed)

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
cd ~/dev/personal/agent-brains && git checkout pi-brain
npm install                      # peer deps only
pi install .                     # or: pi install -l . inside a project
```

Then, in any project:

```bash
cd ~/projects/my-app
pi
> /stack            # what pi-brain thinks this project is
> /feature Add organization invitations
> /flow status      # what's running
> /flow stop        # cancel
```

## Configure roles → models

`~/.pi/agent/pi-brain/config.json` (global) or `.pi/pi-brain.json` (per project,
wins). Only what you want to change:

```json
{
  "roles": {
    "planner":   { "provider": "openrouter", "thinking": "medium" },
    "developer": { "provider": "zai", "model": "glm-4.6", "thinking": "high" },
    "reviewer":  { "provider": "openai", "model": "gpt-5-codex", "thinking": "high", "readOnly": true }
  },
  "stack": "laravel",
  "maxReviewRounds": 2,
  "verify": ["./vendor/bin/pest --compact", "./vendor/bin/pint --test"]
}
```

Providers come from Pi (`/login`). pi-brain never reads or writes `auth.json`.
JSON rather than YAML on purpose: keeps the package dependency-free.

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
profiles/*.list            unchanged, shared with main
.agents/skills/            unchanged canonical skill store
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
