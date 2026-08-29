---
name: update-skills
description: Update the skill store with npx skills update, then repair what the update breaks. Re-applies the .ai/ path remap to mattpocock skills via the bundled script, hand-fixes what the script cannot, checks for broken skill dependencies, missing tracker config, and profile orphans, then reports everything and asks before installing or committing anything. Invoke explicitly ($update-skills / /update-skills); do not auto-trigger.
---

# Update Skills

One command updates every skill in `skills-lock.json` to its upstream latest, and silently reverts the local patches this repo depends on. This skill runs the update, undoes the damage, and surfaces everything that needs a human decision.

## What the update breaks (and this skill repairs)

`npx skills update` overwrites files under `.agents/skills/<skill>/` with upstream content, ignoring local edits (verified empirically: no warning, no conflict, the lock's computedHash does not protect you). It does not touch anything outside skill dirs: `.ai/`, `templates/`, `scaffold.sh`, `profiles/`, `.agents/AGENTS.md` are safe.

The remap this repo applies to mattpocock-sourced skills (documented in `.agents/AGENTS.md`):

- `docs/agents/issue-tracker.md` → `.ai/agents/issue-tracker.md`
- `docs/adr/` → `.ai/adr/`
- `CONTEXT.md` → `.ai/context/GLOSSARY.md` (and `CONTEXT-MAP.md` → `GLOSSARY-MAP.md`)
- `.scratch/<feature>/` → `.ai/features/<feature>/`

## Process

### 1. Preflight

- `git status --short` must be clean; if not, stop and ask the user how to proceed.
- Skills-store work is committed on `main`. If on another branch, say so and ask whether to continue here or switch.
- Ask for scope: all skills (`npx skills@latest update -p -y`) or a subset (`npx skills@latest update <skill...> -p -y`).

### 2. Run the update

Run the agreed command. Report which skills changed and which version they moved to.

### 3. Re-apply the remap (mechanical part)

```bash
bash extra/skills/update-skills/scripts/remap-matt-paths.sh
```

The script only touches skills whose `source` is `mattpocock/skills` in `skills-lock.json`, is idempotent, and prints a leftovers list at the end.

### 4. Agent pass (judgment part)

The script cannot fix prose and diagrams. Review the leftovers it reported plus `git diff` on the mattpocock skills, and hand-fix:

- Tree/diagram blocks showing `CONTEXT.md` or `docs/adr/`: rewrite them to the `.ai/` layout (see domain-modeling's File structure section for the target shape).
- Phrases like "at the repo root" around glossary/ADR paths: adjust to `.ai/context/` and `.ai/adr/`.
- References to `/setup-matt-pocock-skills` (not installed): replace with "ask the user where issues live and record it in `.ai/agents/issue-tracker.md`".
- Triage-label instructions (`ready-for-agent`) in to-spec/to-tickets: keep only where they describe a real tracker (GitHub/Linear); the local tracker uses `Status:` lines.

### 5. Health checks

Run all of these after the remap. They are the "things that end up broken":

a. **Broken dependencies** (a skill invoking a skill that is not installed):

```bash
grep -rn "Skill tool" .agents/skills/*/SKILL.md | grep -oE '"[a-z][a-z0-9-]+"' | tr -d '"' | sort -u
```

For every name found, check a directory exists in `.agents/skills/`. This is how domain-modeling and codebase-design were discovered missing.

b. **Tracker config exists**: `.ai/agents/issue-tracker.md` is present.

c. **Profile orphans** (installed skills no profile will ship):

```bash
ls .agents/skills/ | sed 's:/$::' | sort > /tmp/a.txt
grep -h -v "^#\|@include" profiles/*.list | sed '/^$/d' | sort -u > /tmp/p.txt
comm -23 /tmp/a.txt /tmp/p.txt
```

This skill lives in `extra/skills/` on purpose: it maintains this repo's canonical store and never ships to scaffolded projects (nothing in `extra/` is profiled or symlinked by `setup.sh`).

d. **Smoke test** (optional, when the profiles changed or a new skill was added):

```bash
TMP=$(mktemp -d) && ./setup.sh "$TMP" common && ls "$TMP/.agents/skills/" | wc -l && rm -rf "$TMP"
```

### 6. Report and ask

Present one compact report:

- Skills updated (old → new version where known) and files re-patched
- Leftovers hand-fixed in the agent pass
- Broken dependencies: `<skill> → <missing skill>`, each with the suggested install command (`npx -y skills@latest add mattpocock/skills --skill <name> -y`)
- Profile orphans with the suggested manifest (usually `common.list`)
- Anything else in the upstream diff that looks breaking (removed files, renamed entry points, new required config)

Then ask the user to choose: install missing skills / update profiles / commit on `main` / do nothing. Never install, add, or commit without an explicit pick from this list.

## Rules

- Never run `npx skills add` or `--all` without the user picking from the report.
- Skills-store changes are committed on `main`, never on feature branches.
- If the update was a no-op (nothing changed upstream), say so and stop: no remap, no report, no commit.
