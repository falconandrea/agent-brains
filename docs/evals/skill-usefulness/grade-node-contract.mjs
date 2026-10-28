// Shared fixed Node contract; independent of the current skill catalog.
import assert from 'node:assert/strict';

export async function grade(handler) {
  const results = [];
  async function check(name, run) {
    try { await run(); results.push({ name, pass: true }); }
    catch { results.push({ name, pass: false }); }
  }
  for (const [name, input] of [
    ['null', null], ['array', []], ['missing', {}], ['non-string', { name: 42 }],
    ['empty', { name: '   ' }], ['overlong', { name: 'x'.repeat(81) }],
  ]) {
    await check(`reject ${name} without persistence`, async () => {
      let calls = 0;
      const actual = await handler(input, { create: async () => { calls++; return {}; } });
      assert.deepEqual(actual, { status: 400, body: { error: 'invalid_name' } });
      assert.equal(calls, 0);
    });
  }
  for (const value of [' Ada ', 'x', 'x'.repeat(80)]) {
    await check(`persist trimmed valid name length ${value.trim().length}`, async () => {
      const calls = [];
      const record = { id: 'created-1', name: value.trim() };
      const actual = await handler({ name: value }, {
        create: async name => { calls.push(name); return record; },
      });
      assert.deepEqual(calls, [value.trim()]);
      assert.deepEqual(actual, { status: 201, body: record });
    });
  }
  await check('repository rejection does not leak details', async () => {
    const actual = await handler({ name: 'Ada' }, {
      create: async () => { throw new Error('PRIVATE_DB_DETAIL'); },
    });
    assert.deepEqual(actual, { status: 500, body: { error: 'internal_error' } });
  });
  return results;
}
