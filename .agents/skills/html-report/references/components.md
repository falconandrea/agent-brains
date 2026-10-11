# Report markup

The bundled theme is neutral, uses system fonts and contains light, dark, mobile
and print styles. Sections should reflect the amount of evidence available.

- `.lead`: short explanation below the report title.
- `.meta`: date, scope and source context.
- `.takeaway`: the finding or recommended action; do not highlight everything.
- `.metrics` containing `.metric`: optional parallel quantities, each with its
  unit, date and uncertainty. Never use empty KPI placeholders.
- `.table-wrap`: horizontally scrollable comparison table on small screens.
  Use a caption, column headers and row headers where appropriate.
- `.bar-chart`: list of `.bar-row` items; each contains a label and value plus a
  `.bar-track` with `.bar-fill` inside. Set `--value: 0%` through `100%` on the
  fill. The bar is decorative (`aria-hidden="true"`); the visible label/value
  carries the evidence. All bars in a comparison use the same stated scale.
- `<ol class="steps">`: ordered actions when order matters.
- `<details>`: optional methodology; print styles expose its contents.
- `.sources`: sources with stable IDs for near-claim links.

For a chart, state the unit and denominator and include the underlying values.
For a qualitative comparison, a table is often sufficient. Native `details`
provides keyboard-accessible disclosure without a JavaScript dependency.

Internal links such as `<a href="#source-1">Official documentation</a>` should
resolve to an entry with its original URL, date where relevant and scope.
Source citations identify evidence; the skill's origin belongs in skill metadata,
unless the report itself discusses the methodology.
