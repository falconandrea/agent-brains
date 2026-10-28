// Two AB/BA pairs. Entry-point text screening only, not production skill routing.
// No tools, extensions, project discovery, references, or generated-code execution.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const base = fileURLToPath(new URL('./', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const root = mkdtempSync(join(tmpdir(), 'c5-ui-screen-'));
process.env.PI_CODING_AGENT_DIR = root;
copyFileSync(join(homedir(), '.pi/agent/models-store.json'), join(root, 'models-store.json'));
const { createAgentSession, ModelRuntime, SessionManager, DefaultResourceLoader } =
  await import('@earendil-works/pi-coding-agent');
const task = readFileSync(join(base, 'fixtures/U1/task.md'), 'utf8');
const source = readFileSync(join(base, 'fixtures/U1/component.html'), 'utf8');
const sharedNames = ['designer', 'tailwindcss-development'];
const extraNames = ['frontend-design', 'ui-ux-pro-max', 'tailwind-design-system'];
const guidance = [...sharedNames, ...extraNames].map(name => ({
  name, text: readFileSync(join(repo, '.agents/skills', name, 'SKILL.md'), 'utf8'),
}));
const designSystem = readFileSync(join(base, 'fixtures/U1/DESIGN_SYSTEM.md'), 'utf8');
const common = `This is a bounded code-repair exercise. The explicit task contract takes precedence. No tools are available. Do not claim execution.\n\n${task}\nProject .ai/context/DESIGN_SYSTEM.md (already supplied in full):\n${designSystem}\nCurrent component.html:\n\`\`\`html\n${source}\`\`\``;
const block = entries => '\n\n<guidance>\n' + entries.map(g => g.text).join('\n\n') + '\n</guidance>';
const shared = guidance.filter(g => sharedNames.includes(g.name));
const extras = guidance.filter(g => extraNames.includes(g.name));
const promptB = common + block(shared);
const promptA = promptB + block(extras);
assert.equal(promptA.slice(0, promptB.length), promptB);
const gateOnly = process.argv.includes('--gate-only');
const runtime = await ModelRuntime.create();
const model = runtime.getModel('zai', 'glm-5.2');
assert(model, 'Previously used zai/glm-5.2 model must exist in the copied catalog');
const output = {
  scope: 'U1 UI-slice entry-point screening (plain HTML); no full framework profile, reference access, rendering, or production routing claim',
  model: 'zai/glm-5.2', order: ['A', 'B', 'B', 'A'],
  task, source, designSystem, sharedNames, extraNames, guidance,
  promptSha256: { A: sha(promptA), B: sha(promptB) },
  calls: [],
};
const path = join(base, gateOnly ? 'UI-GATE-2026-10-28.json' : 'UI-SCREEN-2026-10-28.json');
output.baseline = '27b9be7';
let firstSystem;
for (const [index, arm] of output.order.entries()) {
  const loader = new DefaultResourceLoader({ cwd: root, agentDir: root,
    noExtensions: true, noSkills: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root,
    sessionManager: SessionManager.inMemory(root), modelRuntime: runtime,
    model, thinkingLevel: 'off', resourceLoader: loader, tools: [],
  });
  const system = session.systemPrompt;
  firstSystem ??= system;
  assert.equal(system, firstSystem, 'System prompts must be identical across arms');
  const batches = [];
  session.subscribe(event => {
    if (event.type === 'agent_end') batches.push(event.messages);
  });
  const started = Date.now();
  let timer;
  try {
    if (!gateOnly) {
      timer = setTimeout(() => { void session.abort(); }, 120000);
      await session.prompt(arm === 'A' ? promptA : promptB);
    }
    output.calls.push({ index, arm, systemPromptSha256: sha(system), userPromptSha256: sha(arm === 'A' ? promptA : promptB),
      elapsedMs: Date.now() - started, messages: batches,
    });
    writeFileSync(path, JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ index, arm, gateOnly, elapsedMs: Date.now() - started }));
  } finally {
    clearTimeout(timer);
    session.dispose();
  }
  // Stop rather than retry if the provider reports an error or no answer.
  if (!gateOnly) {
    const assistants = batches.flat().filter(m => m.role === 'assistant');
    assert(assistants.length && assistants.every(m => m.stopReason !== 'error' && m.stopReason !== 'aborted'),
      'Provider failed; raw evidence retained, no automatic expansion');
  }
}
