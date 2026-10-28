# Implement the selected related-guides section in Appunti dal Giappone

This is the concrete handoff requested by the owner for the agent working in
`/Users/andreafalcon/dev/appuntidalgiappone`. The prototype preference was
tentative; the owner can send this handoff with an explicit implementation
request in that project's session. It does not itself write to that repository.

## Selected reference and scope

Implement Version 1 of **«Continua a organizzare il viaggio»**, initially only
on `/posts/come-muoversi-in-giappone`. Add it immediately after article content,
before the existing separator/like/share/previous-next areas. Preserve those
controls, article body, URLs, metadata and unrelated work.

Use this ready-made component as the visual/markup reference:
[implemented-1.astro](implemented-1.astro). Its Props are an array of
`{ href: string; title: string; description: string }`. It uses the site's
existing tokens, blue/orange link titles, decorative arrows and readable
descriptions. It includes `data-pagefind-ignore` for navigational content.
Adapt only where needed to the current source/project conventions, preserving
the selected appearance. [Desktop screenshot](previews/version-1-desktop-light-context.png),
[mobile screenshot](previews/version-1-mobile-light.png).

The three guides, in this order:

1. `treno-aeroporto-tokyo-haneda-narita`
2. `carta-suica-come-funziona-iphone`
3. `shinkansen-quando-prenotare-biglietti-jr-pass`

Use each published entry's current title/description and the project's existing
path helper. An explicit curated mapping for this one guide is sufficient;
no recommendation engine, automatic tag ranking, CMS or new dependency.
Check draft/future visibility using the project's existing publication rules.
Preserve this order and avoid showing the current article as a related item.
Do not add blocks to every article or mark a site-wide rollout complete.

## Integrate against current source

Read the current AGENTS, progress, lessons and relevant stack/style references
first. The prototype started from `8659d7b`; the source independently advanced
to `cb79d11` (compact header / wide-table containment) during the experiment.
There may be further work now. Preserve the current changes and use the current
branch; do not reset the repository to the prototype snapshot.

Copy/adapt only the selected component and its narrow production integration.
[integration-1.patch](integration-1.patch) illustrates the insertion seam, but
its hardcoded `experimentalRelatedGuides` values and `data-prototype-related`
wrapper belong to the trial. Prefer current content metadata rather than
duplicating stale titles/descriptions, and remove experimental naming.

**Do not apply preview-safety.patch or copy the whole temporary project.**
The disposable copies intentionally disabled GoogleTagManager.astro and replaced
`src/pages/api/like.ts` with a stub. The production tracking/consent and like API
must keep their current implementations. Do not copy node_modules, .astro,
credentials, agent links or temporary configurations from the trial.

## Verification and completion

- Current Astro check and targeted lint/format for the changed files.
- Browser at mobile/desktop in light/dark: long titles and descriptions remain
  readable, section fits the container, no new horizontal overflow or clipping.
- Three exact destinations work, links have visible keyboard focus and native
  Enter activation, article body and existing navigation are preserved.
- Verify a second article has no new section. Keep the block static with no
  client JavaScript or runtime service call.
- Use local/stubbed verification so automated checks do not send real analytics
  events or mutate production data. Prior trial checks are historical evidence,
  not a substitute for verification against the current implementation.
- Update project progress and the roadmap with the one-page pilot scope. A full
  build/search-index check is warranted only if the chosen integration needs it.

Report changed files and observed checks; leave commit/push/deploy to the
authorization in the receiving session. The experiment did not approve them.
