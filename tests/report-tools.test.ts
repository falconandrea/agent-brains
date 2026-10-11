import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Standalone skill helpers have no TypeScript declarations.
import { scanText, compareScans } from '../extra/skills/humanizer/scripts/scan.mjs';
// @ts-expect-error Standalone skill helpers have no TypeScript declarations.
import { inlineReport } from '../.agents/skills/html-report/scripts/inline.mjs';

test('prose scanner excludes reference material and retains original line numbers', () => {
  const source = [
    '---', 'description: seamless', '---',
    '```js', 'const word = "seamless";', '```',
    '> Seamless', '| seamless | data |',
    '<!-- seamless -->', '`seamless`', '“seamless”',
    'https://example.test/seamless',
    'A [useful link](https://example.test/seamless) works.',
    'A seamless transition.',
  ].join('\n');
  const result = scanText(source);
  assert.equal(result.counts.vocabulary.count, 1);
  assert.deepEqual(result.candidates, [{ pattern: 'vocabulary', line: 14, text: 'seamless' }]);
  assert.equal(result.words, 7); // "A useful link works" + "A seamless transition"
});

test('comparison exposes substitutions even when total candidates fall', () => {
  const before = scanText('It is not just useful but seamless. A seamless tool.');
  const after = scanText('Use it rather than another tool.');
  const comparison = compareScans(before, after);
  const row = comparison.patterns.find((p: { pattern: string }) => p.pattern === 'preference-framing');
  assert.equal(row.rawDelta, 1);
  assert.equal(row.reviewIncrease, true);
  assert.match(comparison.verdict, /no quality or authorship verdict/);
});

test('empty prose avoids invalid normalized counts', () => {
  const result = scanText('```\nseamless\n```');
  assert.equal(result.words, 0);
  assert.equal(result.counts.vocabulary.per1000, 0);
});

test('chat artifacts include punctuation-ended openers without matching longer words', () => {
  const result = scanText('Certainly! Here is the text. I hope this helps. Certainlyish is a coined word.');
  assert.equal(result.counts['chat-artifact'].count, 2);
});

test('HTML packaging embeds local theme, preserves content and refuses overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-report-'));
  const input = join(root, 'draft.html');
  const output = join(root, 'report.html');
  const draft = '<html><head><!-- REPORT_CSS --></head><body><a href="https://example.test">Evidence</a></body></html>';
  await writeFile(input, draft);
  await inlineReport(input, output);
  const result = await readFile(output, 'utf8');
  assert.ok(result.includes('<style>'));
  assert.ok(result.includes('@media print'));
  assert.ok(result.includes('<a href="https://example.test">Evidence</a>'));
  assert.ok(!result.includes('REPORT_CSS'));
  await assert.rejects(inlineReport(input, output), { code: 'EEXIST' });
  assert.equal(await readFile(input, 'utf8'), draft);
  assert.equal(await readFile(output, 'utf8'), result);
});

test('HTML packaging rejects missing or duplicate markers before creating output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-report-invalid-'));
  const input = join(root, 'draft.html');
  const output = join(root, 'report.html');
  for (const draft of ['<p>no marker</p>', '<!-- REPORT_CSS --><!-- REPORT_CSS -->']) {
    await writeFile(input, draft);
    await assert.rejects(inlineReport(input, output), /exactly one/);
    await assert.rejects(readFile(output), { code: 'ENOENT' });
  }
});
