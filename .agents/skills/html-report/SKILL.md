---
name: html-report
description: Create a portable HTML report for research, assessments or comparisons when a shareable visual file is requested or clearly useful. Use for report artifacts, not ordinary chat summaries or product websites.
license: MIT
metadata:
  management: local
  provenance: derived
  origins:
    - repository: https://github.com/alfonsograziano/skills
      path: skills/create-html-report/SKILL.md
      commit: 6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270
      license: MIT — full text in LICENSE
  adaptation: Original local static kit, inline CSS, accessible data tables, browser verification and evidence-linked reports; no hosted assets or mandatory visual per section.
---

# HTML report

Create a shareable report whose conclusion and supporting evidence are easy
to inspect. Keep the depth requested by the user. An HTML rendering of existing
research must retain its sources, uncertainty and limitations.

## Compose

Start from [assets/template.html](assets/template.html). Read
[references/components.md](references/components.md) for supported markup.
Use the project's report/brand conventions when present; otherwise use this
kit's neutral document theme. The kit is a starting point, not a product UI.

Write the answer and reader's questions before arranging sections. Use visuals
where they explain comparisons, sequences or quantities; text-only sections are
appropriate when a visual adds no information. Never invent data for tiles or
charts. Label estimates and show dates for time-sensitive facts.

Keep each factual claim linked to its supporting source or local evidence.
Distinguish observations from inference. Chart data must also be available as
text or a table; meaning cannot depend on color alone. Use semantic headings,
descriptive link text and captions that say what to notice.

## Package

Replace the template's sample content. Preserve the `<!-- REPORT_CSS -->`
marker, then create the standalone file:

```sh
node <skill>/scripts/inline.mjs draft.html report.html
```

The command embeds the bundled stylesheet. It refuses to overwrite an existing
destination. The standard kit has no external fonts, scripts or network-loaded
visuals, so the report opens offline. Links to sources still require access to
those sources. Keep a Markdown source when the project already uses one; do not
create a second prose source of truth merely to satisfy this skill.

If custom JavaScript or external assets are necessary, state the dependency and
verify that behavior separately. Prefer inline SVG and native HTML for simple
charts, diagrams and disclosures. Save only requested final artifacts in the
project; put temporary checks in a scratch directory.

## Verify and deliver

Run [scripts/check.mjs](scripts/check.mjs) against the standalone file:

```sh
node <skill>/scripts/check.mjs report.html --out <scratch>/report-check
```

The checker requires `puppeteer-core` resolvable from the current working
directory or script installation, and Chrome (set `CHROME_PATH` if needed).
Use an existing browser tool when available instead of installing another one;
verify the same desktop/mobile, light/dark and print scenarios. Screenshot and
console checks are not a complete accessibility audit.

Read the desktop and mobile screenshots; inspect print output for clipping.
Fix unreadable labels, overflow and missing content, then rerun affected checks.
If browser verification is unavailable, state that limitation; do not claim
visual verification passed. Deliver a clickable file link, the conclusion and
material limitations. Publish only when requested.

Kit-and-verifier approach inspired by Alfonso Graziano's
[create-html-report](https://github.com/alfonsograziano/skills/tree/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/create-html-report).
