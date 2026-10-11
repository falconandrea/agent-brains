# Optional scan for long prose

Use when the user requests reproducible scanning/comparison, or a long editing
task benefits from candidate locations. Ordinary short text and embedded PR
descriptions use the main skill directly. The scanner supports English lexical
patterns; for Italian or other languages use close reading and say the lexical
coverage is limited. It does not detect authorship or measure writing quality.

```sh
node <skill>/scripts/scan.mjs article.md
node <skill>/scripts/scan.mjs before.md after.md
```

Output is JSON: eligible prose word count, pattern candidates with line numbers,
raw counts and counts per 1,000 words. With two inputs, the comparison shows each
pattern's raw and normalized delta. Candidates require the main skill's
content-type calibration and false-positive checks. Quoted passages, fenced
code, frontmatter, HTML comments, inline code, URLs and Markdown table rows are
masked. This is a heuristic Markdown/text scanner, not an HTML/PDF parser;
for those formats extract prose with source locations first.

For file edits, preserve a before snapshot in scratch and compare both versions
with the same invocation. Record which candidate patterns were fixed, kept or
needed author input. Inspect increases individually: a falling total can hide
replacement of one empty formula with another. A rise is a review prompt, not
an automatic failure. If a draft was shortened substantially, check that
information survived; normalized counts can rise without new occurrences.

Read the final prose for changes outside scanner coverage, including repetitive
section shape, voice loss and invented specifics. Report residual problems and
coverage limits; never label a text clean solely because counts fell.

Candidate-scanning and per-pattern comparison approach inspired by Alfonso
Graziano's [remove-ai-slop](https://github.com/alfonsograziano/skills/tree/6dc8f1d7cd7ce59b8b65b693f05050c9e7b70270/skills/remove-ai-slop).
