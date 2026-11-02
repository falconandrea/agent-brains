# Global general workflows — tasks

Status: approved jointly with spec.md on 2026-11-01, including all five
residual assumptions

All tasks are future work. A shell-capable implementation session executes
checks with rtk; a Pi role without shell tools hands checks to the orchestrator
and reports them as unexecuted until evidence arrives. Preserve the existing
dirty files. No task authorizes another consumer rollout, commit or push.

## T1 — Establish resource and precedence contracts

Status: done (2026-11-01, implementation session; observed contracts recorded
privately beside the T1 fixture evidence, summary to be referenced from
migration plan §11 at T8). Original gate: joint document approval and a fresh
implementation session — satisfied by the recorded approval and rechecked
baseline. Affected areas were: adapters/opencode/agents (new); existing
adapter fixtures and tests/repo.test.ts; reference spec.md evidence and
matrix. Versions rechecked (0.166.0/2.2.5/0.85.1 — gate
holds); effective roots inspected without reading config values. Key observed
contracts: OpenCode registers project/global markdown agents with
`description`+`mode: primary` (native `skill` tool loads by exact ID; project
scope shadows user scope for skills and commands; markdown agent file wins
over a same-name `opencode.json` declaration; `permission.skill: "deny"`
blocks loading with no filesystem fallback; `opencode agent list` does not
exist in 2.2.5 — `debug agents` is the probe). Codex user-scope `$name`
injects `skills.selected_skill_instructions`; a same-name project skill
shadows the route with NO injection (observed twice); project-only names
inject from project scope; outside Git requires `--skip-git-repo-check`.
Pi discovers user scope without project trust, project scope (winning
collisions) with `--approve`; project package declarations load extension
commands; `--no-skills` disables expansion. Non-Git CWD validated for all
three. Limits: Pi available-skills catalog listing not exposed in `--mode
json` (provenance taken from expansion/tool events); Pi project-only skill
discovery confirmed indirectly.

Recheck installed versions and effective config roots without copying secrets.
In isolated harness homes, establish valid primary-agent metadata and native
skill-by-name loading for all seven W names. Exercise same-name project/global
skills, agents and commands, JSON declarations, permissions disabling the skill
tool and Pi package duplication/overrides. Record actual winners independently
per resource/harness. Validate behavior outside Git using CWD as root.

Verification: native registration/selection and tool provenance, not filesystem
presence; focused fixtures plus typecheck if typed fixtures change. Gate further
work on supported 0.166.0/2.2.5/0.85.1 behavior or an approved spec revision.
Acceptance: AC2, AC3, AC6; assumptions 2–5.

## T2 — Make OpenCode workflow entry points portable

Status: done (2026-11-01, implementation session). Seven canonical adapters
added under `adapters/opencode/agents/` (frontmatter `description` +
`mode: primary`; body loads the exact native skill ID; no model, permission or
tool override; no delegation surface; no `$ARGUMENTS`). Legacy
`.opencode/agents/<name>.md` pointers replaced by symlinks to the canonical
adapters (one source of truth; consumers linking `.opencode` inherit portable
behavior). Planning command untouched and still forwards `$ARGUMENTS`. Three
legacy flat skill pointers and package material preserved. `.agents/workflows`
compatibility symlinks retained. Structural guards revised in
`tests/repo.test.ts`: adapter set must mirror the workflow set, adapters must
be portable primary agents loading skills by native ID without project-local
`.agents` references, pointers must resolve to the canonical adapters, and the
planning command separation is pinned. Verification observed: 13/13
`tests/repo.test.ts`; from a consumer-like fixture linking `.opencode`, all
seven agents registered `primary` (`opencode debug agents`) and `--agent
laravel` selected the agent with a native `skill` tool event whose content
came from the global catalog (`~/.agents/skills/laravel`); `rtk npm test`
463/463; `rtk npm run typecheck` clean; `rtk git diff --check` clean.
Acceptance: AC2 (global placement re-proven after install at T5/T6), AC4
(diagnostic-only probes), AC9.

Supply seven canonical selectable primary agents loading W by native skill ID.
Make legacy agent pointers portable too. Keep the planning command independent,
forward arguments and preserve explicit handoff. Add no model/default-agent
override, implicit delegation or permission grant. Keep three legacy flat skill
pointers and package material outside global distribution. Retain compatibility
workflow symlinks and revise structural guards to enforce portable loading,
catalog/license ownership and explicit resource separation.

Verification: focused adapter/structural checks and isolated native listing,
selection and skill-tool events for seven agents and the separate command;
`rtk npm test`, `rtk npm run typecheck` for catalog/reference changes.
Acceptance: AC2, AC4, AC9.

## T3 — Extend one-time machine installation and recovery

Status: done (2026-11-01, implementation session). `install-global-skills.sh`
now manages the seven agent adapters (preview/apply/doctor/rollback +
manifest entries `.config/opencode/agents/<name>.md`), registers this
checkout as a global Pi package through `pi install` when `pi list` shows no
such registration (never recorded as owned when pre-existing), honors
`PI_CODING_AGENT_DIR` as a reported root override, and ends with an explicit
`RESULT: COMPLETE`/`RESULT: INCOMPLETE` verdict (non-zero exit when
incomplete). Relocated checkouts are detected from manifest evidence and
refused without mutation for apply/rollback/doctor, with documented manual
recovery (automated rebind deferred). Doctor additionally reports obsolete
managed sources and a missing managed Pi registration as incomplete states
(no auto-prune). Rollback removes only recorded unchanged links plus only the
Pi registration it recorded, preserving foreign/subsequent settings even when
`pi` is unavailable (manual-recovery message). Verification observed
(fixture homes only; no real-home apply): 20/20 `tests/global-install.test.ts`
covering idempotent apply, pre-existing registration byte-preservation,
registration+rollback with a concurrent foreign entry, missing-pi INCOMPLETE
plus rerun completion, occupied/dangling agent destinations, old-format
manifest readability + rerun adding new resources, moved checkout refusal
without mutation, obsolete/missing-registration diagnostics, repeat rollback
no-op, plus the pre-existing conflicts/partial-write/symlink-parent/invalid-
manifest cases (two updated to the INCOMPLETE contract). `rtk proxy bash -n
install-global-skills.sh`, `rtk npm test` 472/472, `rtk npm run typecheck`,
`rtk git diff --check` clean. Bugs found by fixtures and fixed during the
task: a missing `return 1` marking every skill as an OpenCode-duplicate
conflict, a doubled `.md` suffix in relocation evidence, and path
normalization for the recorded Pi settings entry. Acceptance: AC1, AC6, AC7.
Machine delta itself remains unapplied until the reviewed preview in T5.
Review round 1 (2026-11-01, independent): four P2 findings, all corrected —
(1) relocation recovery now prints the complete procedure including the
stale-manifest archive step and every managed path, with a fixture walking
it to a successful reinstallation + clean doctor; (2) the OpenCode config
root honors `XDG_CONFIG_HOME` (verified against `opencode debug paths`),
is reported by every mode, and nothing lands in an unused location
(fixture asserts `~/.config/opencode` stays absent under the override);
(3) `--apply` now reports OBSOLETE managed sources and ends INCOMPLETE
without pruning (fixture); (4) AC5 claim downgraded to partial in T6/T8
(cancel/resume are unit-covered only, not live-observed).
Review round 2 (2026-11-02): apply and rollback now run the parent-symlink
check against the EFFECTIVE OpenCode destinations (parent of `GLOBAL_COMMAND`
and `GLOBAL_AGENTS`), honoring `XDG_CONFIG_HOME`; the override root is
canonicalized through its deepest existing ancestor first (macOS `/var` is
itself a symlink, which the reviewer's scenario exposed as a false refusal
until normalization). Dedicated fixture: with `$XDG/opencode` symlinked
elsewhere, both modes refuse with the standard message and leave external
links, contents and the manifest untouched; the redirect and recovery
fixtures were adjusted to the canonicalized/relative manifest form.
Installer fixtures 24/24.

Extend preview/apply/doctor/rollback and the managed-resource manifest for the
seven agents and existing command. Integrate missing global Pi package
registration through its package manager, preserving existing registrations and
unrelated settings; record ownership and recovery. Keep old manifests readable.
Detect effective root overrides, conflicts and missing harness executables;
report incomplete installation without overwrite. Retain interrupted-apply
journaling and conservative parent-link checks. Detect checkout relocation and obsolete/missing managed resources, report a
clear incomplete-state error and document safe manual recovery. Defer automated
repair/rebind and stale-resource reconciliation. Support explicit reruns for new
resources and safe rollback under concurrent config edits.

Verification: isolated homes only; idempotent apply, existing Pi registration,
partial install, interrupted write, invalid manifest, symlink parent, real and
foreign/dangling occupied paths, changed settings, old manifest, moved checkout,
missing source, stale resource and repeat rollback. Assert unchanged foreign
bytes and no partial restoration on late conflict. Run `rtk proxy bash -n
install-global-skills.sh`, focused fixture tests, `rtk npm test`,
`rtk npm run typecheck`. No real-home apply before a reviewed preview and
authorization in the implementation session.
Acceptance: AC1, AC6, AC7.

## T4 — Align optional setup, templates and user guidance

Status: done (2026-11-01, implementation session). README "Global skill
distribution" rewritten: one machine-install route covering skills + command +
seven agent adapters + missing-Pi registration, the per-harness invocation
matrix (Codex `$name`; OpenCode skill tool + primary agents + `/spec-and-tasks`;
Pi `/skill:<name>` + existing package commands), the COMPLETE/INCOMPLETE
verdict with rerun semantics, explicit-update rule, relocation and
obsolete-resource manual recovery with deferred automation, rollback
ownership limits, and observed local-override precedence (project shadows
user scope; Codex same-name shadow suppresses `$name` injection; OpenCode
`permission.skill: "deny"`). The stale "installer does not register Pi"
paragraph corrected; the obsolete OpenCode-only workflow-path warning replaced
by the portable-adapter note (README + `setup.sh` + its guard test). Pi guide
"Cross-harness catalog distribution" updated for agents/Pi registration and
INCOMPLETE, preserving the historical M3 sentences as history.
`templates/AGENTS.md` inspected — already aligned (no change). Setup skill
inspected — no installer/profile claims to correct. The user's uncommitted
edits to progress.md and both plans were not rewritten. Verification:
`rtk proxy bash -n setup.sh`, `rtk npm test` 472/472, `rtk npm run typecheck`,
`rtk git diff --check` clean, link/reference checks pass, no personal paths
or secrets in newly changed public files. Acceptance: AC9; supports AC1/AC7.

Document one machine-install route, resource-specific invocation matrix,
conflict/incomplete status, explicit updates, manual relocation/obsolete-resource
recovery and rollback; identify automated repair/reconciliation as deferred.
Remove installation profiles from required onboarding; preserve legacy setup
and internal Pi role/stack profiles. Keep optional copy-if-missing scaffolding.
Explain generated project content ownership and prohibit whole-.opencode global
linking. Reconcile status against actual evidence without closing M3/M4 early
or rewriting the user's current uncommitted plan edits.

Verification: link/reference checks, public-path/secret scan and
`rtk git diff --check`; `bash -n` for changed scripts. For skill/reference edits
run `rtk npm test` and `rtk npm run typecheck`. Inspect setup/unlink preservation
fixtures if their behavior changes; any behavior expansion needs spec review.
Acceptance: AC9; supports AC1 and AC7.

## T5 — Prepare and verify reversible linkedin-analytics isolation

Status: done (2026-11-01, implementation session, under the user's explicit
machine/pilot authorization after preview review). Machine delta: installer
preview reviewed (0 conflicts, 7 agent links, skills/command already linked,
Pi already registered) then applied — RESULT: COMPLETE, `--doctor` clean.
Pilot (linkedin-analytics): dirty state inventoried (only its own
`.ai/memory/progress.md`; preserved); ownership proven for the two shared
links (`.agents/workflows`, `.opencode` — both resolve inside this checkout;
zero shared-skill links present, `.agents/skills` an empty real directory);
private snapshot added as a NEW sibling
`m4-linkedin-20261101/t5-global-workflows-20261101/` (inventory with exact
link text and metadata + conflict-safe `restore-workflows.zsh`), without
touching the existing 44-link backup. The restore script was conflict-tested
on a synthetic fixture BEFORE live use: occupied file, dangling link and a
last-entry conflict all abort with NO partial restoration; clean restore
verifies link-text equality. Live exercise: links removed (link objects only,
targets byte-identical), full live restore performed and inventory compared
(MATCH for both links), then the reviewed isolated state reapplied (both
shared links absent, project opencode.json/Boost/.ai/progress.md untouched)
and `--doctor` re-run clean. Acceptance: AC6, AC7, AC9.

Review installer preview and apply the approved machine delta. Inventory the
pilot's dirty state and local/shared/foreign/generated ownership; reconcile the
existing private 44-link backup without replacing it. Snapshot exact links and
affected content privately. Disable/remove only destination-proven shared
workflow and adapter links, with no shared-skill links present; preserve all
project-specific directories, opencode.json, Boost output, .ai and personal
resources. Exercise full conflict-safe restoration, compare original hashes and
link text, then reapply the reviewed isolated pilot state for T6/T7.

Verification: preflight all restore destinations; temporary conflict tests for
files, directories, live/dangling links and a last-entry conflict with no partial
restore; actual live restore and inventory equality; doctor after reapply.
Stop and restore on genuine native discovery failure. Do not use generic unlink
to remove mixed content or mutate canonical targets through consumer links.
Acceptance: AC6, AC7, AC9.

## T6 — Prove native CLI routes and preserved Pi behavior

Status: done for the CLI scope (2026-11-01, implementation session); T7
(interactive selection + running-session refresh) remains open. Evidence
summary recorded privately beside the transcripts
(`T6-EVIDENCE.md`); public-safe digest added to migration plan §11 at T8.
Fresh diagnostic-only sessions from pilot root and app/: Codex `$name`
matrix 8/8 injections of W+code-review from the canonical catalog with zero
filesystem commands (rollout metadata, multi-mention verified); OpenCode all
seven agents registered `primary` from the installed global links, skill-tool
matrix 8/8 completed from the global catalog per CWD, each of the seven
primary agents firing exactly its own skill id (one small-model flake on
solution-capture retried clean — recorded as model reliability, not
discovery; root matrix had already loaded the same skill), planning command
loading spec-and-tasks from both CWDs; Pi 16/16 `/skill:` expansions from the
global catalog (one expansion per message — multi-mention expands only the
first, observed) and `/stack` + `/flow status` handled locally by the
registered package from both CWDs with zero model usage. Disposable Git
fixture: planning's one joint approval + fresh-session handoff + HARD-GATE
reported with no writes; a workflow skill refused to implement without an
approved plan; code-review reported findings and modified nothing; Pi
`/feature` in the fixture gated implementation (planner drafts only, `src/`
untouched) with `agent.completed`+`workflow.failed` persisted in the exact
existing run schemas — observed limit: Pi `-p` makes the extension ctx stale
before an interactive cancel can happen (U8 guards contained it); interactive
gate/cancel stays covered by the existing unit suite (targeted 65/65; full
suite 472/472, typecheck clean). Pilot invariants re-asserted after all
probes: no shared skill/workflow/.opencode links, `opencode.json` untouched.
Acceptance: AC2, AC3, AC4, AC9 observed; AC5 partial (see T8 map — `/stack`,
`/flow status` and the gate observed; cancel/resume unit-covered only).

Start fresh sessions from pilot root and app/ in all three harnesses. Test every
W plus code-review through the matrix-native route; OpenCode additionally tests
each primary agent and the separate planning command. Use diagnostic-only
requests forbidding planning writes, implementation and delegation. Capture
versions, CWD, native entry/selection/expansion/tool provenance and source, not
just model claims or exits. Assert absent local shared skills/workflows and no
shared .opencode dependency before and after. Test `/stack` and `/flow status`
from both pilot CWDs. In disposable fixtures test planning approval/handoff,
approved-spec implementation input, review without fixes, Pi feature gate/cancel
and existing interrupted-run resume compatibility. Do not rewrite run schemas.

Verification: inspect native events and forbidden-action absence for every
matrix cell, compare preserved content inventories; targeted existing Pi
workflow/resume tests plus `rtk npm test` and `rtk npm run typecheck` if source
changes became necessary. Mark failures/unsupported routes explicitly.
Acceptance: AC2, AC3, AC4, AC5, AC9.

## T7 — Separate interactive selection from running-session refresh

Status: OPEN — deliberately not started (2026-11-01). No interactive
process, UI selector check, or running-session content update was performed;
nothing was substituted for it. The CLI-side prerequisites are all in place:
global agents/command/Pi installed and doctor-clean, pilot isolated, and the
launch commands in migration plan §11 remain the exact repetition procedure.
Original dependencies: T6 (done for CLI scope); interactive access and
authorization for a temporary canonical-source edit.
Affected areas: three harness UIs; private recordings/evidence; canonical
skill content only for an authorized reversible marker probe.

Run six new interactive processes from root/app/, inspect native selectors and
invoke the resources included in the proposal, including OpenCode agents and
command and Pi commands. Separately leave a GUI/TUI process running per harness
during a temporary harmless content update; observe reinvocation, reload and
restart as needed. Restore source byte for byte and check resumed/new sessions.
Record CLI, new interactive and already-running refresh outcomes separately.
If UI access is unavailable, leave this task and M3 open rather than substituting
another headless run. No automatic watcher or updater is introduced.

Verification: actual UI evidence, loaded-source/marker evidence and restored
hashes; no implementation in diagnostic sessions; no claim from filesystem-only
inspection. Check pilot local resources remain intact.
Acceptance: AC8, supports AC2, AC3 and AC9.

## T8 — Reconcile acceptance and hand off to independent review

Status: done as PARTIAL CLI handoff (2026-11-01, implementation session).
Acceptance map with evidence class: AC1 ✓ observed (installer fixtures:
idempotent complete apply incl. agents + Pi, rerun adds nothing; real apply
RESULT: COMPLETE); AC2 ✓ observed at CLI scope (registration/selection/tool
events for all seven agents + command from pilot root and app/; interactive
selector deferred to T7); AC3 ✓ observed (Codex 8/8+8/8 rollout metadata,
OpenCode 8/8+8/8 tool events + 7/7 agents + command, Pi 16/16 expansions,
zero local shared links before/after, versions/CWD/provenance recorded);
AC4 ✓ observed (fixture probes: joint-approval/handoff reporting, refusal to
implement without approved docs, review without fixes — no writes); AC5
PARTIAL — split by evidence class: observed live = `/stack` + `/flow status`
from both pilot CWDs and the fixture `/feature` gate holding (implementation
never ran; `agent.completed`/`workflow.failed` persisted in existing
schemas); covered ONLY by the existing unit suite, not observed live =
interactive approval cancel semantics and interrupted-run resume
compatibility (feature-workflow/resume/run-lock/flow-stop/run-start,
targeted 65/65 within 472/472) — these remain open as unproven-by-pilot
until T7 or a dedicated interactive fixture session; AC6 ✓ observed
(installer collision fixtures
byte-preserving + INCOMPLETE counting, T1 precedence winners per
resource/harness incl. permission-deny block); AC7 ✓ observed (all
listed failure modes in fixtures; live pilot restore + inventory equality +
reapply + doctor); AC8 OPEN (T7 not performed — interactive launches and
running-session refresh pending; M3 stays open); AC9 ✓ (public guidance
rewritten without personal paths; Pi profiles/config/commands/run artifacts
meaningful and unchanged; no other consumer touched; pre-existing dirty
baseline preserved). Historical observations (M3/§11 six-session pilot) kept
distinct from new evidence; assumptions 1–5 remain the approved contract.
Review round 1 (2026-11-01) corrections folded in: relocation recovery now
includes the manifest-archive step and is fixture-verified up to a
successful reinstallation; the OpenCode config root honors XDG_CONFIG_HOME
(verified against `opencode debug paths` on 2.2.5) and is reported;
apply ends INCOMPLETE when a managed source is obsolete (no auto-prune).
Checks at handoff: `rtk git diff --check` clean; documentation links/references
verified; privacy scan clean on changed public files; `rtk npm test` fresh
(re-run after review corrections); `rtk npm run typecheck` clean; `rtk proxy
bash -n` on both changed scripts. Native proofs come from T6, not unit
tests. Remaining M4 work is
unchanged in scope: other consumers and live per-consumer discovery remain
separately authorized work; nothing was rolled out beyond the pilot.
Independent review is requested separately from any fixes; do not commit or
push.

Map every AC to current evidence and distinguish historical observations,
documentation and assumptions. Review installer and pilot rollback evidence,
all preserved content and effective conflicts. Check no other consumer changed.
Run proportionate final checks; request independent review separately from fixes.
Report partial CLI delivery separately from full feature completion; keep T7,
AC8 and M3 open when interactive evidence is unavailable. Report remaining M4
work without expanding rollout. Do not commit or push.

Verification: `rtk git diff --check`, documentation references, privacy scan,
fresh tests/typecheck for catalog/installer changes and bash syntax for changed
scripts. Native proofs must come from T6/T7, never unit-test success alone.
Acceptance: AC1–AC9 reconciliation; report any pending criterion explicitly.

## Planning handoff

Approve spec.md and tasks.md together, including the five residual assumptions.
This ends planning and does not start T1. A fresh implementation session reads
AGENTS.md, current progress and both approved documents, rechecks Git state and
uses T1 as its first task. Independent review follows implementation; no tracker
publication, consumer rollout or automatic development follows this approval.
