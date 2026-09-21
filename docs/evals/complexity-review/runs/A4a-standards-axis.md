# A4a — code-review, Standards axis on Diff A — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (the lens under test; not referenced by this
  run) and, later in the session, unrelated R0.4 artifacts — see
  [README.md](README.md) for the exact chronology
- Evaluated range: `96c639b...763387a`
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens: `.agents/skills/code-review/SKILL.md` Standards axis, executed faithfully
  (separate sub-agent, per the skill's contract)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are the Standards sub-agent of a two-axis code review, executing exactly the brief below. Repository: /Users/andreafalcon/dev/agent-brains.

READ-ONLY: do not create/edit/delete files; no mutating git commands; no installs. Only read files and run read-only commands (git show/diff/log, ls). This is a historical-diff review; there is no issue tracker.

Diff command: git diff 96c639b...763387a
Commit list (git log 96c639b..763387a --oneline): 763387a Add read-only context audit skill
You may read files in the working tree for context; for line-accurate citation use `git show 763387a:<path>`.

Documented standards sources found in this repo (read them):
- templates/AGENTS.md (Conventions section)
- README.md (canonical skill-store, registration and explicit-only conventions)
(.agents/AGENTS.md is Laravel boilerplate with no vendor/ tree here; treat as inapplicable, nothing suppressed from it.)

On top of those, the smell baseline that always applies (from the review skill; each smell reads what it is → how to fix; match against the diff; a documented repo standard overrides the baseline; every smell is a labelled judgement call, never a hard violation; skip anything tooling already enforces):
- Mysterious Name — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- Duplicated Code — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- Feature Envy — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- Data Clumps — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- Primitive Obsession — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- Repeated Switches — the same switch/if-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- Shotgun Surgery — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- Divergent Change — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- Speculative Generality — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- Message Chains — long a.b().c().d() navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- Middle Man — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- Refused Bequest — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

Your brief (report under 400 words): Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words.

Return only your report as your final message.

## Raw output (verbatim)

**Standards review — 96c639b…763387a ("Add read-only context audit skill")**

**Documented-standard violations**

1. **Hard (docs-only impact): `profiles/full.list` not updated.** README.md "Adding a new agent skill — canonical workflow", step 2: *"For documentation only, also add a line to `profiles/full.list`"*, and `full.list`'s own header: *"Keep it in sync for documentation."* The diff adds `context-audit` to `profiles/common.list` but never to `full.list`; the reference list of "everything" is now out of sync.
2. `profiles/common.list` + `src/skill-router.ts` registrations both follow the README workflow correctly — no violation.
3. `templates/AGENTS.md` Conventions (Italian responses, no-commit) are template content for consuming projects; no root `AGENTS.md` exists here, and the diff doesn't touch `templates/`. Inapplicable to this change.

**Baseline smells (all judgement calls)**

1. **Duplicated Code — SKILL.md:22–43 ("Authority model").** The seven-row ownership table and precedence chain are copied verbatim from `templates/AGENTS.md` ("One fact type, one owner" table). It cites the source (`from templates/AGENTS.md`), but it's a second copy that will silently drift when the template is customized per project. Judgement: acceptable for a portable skill, but a pointer with only the delta would be sturdier.
2. **Duplicated Code — evals/README.md:118–124 ("Failure signals").** Near-verbatim repeat of SKILL.md's "Failure modes" paragraph ("modifies any file… reports a historical… mention as a broken operational reference… presents age as proof of staleness…"). One should reference the other.
3. **Speculative Generality — context-audit.mjs `--adr-dir` flag / `auditProject(root, { adrDir })`.** SKILL.md's documented invocation is `node …context-audit.mjs <project-root>` only; no eval or test passes `--adr-dir`; `ADR_CANDIDATES` autodetection already covers the nine documented locations. No demonstrated need.
4. **Duplicated Code (minor) — tests/unit.test.ts.** The new test re-asserts non-reach of `context-audit` for the five pipeline roles, which the adjacent banned-array test (now extended with `"context-audit"`) already covers. Only the `common.list`-membership and `missing`-surface assertions add new information.

Not flagged: the six-file scatter of one logical addition (skill, manifest, router, tests, roadmap) matches the README's prescribed canonical workflow, overriding the Shotgun Surgery baseline; the roadmap's own "source of truth" convention is respected (status header and tail both advanced R0.3→R0.4); read-only invariants are well-tested (mtime/hash snapshot test).
