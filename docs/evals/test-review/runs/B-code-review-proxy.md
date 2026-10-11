# Superseded baseline proxy

Not used as the independent baseline: both axes ran in one context.
Trailing Markdown hard-break spaces normalized on capture.

# Code review pilot B

Fixed point: `e5f8e56513820a49500e1226946ce34e0e4b78ea`
Reviewed target: `73acb85f01db38ad34f61cf7bf9f1c56a183d8e5`
Diff: `git diff e5f8e56...73acb85`
Commit list: `73acb85 fix: preserve project-owned agent configuration during setup`

Scope: T1–T3 setup/unlink work only. Historical files were read with `git show 73acb85:<path>`.

## Child-agent execution note

The available tool surface exposed no child-agent spawn operation, so two isolated review passes were run in this agent and recorded below. No tests were executed and no repository files were modified.

## Standards child prompt (exact prompt used for the independent pass)

Review `git diff e5f8e56...73acb85` and commit list `73acb85 fix: preserve project-owned agent configuration during setup` for T1–T3 setup/unlink only. Standards sources are target `README.md` (setup/unlink ownership contract) and target `.agents/AGENTS.md`; the Laravel commands in `.agents/AGENTS.md` do not apply to these root shell scripts. Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words.

Smell baseline (full):

- Mysterious Name: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- Duplicated Code: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- Feature Envy: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- Data Clumps: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- Primitive Obsession: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- Repeated Switches: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- Shotgun Surgery: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- Divergent Change: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- Speculative Generality: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- Message Chains: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- Middle Man: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- Refused Bequest: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

## Standards child output (verbatim)

1. **Hard documented-standard breach — `unlink.sh` does not report a real `.agents/skills` file.** In target `unlink.sh` lines 164–179, `unlink_agents` handles a skills symlink and an existing skills directory, but has no branch for a regular file at `$target/skills`; it silently falls through and later emits only the generic `.agents kept` message. Target `README.md` lines 97–100 says “Foreign symlinks and real files are preserved and reported.” Preserve behavior is safe, but the required diagnostic is missing.

2. **Judgement call — Duplicated Code.** The complete ownership helper set (`link_destination`, `physical_destination`, `resolve_link`, `link_points_to`, `link_is_managed_skill`) is duplicated between target `setup.sh` lines 74–127 and `unlink.sh` lines 65–117. The duplicated path-resolution policy can drift, so a shared sourced helper or generated common block would reduce maintenance risk. This is a baseline smell only; standalone scripts and Bash portability may justify the duplication.

## Spec child prompt (exact prompt used for the independent pass)

Review `git diff e5f8e56...73acb85` and commit list `73acb85 fix: preserve project-owned agent configuration during setup` against target `.ai/features/code-review-follow-ups/prd-code-review-follow-ups.md` and target `.ai/features/code-review-follow-ups/tasks-code-review-follow-ups.md`, read via `git show 73acb85:<path>`. Scope is F1/F2/F5 and T1–T3 setup/unlink only. Report: (a) requirements the spec asked for that are missing or partial; (b) behavior in the diff that was not asked for (scope creep); (c) requirements that look implemented but where implementation looks wrong. Quote the spec line for each finding. Under 400 words.

## Spec child output (verbatim)

1. **Partial/high — blocked curated→full conversion can mutate `.opencode` before failing.** The target `setup.sh` dispatch at lines 520–525 calls `link_opencode` before `prepare_full_agents`. If `.agents` is a curated installation containing managed and foreign content, `prepare_full_agents` then fails at lines 344–347, but `link_opencode` may already have created the project’s `.opencode` link. This violates the target README lines 223–225 promise that a blocked conversion “fails and the curated installation is left intact.” Preflight the full conversion before linking `.opencode` (or include the opencode mutation in the preflight).

2. **Partial T1 coverage.** Target tasks lines 7–8 claim tests cover foreign skill/workflow/whole-directory symlinks with “absolute and relative destinations.” Target `tests/setup-unlink.test.ts` lines 260–285 exercise relative destinations only for skill links; workflow lines 167–179 and whole-directory lines 181–201 use absolute destinations. Add relative workflow and whole-directory fixtures for the claimed coverage. The implementation’s shared resolver appears intended to support them.

No additional T1–T3 scope creep was found.

## Aggregate

Standards: 2 findings (1 hard documented-standard breach, 1 judgement-call smell); worst issue is the missing real-file diagnostic in `unlink.sh`. Spec: 2 findings (1 partial behavior, 1 partial test requirement); worst issue is the `.opencode` mutation before a blocked full conversion fails.
