# Kostysh development methodology assessment

Assessed 2026-11-13 against the local checkout. This is a retained assessment,
not an adopted policy or an implementation plan. No new workstream is opened.

## Sources and limits

- [Methodology repository](https://github.com/kostysh/development-methodology):
  README identifies version 0.4, dated 2026-11-12, as a prototype for adaptation.
- [Verification](https://github.com/kostysh/development-methodology/blob/master/method/06-verification.md)
  and [learning and recovery](https://github.com/kostysh/development-methodology/blob/master/method/14-learning-and-recovery.md)
  were read directly. These are mutable branch links, not pinned evidence.
- The user supplied a GPT Web analysis referring to the
  [article](https://articles.kostysh.chatgpt.site/it/agentic-development/).
  The article was inaccessible through the browser during this assessment;
  its ERP narrative, timings and causal interpretation were not independently
  verified. The supplied analysis is a lead, not primary evidence.
- No workflow experiment or performance measurement was performed.

## Useful ideas and existing coverage

1. **Distinguish a written rule, a working control and a better outcome.**
   Check a corrective measure on the next suitable real task before adding
   more process. This reinforces existing practice, rather than introducing
   a missing capability: C4/C5 already qualify inconclusive comparisons and
   unproven benefits; RV2 already uses the next real run as an observation
   point. See the [adoption roadmap](../plans/pi-plugin-adoption-roadmap.md).
   No new registry, dashboard, skill or evaluation campaign is proposed.
2. **Reconsider a fix when its workaround needs new coordination, state or
   recovery machinery.** Existing [review limits](../../src/review.ts) bound
   retries and detect repeated blocking findings without diff progress.
   A changing diff alone does not establish improvement. Use complexity
   growth as a diagnostic question; no automatic gate is proposed.
3. **Explain why reused evidence remains applicable.** The
   [verification skill](../../.agents/skills/verification-before-completion/SKILL.md)
   already distinguishes current, reused and unavailable results. A possible
   future clarification is to name the delta and why a reused check does not
   depend on it. This assessment does not change the current execution policy.

## Deferred changes and revisit conditions

- **Split fast and expensive checks, or reuse test results selectively:**
  revisit only after a real run shows material time spent in redundant
  verification. First identify command durations and repeat reasons, alongside
  agent/review time. Existing [usage accounting](../../src/usage.ts) includes
  agent elapsed time; it is not itself a per-command verification cost study.
  [Frozen verification commands](../../src/verify.ts) protect the execution
  contract; they do not prove an earlier result remains valid after edits.
  Dependencies, configuration, environment and data can invalidate results.
  Moving checks after review also requires explicit completion, retry and
  resume semantics in the [workflow](../../src/workflows/feature.ts).
  Two or three different tasks would offer exploratory observations, not a
  reliable causal comparison.
- **Risk-specific runtime routes:** no three-pipeline design now. The
  [planning skill](../../.agents/skills/spec-and-tasks/SKILL.md) already excludes
  trivial work. First establish whether simple tasks are unnecessarily sent
  through `/feature`, and whether the overhead is material.
- **Enterprise machinery:** do not import dedicated per-task VMs, mandatory
  specialized audits, document hierarchies for every change, or concurrent
  writers without a demonstrated local need. Study the ideas rather than
  copying upstream material; reuse permissions were not established here.

## Priority

The already observed
[mid-development plan revision gap](../plans/pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13)
has stronger local evidence than the hypothesized verification bottleneck.
Preserve that priority: an explicit revision path must retain useful partial
work, reopen approval and update developer/reviewer contracts. This note
does not authorize its implementation or change roadmap scope.
