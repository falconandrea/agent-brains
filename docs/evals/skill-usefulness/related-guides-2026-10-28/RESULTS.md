# Related-guides prototypes — tentative preference recorded

Two real Astro proposals generated and rendered on independent copies of
Appunti dal Giappone. User tentatively preferred Version 1 ("forse la 1"); neither proposal is
approved for production. No original-project writes, commits, pushes or deploys
were performed by this experiment.

## Fixed case and generation

Baseline `8659d7b7e03b5ede4bb82352bad83073eb5d1174`, initially clean. The transport
overview receives one section after the article and before existing controls.
Three published airport/Suica/Shinkansen guides use frozen titles, descriptions,
order and destinations. [Protocol](PROTOCOL.md), [frozen inputs](inputs.json),
[fixture/source hashes](fixture.json), [gate](gate.json), [raw model run](raw.json).

The model was zai/glm-5.2, thinking off, one generation per condition, no tools.
The shared context includes project directives, stack, real CSS and components.
Essential guidance = Astro/designer/Tailwind entry points; expanded = essential
plus frontend-design/ui-ux-pro-max/tailwind-design-system. The expanded prompt
contains the exact essential prompt plus only extra guidance. Both sessions
have identical system prompts, retained in raw.json. The random label mapping
is retained separately in condition-mapping.json for disclosure after the
initial preference. Previews do not label the conditions.

This is a real-component rendering trial of entry-point guidance, not a full
autonomous-agent, reference-database, trigger-selection or production-router
experiment. One sample per condition cannot establish skill efficacy or
attribute all design differences to guidance rather than generation variance.

## Applied changes in disposable copies

- One generated RelatedGuides.astro, passed the same frozen data via the same
  PostDetails.astro insertion. Only the selected article gets the prototype.
- No design corrections or model regenerations. Raw proposal files are retained;
  implemented files contain only project Prettier normalization (version 2's
  component needed formatting; version 1 was already formatted).
- Identical preview safety changes: GoogleTagManager.astro is inert and
  `/api/like` is a local fixed-response stub. No .env files or shared agent
  symlinks are copied. Dependencies are independent clones, not writable links
  to the source project's node_modules.
- [Integration patches](integration-1.patch) and [safety patch](preview-safety.patch)
  are retained; the two integration patches are byte-identical. Applied safety
  stubs are for disposable previews and are not intended as a production patch.

Exactly four source paths differ per copy from the frozen baseline: the generated
component, PostDetails, the tracking component and the like endpoint. Other
tracked source files match the initial hashes. Generated local caches are
outside this source comparison.

## Verification

Both copies pass Astro check on 66 files with zero errors/warnings/hints,
targeted ESLint and Prettier. Command outputs are in [verification.json](verification.json).
No full production build or production-service check was needed for this
component-level dev preview.

[Browser checks](browser-results.json) cover eight combinations: two proposals ×
desktop 1440×1000/mobile 390×844 × light/dark. Existing installed Playwright
Chromium was reused rather than installing a second Python browser stack.
External requests are blocked and local API responses are stubbed during checks.

For both proposals in every combination:

- Three guide links in the expected order with full unaltered titles/descriptions.
- Native keyboard Tab/Enter navigation, visible focus and link heights ≥44px.
- No clipped/ellipsized guide links or new horizontal section overflow.
- All three links open the expected local article; other articles have no prototype.
- Selected article text matches its baseline DOM, and previous/next controls
  match between proposals. No browser page errors or failed same-origin responses.

The original snapshot has **515px document width at a 390px viewport**, even
after removing only the experimental subtree in the browser. Both proposals
retain the same width. Thus the initial whole-page no-overflow criterion is
not met by the starting page; the prototypes do not introduce this defect.
The browser baseline is obtained by removing only the prototype DOM subtree,
then reloading for the candidate. A query-based baseline was rejected because
the real article route is prerendered.

Earlier instrumentation attempts needed selector fixes: Astro's dev toolbar
has its own h1 elements and the site inserts a heading permalink inside the
new section. Those were evaluator issues, not candidate regeneration. The
retained browser-instrumentation-initial.json is explicitly superseded; its
reported geometry failures refer to the small heading permalink, not a guide.
Final selectors scope h1 to main and geometry to the three /posts links.

One static integration difference remains for an adoption review: Version 1
marks its section `data-pagefind-ignore`, while Version 2 does not. Search-index
output was not built or tested here; production adoption should decide the
intended treatment of this navigational section explicitly.

Sixteen PNGs include section crops and viewport context for each combination.
Section-only crops temporarily hide the existing progress bar/back-to-top
overlay to avoid screenshot clipping artifacts; context captures retain them.
Both omit Astro's development toolbar. Screenshot-only styling does not change
the source candidates or the interactive local previews.

## Concurrent original-project update

The final integrity check found the original clean on a newer independently
created commit, `cb79d11` (compact header and wide-table containment). Four
tracked files changed since the snapshot: lessons, progress, Header.astro and
typography.css. Initial hashes were verified against the baseline Git blobs;
both experiment copies remain pinned to that baseline. The new commit is not
overwritten, merged, or represented as part of this experiment. The mobile
overflow observation applies to the old snapshot, not a diagnosis of the new
original HEAD. See [summary](summary.json).

## Preference and bounded interpretation

The user saw neutral-label previews and replied "forse la 1": a tentative
preference for Version 1. The retained mapping is now disclosed:
Version 1 = expanded guidance, Version 2 = essential guidance. Version 1 used
Astro/designer/Tailwind plus frontend-design, ui-ux-pro-max and
tailwind-design-system; Version 2 used only the first three. This is a weak
human preference for one realization, not an adoption approval or demonstrated
causal improvement from those additional skills. Both proposals passed the
objective component checks. Keep the specialist design skills provisionally;
this case does not support removing them or loading them for every small edit.
No broad quality or savings conclusion is justified. Cache/token/cost and
elapsed observations are retained in raw.json/summary.json; those are SDK
pricing fields, not verified billing, and are not used to bias the first review.
The tentative preference and mapping are now recorded for C5. Adoption and any adaptation to the newer project
HEAD and publication remain separate decisions.

Local previews (while the dev processes remain running):

- Version 1: http://127.0.0.1:4341/posts/come-muoversi-in-giappone#related-guides-heading
- Version 2: http://127.0.0.1:4342/posts/come-muoversi-in-giappone#related-guides-heading

Copy paths are in fixture.json. Raw/implemented Astro files and patches are
retained so the proposals remain reviewable if disposable copies are removed.
