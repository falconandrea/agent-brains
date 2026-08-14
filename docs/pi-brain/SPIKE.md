# Pi capability spike

Run this **before** trusting anything in `src/pi/`. Everything in that directory
was written against pi.dev docs and has never been executed.

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi              # then /login for the providers you want
cd ~/dev/personal/agent-brains
pi -e ./spike/spike-extension.ts
> /spike
```

## What it proves

| # | Check | Consequence if it fails |
|---|---|---|
| 0 | **skills actually load from the package** (see below) | every skill-routing check below is meaningless |
| 1 | `pi.registerCommand` — `/spike` runs | nothing works; re-read the extensions docs |
| 2 | `ctx.ui.confirm` from a command handler | no approval gate; workflow needs another UI path |
| 3 | `createAgentSession` with an explicitly chosen model | roles cannot use different models — the whole premise |
| 4 | **child calls `ask_user` → parent TUI answers mid-run** | see below |
| 5 | child events observed via `session.subscribe` | no live status; fall back to phase-level status only |
| 6 | structured output captured by a result tool | reviewer output must be parsed from prose — bad |
| 7 | `skillsOverride` filters skills per child | no per-role skill routing; all roles get everything |
| 8 | `pi.appendEntry` persists state | no crash-tolerant run history |

## Check 0 first — do the skills even load?

`package.json` points the **package** loader at `./.agents/skills`, a directory
that follows the **`.agents/skills` convention**. Those are two different
discovery rule sets in Pi's docs (package: top-level `.md` counts as a skill;
`.agents/skills`: top-level `.md` is skipped). Which one wins for this path is
not settled by the docs.

```bash
pi install .
pi
> /skill:            # tab-complete: are our skills listed?
```

Expect ~55 skills and **no** entries for `product-thinking` / `designer` (loose
`.md` files, not Agent Skills — convert them to `<name>/SKILL.md` if you want
them in Pi). If nothing loads, or if `.agents/workflows/*.md` symlinks show up
as bogus skills, fix the `pi.skills` path before spending time on checks 1–8.

## Step 4 is the risky one

The docs warn: *"captured old contexts go stale — only use the ctx handed to
withSession"*. pi-brain calls `ctx.ui.input()` from inside a custom tool that is
executing deep inside a child `session.prompt()` that may have started minutes
earlier. Two ways this can fail:

- the captured parent `ctx` is stale → throws, or silently does nothing;
- the TUI is blocked while the child run holds the loop → deadlock.

**Fallback, already implemented:** construct `PiHumanInput` with
`mode: "deferred"` (`src/pi/human-input.ts`). Child questions are queued, the
child is told to decide and state its assumption, and the queue is flushed at
the next phase boundary. Costs Scenario E from the spec; costs nothing else.

Change the mode in `extensions/pi-brain.ts` — it is the only place that picks it.

## Also worth checking manually

- **Reviewer read-only.** `tools: ["read","grep","find","ls"]` has no shell, but
  the reviewer needs `git diff`/tests. If that turns out to matter, add a
  `bash_readonly` custom tool with a command allowlist instead of granting
  `bash`.
- **Skill leak.** After check 7, print the child's `systemPrompt` and confirm no
  Laravel skill is listed in an Astro project (spec Scenario B).
- **Usage data.** Look for token/cost fields on `agent_end` / `turn_end`. If Pi
  does not expose them, drop the cost summary — it is explicitly optional.

## Record the result

Append the outcome here (date, Pi version, which checks passed) so the next
session does not have to re-run it blind.

| Date | Pi version | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| _not run yet_ | | | | | | | | | | |
