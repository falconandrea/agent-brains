# `pi-agent-starter` and `moegpi` assessment

Date: 2026-09-21

Mode: assessment

Scope: compare both repositories with `agent-brains`, identify reusable ideas, and avoid installation or roadmap changes.

## Executive summary

Both projects are useful references, but neither is an alternative implementation of the `pi-brain` workflow engine.

- [`pi-agent-starter`](https://github.com/ArdaYILDIZ-DEV/pi-agent-starter/tree/ddd7376e0e1afb2f7bc558a49a863f2b42249565) is a turnkey personal Pi distribution: settings, personas, themes, extensions, hooks, skills, and subagent tooling.
- [`moegpi`](https://github.com/MOEG-5/moegpi/tree/1bd14539a913c75450081c0a241faf9e7c7ab123) is a shareable personal Pi setup with a careful installer, Exa search, and a small skill bundle.
- `agent-brains` is a deterministic orchestration system with explicit phase transitions, per-role capability boundaries, a repository lock, verification, independent structured review, bounded fix loops, run logs, and resume.

Neither upstream has the missing dynamic entry router that decides between a direct answer, clarification/grilling, quick implementation, a spec, or the full feature workflow. They provide ingredients for that future layer, not the layer itself.

The highest-value ideas are:

1. a bounded, persistent goal controller inspired by `pi-agent-starter`;
2. immutable subagent loadouts and explicit `waiting`/`stalled` lifecycle states;
3. `moegpi`'s installer preflight, preview, backup, and credential-safety patterns;
4. a structured “consult a stronger model” escalation policy;
5. selected UX ideas from standalone review and temporary prompt modes.

Wholesale installation of either repository would duplicate local capabilities, weaken some existing invariants, and import a personal configuration with unpinned dependencies.

## Baseline: what `agent-brains` already does better

The local architecture deliberately keeps orchestration deterministic. Models work inside phases; code owns transitions. The current `/feature` path provides:

- approved planning before implementation;
- curated context by role;
- one writer per repository;
- developer capability restrictions;
- deterministic checks before model review;
- a fresh reviewer context with structured output;
- bounded developer/reviewer retries;
- persisted events and interruption recovery;
- final human inspection before commit.

Relevant local sources:

- [`docs/pi-brain/ARCHITECTURE.md`](../pi-brain/ARCHITECTURE.md)
- [`docs/pi-brain/README.md`](../pi-brain/README.md)
- [`src/workflows/feature.ts`](../../src/workflows/feature.ts)
- [`src/run-lock.ts`](../../src/run-lock.ts)
- [`src/pi/pi-agent-runner.ts`](../../src/pi/pi-agent-runner.ts)

The two upstream repositories do not offer an equivalent state machine or the same review and safety invariants.

## 1. `pi-agent-starter`

### Snapshot and shape

Assessed at commit [`ddd7376`](https://github.com/ArdaYILDIZ-DEV/pi-agent-starter/tree/ddd7376e0e1afb2f7bc558a49a863f2b42249565). The root repository is MIT licensed and had only two commits at the snapshot. Its submodules have their own histories and licensing and must be assessed independently.

The project is a complete replacement for a user's Pi configuration rather than a composable workflow package. It bundles:

- personas and agent definitions;
- themes and TUI customisation;
- `goal`, `review`, tool-toggle, prompt-editor, question, and provider extensions;
- `interactive-subagents`, `cc-ui`, prompt snippets, and a bash guard as Git submodules;
- a read-before-edit hook;
- several third-party Pi packages with semver ranges rather than an exact lock policy.

The root [`npm/package.json`](https://github.com/ArdaYILDIZ-DEV/pi-agent-starter/blob/ddd7376e0e1afb2f7bc558a49a863f2b42249565/npm/package.json) includes overlapping packages such as `pi-lens`, `pi-web-access`, and other UI/automation packages. Installing the bundle globally would make it harder to know which component owns compaction, tool policy, diagnostics, or context injection.

### A. Persistent goal controller — high-value concept, reimplement

[`extensions/goal.ts`](https://github.com/ArdaYILDIZ-DEV/pi-agent-starter/blob/ddd7376e0e1afb2f7bc558a49a863f2b42249565/extensions/goal.ts) is the most relevant component for the desired “open Pi, state an objective, and let the harness coordinate the work” experience.

It provides:

- goal state persisted as custom session entries;
- reconstruction from the active session branch;
- active, paused, blocked, usage-limited, budget-limited, and complete states;
- elapsed-time and token accounting;
- a status display;
- automatic continuation after `agent_end` while a goal remains active;
- model tools to create, inspect, and update the goal.

This is useful as a model for a future `GoalController`, but the file should not be dropped into the current harness:

- continuation can be unbounded when no budget is supplied;
- the model is responsible for declaring terminal status correctly;
- token accounting is approximate;
- there are no repository safety gates equivalent to the feature workflow;
- there are no focused tests for the extension in the parent repository;
- a long autonomous loop can spend tokens without demonstrating progress.

The local version should therefore be workflow-owned rather than a free-running parent-agent loop. A safe contract would include turn, token, elapsed-time, and no-progress limits; explicit pause points; persisted evidence; and dispatch into existing deterministic workflows.

Recommended timing: after the entry router and quick workflow are defined, not before. A goal supervisor without a routing policy would merely automate repeated turns in an otherwise unstructured loop.

### B. Interactive subagent lifecycle — import semantics, not runtime

[`pi-interactive-subagents`](https://github.com/ArdaYILDIZ-DEV/pi-interactive-subagents/tree/735b03fa7dfa9b1b12df1b02ce0eafd032b53b98) supports tmux-backed child sessions, steering, child-to-parent questions, nested-spawn allowlists, progress status, stable names, resume, and pane cleanup.

The strongest ideas for the future Herdr/subagent layer are:

- distinguish `starting`, `active`, `waiting`, and `stalled`;
- persist the exact child loadout so resume cannot silently gain tools;
- maintain stable public child names independently from process identifiers;
- make liveness and cleanup visible;
- provide a deliberate question channel back to the coordinator.

Adopting the package itself would introduce a second orchestration runtime, tmux as a hard dependency, and child sessions whose extension surface is broader than the current explicit `PiAgentRunner` allowlists. Those trade-offs conflict with the local one-writer and least-capability design.

The dependency-free unit tests that could run locally passed. Two test files could not load because the cloned submodule did not have its Pi/TypeBox peer dependencies installed; this was not treated as an upstream functional failure.

### C. Standalone review UX — borrow target selection only

[`extensions/review.ts`](https://github.com/ArdaYILDIZ-DEV/pi-agent-starter/blob/ddd7376e0e1afb2f7bc558a49a863f2b42249565/extensions/review.ts) supports uncommitted changes, a base branch, a commit, a pull request, or selected folders, with reusable review instructions and an optional fix loop.

Useful additions to the local review UX would be:

- a target selector for reviews outside `/feature`;
- explicit snapshot-versus-diff wording for folder review;
- reusable project review instructions;
- smart defaults based on the current Git state.

The upstream loop should not replace the local reviewer. It uses a less structured same-session flow, parses findings heuristically, and can check out a pull request into the current working tree. The local fresh reviewer, typed result tool, deterministic verification, diff-integrity checks, and bounded fix policy are stronger.

### D. Bash guard — reject current version, retain the requirement

[`pi-safe-bash-guard`](https://github.com/ArdaYILDIZ-DEV/pi-safe-bash-guard/tree/d8e460003694081f07013193f1ca3c861e75546a) is MIT licensed and attempts to inspect both model tool calls and user shell commands. The design is relevant for a future quick workflow or the interactive parent session, where shell access may exist.

However, its own test suite failed at the assessed commit. Reproduced failures included dangerous commands embedded in inline Python/Node/Ruby/Perl/PHP, process substitution, braced `${USER}` path expansion, and one performance threshold. A heuristic command parser is also not a sandbox.

Consequences:

- do not install this release into the default setup;
- do not use it as justification for broadening child shell capabilities;
- retain “parent/quick shell guard” as a requirement;
- reassess only after upstream fixes and a local adversarial corpus pass.

The current developer child having no shell remains the safer enforcement mechanism.

### E. Prompt snippets and UI — optional, lower priority

[`pi-prompt-snippets`](https://github.com/ArdaYILDIZ-DEV/pi-prompt-snippets/tree/ffafbc1897255868ab1bb2bacc75ff21fce450b0) offers deterministic temporary prompt additions. The useful idea is to activate a controlled mode such as `quick`, `planning`, `debugging`, or `security-review` for one route or turn. Project-local prompt overrides should not automatically outrank trusted harness instructions, because an untrusted repository can turn that into prompt injection.

[`cc-ui`](https://github.com/ArdaYILDIZ-DEV/pi-cc-ui/tree/672243422e2b77af980171b6c75e858e39cc56fb) contains good status, token-rate, cache-timer, and compact diff-rendering ideas. These are TUI polish rather than orchestration. Several tests could not load without peer dependencies in the standalone clone, and a timing-sensitive performance test failed on this machine. It is not a current roadmap priority, especially while Herdr is the likely future UI surface.

### F. Components not worth importing

- `tools.ts`: dynamically toggling the session's global tools can undermine per-role allowlists.
- `prompt-editor.ts`: model-mode UX is reasonable, but its short mtime-based stale-lock takeover is weaker than the local process-liveness lock invariant.
- read-before-edit shell hook: raw path logging in `/tmp` does not handle freshness, hashes, normalisation, symlinks, or partial reads robustly; the previously assessed `pi-lens` design is a better reference.
- provider-specific Kilo integration and personal personas/themes: preferences, not harness architecture.
- `sync-from-local.sh`: broad copying and best-effort submodule updates are not a safe distribution mechanism.

### Disposition

Use the goal state model and subagent lifecycle semantics as design references. Consider target-selection UX for a future standalone review command. Do not install the complete configuration or the current bash guard.

## 2. `moegpi`

### Snapshot, licence, and shape

Assessed at commit [`1bd1453`](https://github.com/MOEG-5/moegpi/tree/1bd14539a913c75450081c0a241faf9e7c7ab123). The repository had one commit at the snapshot and does not declare a licence or contain a `LICENSE` file. Its source must therefore be treated as reference-only unless the author grants permission; concepts can be reimplemented, and separately licensed upstream packages can be evaluated independently.

The project bundles an installer, personal agent instructions and model choices, Exa web search, several skills, and external packages. Its README explicitly says the setup is not version-locked and that it was originally built around Pi 0.85.1.

### A. Installer discipline — strongest immediate source of ideas

[`scripts/install.py`](https://github.com/MOEG-5/moegpi/blob/1bd14539a913c75450081c0a241faf9e7c7ab123/scripts/install.py) provides several behaviours absent from the local [`setup.sh`](../../setup.sh):

- preflight dependencies and bundle completeness before mutation;
- honour a custom Pi directory;
- preview exact create/replace targets;
- confirm resources separately;
- refuse non-interactive mutation unless `--yes` is explicit;
- stage selected resources before deleting destinations;
- create unique recovery backups outside extension/skill discovery paths;
- preserve the contents behind a symlinked settings file;
- document that a package-install failure can leave partial changes.

The local script is already less destructive because it primarily creates symlinks and skips real existing directories. It should not be replaced by the Python installer. The worthwhile local improvements are smaller and native to the existing design:

1. add `--dry-run` or an exact preview;
2. preflight manifests and canonical skill targets before changing the destination;
3. make non-interactive approval explicit if future operations become destructive;
4. record any changed paths and recovery instructions;
5. add integration tests using temporary target repositories;
6. avoid deleting all existing profile symlinks until the new desired link set is validated.

This is a real local gap: `setup.sh` has profile parsing logic but almost no behavioural test coverage for mutation, cancellation, conflicting files, or reruns.

Verification at the assessed commit:

- all 10 Python installer tests passed;
- all 3 credential helper tests passed.

### B. Credential handling — reuse the security properties

The Exa helper is a good security reference even if Exa itself is not adopted. It:

- prefers environment credentials;
- edits only the intended provider entry;
- refuses malformed JSON rather than replacing it;
- refuses a symlink target;
- uses an exclusive lock directory;
- writes to a temporary file and renames atomically;
- enforces mode `0600`;
- preserves unrelated providers;
- accepts hidden installer input instead of putting the key in process arguments.

These properties should become requirements for any future provider credential helper. They do not justify adding another web-search backend now; `pi-search-hub` and the existing web tooling are broader candidates.

### C. `consult` escalation — useful for the dynamic harness

The bundled [`consult` skill](https://github.com/MOEG-5/moegpi/blob/1bd14539a913c75450081c0a241faf9e7c7ab123/files/skills/consult/SKILL.md) defines a bounded escalation to a stronger model for:

- a genuine reasoning gap;
- conflicting evidence;
- repeated failed approaches;
- consequential uncertainty.

It packages the objective, constraints, attempts, evidence, and desired decision; gives the consultant read-only tools; and treats its answer as advice that still requires verification.

That policy fits the planned dynamic router well. A local version could become an `oracle` or `consult` route after the initial classifier, or trigger when the no-progress detector fires. It should use the existing role/model configuration rather than the upstream hardcoded model, and it must not bypass human approval or deterministic verification.

This is complementary to grilling:

- grill asks the user when product intent is missing;
- consult asks another model when the intent is known but technical reasoning is stuck;
- deterministic checks remain the source of validation.

### D. Exa search and domain skills — no current need

The Exa extension is bounded, abort-aware, and has good auth tests, but it introduces a commercial provider and only covers search, not a complete search/read abstraction. It would also not automatically make the tool available inside programmatic `pi-brain` children. There is no current reason to add it alongside the broader search work already assessed.

The Android, YouTube transcript, and design skills are domain additions rather than harness primitives. They should be added only for concrete project demand, after checking overlap with the existing skill catalogue.

### Disposition

Reimplement installer safety and consult-escalation semantics. Preserve the credential helper's security requirements for future integrations. Do not copy unlicensed source or install the personal bundle.

## Comparative fit

| Capability | `agent-brains` | `pi-agent-starter` | `moegpi` | Action |
|---|---|---|---|---|
| Deterministic feature state machine | Strong | None | None | Keep local |
| Verify before independent review | Strong | Generic review loop | None | Keep local |
| Resume/run evidence | Workflow event log | Goal/session state | Installer backups only | Extend local goal semantics |
| Dynamic request router | Planned, not implemented | None | None | Still must be built locally |
| Long-running autonomous goal | Partial workflow resume | Strong concept, weak bounds | None | Reimplement after router |
| Subagent lifecycle visibility | Limited | Strong tmux UX | External package | Borrow status/loadout semantics |
| Installer safety/tests | Basic symlink safety | Destructive turnkey setup | Strongest of the three | Harden local setup selectively |
| Shell safety | Capability denial in child | Heuristic guard currently failing tests | Relies on environment | Keep denial; research parent guard |
| Escalation/oracle policy | Not formalised | Personas | Strong `consult` policy | Add as future route |
| Credential handling | Not central today | Personal config | Strong Exa helper | Make future requirement |

## Recommended adoption slices

### Near term

1. Keep the current `pi-vcc` trial and dynamic-router work ahead of these repositories.
2. Add a focused hardening ticket for `setup.sh`: dry-run, preflight, atomic desired-state calculation, and temp-directory integration tests.
3. Record a provider-credential contract based on `moegpi`: no argv secrets, refuse symlinks/corrupt data, preserve unrelated entries, lock, atomic rename, and `0600`.

### Dynamic harness phase

4. Define a Pi-free `EntryDecision` for `direct | grill | quick | spec | feature | consult`.
5. Define a Pi-free `GoalState` and bounded continuation policy: max turns, tokens, elapsed time, repeated-failure threshold, and explicit pause/stop states.
6. Make the goal controller dispatch existing workflows; do not let it become an unrestricted recursive chat loop.
7. Add `consult` as an advisory, read-only escalation path. It cannot skip verification or human gates.
8. Carry immutable tool/model/loadout snapshots across child resume and expose `waiting` versus `stalled` status.

### Optional later trials

9. Add standalone review target selection while reusing the local structured reviewer.
10. Reassess a shell guard only after its full upstream suite passes and it survives a local bypass corpus.
11. Evaluate UI metrics/diff rendering only when the Herdr interaction model is clearer.

## Upgrade compatibility

Updating Pi is not an architectural blocker. These repositories reinforce that an update is likely necessary for some current ecosystem packages. It should still be a separate compatibility tranche because the important question is not whether Pi installs, but whether session events, child tools, human-question bridges, model resolution, and resume semantics remain unchanged.

Minimum acceptance for a Pi update:

- unit tests pass;
- the Pi API spike passes;
- one real `/feature` run completes through developer, verification, review, and final handoff;
- child tool allowlists and reviewer read-only behaviour are rechecked;
- cancellation and resume are exercised.

## Risks and reversibility

- Both upstreams are young snapshots and use external packages that can move independently.
- `pi-agent-starter` is MIT at the root, but each Git submodule has separate provenance.
- `moegpi` has no declared licence, so implementation copying is off limits without permission.
- Installing either global bundle would be harder to reverse and debug than importing one isolated concept.
- Goal auto-continuation raises cost and runaway-loop risk.
- A heuristic shell guard can produce false confidence; capability denial and sandboxing remain primary controls.
- Installer changes are readily reversible if developed against temporary projects and kept symlink-based.
- `consult` is reversible when expressed as an optional routing adapter rather than a core dependency.

Overall verdict: selectively import.
