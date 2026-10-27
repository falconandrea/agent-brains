// Offline acceptance checks over the persisted C4 workflow evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { usageFromEvents } from '../../../src/usage.ts';
const root = process.argv[2];
if (!root) throw Error('usage: verify-feature-e2e.mjs <collected-run-directory>');
const json = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const events = fs.readFileSync(`${root}/after/run.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const outcome = events.findLast(e => e.type === 'workflow.outcome');
assert.equal(outcome.status, 'completed');
assert.equal(outcome.review.verdict, 'approved');
assert.equal(outcome.review.issues.length, 0);
assert.deepEqual(outcome.usage, usageFromEvents(events));
const audit = fs.readdirSync(`${root}/after`).filter(name => /^session-\d+.*\.json$/.test(name)).sort().map(name => {
  const data = json(`after/${name}`);
  const block = data.systemPrompt.match(/<available_skills>([\s\S]*?)<\/available_skills>/);
  const rendered = [...(block?.[1] ?? '').matchAll(/<name>(.*?)<\/name>/g)].map(m => m[1]);
  return {
    role: data.role, contextMarkerCopies: data.systemPrompt.split('C4-FEATURE-CONTEXT-MARKER').length - 1,
    hasSkillsBlock: Boolean(block), renderedSkillNames: rendered,
    renderedButNotRouted: rendered.filter(skill => !data.skills.includes(skill)),
    routedButNotRendered: data.skills.filter(skill => !rendered.includes(skill)),
    assistantErrors: data.messages.filter(m => m.role === 'assistant' && m.stopReason === 'error'),
  };
});
assert.deepEqual(audit.map(x => x.role), ['planner', 'developer', 'reviewer']);
for (const x of audit) {
  assert.equal(x.contextMarkerCopies, 1);
  assert.equal(x.hasSkillsBlock, true);
  assert.equal(x.renderedButNotRouted.length, 0);
  assert.equal(x.assistantErrors.length, 0);
}
const trace = fs.readFileSync(`${root}/after/tools.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(trace.some(x => x.role === 'reviewer' && ['write', 'edit', 'bash'].includes(x.detail)), false);
const tests = json('after/independent-tests.json');
assert.equal(tests.current.exitCode, 0);
assert.notEqual(tests['original-with-new-tests'].exitCode, 0);
const totals = Object.values(outcome.usage).reduce((a, x) => {
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost', 'elapsedMs']) a[k] = (a[k] ?? 0) + x[k];
  return a;
}, {});
const verification = {
  status: outcome.status, review: outcome.review.verdict, issues: outcome.review.issues.length,
  totals, workflowElapsedMs: outcome.elapsedMs,
  allThreeRolesReceiveContextOnce: true, noUnselectedSkillsRendered: true,
  reviewerHasNoMutationToolCalls: true, persistedUsageMatchesFold: true,
  independentTestsPass: true, sameTestsFailOnOriginalCode: true,
};
fs.writeFileSync(`${root}/verification.json`, JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify(verification, null, 2));
console.log('Rendered/excluded skills:', audit.map(x => ({ role: x.role, rendered: x.renderedSkillNames.length, excluded: x.routedButNotRendered })));
