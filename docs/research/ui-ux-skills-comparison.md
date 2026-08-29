# UI/UX skill comparison for anti-slop landing pages

Date: 2026-08-29

## Summary

The UI/UX skills we already have cover almost the entire needed lifecycle:

- `frontend-design`: art direction, brief, typography, distinctive layout, and anti-template self-critique.
- `ui-ux-pro-max`: structured exploration of product types, styles, palettes, fonts, landing patterns, and UX; can generate and persist a design system.
- `designer`: hierarchy, consistency, states, accessibility, and the requirement to read the project's design system first.
- `tailwind-design-system`: tokens, components, and responsive design with Tailwind v4.
- `emil-design-eng`: criteria for deciding whether to animate, duration, easing, performance, accessibility, and motion restraint.
- `web-design-guidelines`: final review against up-to-date web guidelines.
- `webapp-testing` and `pagespeed-optimizer`: visual, browser, performance, and responsive verification.

For a new landing page there is no need to install a second large "design brain". What is needed is mostly a workflow that composes these skills well and makes exploration, motivated choices, real assets, and desktop/mobile verification mandatory.

## Resources examined

### UI Skills

The site is a catalog/registry, not a single skill. It lists several skills we already have locally, including `frontend-design`, `ui-ux-pro-max`, `improve-animations`, and `web-design-guidelines`, plus possible additions such as `better-ui`, `design-lab`, `impeccable`, and `create-design-md`.

Source: [UI Skills](https://www.ui-skills.com/)

### `better-ui`

It is a good craft complement: concentric border radii, optical alignment, borders vs shadows, interruptible transitions, icon strokes, and micro-interactions with precise values. It is more useful for refining components than for setting a landing page's direction. Some areas are delegated to sibling skills (`better-typography`, `better-accessibility`, `better-layout`).

Source: [better-ui](https://www.ui-skills.com/skills/jakubkrehel/better-ui)

### `impeccable`

It is the most interesting candidate if you want a single operating system for design and review: it distinguishes a `Persuade` mode for landing/marketing, offers `shape`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `distill`, and `animate`, and uses artifacts such as `PRODUCT.md` and `DESIGN.md`. However it overlaps heavily with `frontend-design` + `designer` + `web-design-guidelines`; adopting it alongside them without a clear hierarchy can create process conflicts and document naming conflicts.

Source: [impeccable](https://www.ui-skills.com/skills/pbakaus/impeccable)

### `design-lab`

It is useful for exploring variants and gathering feedback: preflight, inference of the existing style, interview, variation generation, and refinement. It is an interactive workflow more than a source of aesthetic rules. It makes sense when you need to compare 2–3 directions; it is overkill for a small change.

Source: [design-lab](https://www.ui-skills.com/skills/0xdesign/design-lab)

### `create-design-md`

It is very useful for extracting a visual language from an existing repository or site, using evidence such as tokens, computed CSS, components, and desktop/mobile behavior. For a greenfield landing it does not replace the art direction phase: there is no system to extract yet. It is instead a good model for improving the discipline with which we generate our own `DESIGN_SYSTEM.md`.

Source: [create-design-md](https://www.ui-skills.com/skills/ibelick/create-design-md)

### `design-taste-frontend` / `gpt-taste`

It has good intentions and some valid checks: it reads the brief, makes audience and references explicit, introduces dials for variance/motion/density, avoids generic meta-labels, and includes a pre-flight checklist.

I would not use it as is, though. It imposes pseudo-random randomization, AIDA, H1s of at most 2–3 lines, bento with no empty cells, large padding, and above all mandatory GSAP/motion. These are heuristics that only apply in some cases; applied always, they become a new "Awwwards" template, with potential performance, accessibility, and conversion problems.

Source: [design-taste-frontend](https://www.skills.sh/leonxlnx/taste-skill/design-taste-frontend) and [gpt-taste in the UI Skills catalog](https://www.ui-skills.com/skills/leonxlnx/gpt-tasteskill)

### `designsystemchecklist.com`

It is a checklist of foundations, language, components, and maintenance, not an operational skill for creating a landing page. The foundations include color, layout, typography, elevation, motion, and iconography; the component catalog also covers buttons, cards, carousels, forms, modals, tabs, toasts, and other patterns. The repository also requires references for every new item.

Source: [Design System Checklist repository](https://github.com/ardakaracizmeli/design-system-checklist), [foundations](https://raw.githubusercontent.com/ardakaracizmeli/design-system-checklist/master/src/data/designFoundations.js), [language](https://raw.githubusercontent.com/ardakaracizmeli/design-system-checklist/master/src/data/designLanguage.js)

I would use it as an audit reference/checklist, not as an always-on skill. If a new local skill is needed, a more useful one would be a `design-system-audit` focused on the project's tokens, components, accessibility, and consistency, with evidence-based output.

### Emil Kowalski's article

It is not primarily a skill to install: it is a decision rule about motion. The central criteria are purpose, frequency of use, perceived speed, and the absence of animation when the interaction is repeated or keyboard-driven; as a general rule it suggests staying under 300 ms for UI animations. These principles are already represented by the local `emil-design-eng`, `review-animations`, and `improve-animations`.

Source: [You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations)

## Recommended decision

1. Do not install the whole UI Skills catalog.
2. Do not add `design-system-checklist` as a standalone skill now.
3. Consider `impeccable` only as an alternative/main coordinator, not in full parallel with the creative skills we already have.
4. Take the missing craft principles from `better-ui`, or install it only if the landing will require intensive micro-interaction and component refinement.
5. Use `design-lab` only when comparing variants with feedback is genuinely needed.
6. For the future, create a local `landing-page-design` skill that orchestrates the existing set: brief → 2–3 directions → evidence-based design system → implementation → desktop/mobile screenshots → final audit.

## Recommended operating stack for the next landing page

- Direction and anti-slop: `frontend-design`.
- Motivated alternative palettes/fonts/layouts: `ui-ux-pro-max`.
- Persistent design contract: `designer` + a `DESIGN_SYSTEM.md` consistent with the project.
- Tokens and components: `tailwind-design-system` if the project uses Tailwind.
- Motion only when needed: `emil-design-eng`.
- QA: `web-design-guidelines`, `webapp-testing`, `pagespeed-optimizer`.

## Role-based workflow for landing pages

The most useful direction is not activating all the skills at once, but separating four responsibilities. The agents should have different outputs, limits, and activation moments.

| Role | Responsibility | Limit |
| --- | --- | --- |
| `landing-art-director` / Awwwards | Generate 2–3 specific visual directions, with concept, hero, typography, palette, layout, assets, motion, and signature element. | Does not write code right away and does not impose AIDA, bento, GSAP, or other patterns unless motivated by the brief. |
| `design-system-author` | Turn the approved direction into a persistent design system usable by the coding agent. | Does not invent a new aesthetic direction. |
| `impeccable-reviewer` | Verify brief, hierarchy, visual consistency, UX, responsiveness, and perceived quality; produces evidence-backed findings. | Does not redo the layout to its own taste and does not modify code without a mandate. |
| `design-system-auditor` | Mechanically check tokens, components, states, accessibility, motion, and responsiveness. | Does not decide whether the design is "beautiful": it checks completeness and consistency. |

### Full workflow for a new landing page

```text
brief
  → landing-art-director
  → human choice of one direction
  → design-system-author
  → frontend implementation
  → impeccable-reviewer
  → design-system-auditor
  → web-design-guidelines + screenshot/performance QA
```

The human choice after the visual directions is a mandatory gate. The system must not move automatically from exploration to implementation.

### Scenarios

1. **Greenfield landing**: run the full workflow.
2. **Existing site with a brand**: use `create-design-md` first, then constrain art direction to the extracted visual language.
3. **Finished but flat landing**: go straight to `impeccable-reviewer`, possibly in "bolder" mode.
4. **Motion-heavy landing**: add `emil-design-eng` only after deciding the motion has a purpose.
5. **Comparing variants**: optionally use `design-lab` for exploration and feedback.

### Role of `impeccable`

`impeccable` can work as a quality validator. It should be run against three sources, in this order:

1. the brief and the page's goal;
2. the approved design system;
3. the implementation and desktop/mobile screenshots.

Its output should be a findings table with severity, evidence, impact, and proposed fix. It must not become a second art director that overrides the chosen direction.

### Role of the checklist

The checklist is a completeness gate separate from the aesthetic review. It should answer binary questions such as:

- do semantic tokens exist for colors, typography, spacing, and radius?
- are hover, focus, active, disabled, and loading covered?
- do images have aspect ratio, dimensions, and alt text?
- are contrast, touch targets, reduced motion, and responsive behavior respected?
- does the system avoid hardcoded values and duplicated components?

### Canonical artifact

Do not create `DESIGN.md` and `.ai/context/DESIGN_SYSTEM.md` at the same time. The local `designer` skill currently reads `.ai/context/DESIGN_SYSTEM.md`, while `create-design-md` uses `DESIGN.md`. V1 should pick a single format; the recommended choice is `.ai/context/DESIGN_SYSTEM.md`, with possible support for `DESIGN.md` as a fallback.

The document should contain at least:

- audience, goal, and visual thesis;
- fonts, type scale, and wrapping rules;
- palette with semantic tokens;
- container, grid, spacing, and breakpoints;
- main components and states;
- rules for images, icons, and assets;
- motion budget and reduced-motion behavior;
- responsive behavior;
- project-specific explicit anti-patterns.

### Recommended V1

Do not immediately create four separate autonomous agents. Create a single user-facing workflow, for example `landing-page`, with modes:

- `concept`: activates the art director;
- `document`: creates or updates the design system;
- `review`: activates the qualitative review;
- `audit`: runs the checklist and technical QA.

This way the agents stay specialized, but the user follows a single path and does not need to know which skills to combine manually. Add separate agents only once the workflow is reused enough to justify the maintenance cost.
