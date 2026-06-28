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
- **Always apply the `designer` skill** (`.agents/skills/designer.md`) when working on frontend files (Blade, JSX, Vue, CSS, Tailwind).
- Also apply relevant UI skills from `.agents/skills/` (e.g., `tailwindcss-development`, `ui-ux-pro-max`, `frontend-design`) when touching visual components.
- Color palette, typography, spacing scale, and component variants defined in the design system are **non-negotiable**. Any deviation must be explicitly approved by the user.

## Development Workflow

Follow this lifecycle for any non-trivial feature work. The phases are enforced by skills — do not skip them.

### Before writing code

- **`/feature`** — for any new feature, modification of behavior, or fuzzy idea. Runs a HARD-GATE design phase (Discovery → Approaches → PRD → Tasks) and produces a PRD + task list under `.ai/features/[name]/`. Do not write code, scaffold, or invoke implementation skills until the user approves the PRD.
- **`grill-with-docs`** (optional) — if the project has `.ai/context/GLOSSARY.md` or ADRs, use it to stress-test the PRD against the project's documented language and decisions before moving to tasks.

### During implementation

- **Framework agents** (`/laravel`, `/nextjs`, `/astro`) — switch to a fresh chat and reference the task file path. They implement the task list using **`tdd`** (red-green-refactor, one test → one implementation → repeat).
- **`to-issues`** (optional) — if the task list needs to be tracked, publish each task as a tracer-bullet vertical slice on the issue tracker.
- **`to-prd`** (optional) — if a formal, shareable PRD is needed for the team, synthesize from the existing context.

### Before claiming work is done

- **`verification-before-completion`** — run the actual lint, typecheck, and test commands and confirm the output before claiming anything is fixed, complete, or passing.

### On bugs

- **`diagnose`** — auto-activates on bugs. Build a reproducible case first, minimize it, then fix. Never guess at a fix without a repro.

### When a chat becomes too long

- **`/handoff`** — when the conversation grows too long (deep context, many back-and-forths, multiple tasks done), invoke `/handoff` to compact it into a document the next agent can pick up in a fresh chat. Do not duplicate content already in PRDs/task lists/issues/ADRs — reference them by path.

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