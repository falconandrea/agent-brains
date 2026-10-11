import { createRequire } from 'node:module';
import { access, constants, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});

async function main() {
  if (positionals.length !== 1 || !values.out) {
    throw new Error('Usage: node check.mjs report.html --out scratch-directory');
  }
  let puppeteer;
  try {
    puppeteer = createRequire(join(process.cwd(), 'package.json'))('puppeteer-core');
  } catch {
    try { puppeteer = (await import('puppeteer-core')).default; }
    catch { throw new Error('puppeteer-core unavailable; use an existing browser tool or install it in a scratch project'); }
  }
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  let executablePath;
  for (const path of candidates) {
    try { await access(path, constants.X_OK); executablePath = path; break; } catch {}
  }
  if (!executablePath) throw new Error('Chrome unavailable; set CHROME_PATH');
  const input = resolve(positionals[0]);
  const output = resolve(values.out);
  await mkdir(output, { recursive: true });
  const summary = { errors: [], externalRequests: [], issues: [], screenshots: [], print: null };
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    for (const width of [1280, 390]) {
      for (const theme of ['light', 'dark']) {
        const mode = `${width === 390 ? 'mobile' : 'desktop'}-${theme}`;
        const page = await browser.newPage();
        try {
          page.on('pageerror', error => summary.errors.push(`${mode}: ${error.message}`));
          page.on('console', message => {
            if (message.type() === 'error') summary.errors.push(`${mode}: ${message.text()}`);
          });
          await page.setRequestInterception(true);
          page.on('request', request => {
            if (/^https?:/.test(request.url())) {
              summary.externalRequests.push(request.url());
              void request.abort();
            } else { void request.continue(); }
          });
          await page.setViewport({ width, height: 900 });
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
          await page.goto(pathToFileURL(input).href, { waitUntil: 'load', timeout: 30000 });
          const issues = await page.evaluate(() => {
            const found = [];
            if (document.documentElement.scrollWidth > innerWidth + 1) found.push('Page overflows viewport');
            if (!document.documentElement.lang) found.push('Missing document language');
            if (!document.title.trim()) found.push('Missing title');
            if (document.querySelectorAll('h1').length !== 1) found.push('Expected one h1');
            if (!document.querySelector('main')) found.push('Missing main landmark');
            if (![...document.querySelectorAll('style')].some(s => s.textContent.includes('--paper:'))) found.push('Missing embedded report theme');
            for (const link of document.querySelectorAll('a[href^="#"]')) {
              if (link.hash.length > 1 && !document.getElementById(decodeURIComponent(link.hash.slice(1)))) found.push(`Broken anchor ${link.hash}`);
            }
            for (const image of document.images) {
              if (!image.complete || !image.naturalWidth) found.push('Broken image');
              if (!image.hasAttribute('alt')) found.push('Image missing alt');
            }
            return found;
          });
          summary.issues.push(...issues.map(issue => `${mode}: ${issue}`));
          const screenshot = join(output, `${mode}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          summary.screenshots.push(screenshot);
          if (mode === 'desktop-light') {
            // Native details can be collapsed in print; expose them explicitly.
            await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
            await page.emulateMediaType('print');
            await page.screenshot({ path: join(output, 'print.png'), fullPage: true });
            summary.screenshots.push(join(output, 'print.png'));
            summary.print = join(output, 'report.pdf');
            await page.pdf({ path: summary.print, format: 'A4', printBackground: true, preferCSSPageSize: true });
          }
        } finally { await page.close(); }
      }
    }
  } finally { await browser.close(); }
  summary.externalRequests = [...new Set(summary.externalRequests)];
  summary.ok = !summary.errors.length && !summary.issues.length && !summary.externalRequests.length;
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.ok ? 0 : 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
