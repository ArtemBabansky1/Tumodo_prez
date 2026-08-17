const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const url = 'file:///' + path.resolve(__dirname, '..', 'output', 'theo-corporate-analytics', 'index.html').split(path.sep).join('/');
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  for (const n of [2, 3, 4, 5]) {
    const result = await page.locator(`#s${n}`).evaluate((slide) => {
      const pick = (selector) => {
        const el = slide.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { x: r.x, y: r.y, width: r.width, height: r.height, top: style.top, bottom: style.bottom, position: style.position };
      };
      return {
        slide: pick(':scope'),
        label: pick('.deck-label'),
        h1row: pick('.h1-row'),
        h1: pick('h1'),
        content: pick('.service-grid, .photo-list-content, .comparison-content'),
      };
    });
    console.log(n, JSON.stringify(result));
  }
  await page.addStyleTag({ content: 'body{margin:0!important;overflow:hidden!important;background:#fff!important}.deck{display:block!important;padding:0!important;gap:0!important}.slide-wrap{display:none!important;width:1920px!important;height:1080px!important;overflow:visible!important}.slide-wrap .slide{transform:none!important}' });
  await page.evaluate(() => { document.querySelectorAll('.slide-wrap')[2].style.setProperty('display', 'block', 'important'); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.resolve(__dirname, 'manual-slide-3.png') });
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
