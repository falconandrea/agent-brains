---
name: agent-readiness
description: Audit whether a repository lets coding agents set up, implement, verify and recover work reliably. Use for agent-readiness or harness assessments; documentation hygiene alone belongs to context-audit.
license: MIT
metadata:
  management: local
  provenance: derived
  origins:
    - repository: https://github.com/alfonsograziano/skills
      path: skills/aine-readiness-analyzer/SKILL.md
      commit: 6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270
      license: MIT — full text in LICENSE
  adaptation: Capability-based operational audit with evidence, unknown status, contextual applicability and root-cause prioritization; no fixed score or prescribed artifact layout.
---

# Agent readiness

Answer: what would prevent a fresh coding agent from doing useful, verifiable
work here, and which changes would remove those obstacles first?

Inspect the requested repository. Audit source and configuration read-only;
report in chat unless a report file was requested. Running a discovered check
is allowed when it is appropriate and its side effects fit the authorized
scope. Keep remediation separate from assessment.

## Establish scope

Read the instruction entry point and its operational pointers, README,
manifests/build files, setup scripts and CI configuration. Discover the stack
before evaluating tooling. In a monorepo state which packages were inspected;
root evidence does not establish package-wide readiness.

Use [the checklist](references/checklist.md) to cover the capabilities. Keep
its IDs in the report so later audits can be compared. Equivalent conventions
count: architecture notes can carry design rationale without a specs directory,
and a Makefile target can be a verification gate. Optional files, MCP servers,
skills and feature flags are not requirements simply because they exist elsewhere.

## Record evidence

For every applicable capability record one status:

- **ready**: inspected evidence shows it works for its intended purpose.
- **gap**: evidence demonstrates a missing or broken capability with a concrete
  consequence for this repository. For absence, name the locations searched.
- **unknown**: evidence is unavailable or incomplete. State what would resolve it.
- **not applicable**: explain why this capability is irrelevant to this project.

Separate configured, documented and executed evidence. A test command listed
in package.json proves discoverability, not that tests pass. CI YAML proves
configuration, not enforcement of branch protection. Do not infer remote
settings, secret absence or runtime behavior from local files alone.

For checks that can touch databases, services or deployment, inspect their
configuration before execution. Never print credential values in evidence.
Document age is a signal; only contradictory current evidence proves staleness.

## Prioritize and deliver

Report scope and limitations, a capability table (ID, status, evidence,
consequence), then a short list of root fixes. Each fix names a real path or
command, the capabilities it unblocks, effort and dependency. Rank by practical
impact and cost; do not create an overall numerical score. Missing one artifact
should not become several independent recommendations.

Include important capabilities found healthy and unknowns that affect the
conclusion. A saved report follows the project's research convention and dates
its evidence. For an explicitly requested visual report, use `html-report`.

This method is adapted from Alfonso Graziano's
[aine-readiness-analyzer](https://github.com/alfonsograziano/skills/tree/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/aine-readiness-analyzer).
