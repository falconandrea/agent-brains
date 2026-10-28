// Run only after human/agent inspection of the retained candidate source.
// The evaluator executes the four locally inspected modules; no provider call.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { grade } from './grade-node-contract.mjs';
const base = fileURLToPath(new URL('./', import.meta.url));
const raw = JSON.parse(readFileSync(join(base, 'NODE-SCREEN-2026-10-28.json'), 'utf8'));
assert.equal(raw.calls.length, 4);
const temp = mkdtempSync(join(tmpdir(), 'c5-inspected-candidates-'));
const require = createRequire(import.meta.url);
const calls = [];
for (const call of raw.calls) {
  const messages = call.messages.flat().filter(m => m.role === 'assistant');
  assert.equal(messages.length, 1, 'This screen expects one answer, no retries or tools');
  const message = messages[0];
  assert.equal(message.stopReason, 'stop');
  const text = message.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
  const fences = [...text.matchAll(/```(?:javascript|js)\n([\s\S]*?)```/g)];
  assert.equal(fences.length, 1);
  const source = fences[0][1];
  assert(!/\brequire\s*\(|\bimport\b|\bprocess\b|\beval\b|\bFunction\b/.test(source),
    'Unexpected candidate capability: inspect again before executing');
  const path = join(temp, `${call.index}.cjs`);
  writeFileSync(path, source);
  const checks = await grade(require(path));
  calls.push({ index: call.index, arm: call.arm, checks,
    passed: checks.filter(c => c.pass).length,
    candidateSha256: createHash('sha256').update(source).digest('hex'),
    usage: message.usage, elapsedMs: call.elapsedMs,
    manualReview: 'Source inspected before execution: no external calls or extra infrastructure; no verification pass claim in answer',
  });
}
const totals = Object.fromEntries(['A', 'B'].map(arm => {
  const selected = calls.filter(c => c.arm === arm);
  return [arm, { calls: selected.length, checksPassed: selected.reduce((n,c) => n+c.passed,0),
    sdkCost: selected.reduce((n,c) => n+c.usage.cost.total,0),
    elapsedMs: selected.reduce((n,c) => n+c.elapsedMs,0),
  }];
}));
const report = { calls, totals,
  limitation: 'Two pairs on one easy, explicit-contract fixture; entry points only. Cache warmth differs; no causal savings, reference-value or removal conclusion.',
};
writeFileSync(join(base, 'NODE-GRADES-2026-10-28.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(totals, null, 2));
