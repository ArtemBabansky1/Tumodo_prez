const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const name = process.argv[2];
if (!name) throw new Error('Укажите имя презентации');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });
  const deckDir = path.join(root, 'output', name);
  const shotsDir = path.join(deckDir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const url = 'file:///' + path.join(deckDir, 'index.html').split(path.sep).join('/');
  const probe = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await probe.goto(url);
  const total = await probe.locator('.slide-wrap').count();
  await probe.close();

  for (let i = 0; i < total; i += 1) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: [
      'html,body{margin:0!important;width:1920px!important;height:1080px!important;overflow:hidden!important;background:#fff!important}',
      '.deck{display:block!important;padding:0!important;gap:0!important}',
      '.slide-wrap{display:none!important;width:1920px!important;height:1080px!important;border-radius:0!important;overflow:visible!important}',
      '.slide-wrap .slide{transform:none!important}',
    ].join('') });
    await page.evaluate((index) => {
      document.querySelectorAll('.slide-wrap')[index].style.setProperty('display', 'block', 'important');
      window.scrollTo(0, 0);
    }, i);
    await page.locator('.slide-wrap').filter({ visible: true }).first().waitFor({ state: 'visible' });
    const png = path.join(shotsDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: png });
    await page.close();
    console.log(path.relative(root, png));
  }
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
