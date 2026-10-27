# Assessment of the Reddit-derived Pi extension shortlist

Date: 2026-10-27

Mode: assessment

Local baseline: `6fd9f8f`, clean working tree before this note.
Scope: verify the supplied web-chat proposal and retain only useful follow-up
ideas. Source/documentation inspection only; no installation, compatibility
smoke test, benchmark or live workflow run. Upstream links describe the moving
branches inspected today, not pinned adoption targets.

## Judgment

The architectural conclusion is reasonable: this shortlist does not establish
a reason to change agent-brains. The proposed immediate UI trials do not follow
from demonstrated local needs, however. Most architectural candidates already
have a local assessment or deferred decision. Keep two conditional ideas rather
than adding fifteen packages to the execution queue.

## Local evidence

- [The runner](../../src/pi/pi-agent-runner.ts) explicitly sets
  `noExtensions: true`, loads routed context/skills before session creation,
  and supplies role-specific tools. Parent installation does not make an
  extension available to `/feature` children. Any future child capability
  requires an explicit integration preserving role constraints.
- [The workflow](../../src/workflows/feature.ts),
  [launcher](../../src/run-launcher.ts), [resume](../../src/workflows/resume.ts)
  and [shell layer](../../src/shell.ts) already provide workflow orchestration,
  async launch, persisted recovery, verification timeout and Git snapshot diff
  accounting. Snapshot accounting is not a general undo facility.
- [The lockfile](../../package-lock.json) resolves Pi 0.84.2; peer ranges in
  [package.json](../../package.json) are unrestricted. Neither establishes
  compatibility with current extension releases.
- [Existing web-chat assessment](./web-chat-pi-packages-assessment.md) already
  covers web access, native MCP versus adapter, and human annotation. The
  [ecosystem assessment](./pi-ecosystem-followup-assessment.md) and
  [IDEAS](../pi-brain/IDEAS.md) already retain web/MCP candidates.
- [The roadmap](../plans/pi-plugin-adoption-roadmap.md) owns execution order:
  consolidation precedes optional trials; R2.1 remains a triggered AgentRunner
  evaluation. This report does not reorder or activate that work. Status text
  about historical uncommitted changes is not used as evidence of today's tree.

## Upstream facts and corrections

| Claim or candidate | Verified evidence and limit |
| --- | --- |
| Nine Pringled packages | The [README](https://github.com/Pringled/pi-extensions) currently lists all nine names under MIT. The pasted text supplies no Reddit permalink: the original eight, six comment suggestions, Windows report and sentiment are unverified here. Repository existence cannot establish what a commenter installed. |
| `pi-polish` is more than styling | [tools.ts](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-polish/extensions/tools.ts) adds edit/write preference instructions; [chrome.ts](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-polish/extensions/chrome.ts) patches UI internals. Treat fragility as an integration risk, not proof of observed failure. |
| `pi-checkpoints` is partial undo | [Implementation](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-checkpoints/extensions/checkpoints.ts) tracks `edit`/`write` calls, not arbitrary shell changes. It cannot substitute for workflow-wide recovery. |
| `pi-feedback` baseline/index | [Implementation](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-feedback/extensions/feedback.ts) selects the remote default branch, then falls back to `main`/`master`; an alternate branch is possible. It temporarily marks untracked files intent-to-add and attempts cleanup with `git reset`. Thus index interaction is real, not merely a hypothetical test concern; cleanup correctness was not executed here. The [README](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-feedback/README.md) declares roughly 235 MB for difit; installed size was not measured. |
| `pi-background` adds a distinct capability | [Source](https://github.com/Pringled/pi-extensions/blob/main/packages/pi-background/extensions/background.ts) supplies shell job lifecycle tools plus foreground bash timeout behavior. This differs from workflow async launch, but it is not a purely passive background-job UI. |
| UI shortlist | [Context bar](https://github.com/Pringled/pi-extensions/tree/main/packages/pi-context-bar) replaces the footer; [model picker](https://github.com/Pringled/pi-extensions/tree/main/packages/pi-model-pick) adds favorites/recents. Those are optional parent-session conveniences, with no measured workflow benefit here. |
| MCP native versus adapter | [Current Pi documentation](https://pi.dev/docs/latest/mcp) confirms native MCP and deferred discovery, requires explicit built-in extension loading in SDK sessions, and says a `/mcp` replacement disables native session MCP. This does not establish native support in local 0.84.2. Compare a deliberately selected SDK target before adopting [the adapter](https://github.com/nicobailon/pi-mcp-adapter). |
| `pi-web-access` | [Upstream](https://github.com/nicobailon/pi-web-access) supplies broad provider/search/extraction functionality. A narrow provider experiment remains conditional on an actual Pi research need; this is already recorded locally. |
| `pi-subagents` | [Current README](https://github.com/nicobailon/pi-subagents) requires Pi 1.2.0+. Keep the existing deferred R2 decision; do not infer compatibility from the package name or an older assessment. |
| Reject all `pi-background-tasks` for duplication | Too categorical: [upstream configuration](https://github.com/ismailsaleekh/pi-background-tasks#select-capabilities-and-avoid-shortcut-conflicts) supports `PI_BG_FEATURES=process`, excluding delegation/Fusion. A full installation still adds substantial unrelated behavior. This is an alternative to compare if shell jobs become necessary, not an adoption recommendation. |
| Claude/Cursor providers | [Claude bridge](https://github.com/pi-pod/pi-claude-agent-sdk) changes tool/session/prompt forwarding; [Cursor integration](https://github.com/Rahularya01/pi-cursor) declares an unofficial reverse-engineered protocol. Neither is just a model-picker preference. Revisit only for a concrete provider requirement, with role-tool and prompt propagation checks. |

`pi-next-prompt`, `pi-away` and `pi-heads-up` have no demonstrated unmet local
requirement in this proposal. Skipping them now does not prove they are useless
in other interactive setups. A second opinion is not automatically equivalent
to the existing structured review gate.

## Ideas worth retaining, with revisit triggers

1. **Human comments attached to the exact run diff.** Revisit if people
   repeatedly struggle to communicate line-specific feedback. Compare the
   existing notes gate, a narrow annotation adapter already considered locally,
   and `pi-feedback`. Require the run's snapshot baseline, preservation of
   staged/unstaged/untracked state including failure paths, and mapping comments
   back into the existing human decision. Do not use a branch-wide diff as proof
   of what one run changed. The useful idea is the interaction, not necessarily
   the difit dependency.
2. **Managed shell jobs in the parent Pi session.** Revisit if long tests,
   watchers or dev servers repeatedly block interactive work. Compare ordinary
   terminal management, `pi-background` and process-only `pi-background-tasks`.
   Check timeout changes, bounded logs, completion delivery, cancellation,
   process-tree cleanup and session exit/reload. Keep workflow verification
   under the existing verifier; do not give no-shell children an escape route.

Web/MCP and subagent work retain their existing notes and triggers; do not
create duplicate tasks. Footer/model favorites can be tried separately if the
user reports that specific UX friction. There is no evidence here to prioritize
those trials or to change the shared skill collection across harnesses.

## Verdict

**selectively import**

Retain the two conditional ideas above and the factual corrections. Skip
installation and runtime changes now. No roadmap change, new immediate trial,
source-code change or commit is part of this assessment.
