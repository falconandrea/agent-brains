# Pi Local Multi-Agent Workflow Harness — Implementation Specification

> **Purpose of this document:** give this file to an implementation agent (OpenCode/Codex/Pi) and have it build a local, trusted, extensible workflow system on top of **Pi**.
>
> This is **not** a request to fork or depend on `pi-extensible-workflows`. Build our own implementation, with our own rules and only the functionality we actually need.
>
> Working project name in this document: **pi-brain**. The name is intentionally replaceable.

---

## 0. Instructions to the implementation agent

Build the system described below in the current repository.

Before coding:

1. Read this entire specification.
2. Inspect the **current official Pi documentation and types/source** for the APIs you intend to use.
3. Prefer official Pi extension/SDK primitives over custom replacements.
4. Inspect `https://github.com/falconandrea/agent-brains` to understand the existing skills, profiles, workflows, and `.ai/` conventions that should be preserved or migrated.
5. You may inspect `https://github.com/vekexasia/pi-extensible-workflows` for **ideas and feature comparison only**.
6. **Do not copy its architecture blindly, do not depend on it, and do not add it as a runtime dependency.**
7. Do not invent undocumented Pi APIs. If an API differs from this specification, adapt the implementation to the current official Pi API while preserving the behavior required here.
8. Implement incrementally. Keep the architecture small enough that one person can understand and maintain it.
9. Do not add infrastructure that is not required: no server, no Redis, no PostgreSQL, no cloud workflow engine, no Docker requirement, no daemon unless a later requirement absolutely proves it necessary.
10. Do not auto-commit, auto-push, auto-merge, or perform destructive Git operations by default.

The end product is a **local developer tool**, not a SaaS product.

---

# 1. Product vision

I currently develop locally with coding agents using OpenCode, Codex CLI, custom skills, and slash-command workflows.

My normal feature workflow is roughly:

1. discuss a feature with an agent;
2. have the agent understand the repository and requirements;
3. answer clarification questions;
4. generate a specification / PRD / task file;
5. start a fresh development context;
6. implement the feature;
7. start a separate review context, ideally using a different model;
8. review the implementation;
9. send findings back to the developer;
10. repeat development ↔ review if necessary;
11. inspect the result myself;
12. commit manually.

I often do this on 2–3 different projects in parallel using different terminal tabs/windows.

The goal is to turn that manual coordination into a **local Pi-based workflow harness** while preserving human control.

The desired experience is:

```text
cd ~/projects/project-a
pi
```

Then, inside Pi:

```text
/feature add organization invitations
```

The workflow should:

```text
understand repo
    ↓
ask me questions interactively
    ↓
confirm shared understanding
    ↓
produce/approve spec
    ↓
developer agent
    ↓
deterministic checks
    ↓
independent reviewer agent
    ↓
developer fixes findings
    ↓
review again
    ↓
automated outcome (no second gate)
```

The single hard gate is the spec approval before development. There is no
second mandatory dialog after the automated review: pi-brain never commits,
so the human inspection of `git diff` and the commit itself ARE the final
gate — adding another modal step would double the ceremony without adding
control the commit doesn't already provide.

While it is running I should be able to see:

- which workflow is active;
- which phase it is in;
- which agents are active;
- which model/provider each role is using;
- what files/actions are being worked on at an operational level;
- test/lint/typecheck results;
- reviewer findings;
- whether an agent is waiting for me;
- token/usage information when Pi exposes it;
- final summary and diff information.

If I want to work on another project at the same time, I simply open another terminal:

```text
cd ~/projects/project-b
pi
```

The two Pi processes must work independently without requiring any shared service.

---

# 2. Core architectural decision

## Use Pi as the runtime and interactive shell

Do **not** build a replacement terminal coding agent from scratch.

Use Pi for:

- terminal UI;
- primary interactive session;
- provider authentication;
- model selection;
- tools;
- sessions;
- skills;
- extension loading;
- interactive dialogs;
- extension state;
- model/provider abstraction.

Our code should be a **Pi package / Pi extension layer** that adds:

- workflow orchestration;
- child/sub-agent execution;
- role → model mapping;
- stack detection;
- skill/profile routing;
- human-in-the-loop questions;
- code-review loops;
- run status/observability;
- local run persistence;
- workflow registration;
- optional notifications.

Do not spawn OpenCode or Codex CLI as the normal agent backend.

The normal execution path should be:

```text
our workflow
    ↓
Pi SDK / Pi model runtime
    ↓
configured Pi provider
    ↓
model
```

rather than:

```text
our workflow
    ↓
spawn opencode / codex
    ↓
parse terminal output
```

A CLI adapter for an external agent may be added in the future, but it is explicitly **not part of the MVP**.

---

# 3. Deployment model

This system is entirely local.

There is:

- no hosted orchestration;
- no self-hosted workflow server;
- no web backend;
- no database server;
- no queue service;
- no required network service other than whichever LLM/provider/tool APIs I explicitly use.

The code should live in a repository I control.

Preferred distribution:

```text
my-pi-brain/
├── package.json
├── extensions/
├── src/
├── workflows/
├── roles/
├── profiles/
├── skills/
├── prompts/
└── tests/
```

The repository should be installable/enableable as a Pi package or loaded from a local path during development.

Development should support the normal Pi extension hot-reload workflow where possible.

The repository is the canonical source of truth for my:

- workflows;
- roles;
- skills;
- profile definitions;
- defaults;
- orchestration rules.

Project-specific business/product context stays in the project repository, e.g. `.ai/`.

---

# 4. Preserve the useful concepts from `agent-brains`

My existing repository is:

`https://github.com/falconandrea/agent-brains`

The new system should preserve these good ideas rather than throwing them away.

## 4.1 Canonical skills

Today I maintain skills centrally under a canonical `.agents/skills/` store.

The new Pi package should likewise have one canonical skill source.

Pi already supports Agent Skills and `.agents/skills/`; do not create a proprietary skill format unless metadata beyond the Agent Skills standard is required.

Skills should remain independently usable, not only callable from workflows.

Examples from the current setup include concepts such as:

- feature;
- setup;
- grilling / grill-with-docs;
- code-review;
- Laravel-specific practices;
- Astro-specific practices;
- Node.js practices;
- TDD;
- security reviewer;
- frontend/design skills;
- verification;
- debugging.

## 4.2 Stack profiles

The current `agent-brains` repository already groups skills using profiles such as:

```text
common
frontend-core
frontend-design
frontend-motion
frontend-qa
laravel
nextjs
astro
nodejs
nodejs-ai-backend
full
```

Preserve the idea of **composable profiles**.

A project/agent should not receive every skill in the library.

The orchestrator should expose only the skills that are relevant to:

1. the current role;
2. the detected project stack;
3. the current task.

This prevents unnecessary context and accidental activation of irrelevant instructions.

## 4.3 Project-local `.ai/` context

Keep project-specific documentation separate from the global Pi package.

Examples:

```text
.ai/
├── context/
│   ├── PROJECT.md
│   ├── TECH_STACK.md
│   ├── GLOSSARY.md
│   ├── PRD.md
│   ├── APP_FLOW.md
│   ├── ROADMAP.md
│   ├── DESIGN_SYSTEM.md
│   ├── database_schema.mmd
│   └── adr/
├── features/
│   └── <feature>/
│       ├── prd-<feature>.md
│       ├── tasks-<feature>.md
│       └── implementation-notes.md
└── memory/
    ├── lessons.md
    └── progress.md
```

Not every project needs every file.

Agents must use **progressive context loading**. Do not dump the entire `.ai/` directory into every prompt.

---

# 5. Non-negotiable behavior

The following are hard requirements.

## 5.1 Human stays inside Pi

If the workflow needs a decision from me, it must ask inside the active Pi terminal UI.

I should not need to:

- exit Pi;
- open another application;
- edit a JSON state file;
- run a second helper command merely to answer a normal question.

Use Pi extension UI primitives such as input/select/confirm/editor or equivalent current APIs.

## 5.2 Autonomy by default, interruption only when useful

Agents should not ask permission for routine implementation choices.

Do not ask things like:

- “May I edit this file?”
- “Should I add a test?”
- “Can I run the test suite?”
- “Can I inspect this directory?”

Ask me when the answer materially changes product behavior, architecture, destructive operations, compatibility, external side effects, or scope.

If a fact can be discovered from the repository, inspect the repository instead of asking me.

For product/design ambiguity, asking is expected.

## 5.3 No infinite agent loops

Every evaluator/developer loop must have:

- a maximum number of rounds;
- a no-progress escape;
- a human escalation state.

Default feature review loop:

```text
maxReviewRounds = 2
```

Allow configuration to raise/lower it.

If developer and reviewer still disagree after the limit, stop and show me both positions.

## 5.4 Independent review context

The reviewer must not simply continue the developer conversation.

The reviewer should receive a clean, curated context containing what it needs, typically:

- relevant project instructions;
- feature spec / task file;
- Git diff;
- changed-file list;
- relevant stack/review skills;
- deterministic check results.

Do **not** send the developer's entire conversation to the reviewer.

The default reviewer should be able to use a different model/provider from the developer.

## 5.5 No automatic Git commits by default

At completion:

- show what changed;
- show verification;
- show reviewer status;
- leave the changes for me to inspect;
- let me commit manually.

A future explicit `autoCommit` option can exist, but default must be false.

---

# 6. Roles are separate from models

Never couple a workflow role to one fixed model.

These are roles:

```text
planner
developer
reviewer
security-reviewer
tester
researcher
```

These are runtime choices:

```text
provider
model
thinking/reasoning level
allowed tools
skill profile
```

Example configuration shape:

```yaml
roles:
  planner:
    provider: openrouter
    model: configurable
    thinking: medium

  developer:
    provider: zai
    model: configurable
    thinking: high

  reviewer:
    provider: openai-codex
    model: configurable
    thinking: high
    readOnly: true

  security-reviewer:
    provider: configurable
    model: configurable
    enabled: false
```

Do not hard-code model IDs in core logic.

Provide sensible defaults but allow all mappings to be changed from config.

The intended providers I currently care about are:

- ZAI Coding Plan / GLM for development;
- OpenAI Codex through my ChatGPT subscription;
- OpenRouter;
- optionally Google/Gemini later.

Reuse Pi's authentication/provider system.

**Never parse, copy, or manage Pi auth tokens directly.**

---

# 7. Configuration precedence

Support a simple precedence model:

```text
built-in defaults
    ↓
global pi-brain config
    ↓
project-local config
    ↓
workflow-specific config
    ↓
command invocation overrides
```

Suggested locations:

```text
~/.pi/agent/pi-brain/config.yaml
.pi/pi-brain.yaml
```

Exact location can change if Pi has a better official convention.

Configurable values should include at least:

- role → provider/model;
- reasoning level if supported;
- review round limit;
- default verification commands;
- stack override;
- workflow defaults;
- skill roots;
- enabled skill profiles;
- reviewer read-only policy;
- notifications;
- optional worktree behavior;
- verbosity/observability.

---

# 8. Stack detection and skill routing

This is a core feature.

When a workflow starts, detect the project type from the repository rather than requiring me to manually invoke `/laravel`, `/astro`, etc. every time.

## 8.1 Detection inputs

Use deterministic repository evidence first.

Examples:

### Laravel

Strong signals:

```text
composer.json contains laravel/framework
artisan exists
bootstrap/app.php
```

### Astro

Strong signals:

```text
package.json contains astro
astro.config.*
src/pages/
```

### Next.js

Strong signals:

```text
package.json contains next
next.config.*
app/ or pages/
```

### Generic Node.js / TypeScript backend

Signals:

```text
package.json
tsconfig.json
no stronger framework match
backend-oriented dependencies/layout
```

A project may be multi-stack.

Example:

```text
Laravel + Livewire + Tailwind
Node API + React frontend
Astro + React islands
```

Detection should return structured data:

```ts
interface ProjectStack {
  primary: string;
  frameworks: string[];
  languages: string[];
  packageManagers: string[];
  capabilities: string[];
  confidence: number;
  evidence: string[];
}
```

## 8.2 Manual override

Provide a command or project config override, for example:

```text
/stack
/stack laravel
```

or equivalent.

If confidence is low and the choice affects skill loading, ask me.

## 8.3 Profile resolution

Profiles should be composable.

Conceptually:

```yaml
profiles:
  common:
    skills:
      - karpathy-guidelines
      - verification-before-completion
      - diagnosing-bugs

  laravel:
    include:
      - common
    skills:
      - laravel
      - laravel-best-practices
      - pest-testing
      - livewire-development

  astro:
    include:
      - common
      - frontend-core
    skills:
      - astro
      - astro-framework

  nodejs:
    include:
      - common
    skills:
      - nodejs-backend-patterns
      - nodejs-best-practices
      - typescript-expert
```

Do not blindly pass every resolved skill to every role.

For example:

- planner may need product/context/grilling skills;
- developer needs stack + implementation skills;
- reviewer needs review + stack standards;
- security reviewer needs security + relevant stack skills.

---

# 9. Skills architecture

Use Pi's native Agent Skills support as the foundation.

Do not build a second skill engine.

A skill should remain a normal skill directory:

```text
skills/
└── example/
    ├── SKILL.md
    ├── references/
    ├── scripts/
    └── assets/
```

The extension may add metadata/indexes around skills, but the skill itself should remain usable by Pi.

## 9.1 Skill discovery

Support:

- skills bundled with this package;
- project-local `.agents/skills/`;
- project-local `.pi/skills/`;
- additional configured external skill roots.

Use the current official Pi resource discovery mechanism where appropriate.

## 9.2 New skills

I must be able to add a new skill by creating/installing it in the canonical skill repository and registering it in one or more profiles.

Do not require editing workflow engine source for each new skill.

A helper command may eventually be added:

```text
/profile
/profile skills
```

But skill authoring itself should use the normal Agent Skills format.

## 9.3 Third-party skills are untrusted by default

Skills can instruct agents to execute code.

Do not automatically download or execute arbitrary third-party skills.

If we later add an installer, require explicit user intent.

---

# 10. Workflow architecture

Workflows should be **deterministic orchestration code**, not an LLM deciding what agent should run next.

Use ordinary TypeScript modules/functions unless the current Pi extension model suggests a clearly better native pattern.

Do not invent a complex YAML DSL for the MVP.

Desired conceptual interface:

```ts
export interface WorkflowDefinition<Input = unknown, Output = unknown> {
  id: string;
  description: string;
  run(ctx: WorkflowContext, input: Input): Promise<Output>;
}
```

A workflow should be able to call primitives such as:

```ts
ctx.agent.run(...)
ctx.human.ask(...)
ctx.verify.run(...)
ctx.git.diff(...)
ctx.events.emit(...)
ctx.checkpoint(...)
```

The exact API is up to implementation, but keep it explicit and testable.

## 10.1 Workflow registry

New workflows should be addable without modifying the orchestration core.

Example:

```text
workflows/
├── feature.ts
├── setup.ts
├── review.ts
├── bugfix.ts
└── architecture-review.ts
```

A registry discovers or imports them.

Expose workflows as Pi slash commands where useful:

```text
/feature
/setup
/review
/bugfix
```

Also provide a generic command:

```text
/flow
```

for status/control.

---

# 11. Primary workflow: `/feature`

This is the most important workflow and the MVP should optimize for it.

## 11.1 Invocation

Example:

```text
/feature Add organization invitations with email acceptance
```

The description can be short and incomplete.

The workflow is responsible for discovery.

---

## Phase A — repository/context discovery

Before asking me basic repository questions:

1. read root `AGENTS.md` if present;
2. inspect stack/package manifests;
3. detect stack/profile;
4. read `.ai/context/TECH_STACK.md` if present;
5. read `.ai/memory/lessons.md` if present;
6. inspect only the code areas relevant to the requested feature;
7. load relevant planning/product skills;
8. load relevant stack skills only when needed.

Do not preload every context document.

If UI work is involved, dynamically include the relevant design/UI skills and `DESIGN_SYSTEM.md` if present.

If database work is involved, include database schema/ADR context if present.

---

## Phase B — interactive discovery / grilling

This phase is human-in-the-loop and happens inside Pi.

Preserve the good behavior of my existing `grilling` skill:

- ask important decisions one at a time when deep discovery is needed;
- provide a recommended answer;
- if the answer exists in the codebase, look it up instead of asking;
- walk dependencies between decisions;
- do not implement until shared understanding exists.

For smaller features, a single compact batch of questions is acceptable.

The workflow/planner should choose between:

```text
quick clarification
```

and:

```text
deep grilling
```

based on complexity, or allow explicit configuration.

An agent can ask follow-up questions until it believes the requirement is sufficiently specified.

At the end it must say, in effect:

```text
I have enough information.
Here is my understanding...
```

and present the consolidated plan/spec.

---

## Phase C — spec and approval hard gate

Before development, produce/update:

```text
.ai/features/<slug>/prd-<slug>.md
.ai/features/<slug>/tasks-<slug>.md
```

Preserve the useful principles from the current feature skill:

- concise PRD;
- architecture/components;
- data flow;
- error handling;
- testing strategy;
- granular tasks;
- stable task IDs;
- explicit affected files when knowable;
- WHAT over implementation choreography;
- no vague TODO placeholders;
- TDD where appropriate.

The user must explicitly approve the plan before implementation starts.

This is a hard gate.

If I request edits, return to planning/spec.

---

## Phase D — developer agent

Start a **separate child agent/session** for implementation.

The developer receives curated context, not the whole planning chat.

At minimum:

```text
approved PRD
approved task file
AGENTS.md
TECH_STACK if present
lessons if relevant
detected stack/profile
relevant implementation skills
current working tree
```

The developer must:

- implement tasks incrementally;
- inspect existing patterns before inventing abstractions;
- run proportional checks during development;
- keep changes focused;
- report unexpected plan deviations;
- ask for human input only for material decisions.

Default developer role/model should be configurable, expected initial choice being ZAI/GLM.

---

## Phase E — deterministic verification

Before spending reviewer tokens, run deterministic project checks.

The verification system should resolve commands from:

1. project-local config;
2. detected stack;
3. package scripts/tooling.

Examples:

### Laravel

Potential checks depending on project policy:

```text
Pest/PHPUnit targeted tests
Pint
PHPStan/Larastan if configured
```

### Node/TypeScript

Potential checks:

```text
package-manager test
lint
typecheck
build where proportional
```

### Astro

Potential checks:

```text
astro check
tests if configured
lint
build where proportional
```

Do not always run the largest possible suite.

Prefer the smallest check that gives strong signal, then a broader final pass if appropriate.

If deterministic verification fails, send the failures back to the developer before invoking the reviewer, unless the failure itself requires independent diagnosis.

---

## Phase F — independent code review

Start a **new independent reviewer child agent**.

Default reviewer can use OpenAI Codex through Pi, but this is configurable.

Reviewer should be read-only wherever practical.

Review inputs:

```text
approved PRD/tasks
AGENTS.md and relevant standards
detected stack
relevant review/stack skills
git diff from the workflow baseline
changed file list
verification results
```

Do not provide the developer's hidden reasoning or full conversation.

Review at least these axes:

1. **Spec correctness**
   - does the implementation satisfy the approved feature?
   - missing requirements?
   - unintended behavior?

2. **Code/repository standards**
   - project conventions;
   - maintainability;
   - obvious bugs/regressions;
   - error handling;
   - performance;
   - security where relevant;
   - test quality.

The existing `agent-brains` `code-review` skill can be migrated/adapted as one input to this role.

---

## 11.2 Structured review result

The reviewer must return machine-readable structured output validated at runtime.

Example schema:

```ts
interface ReviewResult {
  verdict: "approved" | "changes_requested" | "needs_human";
  summary: string;
  issues: ReviewIssue[];
}

interface ReviewIssue {
  id: string;
  severity: "blocking" | "warning" | "suggestion";
  category:
    | "spec"
    | "bug"
    | "security"
    | "performance"
    | "maintainability"
    | "tests"
    | "standards";
  file?: string;
  line?: number;
  problem: string;
  recommendation?: string;
}
```

Use a schema validator such as TypeBox/Zod only if appropriate for the surrounding Pi implementation.

Do not parse natural-language reviewer output with fragile regexes.

---

## Phase G — developer ↔ reviewer loop

Logic:

```text
review approved
    ↓
automated outcome (completed) — the human commit IS the final gate
```

or:

```text
review has blocking issues
    ↓
developer receives ONLY actionable findings + required context
    ↓
developer fixes
    ↓
verification
    ↓
fresh review
```

Rules:

- default max review rounds: 2;
- reviewer can mark `needs_human`;
- track issue IDs between rounds;
- detect repeated identical findings / no meaningful diff;
- if no progress, escalate rather than loop;
- warnings/suggestions do not necessarily block completion;
- do not let developer modify the spec merely to satisfy the reviewer.

---

## Phase H — final result / human review

When automated work is done:

1. notify me in the Pi UI;
2. show workflow status as complete/needs-human;
3. provide:
   - summary;
   - files changed;
   - tests/checks run;
   - final review verdict;
   - unresolved warnings;
   - spec deviations;
   - suggested manual inspection points;
   - Git diff command / baseline;
4. do not commit.

Optional terminal bell / OS notification can be added behind configuration.

---

# 12. Setup workflow

Provide `/setup` as an independent workflow.

Purpose: bootstrap or document a project before development.

Preserve the existing `agent-brains` behavior:

- planning only;
- structured interview;
- understand product, users, scope, architecture, stack, integrations, data model, UX/design;
- generate/update `.ai/context/` documents;
- initialize memory/progress;
- get explicit approval.

It should work for greenfield repositories and partially existing repositories.

Do not write application code during `/setup` unless the user explicitly switches workflow.

---

# 13. Review-only workflow

Provide `/review`.

Use cases:

```text
/review
/review main
/review HEAD~3
```

It should:

1. establish a fixed comparison point;
2. inspect the diff;
3. find an applicable spec if available;
4. run independent review;
5. optionally run multiple review agents in parallel later.

MVP can use one reviewer.

Later version may support:

```text
correctness reviewer
security reviewer
tests reviewer
```

in parallel, then aggregate.

Do not add parallel review in the MVP if it significantly complicates the core.

---

# 14. Bugfix workflow

A later but important workflow:

```text
/bugfix <description>
```

Desired sequence:

```text
reproduce
    ↓
diagnose
    ↓
minimal failing test where possible
    ↓
fix
    ↓
verification
    ↓
review
```

Reuse the existing `diagnosing-bugs` skill where useful.

---

# 15. Human-input broker

Human-in-the-loop must be a first-class primitive.

Create a clean abstraction, conceptually:

```ts
interface HumanInputBroker {
  confirm(question: ConfirmQuestion): Promise<boolean>;
  select(question: SelectQuestion): Promise<string>;
  input(question: InputQuestion): Promise<string>;
  editor(question: EditorQuestion): Promise<string>;
}
```

Use Pi's UI API underneath.

## 15.1 Questions from child agents

Child agents must also be able to request user input.

Prefer the simplest reliable architecture supported by current Pi:

### Preferred behavior

A child agent invokes a controlled `ask_user` capability or returns a structured `needs_input` event.

The orchestrator:

1. marks the child as waiting;
2. renders the question in the main Pi UI;
3. receives the answer;
4. resumes/re-prompts the child with the answer;
5. records the interaction in the run history.

Do not require a continuously open pseudo-terminal for each child.

Crash/restart safety is more valuable than preserving an opaque live child process.

Example structured request:

```ts
interface AgentQuestion {
  id: string;
  question: string;
  reason?: string;
  options?: string[];
  blocking: boolean;
}
```

---

# 16. Child agent runtime

Create an abstraction around Pi child sessions/model calls so workflow code does not depend directly on low-level Pi SDK details.

Conceptually:

```ts
interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

interface AgentRunRequest {
  role: string;
  cwd: string;
  prompt: string;
  model?: ModelSelection;
  skills?: string[];
  tools?: string[];
  readOnly?: boolean;
  runId: string;
}
```

Implementation must use the **current official Pi SDK/runtime APIs**.

Requirements:

- isolated session/context per child;
- reuse Pi provider/auth infrastructure;
- configurable model per role;
- cancellation support;
- event forwarding;
- tool allowlist per role;
- structured output support;
- token/usage capture when available;
- no direct access to Pi credential files.

---

# 17. Tool permissions by role

Different roles should not automatically get the same tools.

Example defaults:

## Planner

Allowed:

```text
read
grep/search
limited shell inspection
ask_user
```

Should not modify application source before plan approval.

## Developer

Allowed:

```text
read
write/edit
search
shell
ask_user
```

Subject to safety rules.

## Reviewer

Prefer:

```text
read
search
shell read-only checks
git diff/log/status
```

No source edits by default.

## Security reviewer

Read-only by default.

Tool policy should be configurable.

---

# 18. Observability and TUI

I want to understand what is happening without reading every token the models produce.

Do not build the UX around exposing hidden/internal chain-of-thought.

Show an **operational trace**:

```text
FEATURE: organization-invites

✓ discovery
✓ specification
✓ approved
● development
  developer: zai / <model>
  task: U4 - invitation acceptance
  changed: 6 files
  tests: 18 passed
○ review
○ final
```

Provide concise events such as:

```text
agent started
agent waiting for input
file changed
command started
command completed
tests passed/failed
review received
phase changed
agent completed
workflow completed
workflow failed
```

Use Pi widgets/status/custom UI where useful, but keep the first version robust and simple.

## 18.1 Commands

At minimum expose:

```text
/flow
/flow status
/flow agents
/flow log
/flow stop
```

If Pi command parsing makes subcommands awkward, implement equivalent commands with clear names.

Useful later:

```text
/flow retry
/flow resume
/flow inspect
```

`/feature`, `/setup`, `/review`, and `/bugfix` should remain first-class commands.

## 18.2 Verbosity

Support at least:

```text
compact
normal
verbose
```

Compact:

```text
✓ spec
● developer
○ review
```

Normal shows important operational events.

Verbose can show subprocess output and detailed child-agent summaries.

---

# 19. Event model

Use typed events internally.

Example:

```ts
type WorkflowEvent =
  | { type: "workflow.started"; runId: string; workflow: string }
  | { type: "phase.started"; runId: string; phase: string }
  | { type: "agent.started"; runId: string; agentId: string; role: string }
  | { type: "agent.message"; runId: string; agentId: string; summary: string }
  | { type: "agent.waiting_input"; runId: string; agentId: string; questionId: string }
  | { type: "command.started"; runId: string; command: string }
  | { type: "command.completed"; runId: string; command: string; exitCode: number }
  | { type: "verification.completed"; runId: string; passed: boolean }
  | { type: "review.completed"; runId: string; verdict: string }
  | { type: "workflow.completed"; runId: string }
  | { type: "workflow.failed"; runId: string; error: string };
```

Do not make rendering code the source of truth.

UI subscribes to events; workflow state owns the truth.

---

# 20. Run state and persistence

No external database.

Persist enough state to:

- inspect the current run;
- understand what happened after a failure;
- resume a human-interrupted workflow where practical;
- keep multiple Pi terminals/projects independent.

Use Pi extension/session persistence APIs where they fit well.

If additional local files are needed, store ephemeral orchestration state outside normal committed source files.

Preferred principle:

```text
Pi/session state or user-level Pi state
```

rather than:

```text
random workflow JSON committed into project
```

Project artifacts such as PRDs/tasks belong in `.ai/` and may be committed.

Runtime state does not.

Example state:

```ts
interface WorkflowRunState {
  id: string;
  repository: string;
  workflow: string;
  status:
    | "running"
    | "waiting_user"
    | "completed"
    | "failed"
    | "cancelled";
  phase: string;
  startedAt: string;
  updatedAt: string;
  baseline: GitBaseline;
  agents: AgentState[];
  reviewRound: number;
  pendingQuestion?: AgentQuestion;
}
```

Use atomic writes if filesystem persistence is used.

---

# 21. Multiple terminal instances

The design must support:

```text
terminal 1 → project A → pi
terminal 2 → project B → pi
terminal 3 → project C → pi
```

without coordination infrastructure.

Each Pi process owns its active workflows.

Persisted run keys must include a canonical repository identity/path so runs from different projects cannot collide.

If the same repository is opened in two Pi processes and both attempt a writing workflow, detect the situation when practical and warn or lock.

A simple local lockfile is acceptable.

Do not implement distributed locking.

---

# 22. Git behavior and safety

At the start of a writing workflow capture a baseline.

Example baseline information:

```text
repo root
current branch
HEAD SHA
working tree status
pre-existing changed files
```

Never assume the working tree is clean.

Do not overwrite/revert unrelated user changes.

Dangerous commands require confirmation or should be blocked by default:

```text
git reset --hard
git clean -fd
force checkout over changes
force push
destructive branch deletion
```

Reviewer must compare against a stable baseline.

For a feature started on the current working tree, distinguish:

```text
pre-existing user modifications
```

from:

```text
workflow modifications
```

as reliably as practical.

---

# 23. Worktrees

Git worktrees are **optional**, not a requirement for normal feature flow.

Default MVP behavior:

- one writing agent at a time in the current repository;
- reviewer is read-only;
- no worktree required.

Use a worktree when:

- two independent writing workflows run concurrently in the same repository;
- the user explicitly requests isolation;
- a later parallel-development workflow needs it.

If implemented, hide the complexity behind a `WorkspaceManager`.

Do not make worktrees a prerequisite for using `/feature`.

---

# 24. Deterministic checks before LLM checks

Use normal tools whenever they can answer the question more reliably and cheaply than an LLM.

Examples:

```text
compiler/type checker
unit tests
formatter
lint
framework checker
build
static analysis
```

Do not call a reviewer merely to discover a failing test that can be run directly.

This reduces tokens and improves signal.

---

# 25. Token/cost discipline

The orchestrator must avoid unnecessary model calls.

Principles:

1. deterministic orchestration, not an LLM manager deciding each transition;
2. progressive skill/context loading;
3. separate curated contexts for roles;
4. do not copy the full parent conversation into every child;
5. deterministic verification before review;
6. bounded review loops;
7. no automatic swarm of agents;
8. parallel agents only where their work is genuinely independent.

Capture per-agent usage if Pi exposes it and show a run summary.

Example:

```text
planner      <usage>
developer    <usage>
reviewer     <usage>
total        <usage>
```

Do not fail if a provider does not expose cost data.

---

# 26. MCP and external tools

I want the architecture to remain compatible with MCPs or other external tool integrations.

Do **not** implement a complete proprietary MCP client in the MVP unless Pi currently provides an official primitive that makes it trivial.

Instead:

- keep tool registration abstract;
- allow Pi extensions/tools installed by me to be visible to roles when explicitly allowed;
- allow role tool allowlists;
- avoid hard-coding tool names into workflow engine internals.

The workflow engine should care about capabilities, not where a tool came from.

---

# 27. Notifications

When a workflow finishes or needs human input:

- visibly update Pi UI;
- change status/widget;
- optionally ring terminal bell;
- optionally support OS notification behind a setting.

Do not add a resident daemon just for notifications.

If the terminal is gone, persistence should still make the final state inspectable on the next run.

---

# 28. Direct/manual Pi usage must remain intact

The workflow extension must not turn Pi into a workflow-only application.

I should still be able to open Pi and use it normally:

```text
pi
> inspect this function
> fix this small bug
> explain this query
```

without invoking a workflow.

The workflow system is an additional capability.

For trivial work, using normal Pi directly should remain the recommended path.

---

# 29. Proposed repository structure

Use this as a starting point, not an unquestionable requirement:

```text
pi-brain/
├── package.json
├── tsconfig.json
├── README.md
│
├── extensions/
│   └── pi-brain.ts
│
├── src/
│   ├── index.ts
│   │
│   ├── core/
│   │   ├── orchestrator.ts
│   │   ├── workflow-registry.ts
│   │   ├── run-store.ts
│   │   ├── event-bus.ts
│   │   ├── human-input.ts
│   │   └── config.ts
│   │
│   ├── agents/
│   │   ├── agent-runner.ts
│   │   ├── role-registry.ts
│   │   ├── model-resolver.ts
│   │   └── output-schema.ts
│   │
│   ├── project/
│   │   ├── stack-detector.ts
│   │   ├── context-router.ts
│   │   └── skill-router.ts
│   │
│   ├── git/
│   │   ├── git-service.ts
│   │   ├── baseline.ts
│   │   └── workspace-manager.ts
│   │
│   ├── verification/
│   │   ├── verifier.ts
│   │   ├── laravel.ts
│   │   ├── node.ts
│   │   └── astro.ts
│   │
│   ├── ui/
│   │   ├── status-widget.ts
│   │   ├── run-view.ts
│   │   └── notifications.ts
│   │
│   └── workflows/
│       ├── feature.ts
│       ├── setup.ts
│       ├── review.ts
│       └── bugfix.ts
│
├── roles/
│   ├── planner.md
│   ├── developer.md
│   ├── reviewer.md
│   └── security-reviewer.md
│
├── profiles/
│   ├── common.yaml
│   ├── laravel.yaml
│   ├── astro.yaml
│   ├── nextjs.yaml
│   └── nodejs.yaml
│
├── skills/
│   └── ...
│
├── prompts/
│   └── ...
│
└── tests/
    ├── unit/
    ├── integration/
    └── fixtures/
```

Do not create empty abstraction files just to match this tree.

Only add modules when they own real behavior.

---

# 30. Role prompt design

Keep role prompts small.

Role prompt says **how the role behaves**.

Skills say **specialized domain knowledge/process**.

Workflow says **when roles run and how outputs connect**.

Do not duplicate the same 100-line rules into every role.

Example developer role responsibilities:

```text
- implement an approved task list;
- inspect existing patterns first;
- make surgical changes;
- use relevant stack skills;
- run proportional verification;
- ask only material questions;
- do not commit.
```

Then Laravel-specific conventions belong in Laravel skills/profile, not inside generic developer prompt.

---

# 31. Context routing

Implement a `ContextRouter`.

Inputs:

```text
role
workflow
task
detected stack
files touched
project metadata
```

Output:

```text
minimum relevant context sources
```

Examples:

### Generic backend feature

```text
AGENTS.md
TECH_STACK.md
approved feature docs
lessons.md
backend skills
```

### UI task

Add:

```text
DESIGN_SYSTEM.md
APP_FLOW.md if relevant
designer/frontend skill
framework UI skill
```

### Database task

Add:

```text
database_schema.mmd
relevant ADRs
DB skill
```

Avoid loading:

```text
ROADMAP.md
all ADRs
all frontend skills
all database docs
```

unless needed.

---

# 32. Workflow-to-workflow composition

Workflows must be callable both directly and from another workflow.

For example:

```text
feature
  ├── planning
  ├── development
  ├── verification
  └── review
```

`review` should also be independently invokable.

Do not implement composition by simulating slash commands as text.

Use actual function/registry calls.

Example concept:

```ts
await ctx.workflows.run("review", {
  baseline,
  specPath,
});
```

---

# 33. Cancellation

Pressing Escape / issuing a stop command should cancel the active agent/workflow when possible.

Propagate AbortSignal/cancellation through:

```text
workflow
child agent
shell verification
long-running tools
```

Cancellation should leave the repository untouched beyond changes already made; do not attempt destructive automatic rollback.

Show:

```text
cancelled
```

rather than pretending completion.

---

# 34. Error handling

Differentiate:

```text
agent/provider error
tool error
verification failure
workflow logic failure
invalid structured output
human cancellation
Git safety conflict
```

A verification failure is often normal workflow feedback, not a fatal orchestration error.

A malformed reviewer response escalates immediately to the human (decision
2026-08-25: an auto-repair round was rejected — a reviewer that failed to fill
the result schema once will not fill a repair prompt more reliably, and the
human sees the raw validation errors instead).

Do not retry arbitrary write operations blindly.

---

# 35. Security/trust rules

This extension runs locally with my filesystem permissions.

Therefore:

- keep dependency count low;
- pin/lock dependencies;
- avoid unnecessary install scripts;
- do not execute downloaded code automatically;
- treat third-party skills/extensions as trusted code only after explicit installation;
- never exfiltrate repository content to a provider not selected for the current role;
- make provider/model selection visible;
- make destructive shell actions confirmable/blockable.

Do not silently send the same project content to every configured provider.

Only agents actually invoked should receive context.

---

# 36. MVP scope

The first usable version should implement **only**:

1. Pi package/extension bootstrap.
2. `/feature`.
3. `/flow status` or equivalent status view.
4. stack detection for:
   - Laravel,
   - Astro,
   - Next.js,
   - generic Node.js/TypeScript.
5. profile/skill routing.
6. planner human-interaction loop.
7. PRD/tasks hard approval gate.
8. independent developer child agent.
9. deterministic verification.
10. independent reviewer child agent.
11. structured reviewer output.
12. max-2 developer ↔ reviewer loop.
13. final summary.
14. no auto-commit.
15. config for role → provider/model.
16. basic local run persistence/event log.
17. cancellation.

Do **not** block MVP on:

- worktrees;
- OS notifications;
- security-review swarm;
- arbitrary DAG editor;
- web UI;
- remote execution;
- MCP server implementation;
- cross-machine sync;
- daemon/background service;
- Redis/Postgres;
- YAML workflow language.

---

# 37. Phase 2 after MVP

Once MVP is stable, add:

- `/setup`;
- `/review`;
- `/bugfix`;
- better run inspector;
- richer TUI widget;
- optional terminal/OS notifications;
- worktree isolation;
- additional framework detectors;
- additional reviewer roles;
- parallel independent review;
- helper commands for profiles;
- better cost/token reporting;
- run resume/retry UX;
- external/MCP tool capability routing.

---

# 38. Tests

Do not rely only on live LLM manual testing.

Create a fake/stub agent runtime so orchestration can be tested deterministically.

Unit test:

- stack detection;
- profile inclusion;
- config precedence;
- role model resolution;
- context routing;
- review-loop termination;
- no-progress detection;
- review schema validation;
- state persistence;
- Git baseline parsing;
- verification command resolution.

Integration test:

```text
feature starts
planner asks question
fake user answers
spec is created
approval happens
developer succeeds
verification succeeds
reviewer requests change
developer runs second time
reviewer approves
workflow completes
```

Another test:

```text
reviewer keeps rejecting
max rounds reached
workflow becomes needs_human
```

Another:

```text
verification fails
reviewer is NOT called
developer receives failure
```

Another:

```text
user cancels during question
workflow cancels cleanly
```

Use temporary fixture repositories for Git tests.

---

# 39. Acceptance scenarios

The implementation is not complete until these scenarios work.

## Scenario A — Laravel feature

From a Laravel repository:

```text
pi
/feature Add organization invitations
```

Expected:

1. detects Laravel;
2. loads Laravel profile;
3. planner inspects repo;
4. asks me meaningful product questions in Pi;
5. creates feature PRD/tasks;
6. waits for approval;
7. developer uses configured developer model;
8. deterministic Laravel checks run;
9. reviewer uses configured reviewer model;
10. reviewer has separate context;
11. issues loop back to developer;
12. max review loop is respected;
13. final summary appears;
14. no commit was made.

## Scenario B — Astro feature

Same flow, but Astro skills/checks are selected instead of Laravel skills.

No Laravel instructions should leak into the Astro developer.

## Scenario C — direct manual use

Open Pi and ask a normal coding question without `/feature`.

Pi works normally.

No workflow is forced.

## Scenario D — two projects simultaneously

Terminal A:

```text
cd project-laravel
pi
/feature ...
```

Terminal B:

```text
cd project-astro
pi
/feature ...
```

Both function independently.

## Scenario E — human question during development

Developer discovers a material ambiguity.

The main Pi UI asks me.

I answer without leaving Pi.

Developer continues with the answer.

## Scenario F — reviewer disagreement

Reviewer requests the same change twice and developer cannot resolve it.

Workflow stops after configured rounds and presents the disagreement to me.

It does not loop forever.

---

# 40. UX target

The final experience should feel like **Pi with a workflow supervisor**, not like a CI server.

Example normal display:

```text
┌ Feature: organization-invites
│
│ ✓ Discover      Laravel 12 / Livewire / Pest
│ ✓ Clarify       5 decisions resolved
│ ✓ Spec          approved
│ ● Develop       zai / <configured-model>
│   ├─ U1 ✓
│   ├─ U2 ✓
│   └─ U3 running
│ ○ Verify
│ ○ Review        openai-codex / <configured-model>
│ ○ Final
│
└ /flow status · /flow stop
```

During review:

```text
┌ Feature: organization-invites
│
│ ✓ Develop
│ ✓ Verify        24 tests passed
│ ● Review #1
│   reviewer: openai-codex / <model>
│
│   1 blocking issue
│   2 warnings
│
│ → sending blocking issue back to developer
└
```

Completion:

```text
✓ FEATURE COMPLETE

Changed:
  8 files

Verification:
  ✓ tests
  ✓ lint
  ✓ type/static analysis

Review:
  ✓ approved on round 2
  1 non-blocking warning remains

No commit created.

Inspect:
  git diff <baseline>...HEAD
```

Exact rendering can differ.

Clarity and reliability matter more than flashy UI.

---

# 41. Implementation approach

Use this order.

## Step 1 — Pi capability spike

Before full architecture, prove in a tiny branch/test extension that we can:

1. register `/feature`;
2. show a Pi UI input/confirm;
3. start a separate Pi child agent/session with a chosen model;
4. stream or receive useful child events;
5. capture structured output;
6. cancel it;
7. persist extension state.

If any of these require a different Pi API than expected, document the finding and adapt the architecture.

Do not build the full system until this spike is working.

## Step 2 — vertical slice

Implement one hard-coded-ish but clean feature workflow:

```text
question
→ approval
→ developer
→ shell check
→ reviewer
→ completion
```

Use fake roles/tests first, then real Pi models.

## Step 3 — extract reusable primitives

Only after the vertical slice works, extract:

```text
AgentRunner
HumanInputBroker
RunStore
StackDetector
SkillRouter
Verifier
WorkflowRegistry
```

Avoid premature frameworks.

## Step 4 — migrate/adapt skills

Bring over the relevant skills/concepts from `falconandrea/agent-brains`, maintaining one canonical source.

Do not migrate everything before the orchestration works.

Start with:

```text
feature/planning rules
grilling
code-review
karpathy-guidelines
verification-before-completion
Laravel profile
Astro profile
Node profile
```

## Step 5 — polish

Add:

```text
status widget
logs
cancellation
config
README
installation workflow
```

---

# 42. Dependency policy

Keep dependencies minimal.

Use Pi-provided packages as peer dependencies according to current Pi package guidance.

Use Node built-ins where reasonable.

A small validation/config library is acceptable.

Avoid adding:

```text
workflow engines
job queues
databases
web frameworks
state-machine mega-frameworks
terminal framework separate from Pi
```

unless there is a concrete reason.

---

# 43. Documentation required

The repository must include a README explaining:

## Install

How to install Pi and load/install this local package.

## Providers

How to configure roles using providers already authenticated/configured in Pi.

Do not duplicate provider credential handling.

## Basic usage

```text
pi
/feature ...
/flow status
/review ...
/setup ...
```

Only document commands that actually exist.

## Adding a skill

Explain canonical skill directory + profile membership.

## Adding a profile

Explain include/composition rules.

## Adding a workflow

Show a minimal workflow module.

## Changing models

Show how to map planner/developer/reviewer to different Pi providers/models.

## Safety

Explain that local extensions/skills execute with the user's permissions and should be reviewed before installation.

---

# 44. Architecture principles

When tradeoffs arise, prefer these in order:

1. **local-first**
2. **simple**
3. **deterministic orchestration**
4. **human control**
5. **observable**
6. **crash-tolerant**
7. **provider-independent**
8. **skill-driven**
9. **minimal context**
10. **minimal token waste**
11. **extensible**
12. **no unnecessary infrastructure**

---

# 45. Explicit anti-goals

Do not turn this project into:

- an autonomous software company;
- a swarm framework;
- a generic distributed workflow engine;
- a replacement for Pi;
- a replacement for Git;
- an issue tracker;
- a cloud agent platform;
- a custom LLM gateway;
- a general-purpose MCP platform;
- a terminal multiplexer;
- a web dashboard.

The primary use case is one developer, local repositories, several Pi terminals, deterministic development workflows.

---

# 46. Important design decisions to preserve

These are intentional.

### A. Pi is the shell/harness

We extend Pi rather than wrapping multiple coding CLIs.

### B. Workflow engine is deterministic

The LLM does tasks; code decides workflow transitions.

### C. Roles are model-independent

Developer/reviewer/planner can be remapped without rewriting workflows.

### D. Skills remain native skills

Do not invent another skill ecosystem.

### E. Stack selection is automatic but overridable

Laravel/Astro/Node/Next should load different implementation knowledge.

### F. Review is independent

Reviewer starts clean and can use another model/provider.

### G. Deterministic checks precede expensive review

Tests/lint/typecheck first.

### H. Human questions are first-class

Agents can pause for meaningful decisions inside Pi.

### I. No auto-commit

I remain the final gate.

### J. No external infrastructure

Each terminal Pi process should be enough.

---

# 47. Reference material

Implementation should prioritize current official documentation over assumptions.

Primary references:

- Pi home: https://pi.dev/
- Pi docs: https://pi.dev/docs/latest
- Pi extensions: https://pi.dev/docs/latest/extensions
- Pi skills: https://pi.dev/docs/latest/skills
- Pi packages: https://pi.dev/docs/latest/packages
- Pi providers: https://pi.dev/docs/latest/providers
- Pi SDK: https://pi.dev/docs/latest/sdk
- Pi sessions: https://pi.dev/docs/latest/sessions
- Pi security: https://pi.dev/docs/latest/security
- Existing personal conventions: https://github.com/falconandrea/agent-brains

Conceptual comparison only:

- https://github.com/vekexasia/pi-extensible-workflows

Again: **do not add `pi-extensible-workflows` as a dependency.**

---

# 48. Deliverables

For the first implementation pass, deliver:

1. working Pi package/extension;
2. `/feature` vertical slice;
3. role/model configuration;
4. stack detector;
5. skill/profile router;
6. developer child agent;
7. reviewer child agent;
8. human input broker;
9. deterministic verification layer;
10. bounded review loop;
11. status UI;
12. run persistence;
13. unit/integration tests;
14. README;
15. example config;
16. architecture note describing how to add workflows/roles/profiles.

At the end, run all repository checks and provide a concise implementation report containing:

```text
implemented
not yet implemented
important architecture decisions
known limitations
how to run
how to test
next recommended step
```

Do not silently implement Phase 2 extras before the MVP is stable.

---

# 49. Final success criterion

The project is successful when I can replace this manual pattern:

```text
OpenCode chat → feature spec
/new
OpenCode/GLM → implementation
/new
Codex/other model → review
/new
developer → fixes
manual terminal juggling
```

with:

```text
cd project
pi
/feature <idea>
```

while still keeping:

- interactive human decisions;
- my existing skill philosophy;
- different models for different roles;
- framework-specific expertise;
- visibility into progress;
- independent code review;
- manual final approval and commit;
- the ability to work on another project by opening another terminal.

That is the product.
