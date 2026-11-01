# Tech stack — agent-brains

Verified against the repository on 2026-10-31 (M4 self-alignment; `package.json`,
`tsconfig.json`, installed toolchain). This is a tooling/skills repository, not an
application: there is no runtime deployment target.

## Language and runtime

- TypeScript 5.9.3 (devDependency `typescript ^5.6.0`), strict mode,
  `ES2023` target, ES modules (`"type": "module"`), `noEmit` typecheck only —
  nothing is compiled or published; the source is consumed in place.
- Node.js v24 (tested on v24.12.0). No `engines` field is declared; the test
  runner requires a modern Node with the built-in `node:test` module.

## Pi package

- The repository is a Pi package (`pi` key in `package.json`): extensions from
  `./extensions`, skills from `./.agents/skills`.
- Pi SDK packages are peer dependencies: `@earendil-works/pi-coding-agent`,
  `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox`. They are
  installed as devDependencies of the local checkout (`npm install`), not
  bundled.

## Tests and checks

- Test runner: `node --test` over `tests/**/*.test.ts` (`npm test`).
- Typecheck: `tsc --noEmit` (`npm run typecheck`).
- Shell scripts (`setup.sh`, `scaffold.sh`, `unlink.sh`,
  `install-global-skills.sh`, `update-upstream-skills.sh`) are POSIX/bash and
  checked with `bash -n` when modified.

## Skill catalog

- `.agents/skills/` is the canonical catalog (66 installed globally by
  `install-global-skills.sh`); profiles in `profiles/*.list`; upstream-managed
  skills pinned in `skills-lock.json`, locally managed ones marked
  `metadata.management: local` in their frontmatter.
- Distribution model, invocation syntaxes per harness, and rollback are owned
  by the root [README](../../README.md) — do not duplicate them here.
