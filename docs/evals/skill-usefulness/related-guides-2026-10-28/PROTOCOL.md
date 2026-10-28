# Real-project related-guides prototype comparison

User approved two isolated proposals; no approval to merge or publish either.
Project baseline and all copied-file hashes are in fixture.json. The source
working tree was clean. Copies contain tracked real files, excluding credentials,
agent configurations and symlinks; dependencies are independent local clones.
No project-owned files or git metadata are modified in the original repository.

Use the existing transport overview page and three published guides (airport,
Suica, Shinkansen). Freeze titles, descriptions, order, URLs, context and task in
inputs.json before calls. No editorial content change or factual research.

Generate one Astro component per condition with zai/glm-5.2, thinking off:
essential = astro-framework/designer/tailwindcss-development;
expanded = essential plus frontend-design/ui-ux-pro-max/tailwind-design-system.
Guidance entry points and source context are included explicitly in the user
prompt. No model tools or reference database access. This is a real component
and browser preview trial, not a full autonomous coding-agent or router test.
Identical base task/context, identical system prompt. Different guidance is
the only generation intervention. Two samples cannot establish efficacy or
statistical equivalence. Do not regenerate candidates based on preference.

Randomly assign neutral labels 1/2 and retain the mapping for later disclosure.
Show previews without condition names initially. Record verbatim answers,
prompt/system hashes, usage, errors/retries and elapsed time. Stop on failure;
no automatic paid retry, no cherry-picked reruns. A 120-second call timeout
bounds each generation.

The evaluator inserts each component in the same seam of PostDetails.astro,
using the same frozen data, only for the transport overview. All original
article text, route metadata, links and previous/next controls are preserved.
Any required corrective edit must be recorded; retain original candidate source.

## Acceptance fixed before generation

- Exactly three published guide links in the specified order, with unaltered
  titles/descriptions and destinations; heading names the section.
- Accessible heading/list relationships and native link keyboard activation.
- Existing global tokens/type respected; no new dependency, client script,
  remote asset, production API call or unrelated original-file modification.
- Both copies compile/typecheck; targeted formatting/lint when applicable.
- Browser at 390x844 and 1440x1000, light and dark: no horizontal overflow,
  no clipping/overlap, readable full titles/descriptions, focus-visible links.
- Existing article and previous/next links remain; a separate article has no
  experimental section. Clicking each related link opens the expected page.
- Capture screenshot of the section in context in each viewport/theme and
  retain neutral-label image artifacts for user preference review.

Block external browser requests and local API writes (likes etc.); no real
analytics events or backend mutations. No env files. Record stubs and limits.
Project design-system fallback is existing source CSS, equally supplied.

Grade objective checks first; assess scanning, hierarchy, whitespace and
integration qualitatively without using condition names. Do not infer useful
design from token count or cost. Human preference remains pending until the
user sees the two proposals. Preserve both or discard both without changing
the actual project. Original snapshot hashes/status are rechecked at the end.
