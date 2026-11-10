# T7 evidence archive index — 2026-11-10

Private evidence was copied without changing the `/private/tmp/` originals to:

`/Users/andreafalcon/.local/state/agent-brains/t7-final-validation-20261110/`

| Original package | Preserved copy |
|---|---|
| `/private/tmp/t7-opencode-residual-b-20261110/` | `t7-opencode-residual-b-20261110/` |
| `/private/tmp/t7-pi-matrix-live-20261110/` | `t7-pi-matrix-live-20261110/` |
| `/private/tmp/t7-codex-matrix-live-20261110/` | `t7-codex-matrix-live-20261110/` |
| `/private/tmp/t7-final-validation-20261110/` | `t7-final-validation-20261110/` |

Historical packages and support artifacts, copied under `historical/`:

| Original | Preserved copy | Purpose in the evidence record |
|---|---|---|
| `/private/tmp/t7-pi-scenarios2-20261109/` | `historical/t7-pi-scenarios2-20261109/` | AC5 cancel and interrupted-run resume native evidence and fixtures. |
| `/private/tmp/t7-pi-scenarios-20261109/` | `historical/t7-pi-scenarios-20261109/` | Earlier stopped AC5 attempt, preserved as failed/incomplete evidence. |
| `/private/tmp/t7-opencode-root-nextjs-20261109/` | `historical/t7-opencode-root-nextjs-20261109/` | OpenCode root/nextjs invocation and native transcript. |
| `/private/tmp/t7-opencode-residual-20261110/` | `historical/t7-opencode-residual-20261110/` | November 10 first OpenCode residual batch (including app/astro's coordinator-reviewed native evidence). |
| `/private/tmp/t7-opencode-residual-20261109/` | `historical/t7-opencode-residual-20261109/` | Earlier stopped OpenCode residual attempt. |
| `/private/tmp/t7-opencode-residual2-20261109/` | `historical/t7-opencode-residual2-20261109/` | Earlier OpenCode root/setup attempt and its evidence. |
| `/private/tmp/t7-validation-20261108/` | `historical/t7-validation-20261108/` | November 8 initial Pi invocation and handoff artifacts. |
| `/private/tmp/t7-driver-readiness-20261109/` | `historical/t7-driver-readiness-20261109/` | Driver readiness observations. |
| `/private/tmp/t7-driver-synthetic-20261109/` | `historical/t7-driver-synthetic-20261109/` | Synthetic transport/cleanup evidence. |
| `/private/tmp/t7-driver-interrupted-20261109/` | `historical/t7-driver-interrupted-20261109/` | Interrupted-driver evidence. |
| `/private/tmp/t7-driver-duplicate-term-20261109/` | `historical/t7-driver-duplicate-term-20261109/` | Synthetic repeated-TERM cleanup evidence. |
| `/private/tmp/t7-opencode-synthetic-20261109/` | `historical/t7-opencode-synthetic-20261109/` | OpenCode runner synthetic checks. |
| `/private/tmp/t7-opencode-synthetic2-20261109/` | `historical/t7-opencode-synthetic2-20261109/` | OpenCode runner synthetic checks. |
| `/private/tmp/t7-opencode-synthetic3-20261110/` | `historical/t7-opencode-synthetic3-20261110/` | OpenCode runner synthetic checks. |
| `/private/tmp/t7-codex-synthetic-20261110/` | `historical/t7-codex-synthetic-20261110/` | Codex runner synthetic checks. |
| `/private/tmp/t7-pi-matrix-synthetic-20261110/` | `historical/t7-pi-matrix-synthetic-20261110/` | Pi matrix-runner synthetic checks. |
| `/private/tmp/t7-pi-matrix-synthetic2-20261110/` | `historical/t7-pi-matrix-synthetic2-20261110/` | Refined Pi matrix-runner synthetic checks. |
| `/private/tmp/t7-opencode-worklist-20261110/` | `historical/t7-opencode-worklist-20261110/` | Residual-cell worklist and coordination artifact. |

All 24 top-level `/private/tmp/t7-*.py` helper scripts present at inventory
time were copied by basename into `historical/`. This includes the
Pi/OpenCode/Codex drivers, fakes, self-checks, fixture helpers and preserved
pre-fix driver snapshots. The index copy itself is stored at the archive root.

Verification on 2026-11-10:

- The final package's original `SHA256SUMS` validated successfully.
- Recursive `diff -qr` found each archived package identical to its original.
- Recursive `diff -qr` also found all 18 listed historical directories
  identical to their `/private/tmp/` originals. The original directory
  manifests, where present, were left unchanged.
- The three live batch packages do not have a package-root `SHA256SUMS`; their
  per-cell evidence was preserved byte-for-byte, without retroactively adding
  or changing original manifests.
- The other 16 invocation cells are supported by the prior observations
  described in the November 3 and dated November 8/9 report sections. The
  November 3 selector and running-session refresh observations were user
  supplied in the coordinating conversation; no separate raw TUI transcript
  or screenshot package is identified in those reports or available among the
  named temporary artifacts. Their durable evidence is the qualified account
  in `T7-2026-11-03.md`; no missing raw capture has been reconstructed.

The archive root, `historical/`, and package directories are private (`0700`).
This index is the repository-side pointer; the archive contains the original
package contents and manifests.
