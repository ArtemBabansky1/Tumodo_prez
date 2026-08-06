#!/usr/bin/env node
/**
 * Скриншоты слайдов собранной презентации через headless Edge/Chrome.
 * Запуск: node scripts/screenshot.js <имя> [номер-слайда]
 *   output/<имя>/index.html → output/<имя>/screenshots/slide-01.png, slide-02.png, …
 *   [номер-слайда] — переснять только один слайд (нумерация с 1).
 * Без внешних зависимостей: каждый слайд рендерится отдельно в окне 1920×1080.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const name = process.argv[2];
const only = process.argv[3] ? parseInt(process.argv[3], 10) : null;
if (!name) { console.error('Использование: node scripts/screenshot.js <имя> [номер-слайда]'); process.exit(1); }

const deckDir = path.join(ROOT, 'output', name);
const indexPath = path.join(deckDir, 'index.html');
if (!fs.existsSync(indexPath)) { console.error('Сначала соберите: node scripts/build.js ' + name); process.exit(1); }

const html = fs.readFileSync(indexPath, 'utf8');
const total = (html.match(/class="slide-wrap"/g) || []).length;
if (!total) { console.error('В output/' + name + '/index.html не найдено слайдов (.slide-wrap)'); process.exit(1); }
if (only && (only < 1 || only > total)) { console.error('Слайд ' + only + ' вне диапазона 1..' + total); process.exit(1); }

const candidates = [
  [process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
].filter((p) => p[0]).map((p) => path.join(...p));
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error('Не найден Edge/Chrome для headless-скриншотов'); process.exit(1); }

const shotsDir = path.join(deckDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

// временный html показывает ровно один слайд в натуральную величину 1920×1080.
// Отдельный tmp-файл на слайд и свежий --user-data-dir: без него Edge/Chrome может
// передать навигацию уже работающему фоновому процессу и вернуть управление до
// загрузки страницы (скриншоты путаются или ловят удалённый файл).
const os = require('os');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-shots-'));
const nums = only ? [only] : Array.from({ length: total }, (_, i) => i + 1);

// Фаза 1: пишем все tmp-файлы заранее (рядом с index.html — работают относительные пути).
// Удаляем только в самом конце: Edge может делегировать навигацию другому процессу и
// открыть файл уже после выхода запущенного процесса.
const tmpPaths = [];
for (const n of nums) {
  const style = [
    '<style>',
    'body { margin: 0 !important; background: #fff !important; overflow: hidden !important; }',
    '.deck { display: block !important; padding: 0 !important; gap: 0 !important; }',
    '.slide-wrap { display: none !important; }',
    `.slide-wrap:nth-of-type(${n}) { display: block !important; width: 1920px !important; height: 1080px !important; }`,
    `.slide-wrap:nth-of-type(${n}) .slide { transform: none !important; }`,
    '</style></head>',
  ].join('\n');
  const tmpPath = path.join(deckDir, '_shot-' + n + '.html');
  fs.writeFileSync(tmpPath, html.replace('</head>', style));
  tmpPaths.push(tmpPath);
}

// Фаза 2: скриншоты
try {
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    const png = path.join(shotsDir, 'slide-' + String(n).padStart(2, '0') + '.png');
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--user-data-dir=' + path.join(tmpDir, 'profile-' + n),
      '--force-device-scale-factor=1', '--window-size=1920,1080',
      '--screenshot=' + png,
      'file:///' + tmpPaths[i].split(path.sep).join('/'),
    ], { stdio: 'pipe', timeout: 60000 });
    console.log('output/' + name + '/screenshots/' + path.basename(png));
  }
} finally {
  // Фаза 3: зачистка с паузой — даём возможным отложенным процессам дочитать файлы
  setTimeout(() => {
    for (const p of tmpPaths) { try { fs.rmSync(p, { force: true }); } catch {} }
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch {}
  }, 1500).unref();
}
console.log('Готово: ' + nums.length + ' скриншот(ов).');
