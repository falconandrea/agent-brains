# B4a — code-review, Standards axis on Diff B — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (the lens under test; not referenced by this
  run) and, later in the session, unrelated R0.4 artifacts — see
  [README.md](README.md) for the exact chronology
- Evaluated range: `906c47e...ed43993` (historical; file versions read via
  `git show ed43993:<path>`)
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens: `.agents/skills/code-review/SKILL.md` Standards axis, executed faithfully
  (separate sub-agent, per the skill's contract)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are the Standards sub-agent of a two-axis code review, executing exactly the brief below. Repository: /Users/andreafalcon/dev/agent-brains.

READ-ONLY: do not create/edit/delete files; no mutating git commands; no installs. Only read files and run read-only commands (git show/diff/log, ls). This is a historical-diff review; there is no issue tracker.

Diff command: git diff 906c47e...ed43993
Commit list (git log 906c47e..ed43993 --oneline): ed43993 fix: repair grill-with-docs workflow
The diff is markdown/skill-only. For line-accurate citation use `git show ed43993:<path>`; read working-tree files for context if needed (they may have evolved).

Documented standards sources found in this repo (read them):
- README.md (canonical skill-store, registration and explicit-only conventions)
- templates/AGENTS.md (Conventions — template content for consuming projects; applies only if relevant to a markdown-only diff)
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

# Standards review — `906c47e...ed43993` (ed43993, markdown/skill-only)

## Documented standards

**README.md — skill-store & activation conventions.** No hard violations found:
- `grill-with-docs` is pre-existing and registered (`profiles/common.list:16`), so the README "Adding a new skill" workflow doesn't apply.
- Adding `agents/openai.yaml` with `allow_implicit_invocation: false` follows the README's explicit-only pattern — correct direction.

**Judgement call — activation semantics regression (README.md:105-109, spirit).** The old SKILL.md frontmatter carried `disable-model-invocation: true` (OpenCode's explicit-only guard); the rewrite drops it and adds only the Codex-side `agents/openai.yaml`. In OpenCode the skill can now be implicitly model-invoked, and it's a file-writing workflow. README's invasive list doesn't include `grill-with-docs`, so this isn't a hard breach, but the OpenCode half of the explicit-only contract was silently removed rather than replaced.

**templates/AGENTS.md.** Not touched by the diff; its Conventions target consuming projects' code. Its ownership/single-source-of-truth principle is *supported* by the change: `docs/pi-brain/README.md` now defers next-action to the roadmap instead of duplicating "R0.1".

## Baseline smells (all judgement calls)

- **Duplicated Code** — `SKILL.md` states the phase-gate rules four times: Invariants ("Keep the interview, output selection and output phases separate"; "Do not write source code…"), §2 ("Do not batch questions… or generate a PRD, ADR or glossary update while the interview is still open"), §3 ("Until approval, write nothing except the checkpoint"), §4 ("Write only the approved artifacts… Do not modify source code"). For an LLM prompt, deliberate reinforcement may be intended — flagging, not condemning.
- **Duplicated Code (minor, intra-file)** — `docs/plans/pi-plugin-adoption-roadmap.md` keeps the next action in three lockstep places: header "**Status:** planned — next action is R0.2", the R0.2 section "**Status:** NEXT", and the footer "**Next action:** R0.2 — tighten the project context templates." Each cycle demands three synchronized edits (the commit itself had to update all three). Consider one canonical location.
- No Mysterious Names ("GWD-1…3", "R0.1/R0.2" are defined at site), no Speculative Generality (evals are explicitly manual protocols, honestly labelled "no transcript is claimed"), no Shotgun Surgery across files (roadmap/README edits are the same logical status change).

## Verdict

Clean against documented standards; the dropped `disable-model-invocation` frontmatter is the one substantive concern worth a follow-up, plus the two duplication notes above.
