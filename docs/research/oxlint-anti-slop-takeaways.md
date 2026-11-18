# oxlint-anti-slop: retained ideas

Date: 2026-11-16. Discussion note based on the linked upstream README and
rule documentation, plus inspection of local `src/verify.ts` and
`src/workflows/revise.ts`. No plugin execution or effectiveness evaluation.

## Decision

Retain useful principles without adopting the package, copying its rules into
a skill, or opening a new implementation workstream. Revisit when a concrete
code change or observed defect makes a check worthwhile.

## Useful principles

- Preserve available type information: prefer inference and `satisfies` over
  widening a known local value and recovering its type through assertions.
- Make validation boundaries explicit: accept external data as `unknown`,
  validate the required contract, and expose the validated domain type.
  `Record<string, unknown>` remains appropriate for genuinely dynamic data.
- Give actionable diagnostics: explain the risk and a suitable correction,
  rather than merely forbidding syntax.
- Move repeatable, high-signal checks into tools where practical. Determinism
  means repeatability, not proof that a rule measures correctness or quality.
  Measure useful findings, intentional exceptions and false positives before
  making a check mandatory. Naming conventions alone do not establish value.

## Local opportunities and limits

`parseRevisionEvent` in `src/workflows/revise.ts` uses chained assertions
after runtime checks. This is a candidate for examining whether validation
fully establishes each event contract and whether TypeScript can express that
fact. The assertions alone do not demonstrate a bug; moving them into a helper
would not establish safety either. No parser refactor is authorized by this note.

`resolveVerifyCommands` in `src/verify.ts` marks automatically detected lint
as non-blocking, but explicitly configured verification commands are already
blocking. Mandatory project checks therefore do not inherently require an
orchestration change.

If a real need emerges, start with the invariant and choose the cheapest
effective existing check. Instructions can explain design intent while tools
enforce a mechanically checkable part; avoid duplicating whole rule catalogs.
No Node upgrade, dependency addition or global lint policy is selected.

## Sources

- [Upstream project and diagnostic example](https://github.com/emilioSp/oxlint-anti-slop)
- [Preserving local type information](https://github.com/emilioSp/oxlint-anti-slop/blob/main/docs/rules/no-narrowing-after-widening.md)
- [Dictionary value contracts](https://github.com/emilioSp/oxlint-anti-slop/blob/main/docs/rules/no-unsafe-dictionary-values.md)
- [Local verification resolver](../../src/verify.ts)
- [Local revision parser](../../src/workflows/revise.ts)
