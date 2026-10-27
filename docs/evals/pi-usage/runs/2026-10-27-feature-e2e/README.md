# C4 workflow evidence

The [report](../../FEATURE-E2E-2026-10-27.md) owns findings and limitations.
This package retains all six completed provider calls: two rejected old-runtime
plans, one rejected current-runtime plan, and the successful current
planner/developer/reviewer sequence. Including the failed network preflight,
there are seven raw session files.

- `manifest.json`: shared initial fixture bytes/hashes, identical fixture
  commit, runtime revisions and observational instrumentation hashes.
- `pilot-format/`: original request, both rejected plans.
- `format-reminder/`: explicit format reminder; rejected old-runtime plan,
  approved current-runtime plan and completed workflow.
- `preflight-network/`: only the old-runtime arm ran; SDK connection failure.

Each executed arm keeps its original `config.json`, `session-*.json` and
`tools.jsonl`. `run.jsonl` is a byte-for-byte copy of the original persisted
`.pi/pi-brain/runs/c4-e2e-<arm>.jsonl`; the duplicate JSON array is omitted.
Sessions include the actual system prompt, request and complete SDK messages,
including rejected planner output. Separate result/rejected-output copies
are omitted because their underlying messages and outcome events are retained.

The successful arm also keeps the exact plan presented at the gate,
approval record, human question, independent test outputs and `tracked.patch`.
To reconstruct the final fixture, write `manifest.json`'s `fixture` mapping
to an empty directory, then apply `format-reminder/after/tracked.patch` using
`git apply`. The PRD/tasks are preserved separately in `plan-gate.json`;
they are untracked orchestrator outputs and are not part of that patch.

No runtime trees, provider catalogs, auth files, repeated fixture trees,
empty patches or generated session-audit copies are retained. The offline
verifier derives context/skill checks directly from the raw sessions:

```sh
node docs/evals/pi-usage/verify-feature-e2e.mjs \
  docs/evals/pi-usage/runs/2026-10-27-feature-e2e/format-reminder
```

`format-reminder/verification.json` is its regenerable result. Compaction
checked the 28 retained source files byte-for-byte against the original
collection before removing duplicates; it did not edit raw evidence.
