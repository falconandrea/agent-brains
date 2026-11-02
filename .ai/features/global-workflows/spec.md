# Global general workflows

Status: approved — joint approval with tasks.md on 2026-11-01, including all
five residual assumptions
Date: 2026-11-01

## Goal and final behavior

After one machine installation from the canonical agent-brains checkout, a
user can open any project in Codex, OpenCode or Pi and explicitly invoke shared
skills and general workflows without project setup, installation-profile
selection or local links to shared content. Project instructions and context
continue to govern the work. No global default starts a workflow automatically.

Planning produces spec.md and tasks.md for one approval and a fresh-session
implementation handoff. Implementation consumes approved documents; review is
independent and does not silently become a fix session. Pi `/feature` remains
the separate orchestrated runtime with its existing approval/implementation
gate; it is not an alias for the planning skill.

An installation is complete only when the requested resources are available
without unresolved conflicts. A preserved conflicting resource may intentionally
override the shared one; diagnostics must describe this exception rather than
claiming universal availability.

## Scope and boundaries

Implement machine distribution, portable OpenCode adapters, diagnostics,
recovery and documentation. Validate only linkedin-analytics as the consumer
pilot. Migration of other consumers remains separately authorized M4 work.
Do not remove directories containing project resources. Preserve personal
skills, local agents, plugin registrations, configuration and Laravel Boost
output. Do not globally link `.opencode` or distribute its dependencies.
No automatic updater, background service, token saving or performance claim.
Keep Pi configs, role/stack profiles, commands, run schemas, historical planning
artifacts and resume semantics. Project scaffolding stays optional.

This planning session writes only this spec and tasks.md. No installation,
consumer mutation, link removal, commit or push is authorized by these files.
Approval of the pair ends planning; implementation requires a separate session.

## Baseline and evidence classification

Observed on 2026-11-01: `codex --version` reports 0.166.0, OpenCode reports
2.2.5, Pi reports 0.85.1. OpenCode version inspection required permission to
access its log; no configuration was changed. Repository tests/typecheck pin
the Pi SDK separately; the Pi guide identifies 0.84.2 as its checked baseline.
Do not equate installed CLI compatibility with SDK typecheck compatibility.

The working tree already had edits in `.ai/memory/progress.md` and both
migration/adoption plans. Preserve them. M3 interactive refresh and remaining
M4 migrations are open. Existing six-session CLI evidence in
[migration plan §11](../../../docs/plans/cross-harness-workflow-migration.md#11-m4-linkedin-analytics-global-catalog-pilot--2026-11-01)
is historical observed evidence, not a new test performed by this planning run.
It proves native skill loading from root and app/ without 44 local skill links;
it does not prove independence from the retained workflow/adapter links.

### Current resource inventory

| Resource | Physical/source form | Current distribution and meaning |
|---|---|---|
| Canonical skills | 66 directories with SKILL.md in `.agents/skills` | 66 per-skill global links in `~/.agents/skills`; contains local-authoritative and lock-managed upstream content; preserve licenses, provenance and skills-lock.json |
| Personal skill | Real `diagnose` directory alongside global links | Not owned by this catalog; preserve |
| Optional extras | `extra/skills/{humanizer,test-review,ponytail-review,update-skills}` | Manual extras, outside default global catalog/profiles; do not silently promote |
| Workflow aliases | Seven symlinks in `.agents/workflows`: astro, laravel, nextjs, setup, solution-capture, spec-and-tasks, start | Each points to `../skills/<name>/SKILL.md`; alternate paths to instructions, not executable engines |
| OpenCode agents | Seven real Markdown pointers in `.opencode/agents`, with those same names | Read consumer-relative `.agents/workflows/<name>.md`; this creates the remaining local dependency |
| Legacy OpenCode skill pointers | Three real flat Markdown files in `.opencode/skills`: astro, designer, product-thinking | Read `.agents/skills/...`; not equivalent to native directory-form SKILL.md discovery; exclude from global exposure |
| OpenCode command | Real `adapters/opencode/commands/spec-and-tasks.md` | Global single-file link under `~/.config/opencode/commands`; invokes native skill by ID and forwards arguments; independent of agent selection |
| OpenCode package material | `.opencode/package.json`, package-lock.json, .gitignore; generated node_modules | package.json depends on `@opencode-ai/plugin` 1.15.10; generated dependency tree is not a workflow. Do not expose globally |
| Pi engine | `extensions/pi-brain.ts`, src/, root package.json | Pi package exports extensions and canonical skills; global package registration supplies runtime commands |
| Profiles | `profiles/*.list`, includes and full special case | setup.sh installation selections AND Pi role/stack routing inputs; these purposes must remain distinct |
| Project knowledge | Real AGENTS.md, `.ai`, optional project configs | Project-owned, never replaced by catalog installation |
| Third-party project generation | Boost rules, MCP configuration, generated skills/adapters where present | Remains in its project; never redirect generator writes through catalog links |

Live read-only consumer inspection confirmed `.agents/workflows` and `.opencode`
links into this checkout in linkedin-analytics, ga-analytics, itinerary-ai,
ardizio-design, andreafalcon.dev, appuntidalgiappone, craftcv.online,
careguru-brain and careguru/carefinder-backend. Real opencode.json is present
in linkedin-analytics, ga-analytics, itinerary-ai, careguru-brain and the backend;
absent in the other four inspected roots. These are link/config-presence checks,
not content validation or a fresh exhaustive M4 inventory. The authoritative
larger consumer list remains migration plan §7; no migration is inferred here.

linkedin-analytics currently has no local shared-skill links, but retains both
shared workflow and `.opencode` links. Its real opencode.json supplies Sail Boost
MCP according to §11. Project `.pi` and `.codex` were absent in that pilot.
Global OpenCode agents directory is currently empty; the global planning command
is present. Existing Pi registrations, including a third-party package, remain
outside installer ownership unless explicitly adopted through a reviewed plan.

### Dependency reconstruction

1. Skill discovery: scanners load global SKILL.md directories. Neither
   `.agents/workflows` nor OpenCode agent files are required for that scanner.
2. Command invocation: OpenCode `/spec-and-tasks` expands a command template
   which requests the native skill tool. It does not select a dedicated agent
   today and does not require `.agents/workflows`.
3. Agent selection: current OpenCode workflow agents instruct the model to read
   project-relative workflow paths. Removing workflows alone breaks these
   adapters; removing `.opencode` alone removes their local selection surface.
4. Pi orchestration: PACKAGE_ROOT resolves profiles and canonical skills from
   the installed package; repoRootOf resolves the consumer Git root from CWD,
   falling back to CWD outside Git. Roles receive explicit routed skill inputs.
   `/feature`, `/flow`, `/stack` are extension commands, not workflow symlinks
   or OpenCode agents. No consumer workflow link is needed by this wiring.

## Official mechanisms and limits

Documentation fetched 2026-11-01 is current documentation, not necessarily a
versioned guarantee for every installed binary. New native pilot evidence must
close any gap before declaring the design delivered.

- [Official Codex skills documentation](https://learn.chatgpt.com/docs/build-skills)
  documents user scope at `~/.agents/skills` and explicit `$name` invocation.
  `allow_implicit_invocation: false` retains explicit loading. Existing §11
  provenance confirms native user-scope loading even when the initial model
  catalog omits spec-and-tasks. Do not add a Codex agent/command layer.
- [Official OpenCode skills](https://opencode.ai/docs/skills/),
  [agents](https://docs.opencode.ai/docs/agents/) and
  [commands](https://opencode.ai/docs/commands/) document distinct native
  resources: skill tool, global agent Markdown and global command Markdown.
  Agent mode can restrict an adapter to primary selection; commands default to
  the current agent unless configured otherwise. Existing §11 proves only the
  standalone planning command and native skill path, not new global agents.
- [Official Pi skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)
  and [packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
  document global skills and package resources. Installed 0.85.1 docs also
  confirm `~/.agents/skills`, `/skill:name`, user package registration and
  project package overrides. Installed extension docs describe `/reload`.
  Existing §11 proves native planning-skill loading; this feature must still
  validate package commands and interactive refresh independently.

Do not promise one precedence rule across harnesses or resource types. Inventory
same-name skills, agents, commands, JSON declarations and package registrations;
test the effective winner on each supported installed harness. Local overrides
and disabled skill tools may intentionally block the shared route. Preserve
them and report the observed cause; do not override permissions to force success.

## Proposed minimum and rationale

Keep the existing global catalog and installer entry point. Add an allowlisted
set of seven global OpenCode agent adapters under `adapters/opencode/agents`.
Each uses native skill loading by the corresponding exact name, contains valid
OpenCode metadata and is explicitly selectable as a primary agent. No default
agent change, model pin, automatic delegation, tool grant or broad permission
change. Primary-only mode avoids exposing these workflow entry points as
automatically delegated subagents. Agent prompts preserve planning, execution
and review boundaries without duplicating full canonical skill bodies.

Retain only the existing `/spec-and-tasks` command; additional slash aliases
are unnecessary for the outcome. It continues to run in the current agent and
must load the planning skill by ID. Seven agents preserve the existing OpenCode
selection surface; commands and agents are deliberately tested separately.
Update the legacy `.opencode/agents` pointers to use the same portable native
loading behavior so compatibility setup no longer creates a workflow-path
dependency. Keep `.agents/workflows` aliases available to old consumers; this
feature does not authorize deleting the canonical compatibility directory.

For a fresh machine, one documented machine-install procedure covers global
skills, selected OpenCode adapters and global Pi package registration. Reuse
Pi's package manager rather than copying its extension into consumer projects.
The installer must recognize an existing registration and preserve other
packages/settings. Extend the existing entry point with reviewed orchestration
of the missing Pi registration, backed by settings recovery; do not claim the
current skill installer already registers Pi. Missing harness executables yield
explicit incomplete status and a safe rerun path, not false success.

### Final resource and invocation matrix

Let W = astro, laravel, nextjs, setup, solution-capture, spec-and-tasks, start.

| Harness | General skills/workflows | Commands | Agent/role surface | Global source |
|---|---|---|---|---|
| Codex | `$<name>`, including every W and code-review | No new custom slash commands | No new Codex agent definitions | Per-skill links in `~/.agents/skills` |
| OpenCode | Native skill tool by exact name, including W and code-review | `/spec-and-tasks` only | Seven selectable primary agents W, each loading its native skill; independent review uses code-review in a fresh session | Skills plus individual files in global agents/commands directories |
| Pi | `/skill:<name>`, including W and code-review | Existing `/feature`, `/flow`, `/stack` from package | Internal planner/developer/reviewer roles, config and routed skills unchanged | Global catalog plus registered canonical package |

`setup` is an optional context/bootstrap workflow, never a prerequisite for
discovering other workflows. A workflow name does not imply the same command
syntax across harnesses. No new `/feature` planning alias is introduced.

## Profiles and affected code

The global installer already enumerates the entire catalog rather than choosing
an installation profile. Remove profile choice from the normal documented user
journey; retain manifests and src/profiles.ts / src/skill-router.ts unchanged in
meaning for Pi role/stack filtering. Keep setup.sh <project> <profile> and
unlink.sh as explicitly legacy compatibility tools, not required onboarding.
Do not delete manifests merely because their installation use becomes optional.

Real code impact:

- install-global-skills.sh currently hardcodes one COMMAND_SRC/GLOBAL_COMMAND
  and manifest accepts only skill paths plus that command. Extend its allowlist,
  preview/apply journal, manifest validation, doctor and rollback for agents and
  Pi registration ownership; retain the CLI and old manifest readability.
- Current source validation binds manifest entries to this checkout's absolute
  path. A moved checkout currently cannot simply adopt the old manifest. Detect and report
  this state without mutation; document manual recovery using recorded old/new
  source evidence. Automated repair/rebind is deferred.
- setup.sh links `.opencode` and curated workflows, or whole `.agents` for
  full; unlink.sh removes only destination-owned links. Preserve conservative
  legacy behavior. Any pilot migration needs a separate narrow, reviewed
  removal/backup operation, never a blanket unlink of mixed local directories.
- scaffold.sh uses copy-if-missing; keep scaffolding optional and preserve local
  content. Update templates/AGENTS.md, setup skill and README/Pi guide references
  that imply local setup or profile selection is required.
- tests/repo.test.ts currently enforces README workflow pointers to local
  workflow paths; revise that invariant for portable adapters while preserving
  aliases, profile coverage, lock ownership and license guards.
- tests/setup-unlink.test.ts and global-installer fixtures are existing recovery
  test boundaries. Add behavioral cases there rather than testing Markdown
  wording alone. No Pi runtime redesign is needed.

## Compatibility, conflicts and recovery

Preview is read-only and lists planned resources, occupied paths, source and
effective-scope conflicts. Preserve real files/directories and foreign/live or
dangling symlinks; a matching name alone never establishes ownership. Detect
symlinked destination parents before mutation. Support default config locations;
detect environment-overridden roots and either use a verified explicit root or
stop with an actionable unsupported-root message. Never silently install into an
unused location. Do not copy global config or secrets into public reports.

Updates are explicit. Content edits flow through links on native reload/restart;
new resources require an explicit installer rerun. Renamed, missing or obsolete
managed resources require detection, a clear incomplete-state diagnostic and a
documented manual recovery procedure. Automated stale-resource reconciliation
and removal are deferred; never prune foreign content. Partial or
interrupted apply must remain diagnosable and recoverable. Validate the complete
manifest and all rollback destinations before mutation; retain the journal until
the durable manifest is installed. Conflicts produce incomplete status.

Rollback removes only recorded, unchanged owned links and restores only installer
changes to Pi registration, preserving unrelated or subsequently edited settings.
Pre-existing package registration is not owned and must survive rollback.
If concurrent edits prevent safe restoration, stop with a recovery diagnostic,
without replacing the settings wholesale. Test old-manifest upgrade, a moved
checkout, missing sources and repeated apply/rollback. Never infer ownership of
a dangling old link from its name; documented manual recovery requires recorded
identity/evidence and destination preflight.

Pilot backup records exact link text, metadata and affected configuration hashes
privately. Before removing either shared consumer link, inventory its resolved
contents and reject mixed ownership. Removing an entirely owned `.opencode`
symlink removes the link object only, never its target/package tree. Preserve
project opencode.json, Boost content, personal agents/plugins and .ai. Recovery
preflights every destination before restoring any link; occupied file, directory,
live/dangling link and late conflict all fail without partial restoration.

## Observable acceptance criteria

- AC1: A clean fixture machine install requires no profile and supplies the
  matrix resources; a rerun makes no duplicate links or Pi registrations.
- AC2: All seven OpenCode agents are natively listed/selectable and load the
  exact global skill by native tool event; the planning command independently
  forwards arguments and loads spec-and-tasks without filesystem fallback.
- AC3: Fresh Codex/OpenCode/Pi sessions from linkedin-analytics root and app/
  load every W plus code-review natively, with zero local links to shared skills
  or workflows and no shared `.opencode` dependency. Record version, CWD, native
  source/provenance and result for each resource. A manual cat is not proof.
- AC4: Diagnostic runs perform no implementation or delegation. Bounded behavior
  probes in disposable fixtures demonstrate planning's joint approval/handoff,
  implementation's approved-document input and independent review without fixes.
- AC5: Pi `/stack` and `/flow status` operate from both pilot CWDs; command
  registration is native. A disposable Git fixture demonstrates `/feature`
  gate/cancel and interrupted-run resume compatibility with existing run forms;
  do not start a writing feature run in the live consumer for this check.
- AC6: Collision fixtures preserve personal/local/Boost/plugin content byte for
  byte, report winners or blocked routes by resource type and never count a
  skipped resource as installed. Local project overrides remain possible.
- AC7: Partial apply, corrupt manifest, foreign/dangling links, symlink parents,
  old manifest, relocated checkout and rollback conflict cases have observed
  safe outcomes. Pilot restore is actually exercised and verified, followed by
  reapplying the reviewed final pilot state. Hash/link inventories match.
- AC8: Six fresh interactive launches (three harnesses × root/app/) verify native
  selectors and explicit loading separately from CLI probes. A separate test
  keeps each GUI/TUI open during an authorized temporary content update, records
  required reload/restart, and restores content byte for byte. If not performed,
  report pending and leave M3 open. A verified partial CLI delivery may be
  handed off while these checks remain open; do not declare the whole feature
  complete or claim full interactive acceptance.
- AC9: Public guidance describes one machine install, native syntax and optional
  scaffolding/legacy setup without personal paths or config copies. Pi profiles,
  config layering, commands and run artifacts retain their meanings. No other
  consumer is changed and no uncommitted baseline edit is lost.

## Residual assumptions and approval decisions

1. Preserve all seven existing OpenCode agent names as primary entry points;
   do not add six extra slash commands or a separate review agent. This is the
   minimum preserving today's agent selection surface, rather than identical
   UI syntax across harnesses.
2. A stable canonical checkout and installed harnesses are prerequisites. A
   move requires a documented manual recovery procedure; automated relocation
   repair and stale-resource reconciliation are deferred follow-ups. Projects without Git use the harness CWD root convention and are
   covered by a disposable fixture, not by an invented project-root marker.
3. Existing global Pi catalog/package duplication is assessed by native source
   evidence; retain exports for compatibility unless a concrete collision is
   reproduced. Do not remove third-party registrations to resolve it.
4. Explicit activation is preserved at entry points and in skill contracts;
   Codex invocation policy is not assumed to be enforced by other harnesses.
   General utility-skill discovery need not become explicit-only wholesale.
5. Current official docs support the proposed resource types; actual parsing,
   precedence and reload behavior for new OpenCode adapters remain delivery
   gates, not established observations. If primary-only adapters cannot load
   on 2.2.5, stop and revise this joint plan before substituting resource types.

No additional blocking product question remains beyond joint approval or veto
of these listed choices. Interactive access and later machine/pilot mutation
authorization must be available in the separate implementation session.

## Handoff

Planning output only. Review this file and tasks.md together. After explicit
joint approval, end this session; a fresh implementation session rechecks the
dirty baseline and begins T1. Use the approved paths as the contract, with
separate implementation and review. Do not publish tracker files in this session.

Approval record (2026-11-01, verbatim user authorization): "Approvo
congiuntamente spec.md e tasks.md, incluse le assunzioni residue. Chiudi la
pianificazione con il handoff, senza iniziare l'implementazione." The same
user message then explicitly authorized implementation to proceed in the
continuing session, starting from T1, with no commit/push, no rollout beyond
the linkedin-analytics pilot, and a clearly labeled partial CLI handoff
keeping T7, AC8 and M3 open if interactive proofs are not executable.
Planning is closed; T1 onward is implementation work.
