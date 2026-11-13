# Tech stack — agent-brains

Verified against the repository on 2026-11-12 (T9 compatibility; `package.json`,
`tsconfig.json`, installed toolchain). This is a tooling/skills repository, not an
application: there is no runtime deployment target.

## Language and runtime

- TypeScript 5.9.3 (devDependency `typescript ^5.6.0`), strict mode,
  `ES2023` target, ES modules (`"type": "module"`), `noEmit` typecheck only —
  nothing is compiled or published; the source is consumed in place.
- Node.js `>=24.12.0 <25` (`engines`), tested on v24.12.0/macOS arm64.
  Other majors/platforms are unverified; tests run directly with type stripping.

## Pi package

- The repository is a Pi package (`pi` key in `package.json`): extensions from
  `./extensions`, skills from `./.agents/skills`.
- Pi SDK peers `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai` and
  `@earendil-works/pi-tui` are pinned to 1.5.2; direct `typebox` to 1.3.27.
  npm installs these peers for the local checkout; they are not bundled.
  [Compatibility scope and evidence](../../docs/pi-brain/README.md#supported-compatibility-baseline).

## Tests and checks

- Test runner: `node --test` over `tests/**/*.test.ts` (`npm test`).
- Typecheck: `tsc --noEmit` (`npm run typecheck`).
- SDK/workflow smoke: `npm run smoke:pi`, using scripted loopback SSE and
  a temporary Git/Pi fixture; distinct from real-provider/TUI validation.
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
