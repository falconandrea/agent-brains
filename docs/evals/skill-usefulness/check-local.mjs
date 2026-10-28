// C5 evidence, not a shipping regression suite. No network or consumer writes.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveProfile } from '../../../src/profiles.ts';
import { selectSkills } from '../../../src/skill-router.ts';
import { resolveTools } from '../../../src/pi/pi-agent-runner.ts';
import { grade } from './grade-node-contract.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const profiles = `${repo}/profiles`;
const names = new Set(readdirSync(`${repo}/.agents/skills`));
const roles = ['planner', 'developer', 'reviewer', 'security-reviewer', 'tester'];
const selections = Object.fromEntries(roles.map(role => [role,
  selectSkills(profiles, 'nodejs', role, names).skills.includes('simplify')]));
const baseline = process.argv.includes('--baseline');
assert.equal(selections.reviewer, baseline);
assert.equal(selections['security-reviewer'], baseline);
assert.equal(selections.developer, false);
const stackWorkflows = Object.fromEntries(['laravel', 'nextjs', 'astro'].map(profile => [
  profile, Object.fromEntries(roles.map(role => [role,
    selectSkills(profiles, profile, role, names).skills.includes(profile)])),
]));
for (const selection of Object.values(stackWorkflows)) {
  assert.equal(selection.planner, baseline);
  assert.equal(selection.reviewer, baseline);
  assert.equal(selection.developer, baseline);
}
const tools = resolveTools({ readOnly: true }, []);
assert.deepEqual([...tools].sort(), ['find', 'grep', 'ls', 'read']);
const full = resolveProfile(profiles, 'full').skills;
const omissions = [...names].filter(name => !full.includes(name)).sort();
assert.deepEqual(omissions, baseline ? ['laravel', 'nextjs', 'socialite-development'] : []);
const nodeBody = readFileSync(`${repo}/.agents/skills/nodejs-backend-patterns/SKILL.md`, 'utf8');
assert.equal(nodeBody.includes('javascript-testing-patterns'), baseline);
assert(!names.has('javascript-testing-patterns'));

// The same contract checks must fail on the seed and pass on the oracle.
// Only checked-in fixture code is executed; no model-generated code is run here.
const require = createRequire(import.meta.url);
const seed = await grade(require('./fixtures/N/handler.cjs'));
const oracle = await grade(require('./fixtures/N/oracle.cjs'));
assert(seed.some(r => !r.pass));
assert(oracle.every(r => r.pass));
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify({
  surface: 'repository-local deterministic evidence; no provider calls',
  simplifySelected: selections, stackWorkflowsSelected: stackWorkflows, reviewerTools: tools,
  full: { canonical: names.size, manifest: full.length, omissions },
  missingNodeDependency: baseline ? 'javascript-testing-patterns' : null,
  nodeContract: { seed, oracle },
}, null, 2));
