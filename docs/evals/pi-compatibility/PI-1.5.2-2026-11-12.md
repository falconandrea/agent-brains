# PI-1.5.2 — Pi engine and extension migration to 1.5.2

Date: 2026-11-12. Driver: user-requested migration of the pi-brain engine and
extension to the Pi 1.5.2 baseline, verified before any global Pi CLI update.
This report records the **new** 1.5.2 migration and keeps it separate from the
[T9 0.84.2 baseline](T9-2026-11-12.md), which it supersedes.

## Target and source verification

Target: `@earendil-works/pi-coding-agent` **1.5.2** (npm latest; release notes
2026-11-10 on [pi.dev](https://pi.dev/changelog/releases/1.5.2)). Later releases
do not exist; 1.5.2 was kept as the explicit target.

Relevant changes 0.84.2 → 1.5.2 (official changelogs 1.5.0–1.5.2 plus
intermediate releases):

- **1.5.0 breaking — tool argument validation moved to
  `@earendil-works/pi-schema`.** TypeBox features outside JSON Schema
  (`Type.Refine()`, `Type.BigInt()`, `Type.Undefined()`, codecs,
  `Format.Set()`) no longer apply to tool arguments; plain JSON Schema tools get
  the same coercion as TypeBox tools. **Impact on pi-brain: none.** The engine's
  schemas (`ask_user`, `ask_user_batch`, `submit_review`, guarded write/edit)
  use only JSON-Schema-compatible constructs (`Type.Object/String/Optional/
  Array/Union/Literal/Number/Integer/Boolean`) — verified by source inspection
  (`src/pi/pi-agent-runner.ts`, `src/pi/ask-user-batch.ts`,
  `src/pi/json-schema.ts`); no excluded feature appears anywhere in `src/`.
- 1.5.0: `Type`/`Static`/`TSchema` imports keep working; pi-brain imports
  `Type` from `typebox` directly, which remains supported.
- 1.5.1: custom `GrepOperations.readFile` no longer called for context lines
  (deprecated). pi-brain does not override grep operations. Unaffected.
- 1.5.2: session continue/fork fixes for missing working directories. Unrelated
  to pi-brain.
- Dependency tree changes: `pi-protocol`/`pi-client` gone from the CLI;
  `pi-mcp`, `pi-codemode`, `pi-schema` added; SDK TypeBox moved 1.3.7 → 1.3.27.

## Declared baseline (new)

| Component | T9 baseline (superseded) | New baseline | Observed locally |
|---|---|---|---|
| Node | `>=24.12.0 <25` | `>=24.12.0 <25` (unchanged) | 24.12.0, macOS arm64 |
| `@earendil-works/pi-coding-agent` | 0.84.2 | `1.5.2` | 1.5.2 |
| `@earendil-works/pi-ai` | 0.84.2 | `1.5.2` | 1.5.2 |
| `@earendil-works/pi-tui` | 0.84.2 | `1.5.2` | 1.5.2 |
| Direct `typebox` peer | 1.3.14 | `1.3.27` | 1.3.27 (deduped with the SDK) |

TypeBox 1.3.27 aligns the direct peer with the SDK 1.5.2 dependency so one
TypeBox copy serves both; the engine's schema-building usage is unchanged.

## Method

All compatibility checks ran in an isolated git worktree containing the full
uncommitted working state; the main tree, global Pi (0.85.1), personal
configuration and consumer repositories were not touched during verification.

1. Worktree peers switched to 1.5.2 + typebox 1.3.27; fresh `npm install`.
2. `tsc --noEmit` against the real 1.5.2 SDK — no API break; **zero functional
   source changes required**. The migration changed dependency metadata and the
   two Pi-surface header comments only (`extensions/pi-brain.ts`,
   `src/pi/pi-agent-runner.ts`): version stamp refreshed and the stale
   "never run / nothing has executed" claims replaced with the actual runtime
   status (scripted SDK/RPC verification on 1.5.2; real-provider and
   fullscreen-TUI execution still unverified on this baseline) after review
   flagged the contradiction.
3. Full offline suite and SDK/workflow smoke on 1.5.2 (below).
4. Isolated Pi CLI 1.5.2 (`npm install` into a temp prefix — not global) with a
   disposable `PI_CODING_AGENT_DIR`; the worktree registered via `pi install`;
   extension loading, command dispatch, gate approval, cancellation and
   interruption/resume exercised through the CLI's RPC mode with scripted
   loopback SSE responses against disposable Git fixtures.

## Checks and results

| Check | Result |
|---|---|
| `npm run typecheck` (SDK 1.5.2) | pass, no source changes needed |
| `npm test` (SDK 1.5.2) | 484/484 pass, 0 failed/skipped |
| `npm run smoke:pi` (SDK 1.5.2) | exit 0 — workflow `completed`, 5 model turns, 1 approval, verification exit 0, roles planner/developer/reviewer, HEAD unchanged |
| CLI 1.5.2 — extension load + dispatch | `/stack` intercepted by the extension (0 model turns) while a `/no-such-command-xyz` control reached the model; package skills loaded from the checkout (`pi list` registration visible in the CLI session) |
| CLI 1.5.2 — approval (RPC fixture) | 13/13 — gate `select` arrived through the RPC extension UI with the three pi-brain options; approve → developer `write` → verify exit 0 → `submit_review` → outcome `completed`; per-role tool allowlists asserted from actual request payloads (planner without `write`; developer `write`/no `bash`; reviewer `submit_review`/no `write`); planner request carried the `AGENTS.md` context marker; HEAD unchanged; lock released |
| CLI 1.5.2 — cancellation (RPC fixture) | 5/5 — `/flow stop` mid-developer ended the run `cancelled`, `hello.txt` intact, HEAD unchanged, lock released |
| CLI 1.5.2 — interruption + resume (RPC fixture) | 12/12 — SIGKILL mid-developer left lock + log; fresh CLI process `/flow resume` re-entered at develop (lock takeover from the dead pid), completed with scripted review; `workflow.resumed` present; HEAD unchanged; lock released |
| `git diff --check` | pass |

Scripted vs real: every 1.5.2 runtime check above used scripted loopback
responses — no real provider call, no personal authentication, no fullscreen-TUI
manual interaction. One earlier scripted-sequence misalignment (a `submit_review`
call served to the developer role) was a driver defect, diagnosed and fixed;
it is not an engine or SDK finding and produced no product regression.

## Limits — what remains unverified on 1.5.2

- **Real-provider execution** through the CLI/SDK on 1.5.2 (authentication,
  retries, provider-specific behavior) — not attempted; would spend real tokens.
- **Interactive fullscreen TUI**: checks used RPC mode (dialog sub-protocol),
  which is not the fullscreen TUI rendering/input path. A manual TUI run
  (e.g. AC5-style) on 1.5.2 remains open.
- Other Node majors/platforms; later Node 24 patches admitted by policy, not
  individually tested.
- Resume-to-completed is now observed at scripted-fixture scope; the historical
  AC5 note (resume ending `needs_human`) describes a different, real-TUI
  observation and stays untouched.
- Historical live evidence (spike, 2026-08 runs, T7 matrix on CLI 0.85.1)
  remains scoped to its own baselines and is not re-interpreted for 1.5.2.

## Deliverable state

- `package.json` / `package-lock.json`: peers 1.5.2, typebox 1.3.27, Node
  engines unchanged.
- No functional source, test or shell change; two Pi-surface header comments
  refreshed in content, not just stamp (above).
- Global Pi update is a separate user action; the exact update, post-update
  check and rollback commands are in
  [docs/pi-brain/README.md](../../pi-brain/README.md#updating-the-globally-installed-pi-cli).

## Post-update observation — 2026-11-13

The user reported a working `/stack` response (`nodejs`, 70% confidence,
`package.json` evidence). A separate local `pi --version` check returned
`1.5.2`. These observations establish the installed CLI version and reported
extension command dispatch; they do not establish a complete real-provider
workflow or exercise the fullscreen approval/cancel/resume UI. Those remaining
limits above stay open. Both documentation P3 review findings were corrected
and rechecked; the user authorized committing the reviewed changes, not pushing.
