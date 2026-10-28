import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/andreafalcon/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const dir = fileURLToPath(new URL('./', import.meta.url));
const fixture = JSON.parse(readFileSync(join(dir, 'fixture.json'), 'utf8'));
mkdirSync(join(dir, 'previews'), { recursive: true });
const report = { tooling: 'Existing installed Playwright Chromium; no downloaded browser/tool changes', checks: [], blockedHosts: [], objectiveFailures: [] };
const blocked = new Set();
const browser = await chromium.launch({ headless: true });
let articleHash, navigation;
try {
  for (const label of ['1', '2']) {
    const base = `http://127.0.0.1:${label === '1' ? 4341 : 4342}`;
    for (const [size, width, height] of [['desktop',1440,1000], ['mobile',390,844]]) {
      for (const theme of ['light','dark']) {
        const context = await browser.newContext({ viewport: { width,height }, colorScheme: theme, serviceWorkers: 'block' });
        const errors = [], badResponses = [];
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.url().startsWith(base) && response.status() >= 400) badResponses.push({ url: new URL(response.url()).pathname, status: response.status() });
        });
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== base) { blocked.add(url.host); return route.abort(); }
          if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { count: 0, liked: false } });
          return route.continue();
        });
        await context.addInitScript(theme => { localStorage.setItem('theme',theme); }, theme);
        await page.goto(base+fixture.page, {waitUntil:'networkidle'});
        await page.addStyleTag({content:'astro-dev-toolbar { display: none !important; }'});
        // The project prerenders this route, so query parameters cannot select
        // a server baseline. Remove only the experimental subtree in the browser.
        await page.locator('[data-prototype-related]').evaluate(el => el.remove());
        assert.equal(await page.locator('[data-prototype-related]').count(),0);
        const baselineGeometry = await page.evaluate(() => ({width:document.documentElement.scrollWidth, viewport:innerWidth}));
        const baselineArticle = createHash('sha256').update(await page.locator('#article').innerText()).digest('hex');
        const response = await page.goto(base+fixture.page, { waitUntil: 'networkidle' });
        assert.equal(response.status(),200);
        await page.locator('[data-prototype-related] section').waitFor();
        await page.addStyleTag({content:'astro-dev-toolbar { display: none !important; }'});
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        const wrapper = page.locator('[data-prototype-related]');
        const section = wrapper.locator('section');
        // The existing page script adds heading permalinks; count guide destinations only.
        const links = section.locator('a[href^="/posts/"]');
        assert.equal(await section.getByRole('heading',{ name:'Continua a organizzare il viaggio', exact:true }).count(),1);
        assert.equal(await links.count(),3);
        assert.equal(await section.locator('li').count(),3);
        assert.equal(await section.locator('script').count(),0);
        for (const [index,guide] of fixture.guides.entries()) {
          assert.equal(await links.nth(index).getAttribute('href'),guide.href);
          assert.equal(await section.getByText(guide.title,{exact:true}).count(),1);
          assert.equal(await section.getByText(guide.description,{exact:true}).count(),1);
        }
        const currentArticle = createHash('sha256').update(await page.locator('#article').innerText()).digest('hex');
        assert.equal(currentArticle,baselineArticle);
        articleHash ??= currentArticle;
        assert.equal(currentArticle,articleHash);
        const currentNavigation = await page.locator('main > div[data-pagefind-ignore] a').evaluateAll(nodes => nodes.map(n => ({href:n.getAttribute('href'),text:n.textContent.trim()})));
        assert(currentNavigation.length > 0);
        navigation ??= currentNavigation;
        assert.deepEqual(currentNavigation,navigation);
        const geometry = await section.evaluate(el => ({
          documentWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
          links: [...el.querySelectorAll('a[href^="/posts/"]')].map(a => ({
            height: a.getBoundingClientRect().height,
            scrollWidth: a.scrollWidth, clientWidth: a.clientWidth,
            left: a.getBoundingClientRect().left, right:a.getBoundingClientRect().right,
            text: getComputedStyle(a).textOverflow,
          })),
        }));
        assert(geometry.documentWidth <= Math.max(width,baselineGeometry.width), 'prototype introduces horizontal page overflow');
        for (const g of geometry.links) {
          if (!(g.height >= 44 && g.scrollWidth <= g.clientWidth && g.left >= 0 && g.right <= width)) {
            report.objectiveFailures.push({label,size,theme,check:'link geometry',actual:g});
          }
          assert.notEqual(g.text,'ellipsis');
        }
        writeFileSync(join(dir,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
        // Use actual keyboard traversal through the section, then native Enter.
        await links.nth(0).focus();
        await page.keyboard.press('Tab');
        assert.equal(await links.nth(1).evaluate(el => document.activeElement === el),true);
        const focus = await links.nth(1).evaluate(el => ({ visible:el.matches(':focus-visible'), style:getComputedStyle(el).outlineStyle, width:getComputedStyle(el).outlineWidth }));
        assert(focus.visible && focus.style !== 'none' && parseFloat(focus.width)>0);
        await page.keyboard.press('Tab');
        assert.equal(await links.nth(2).evaluate(el => document.activeElement === el),true);
        await page.locator('main h1').evaluate(el => { el.tabIndex=-1;el.focus();el.removeAttribute('tabindex'); });
        await wrapper.screenshot({ path:join(dir,'previews',`version-${label}-${size}-${theme}.png`), animations:'disabled' });
        // Save viewport context separately; full section screenshots above include long mobile content.
        await wrapper.scrollIntoViewIfNeeded();
        await page.screenshot({path:join(dir,'previews',`version-${label}-${size}-${theme}-context.png`),animations:'disabled'});
        for (const [index,guide] of fixture.guides.entries()) {
          await page.goto(base+fixture.page,{waitUntil:'networkidle'});
          const target = page.locator('[data-prototype-related] section a[href^="/posts/"]').nth(index);
          if (index===0) {
            await target.focus();
            await Promise.all([page.waitForURL(base+guide.href), page.keyboard.press('Enter')]);
          } else {
            await Promise.all([page.waitForURL(base+guide.href), target.click()]);
          }
          assert.equal(new URL(page.url()).pathname,guide.href);
          assert.equal(await page.locator('main h1').innerText(),guide.title);
          assert.equal(await page.locator('[data-prototype-related]').count(),0);
        }
        assert.deepEqual(errors,[]);
        assert.deepEqual(badResponses,[]);
        report.checks.push({label,size,theme,status:'passed', baselineGeometry, geometry, focus, articleHash:currentArticle, navigation:currentNavigation});
        report.blockedHosts=[...blocked].sort();
        writeFileSync(join(dir,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify({label,size,theme,status:'passed'}));
        await context.close();
      }
    }
  }
  assert.equal(report.objectiveFailures.length,0,'new section geometry checks failed');
} finally {
  await browser.close();
}
