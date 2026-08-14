# AGENTS.md — Project Directives

> This file defines the rules and conventions that all AI agents must follow in this project.

## General Rules

- Read `.ai/context/TECH_STACK.md` before making any technical decision.
- Read `.ai/memory/lessons.md` before starting work to avoid repeating past mistakes.
- Always update `.ai/memory/progress.md` when completing a task.
- Write clean, well-documented code following the project's established patterns.
- Never install a dependency without checking if it's already in the project.
- **Before writing any UI code**, read `.ai/context/DESIGN_SYSTEM.md` (if present) and follow it strictly. Do not invent colors, typography, or spacing — always defer to the design system.

## Design System

- Source of truth for all UI decisions: `.ai/context/DESIGN_SYSTEM.md`
- **Always apply the `designer` skill** (`.agents/skills/designer/SKILL.md`) when working on frontend files (Blade, JSX, Vue, CSS, Tailwind).
- Also apply relevant UI skills from `.agents/skills/` (e.g., `tailwindcss-development`, `ui-ux-pro-max`, `frontend-design`) when touching visual components.
- Color palette, typography, spacing scale, and component variants defined in the design system are **non-negotiable**. Any deviation must be explicitly approved by the user.

## Context Routing

Load context **by area**, not "everything upfront". Read the file only if the task touches that area.

| Task area | Read / activate |
|---|---|
| General orientation | `AGENTS.md`, `.ai/context/TECH_STACK.md`, `.ai/memory/progress.md`, `.ai/memory/lessons.md` |
| Laravel backend | Boost-generated `AGENTS.md` + `laravel-best-practices` skill |
| Livewire / Volt | Add `livewire-development` or `volt-development` |
| Pest / test code | Add `pest-testing` |
| UI / Tailwind / Blade / JSX | `.ai/context/DESIGN_SYSTEM.md` (mandatory) + `designer` + the one relevant UI skill |
| Hard bug / regression | `diagnosing-bugs` |
| Completion claim | `verification-before-completion` only when the user asked for verification |

`.ai/context/APP_FLOW.md`, `GLOSSARY.md`, `database_schema.mmd` are read **only** when the requested area needs them. Do not preload.

## Verification Policy

**Default — minimal and proportional:**
- For a behavior change, run only the **smallest** verification that proves it (one targeted test, the affected route, a typecheck on the touched file).
- **Never** run the full suite, lint everything, or rebuild unless the user asks or the change clearly requires it.
- No "while I'm here" extra checks — they add cost without value.

**Manual mode** — when the user says "verifica manuale" / "manual verify" / "don't run anything":
- Do **not** run tests, lint, typecheck, build, or browser checks.
- Output the exact commands the user should run, and wait for them to paste failures before touching code again.
- Still explain what each command verifies and what success looks like.

## Development Workflow

Follow this lifecycle for any non-trivial feature work. The phases are enforced by skills — do not skip them.

### Before writing code

- **Fast path** — typo, config tweak, one-line fix, isolated refactor: do **not** invoke `/feature`. Use `AGENTS.md` + the relevant framework/domain skill and make the change directly. No PRD unless the user asks for one.
- **`/feature`** — for any new feature, modification of behavior, or fuzzy idea that is **not** a fast path. Runs a HARD-GATE design phase (Discovery → Approaches → PRD → Tasks) and produces a PRD + task list under `.ai/features/[name]/`. Do not write code, scaffold, or invoke implementation skills until the user approves the PRD.
- **`grill-with-docs`** (optional) — if the project has `.ai/context/GLOSSARY.md` or ADRs, use it to stress-test the PRD against the project's documented language and decisions before moving to tasks.

### During implementation

- **Framework agents** (`/laravel`, `/nextjs`, `/astro`) — switch to a fresh chat and reference the task file path. They implement the task list using **`tdd`** (red-green-refactor, one test → one implementation → repeat).
- **`to-tickets`** (optional) — if the task list needs to be tracked, publish each task as a tracer-bullet vertical slice on the issue tracker.
- **`to-spec`** (optional) — if a formal, shareable PRD is needed for the team, synthesize from the existing context.

### Before claiming work is done

- Run verification per the **Verification Policy** above (minimal by default; manual mode if requested).
- **`verification-before-completion`** — only when the user explicitly asked for verification. Run the actual lint, typecheck, and test commands and confirm the output before claiming anything is fixed, complete, or passing.

### On bugs

- **`diagnosing-bugs`** — auto-activates on bugs. Build a reproducible case first, minimize it, then fix. Never guess at a fix without a repro.

### When a chat becomes too long

- **`/handoff`** — when the conversation grows too long (deep context, many back-and-forths, multiple tasks done), invoke `/handoff` to compact it into a document the next agent can pick up in a fresh chat. Do not duplicate content already in PRDs/task lists/issues/ADRs — reference them by path.

### Frontend & Motion

Pick a frontend skill by **intent**, not by "frontend" in general. Triggering the wrong one is the most common cause of generic AI-slop output.

- **`frontend-design`** — bold/distinctive aesthetics, landing pages, marketing, hero sections, concept UI, posters. Anti-AI-slop. Picks an intentional aesthetic.
- **`ui-ux-pro-max`** — product UI structure & design systems: dashboards, admin panels, SaaS, charts. Database of 161 color palettes, 57 font pairings, 25 chart types.
- **`emil-design-eng`** — animations, transitions, easing curves, spring physics, micro-interactions, gestures, polish/feel. Sonner/Vaul author's motion philosophy.
- **`shadcn`** — shadcn/ui components (add, fix, style, compose).
- **`tailwindcss-development`** — Tailwind utility classes, responsive layouts, dark mode.
- **`tailwind-design-system`** — scalable design systems with Tailwind v4 (tokens, component libraries).
- **`vercel-react-view-transitions`** — View Transition API (page transitions, shared-element animations).
- **`vercel-composition-patterns`** — React composition (compound components, render props, context).
- **`vercel-react-best-practices`** — React/Next.js performance (RSC, data fetching, bundle size).
- **`web-design-guidelines`** — review UI against Vercel Web Interface Guidelines.
- **`/review-animations`** — slash command. Review animation/motion code against a brutal craft bar.

## Coding Conventions

<!-- Customize per project -->
- Follow the existing code style and naming conventions.
- Don't commit or push code to the repository. That's my job. Always let me review the code before committing it.
- Add comments only for non-obvious logic.
- Always write comments and code in English, even if the response is in Italian.

## Communication

- Respond in Italian unless the context requires English.
- Be concise. Avoid unnecessary explanations.
- When in doubt, ask rather than assume.