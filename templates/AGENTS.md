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