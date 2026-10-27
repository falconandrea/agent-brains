#!/usr/bin/env node
// C4: real production workflow/launcher/runner, disposable fixture only.
// prepare.py creates observationally instrumented runtime copies; no prompt,
// tool, loader, workflow or usage behavior is replaced by this harness.
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import assert from 'node:assert/strict';

const [experiment, arm] = process.argv.slice(2);
if (!experiment || !['before', 'after'].includes(arm)) throw Error('usage: run-feature-e2e.mjs <experiment> before|after');
const root = resolve(experiment);
const runtime = join(root, arm, 'runtime');
const cwd = join(root, arm, 'fixture');
const out = join(root, arm);
process.env.HOME = join(root, 'home');
process.env.PI_CODING_AGENT_DIR = join(root, 'agent');
const load = (file) => import(pathToFileURL(join(runtime, file)).href);
const { PiAgentRunner } = await load('src/pi/pi-agent-runner.ts');
const { runFeatureWorkflow } = await load('src/workflows/feature.ts');
const { DEFAULT_CONFIG } = await load('src/config.ts');
const { RealGitService, ShellVerifyRunner } = await load('src/shell.ts');
const { RunLog, readRunLog } = await load('src/run-log.ts');
const { launchRun } = await load('src/run-launcher.ts');
const { acquireRunLock } = await load('src/run-lock.ts');
const { usageFromEvents } = await load('src/usage.ts');
const description = 'Add an optional maxDelayMs parameter to retryDelay(attempt, baseMs = 100). '+
  'Omitting it must preserve existing results exactly. When supplied it must be a finite nonnegative number; '+
  'otherwise throw RangeError. Return Math.min(the existing exponential delay, maxDelayMs), including a zero cap. '+
  'Preserve the existing attempt and baseMs validation and error types. Add focused node:test tests and document '+
  'the API in README.md. No dependencies, no other API changes, no commit or push. '+
  'This is a disposable evaluation fixture; keep scope to this contract and use the existing npm test command. '+
  'Planner output format is mandatory: use the literal headings ## TITLE, ## PRD, ## TASKS, in that order. '+
  'Put the feature title on the line AFTER ## TITLE; never replace ## TITLE with the title itself. No preamble.';
const config = {
  ...DEFAULT_CONFIG, stack: 'nodejs', verify: ['npm test'], maxReviewRounds: 1, maxVerifyRetries: 1,
  roles: {
    planner: { provider: 'zai', model: 'glm-5.2', thinking: 'medium' },
    developer: { provider: 'zai', model: 'glm-5.2', thinking: 'medium' },
    reviewer: { provider: 'zai', model: 'glm-4.7', thinking: 'medium', readOnly: true },
    'security-reviewer': { enabled: false, readOnly: true },
  },
};
writeFileSync(join(out, 'config.json'), JSON.stringify({ description, config, runtime, cwd, node: process.version }, null, 2));
let call = 0;
globalThis.__piEvalCapture = (request, session) => {
  writeFileSync(join(out, `session-${++call}-${request.role}.json`), JSON.stringify({
    role: request.role, prompt: request.prompt, skills: request.skills,
    contextFiles: request.contextFiles, systemPrompt: session.systemPrompt,
    messages: session.messages,
  }, null, 2));
};
const human = {
  async select(q) {
    appendFileSync(join(out, 'human.jsonl'), JSON.stringify(q) + '\n');
    if (!q.options.some(o => o.value === 'approve')) throw Error('Unexpected human selection');
    const plans = [];
    for (const slug of readdirSync(join(cwd, '.ai/features'))) {
      for (const file of readdirSync(join(cwd, '.ai/features', slug))) {
        plans.push({ path: join(cwd, '.ai/features', slug, file), content: readFileSync(join(cwd, '.ai/features', slug, file), 'utf8') });
      }
    }
    writeFileSync(join(out, 'plan-gate.json'), JSON.stringify(plans, null, 2));
    console.log(`${arm}: PLAN_READY ${join(out, 'plan-gate.json')}`);
    // Never convert elapsed time into approval. A human response must create
    // this file after the actual generated plan has been inspected.
    while (!existsSync(join(out, 'approve'))) await setTimeout(1000);
    return 'approve';
  },
  async confirm() { throw Error('Unexpected confirmation'); },
  async input() { throw Error('Unexpected input'); },
  async editor() { throw Error('Unexpected editor'); },
  notify(message) { console.log(`${arm}: ${message}`); },
};
const runId = `c4-e2e-${arm}`;
const acquired = acquireRunLock(cwd, { runId, workflow: 'feature' });
if (!acquired.ok) throw Error('Fixture lock refused');
const runner = await PiAgentRunner.create({ cwd, onEvent(event) {
  appendFileSync(join(out, 'tools.jsonl'), JSON.stringify(event) + '\n');
} });
const agents = { async run(request) {
  console.log(`${arm}: agent ${request.role} started`);
  const result = await runner.run(request);
  appendFileSync(join(out, 'results.jsonl'), JSON.stringify(result) + '\n');
  console.log(`${arm}: agent ${request.role} ended`);
  return result;
} };
const run = { runId, workflow: 'feature', phase: 'starting', status: 'running', events: [] };
await launchRun({
  run, runLog: RunLog.open(cwd, runId), lock: acquired,
  history() {}, setStatus() {}, bell() {}, notify: human.notify,
}, events => runFeatureWorkflow({
  cwd, profilesDir: join(runtime, 'profiles'),
  availableSkills: new Set(readdirSync(join(runtime, '.agents/skills'))),
  config, agents, human, verifier: new ShellVerifyRunner(cwd), git: new RealGitService(), events,
}, description, runId));
const events = readRunLog(cwd, runId);
const outcome = events.findLast(e => e.type === 'workflow.outcome');
assert.ok(outcome, 'persisted outcome required');
assert.deepEqual(outcome.usage, usageFromEvents(events), 'persisted usage must equal fold of agent.completed');
writeFileSync(join(out, 'events.json'), JSON.stringify(events, null, 2));
console.log(`${arm}: FINISHED ${JSON.stringify(outcome)}`);
