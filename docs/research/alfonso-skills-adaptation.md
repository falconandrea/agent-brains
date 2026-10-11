# Alfonso Graziano skills: selected adaptations

Mode: assessment · Evidence date: 2026-10-11

## Decision and sources

Verdict: **selectively import**. The user approved a capability-oriented audit,
an optional portable HTML report kit and improvements to the existing manual
humanizer. Node CLI guidance was excluded.

Sources inspected at commit
[`6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270`](https://github.com/alfonsograziano/skills/tree/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270):

- [aine-readiness-analyzer](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/aine-readiness-analyzer/SKILL.md)
  and its [report template](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/aine-readiness-analyzer/resources/REPORT-TEMPLATE.md).
- [create-html-report](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/create-html-report/SKILL.md)
  and its [browser checker](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/create-html-report/scripts/check.mjs).
- [remove-ai-slop](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/remove-ai-slop/SKILL.md)
  and [write-without-slop](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/write-without-slop/SKILL.md).
- [Upstream MIT license](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/LICENSE).

## Local evidence and changes

`context-audit` already audits context hygiene with evidence and careful reference
classification. `research` already requires primary sources and separates facts,
local evidence and inference. `extra/skills/humanizer` already preserves voice,
supports detect/file/embedded modes and checks for remediation artifacts.

| Local artifact | Borrowed idea | Local choice |
| --- | --- | --- |
| `.agents/skills/agent-readiness` | Capability checks, evidence and root-cause recommendations | Contextual applicability, explicit unknowns, no readiness score or required specs layout |
| `.agents/skills/html-report` | Reusable kit and browser verification | Original neutral static assets, embedded CSS, no third-party hosted kit, accessible tables and offline checks |
| `extra/skills/humanizer/references/compose.md` | Preventive composition and factual provenance | Reuse existing editorial rules, calibrate to genre, preserve requested depth |
| `extra/skills/humanizer/scripts/scan.mjs` | Mechanical candidates and per-pattern comparison | Small English-only lexical helper; no structural detector, authorship or quality score |

Inference: these additions should reduce repeated audit/report setup and improve
long-edit review. That benefit has not been measured in production use. Revisit
after real audits and report handoffs; expand components or detectors only for
demonstrated recurring needs. Scanner thresholds from upstream were not adopted.

The new canonical skills are local-managed and inherited through `common`;
`full.list` also lists them explicitly for documentation. They are not added to
`skills-lock.json`. Existing consumers get new profiled skills on their next
`./setup.sh /path/to/project <profile>` refresh; full-store links see them directly.
Humanizer remains an extra, outside profiles and setup.
Both new skills are operational in the Pi role router: main-session discovery
includes them, while implementation/review pipeline children do not receive them.

## Updating manual humanizer installations

Update the **entire folder**, including `references/`, `scripts/`, existing
`agents/` metadata and `LICENSE.alfonso`. Replacing only SKILL.md leaves broken
references. Check whether an installation is a symlink to this canonical folder
or an independent copy, and review local modifications before replacing copies.

For an independent installation, once its destination and any local changes have
been checked, copy from `extra/skills/humanizer/` into that skill's folder:

```sh
rtk rsync -a extra/skills/humanizer/ /actual/installation/humanizer/
```

This merges files without deleting destination-only material; it can overwrite
same-named files, so inspect differences and back up local changes first. Consumer
installations outside this workspace were not modified by this adaptation.

## Small upstream documentation PR

Observed inconsistency: the pinned [README](https://github.com/alfonsograziano/skills/blob/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/README.md)
advertises **55** readiness checks. Both the skill's total constraint and its
template enumerate **46**. This is a documentation correction, not a runtime bug.

Before proposing the change, check the current branch still has that mismatch.
On GitHub open README.md, click the edit pencil, change `55 evidence-backed
checks` to `46 evidence-backed checks`, and propose the change on a new branch
in your fork. Open a pull request to `alfonsograziano/skills:main` containing only
that README change.

Suggested title: `docs: align readiness check count with report template`

Suggested body:

> The README advertises 55 evidence-backed readiness checks, while the current
> skill and report template contain 46. This updates the README to match them.
>
> Validation: checked the numbered template items (1–46) and the skill's required
> result total. Documentation-only change.

Credit for borrowed methods is recorded in each skill's metadata and references.
Report citations identify the sources supporting their factual claims; the
method's origin does not substitute for those sources.
