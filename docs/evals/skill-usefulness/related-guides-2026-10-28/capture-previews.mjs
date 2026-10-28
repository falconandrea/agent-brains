// Screenshot-only replay. No model call, no source edits. Existing floating
// site chrome is hidden only in the component crop, retained in context images.
import { chromium } from '/Users/andreafalcon/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const dir=fileURLToPath(new URL('./',import.meta.url));
const browser=await chromium.launch({headless:true});
try {
  for(const label of ['1','2']) {
    const base=`http://127.0.0.1:${label==='1'?4341:4342}`;
    for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
      for(const theme of ['light','dark']) {
        const context=await browser.newContext({viewport:{width,height},colorScheme:theme,serviceWorkers:'block'});
        await context.route('**/*',route=>{
          const url=new URL(route.request().url());
          if(url.origin!==base)return route.abort();
          if(url.pathname.startsWith('/api/'))return route.fulfill({json:{count:0,liked:false}});
          return route.continue();
        });
        await context.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
        const page=await context.newPage();
        await page.goto(base+'/posts/come-muoversi-in-giappone',{waitUntil:'networkidle'});
        await page.mouse.move(0,0);
        const wrapper=page.locator('[data-prototype-related]');
        await wrapper.screenshot({path:join(dir,'previews',`version-${label}-${size}-${theme}.png`),
          animations:'disabled',style:'astro-dev-toolbar, .progress-container, #btt-btn-container { visibility: hidden !important; }'});
        await wrapper.scrollIntoViewIfNeeded();
        await page.screenshot({path:join(dir,'previews',`version-${label}-${size}-${theme}-context.png`),
          animations:'disabled',style:'astro-dev-toolbar { visibility: hidden !important; }'});
        console.log(JSON.stringify({label,size,theme,screenshot:'saved'}));
        await context.close();
      }
    }
  }
} finally {await browser.close();}
