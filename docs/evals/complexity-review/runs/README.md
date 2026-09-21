# R0.4 pilot — evaluator run artifacts

One file per run. Each file contains the exact prompt sent to the evaluator and
its complete returned output, verbatim. The synthesized comparison lives in
[../R0.4-ponytail-pilot.md](../R0.4-ponytail-pilot.md); these artifacts are its
evidence.

## Configuration snapshot (shared by all runs)

- Date: 2026-09-21
- Fixture repository: `agent-brains` at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out.
  **The working tree was not a clean-HEAD tree during the runs:** it
  additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` — necessarily, because the ponytail lens must
  read the skill under test. The six single-lens runs (A1-A3, B1-B3) and the two
  superseded proxy runs (A4, B4) were explicitly instructed not to read it
  (independence requirement embedded in their prompts); the four faithful
  code-review reruns had no such prohibition — see Chronology below. Diff
  content itself was obtained from commit objects (`git diff <a>..<b>`,
  `git show <sha>:<path>`), so untracked files cannot have altered the reviewed
  diffs; only working-tree reuse checks could theoretically have seen the extra
  folder, and no finding references it.
- Chronology: the eight lens-context runs (A1-A4, B1-B4) all ran before any
  R0.4 report, test or roadmap edit existed; their prompts explicitly forbade
  reading the other lenses' skills and `docs/evals/**`. The faithful
  code-review reruns (A4a, A4b, B4a, B4b) ran later the same day, with the R0.4
  artifacts already present in the working tree; their prompts contained only
  the diff command, commit list, standards/spec sources and the skill's brief,
  and did **not** forbid reading R0.4 artifacts — so contamination cannot be
  categorically excluded for them. What can be said: no R0.4 content is visible
  in their returned outputs (all preserved verbatim above/below and
  inspectable). An unrelated untracked user file
  (`docs/research/pi-ecosystem-followup-assessment.md`) appeared late in the
  session; it is not part of this work and no run references it.
- Evaluated ranges: Diff A `96c639b..763387a`, Diff B `906c47e..ed43993`
  (historical; file versions read via `git show <sha>:<path>`)
- Client/runtime: opencode CLI, Task tool, subagent type `general`, one fresh
  context per run. The six single-lens runs were explicitly forbidden from
  reading the other lenses' skills and `docs/evals/**`; the four faithful
  code-review reruns had no such prohibition — for them only "no cross-reference
  is visible in the returned outputs" can be claimed (see Chronology)
- Provider/model: host session's configured provider (GLM coding plan). The exact
  model variant that served each subagent was not independently logged — recorded
  as a limitation, not asserted.
- Read-only mandate: embedded in every prompt (no file writes, no mutating git
  commands, no formatters, no test runs)
- Human spot-check: every returned output was read by the session author before
  being summarized; summaries were checked against these artifacts.

## Run index

Findings of record (10 runs):

| Run | Lens | Diff |
|---|---|---|
| [A1](A1-ponytail-review.md) | `ponytail-review` | A — implementation-heavy |
| [A2](A2-karpathy-guidelines.md) | `karpathy-guidelines` | A |
| [A3](A3-simplify.md) | `simplify` | A |
| [A4a](A4a-standards-axis.md) | `code-review` — Standards axis (separate sub-agent) | A |
| [A4b](A4b-spec-axis.md) | `code-review` — Spec axis (separate sub-agent) | A |
| [B1](B1-ponytail-review.md) | `ponytail-review` | B — skill/doc-heavy |
| [B2](B2-karpathy-guidelines.md) | `karpathy-guidelines` | B |
| [B3](B3-simplify.md) | `simplify` | B |
| [B4a](B4a-standards-axis.md) | `code-review` — Standards axis (separate sub-agent) | B |
| [B4b](B4b-spec-axis.md) | `code-review` — Spec axis (separate sub-agent) | B |

Superseded proxy runs (kept for the record, not findings of record):

| Run | Note |
|---|---|
| [A4](A4-code-review.md) | both axes in one context, contrary to the skill's two-sub-agent contract |
| [B4](B4-code-review.md) | same deviation |

## Limitation

The Task runtime returns only each evaluator's final message; internal tool-call
transcripts were not exported. Prompts and final outputs are complete and
verbatim; a future rerun wanting full session exports should use a runtime that
persists them.

## Evidence classification

Under the repository standard (complete raw session export plus configuration
snapshot), these artifacts are **substantial evidence with a documented
limitation**, not a fully reproducible configuration: prompts and verbatim
outputs are complete, but the exact per-run model variant and the tool-call
transcripts are missing. For this read-only pilot the limitation was accepted —
the findings are advisory, none were applied, and the promotion decision rests on
findings independently converged on by multiple lenses, not on any single run.
The recorded remedy, if a future decision ever requires full reproducibility, is
to repeat the pilot with a runtime that persists complete session exports and
logs the exact model per run.
