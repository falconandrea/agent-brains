import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { randomInt, createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('./', import.meta.url));
const input = JSON.parse(readFileSync(join(base, 'inputs.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const mappingPath = join(base, 'condition-mapping.json');
const mapping = existsSync(mappingPath)
  ? JSON.parse(readFileSync(mappingPath, 'utf8'))
  : (randomInt(2) ? { '1': 'essential', '2': 'expanded' } : { '1': 'expanded', '2': 'essential' });
writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + '\n');
const common = input.task + '\n\nFixed guides:\n' + JSON.stringify(input.guides, null, 2) +
  '\n\nProject source context:\n' + Object.entries(input.context)
    .map(([name, text]) => `FILE ${name}\n${text}`).join('\n\n');
const guidanceBlock = names => '\n\n<skill_guidance>\n' +
  names.map(name => `SKILL ${name}\n${input.guidance[name]}`).join('\n\n') + '\n</skill_guidance>';
const essential = common + guidanceBlock(input.sharedNames);
const expanded = essential + guidanceBlock(input.extraNames);
assert.equal(expanded.slice(0, essential.length), essential);
const prompts = { essential, expanded };
const agentDir = mkdtempSync(join(tmpdir(), 'c5-related-model-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
copyFileSync(join(homedir(), '.pi/agent/models-store.json'), join(agentDir, 'models-store.json'));
const { ModelRuntime, DefaultResourceLoader, SessionManager, createAgentSession } =
  await import('@earendil-works/pi-coding-agent');
const runtime = await ModelRuntime.create();
const model = runtime.getModel('zai', 'glm-5.2');
assert(model);
const gateOnly = process.argv.includes('--gate-only');
const output = { model: 'zai/glm-5.2', baseline: input.baseline, prompts,
  promptHashes: Object.fromEntries(Object.entries(prompts).map(([k,v]) => [k,hash(v)])),
  calls: [],
};
const outputPath = join(base, gateOnly ? 'gate.json' : 'raw.json');
assert(gateOnly || !existsSync(outputPath), 'Refuse to overwrite a model run');
for (const label of ['1', '2']) {
  const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir,
    noExtensions: true, noSkills: true, agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: agentDir,
    sessionManager: SessionManager.inMemory(agentDir), modelRuntime: runtime,
    model, thinkingLevel: 'off', resourceLoader: loader, tools: [],
  });
  output.systemPrompt ??= session.systemPrompt;
  assert.equal(session.systemPrompt, output.systemPrompt);
  const batches = [];
  session.subscribe(event => { if (event.type === 'agent_end') batches.push(event.messages); });
  const started = Date.now();
  let timer;
  try {
    if (!gateOnly) {
      timer = setTimeout(() => { void session.abort(); }, 120000);
      await session.prompt(prompts[mapping[label]]);
    }
    const messages = batches.flat().filter(m => m.role === 'assistant');
    output.calls.push({ label, condition: mapping[label], elapsedMs: Date.now()-started,
      systemHash: hash(session.systemPrompt), promptHash: hash(prompts[mapping[label]]), batches });
    writeFileSync(outputPath, JSON.stringify(output,null,2)+'\n');
    console.log(JSON.stringify({ label, gateOnly, elapsedMs: Date.now()-started }));
    assert(gateOnly || (messages.length && messages.every(m => m.stopReason === 'stop')),
      'Provider failure; raw retained; stop without automatic rerun');
  } finally {
    clearTimeout(timer);
    session.dispose();
  }
}
