# Capability checklist

These IDs identify capabilities, not required tools or files. Judge each against
the repository's work and operational consequences. Record unknowns explicitly.

| ID | Capability | Evidence to inspect |
| --- | --- | --- |
| AR-01 | Agent instructions can be discovered and scoped | Entry point, nested instructions, operational pointers |
| AR-02 | Instructions name usable setup and verification commands | Commands against current manifests and scripts |
| AR-03 | Repository-specific constraints and ownership are discoverable | Instructions and examples of non-obvious rules |
| AR-04 | Context supports navigation without unnecessary preloading | Entry-point size, pointers, duplication, scoped context |
| AR-05 | Interrupted work can be resumed | Progress convention, task state, decisions and remaining work |
| AR-06 | Design rationale is recorded where useful | ADRs, specs, architecture notes or equivalent |
| AR-07 | Substantial work has checkable outcomes and boundaries | Recent requirements, acceptance criteria, non-goals |
| AR-08 | Relevant failure and recovery cases inform requirements | Error paths, rollback expectations; contextual applicability |
| AR-09 | Recent implementation can be traced to its intended behavior | A representative change and originating request/spec |
| AR-10 | Environment setup is reproducible | Runtime requirements, bootstrap, dependency resolution |
| AR-11 | Automated checks cover meaningful behavior | Tests and assertions, not only mock interactions |
| AR-12 | Verification commands and prerequisites are discoverable | README, instruction entry point, manifests |
| AR-13 | Appropriate static checks and formatting are usable | Existing ecosystem tools and actual results if run |
| AR-14 | Local verification can reproduce required CI checks | Task targets, CI steps, differences in environment |
| AR-15 | Integration gates run before changes land | CI configuration; remote enforcement only if inspected |
| AR-16 | Repeated project tasks have suitable automation | Existing scripts, task runners, skills and repeated work |
| AR-17 | Needed external systems are accessible within task scope | Documented interfaces, account/config prerequisites; no assumed access |
| AR-18 | Failures produce actionable output | Test/build logs, diagnostics and inspectable artifacts |
| AR-19 | Credential handling reduces accidental disclosure | Ignore rules, example config, scanner; limits of inspected scope |
| AR-20 | Dependency resolution and update practices suit the project | Lock/pin strategy and security update process |
| AR-21 | Review and authorization boundaries are discoverable | Review policy, deployment permissions, destructive operations |
| AR-22 | Agent access is scoped to its work | Sandbox, credentials and runtime settings actually available |
| AR-23 | Deployed behavior can be observed and recovered | Applicable logs, alerts, rollout and rollback procedures, data recovery |
| AR-24 | Past failures leave reusable prevention | Regression tests or project-specific lessons tied to real incidents |

Root-level evidence may establish a convention without establishing compliance
in every package. Record the sampled package/change and date. For AR-19 and
AR-22, describe mechanisms and evidence limits, never secret contents.
