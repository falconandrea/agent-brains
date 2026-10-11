import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function inlineReport(input, output) {
  const html = await readFile(input, 'utf8');
  const marker = '<!-- REPORT_CSS -->';
  if (html.split(marker).length !== 2) throw new Error('Expected exactly one REPORT_CSS marker');
  const css = await readFile(new URL('../assets/report.css', import.meta.url), 'utf8');
  await writeFile(output, html.replace(marker, () => `<style>${css}</style>`), { flag: 'wx' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node inline.mjs input.html output.html');
    await inlineReport(resolve(process.argv[2]), resolve(process.argv[3]));
    console.log(resolve(process.argv[3]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
