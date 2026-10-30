# Assessment of Cloudflare `security-audit`

Mode: assessment  
Date: 2026-10-22
Local checkout: `f065e5a970554b91fd86427a7e123c2fbc4caa7b`
Snapshot upstream: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14)

## Status updated after local review (2026-10-22)

Reconciled against `af37cf6`: U9–U11 (workflow pointers, OpenCode warning, and
Pi runtime ignore rules) are complete and committed. They do not change the
technical evidence relevant here. Upstream sources remain at the original
snapshots: this review is not a new upstream check or benchmark. The [agreed
roadmap](../plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22)
owns the order and status of future work; this research preserves the evidence.

Decision: C3 improves only `security-reviewer` with principles that are
applicable today. The user excludes an OS sandbox and full installation: no
additional bundle, ledger, or Cloudflare orchestrator is queued. Parts that
require new infrastructure are discarded. Independent review is reserved for
explicit deep dives; it does not add an automatic `/feature` phase.

## Scope and sources

I read the pinned upstream checkout, the local `security-reviewer` and
`code-review` skills, the router, and relevant profiles. I did not audit this
repository's security, install the skill, or modify skills, code, or
configuration. I ran only the 65 tests for the two upstream validators; all
passed.

Primary sources: [upstream README](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/README.md),
[SKILL.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/SKILL.md),
[RECONNAISSANCE.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/RECONNAISSANCE.md),
[HUNTING.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/HUNTING.md),
[VALIDATION-AND-REPORTING.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/VALIDATION-AND-REPORTING.md),
[schema](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/report-schema.json),
[validator tests](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/validate-findings.test.cjs).

## Upstream facts

Cloudflare does not provide a short checklist: the bundle contains 22 files and
about 5,400 lines. The full workflow has six phases: reconnaissance,
coverage-guided hunting, adversarial validation of candidates, validated JSON
output, independent record verification, and derived reports. It also
distinguishes guidance mode from full audit mode, so loading the skill should
not start an audit or create files by itself.

The evidence model requires a low-trust principal, the expected control, the
boundary crossed, the affected resource, and an observed result. Records are
`confirmed`, `needs_validation`, or `rejected`; only the first receives a
severity. Severity must follow demonstrated impact, while a missing deployment
fact remains an explicit blocker.

Coverage is persisted in `coverage-ledger.json`, with `quick`, `standard`, and
`deep` profiles, invocation budgets, cautious reuse of previous runs, and
separate critics. The verifier must be fresh relative to the hunter; a material
replacement requires another verification. `findings.json` and the ledger have
zero-dependency validators with input limits and structural checks.

The instructions require an OS-enforced sandbox for running target code:
external network disabled, allowlisted environment, read-only target, isolated
scratch space, and resource limits. Artifact promotion is parent-only and
described with no-follow, link-count, size, and race-safety checks. Without
these guarantees the result must remain `needs_validation`; this is an
operational contract, not a guarantee that every host enforces it.

The bundle includes specialist lenses for web/auth, clients, cloud, supply
chain, LLMs, protocols, availability, data isolation, and IPC. The license is
MIT, but the
[LICENSE upstream](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/LICENSE)
requires preserving copyright and notice in copies or substantial portions.

## Local evidence

The [local `security-reviewer` skill](../../.agents/skills/security-reviewer/SKILL.md)
already covers scope and authorization, SAST, dependency and secret scanning,
manual review, limited proof of concept, CVSS classification, file/line
location, remediation, and reports with an executive summary and findings
table. It is therefore a real basis for the generic parts of the upstream
skill.

The [`code-review` skill](../../.agents/skills/code-review/SKILL.md) has a
different scope: it compares a diff against a fixed point on two independent
axes, Standards and Spec. The independence of its two reviewers is related, but
it does not replace a repository audit, a coverage ledger, or vulnerability
validation.

`security-reviewer` appears in the `full` and `nodejs-ai-backend` profiles
([full.list](../../profiles/full.list), [nodejs-ai-backend.list](../../profiles/nodejs-ai-backend.list));
the router classifies it as `review`, and its role accepts `review`, `craft`, and
`stack` ([skill-router.ts](../../src/skill-router.ts)). The default configuration
still leaves it disabled ([config.ts](../../src/config.ts)). Local occurrences
of the role are in the router, configuration, and tests: the current feature
workflow calls planner, developer, and reviewer, without an automatic
security-reviewer phase.

The inventory checked by the parent does not show `security-audit` in the local
or global catalog, in `skills-lock.json`, or in the installation script. Its
absence from the lock also means the updater does not manage its provenance or
updates. For manual and tool-specific skills, the repository instead prescribes
`extra/skills/`
([README](../../README.md#L327)).

## Comparison and compatibility

| Dimension | Cloudflare | Local | Consequence |
|---|---|---|---|
| Intent | Full audit or focused guidance | Generic security review | Overlap on ordinary cases; new value on full runs |
| Evidence | Boundary/result, three verdicts, severity separate from confidence | Findings with CVSS and remediation | Importing the gate and `needs_validation` reduces overclaiming |
| Coverage | Ledger, critics, additive runs, and budget | No audit ledger | New capability, but also persistent state to design |
| Independence | Separate hunter, verifier, and final-record verifier | `code-review` separates Standards/Spec | Reuse the principle without merging the two scopes |
| Execution | OS-enforced sandbox and isolated artifacts | Bash allowed in the local skill; no equivalent contract | Operational incompatibility to resolve before a full audit |
| Distribution | CLI skills, 22 files, companion docs, and scripts | Central store, profiles, and its own router | Direct installation would bypass the local lifecycle |

The additional value is methodological and verifiable: a concrete boundary,
severity only after evidence, named blockers, independent verification, a
ledger, and a machine-readable schema. SAST, secret scanning, OWASP/CWE, CVSS,
and basic reporting are already covered by the local skill. The bundle should
therefore not be treated as a full replacement or an extension of `code-review`.

## Costs, risks, and upstream maintenance

Importing everything would add 22 files, thousands of prompt lines, and two
validators to maintain, as well as a hunter/verifier orchestrator, external run
directories, a ledger, budgets, and safe promotion. The local code exposes an
`AgentRunner` per call and has a disabled security role; there is no evidence
of a sandbox-aware descriptor or a pipeline that owns the shared files required
upstream.

Simply adding `security-audit` to a profile would be ambiguous: skills unknown to
the router fall back to `craft`, so it could end up in multiple roles. A full
audit instead requires an explicit entrypoint and the security role alone, with
output outside the target and stated delegation/isolation capabilities.

The chosen path is to selectively adapt the method within `security-reviewer`,
without global installation or an additional manual bundle. Preserve the MIT
notice, record the commit and provenance, and establish a dedicated upstream
check: the repository does not currently update it through a lockfile.

## Decision

**Verdict: selectively import.** Keep `security-reviewer` as the entrypoint for
ordinary reviews and recover these Cloudflare elements in a separate future
change: boundary/result gate, `needs_validation` without severity,
impact/likelihood calibration, a minimal findings schema, independent
verification, and hardening notes. Do not automatically import companion
files, the coverage ledger, six-phase orchestration, or artifact promotion. The
OS sandbox is excluded from the agreed work.

The pilot should measure unique findings, duplicates, validation blockers,
tokens/invocations, and time on a real local audit; count it as positive only
if it adds evidence or coverage without multiplying generic reports. Full
integration is not queued; it would require a future user decision, not merely
advancing this proposal.
