# S2 raw evidence (2026-10-24/25)

Unedited outputs of `run-baseline.mjs`, `smoke.mjs` and `quota-probe.mjs` (the
latter two are one-call diagnostics beside this directory). The analysis, tables
and limitations live in [../S2-2026-10-24.md](../S2-2026-10-24.md); this file
only records provenance. Do not edit these files — rerun the scripts instead.

| File | Produced by | Model | What it is |
|---|---|---|---|
| `2026-10-26-post-s1-audit-after-review.json` | `run-baseline.mjs --audit-only` | none (no calls) | Deterministic audit after the two 2026-10-26 review fixes: `context-overlap` is still 1 entry, 1 unique path, 0 duplicate bytes, 220 loaded; the 3 repo tasks load 0. |
| `2026-10-26-review-fixes-provenance.txt` | shell preflight | none | Review-fix tree: base commit `fb66860`, tracked diff sha256, manifest and fingerprint `76f5cebf…`. Identifies the code the audit above ran against. |
| `2026-10-25-post-s1-baseline-zai.json` | `run-baseline.mjs` | `zai/glm-5.2` | **Post-S1 rerun, recorded before the 2026-10-26 review fixes**: all 4 tasks on S2 commit `fb66860` + the then-current S1 change. All succeeded with non-zero usage; 4/4 answers correct. `recordedAt` 2026-10-25T19:53:06Z. Kept unedited; it does not exercise the two fixed edge cases. |
| `2026-10-25-post-s1-audit.json` | `run-baseline.mjs --audit-only` | none (no calls) | Deterministic post-S1 audit on the pre-review-fix tree: `context-overlap` is 1 entry, 1 unique path, 0 duplicate bytes, 220 loaded bytes; the 3 repo tasks load 0. |
| `2026-10-25-post-s1-provenance.txt` | shell preflight | none | Post-S1 measured tree at the time of the rerun: base commit `fb66860`, tracked S1 diff sha256, per-file manifest and fingerprint `2a72af34…`; regenerated after the run and matched. The review fixes later changed two source files, so it does not identify the current tree. |
| `2026-10-25-baseline-zai.json` | `run-baseline.mjs` | `zai/glm-5.2` | **Definitive S2 baseline**: all 4 tasks, real calls, S2 code at measurement time, independent catalog copy, no abort and non-zero usage everywhere. `recordedAt` 2026-10-25T19:31:16Z; verbatim answers, per-task usage, tool/read traces and loader audits. |
| `2026-10-25-baseline-zai-provenance.txt` | `run-baseline.mjs` preflight (shell) | none | Measured-tree identification: commit `75ffea5`, `git diff --stat`, per-file sha256 and the tree fingerprint `06f2bbec…`; regenerated after the run and matched. |
| `2026-10-25-zai-availability-smoke.json` | `smoke.mjs` | `zai/glm-5.2` | One-call pre-flight run immediately before the baseline, after the quota reset: `pong`, real input/output/cacheRead, SDK cost and elapsed. The file has no embedded timestamp; the run order is the provenance. |
| `2026-10-24-baseline-pre-remediation-zai.json` | `run-baseline.mjs` | `zai/glm-5.2` | 3 repo exploration tasks, real calls. **Pre-remediation**: recorded before the S2 review fixes. No context audit, no `context-overlap` task. |
| `2026-10-24-audit-before.json` | `run-baseline.mjs --audit-only` | none (no calls) | Loader audit for all 4 tasks against the post-fix code. This is the deterministic S1 "before" state. |
| `2026-10-24-overlap-before-openrouter.json` | `run-baseline.mjs --task context-overlap` | `openrouter/mistralai/mistral-nemo` | First real run of the duplicated-context task with the post-fix code. The answer is wrong (see report); it is a quality data point, not a corrected zai baseline. |
| `2026-10-24-smoke-post-fix.json` | `smoke.mjs` | `openrouter/mistralai/mistral-nemo` | One-call end-to-end validation of the post-fix capture (provider/model, tokens, cache, SDK cost, elapsed). |
| `2026-10-24-symlink-guard.txt` | `run-baseline.mjs` with a symlinked catalog | none | Isolation guard evidence: the script refuses a writable symlink to the personal models store, exit 2. |
| `2026-10-24-zai-quota-block.txt` | `quota-probe.mjs` | `zai/glm-5.2` | Provider quota block: 4 `agent_end` batches (initial attempt + 3 retries), every assistant usage zero, elapsed printed by the probe (18.9s in this log). |
| `2026-10-24-zai-quota-runner-smoke.txt` | `smoke.mjs` | `zai/glm-5.2` | The production runner over the same blocked call: zero usage is reported as measured zero, provider/model preserved, elapsed 18.1s. |

Environment for every file: disposable `HOME` and Pi agent directory; the
model catalog is an independent **copy** of `models-store.json`; credentials
come from ambient environment keys only. No `auth.json`, API key or personal
path is present in the 2026-10-24 outputs (checked by scan; the overlap fixture
is generated in a temp directory and its bytes/hashes are the only fixture
content recorded). The 2026-10-25 baseline also contains no credential, but its
`readCounts` names absolute local working paths: the runner records the `read`
tool argument verbatim. Those are machine-local paths, not secrets, and the raw
artifact was deliberately not edited. The post-S1 artifact has no credential and
its `readCounts` happen to be repository-relative. Answers are stored verbatim so
grading can be checked, so they may quote code fragments from the files the
model read; they never contain a full file dump.

Where present, the `recordedAt` timestamps inside the JSON are authoritative. The
2026-10-25 baseline is the definitive "before"; the post-S1 file is its paired
"after" and is not a second baseline. The pre-remediation file predates the
review fixes and is supporting evidence only.
