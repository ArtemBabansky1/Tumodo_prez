#!/usr/bin/env node
/**
 * Браузерный проход измерения контента после черновой сборки.
 * Использует реальные шрифты, переносы и computed layout.
 *
 * Запуск: node scripts/measure-content.js <имя> [--strict]
 * Отчёт: output/<имя>/content-measurements.json
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const name = process.argv[2];
const strict = process.argv.includes('--strict');
if (!name) {
  console.error('Использование: node scripts/measure-content.js <имя> [--strict]');
  process.exit(1);
}

const deckDir = path.join(ROOT, 'output', name);
const indexPath = path.join(deckDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('Сначала соберите презентацию: node scripts/build.js ' + name);
  process.exit(1);
}

const browserCandidates = [
  [process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
].filter((parts) => parts[0]).map((parts) => path.join(...parts));
const browser = browserCandidates.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('Не найден Edge/Chrome для измерения контента');
  process.exit(1);
}

const PROBE_STYLE = [
  '<style id="content-measure-style">',
  'body{margin:0!important;overflow:visible!important}',
  '.deck{display:block!important;padding:0!important}',
  '.slide-wrap{width:1920px!important;height:1080px!important;margin:0!important}',
  '.slide-wrap .slide{transform:none!important}',
  '</style>',
].join('');

const escapedName = name.replace(/'/g, "\\'");
const PROBE_SCRIPT = String.raw`<script>
(function () {
  function round(value) { return Math.round(value * 100) / 100; }
  function rect(node) {
    var r = node.getBoundingClientRect();
    return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
  }
  function visible(node) {
    var style = getComputedStyle(node), r = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || 1) > 0 && r.width > 1 && r.height > 1;
  }
  function leafTextNodes(scope) {
    var selectors = 'h1,h2,h3,p,li,.t-cover-1,.t-cover-2,.t-page-title,.t-body-big,.t-body-large,.t-body-middle,.t-body-small,.lead,.stmt-big,.photo-list-text,.card-title,.card-text,.metric-value,.metric-text,.process-step-title,.process-step-text,.journey-title,.journey-text,.change-cell';
    return Array.from(scope.querySelectorAll(selectors)).filter(function (node) {
      if (!visible(node) || !String(node.textContent || '').trim()) return false;
      return !Array.from(node.children).some(function (child) { return visible(child) && String(child.textContent || '').trim(); });
    });
  }
  function lineCount(node) {
    var style = getComputedStyle(node);
    var lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    return Math.max(1, Math.round(rect(node).height / Math.max(1, lineHeight)));
  }
  function overflows(node) {
    var style = getComputedStyle(node);
    var clipsX = /hidden|clip|auto|scroll/.test(style.overflowX);
    var clipsY = /hidden|clip|auto|scroll/.test(style.overflowY);
    return (clipsY && node.scrollHeight > node.clientHeight + 2) || (clipsX && node.scrollWidth > node.clientWidth + 2);
  }
  function layoutName(slide) {
    var classes = slide.classList;
    if (classes.contains('benefits-slide')) return 'benefits-grid';
    if (classes.contains('comparison-slide')) return 'comparison-flow';
    if (classes.contains('metrics-slide')) return 'kpi-metrics';
    if (classes.contains('photo-list-slide')) return 'photo-list';
    if (classes.contains('process-slide')) return 'process-steps';
    if (classes.contains('journey-slide')) return 'process-journey';
    if (classes.contains('title-bullets-slide')) return 'title-bullets';
    if (slide.querySelector('.service-grid')) return 'benefits-grid';
    if (slide.querySelector('.comparison-content')) return 'comparison-flow';
    if (slide.querySelector('.metrics-grid')) return 'kpi-metrics';
    if (slide.querySelector('.photo-list-content')) return 'photo-list';
    if (slide.querySelector('.process-content')) return 'process-steps';
    if (slide.querySelector('.journey-content')) return 'process-journey';
    if (slide.querySelector('.aside-head,.title-card-grid')) return 'title-bullets';
    if (slide.querySelector('.content > .cols')) return 'title-bullets';
    if (slide.querySelector('.stmt,.statement')) return 'statement';
    if (slide.id === 's1' && slide.querySelector('.cover-logo')) return 'cover';
    if (slide.querySelector('.cover-logo')) return 'final';
    return 'custom';
  }
  function measureContainer(container, allContainers) {
    var cr = rect(container), style = getComputedStyle(container);
    var inner = {
      left: cr.left + parseFloat(style.paddingLeft || 0),
      right: cr.right - parseFloat(style.paddingRight || 0),
      top: cr.top + parseFloat(style.paddingTop || 0),
      bottom: cr.bottom - parseFloat(style.paddingBottom || 0)
    };
    inner.width = Math.max(1, inner.right - inner.left);
    inner.height = Math.max(1, inner.bottom - inner.top);
    var owned = leafTextNodes(container).filter(function (node) {
      var closest = node.closest(allContainers);
      return !closest || closest === container;
    });
    var boxes = owned.map(rect);
    var top = boxes.length ? Math.min.apply(Math, boxes.map(function (box) { return box.top; })) : inner.top;
    var bottom = boxes.length ? Math.max.apply(Math, boxes.map(function (box) { return box.bottom; })) : inner.top;
    var area = boxes.reduce(function (sum, box) {
      return sum + Math.min(inner.width, box.width) * Math.min(inner.height, box.height);
    }, 0);
    var verticalFill = boxes.length ? Math.min(1.5, (bottom - top) / inner.height) : 0;
    var areaFill = Math.min(1.5, area / Math.max(1, inner.width * inner.height));
    var overflow = owned.some(overflows) || top < inner.top - 2 || bottom > inner.bottom + 2;
    var hasMedia = Boolean(container.querySelector('img,video,canvas,svg,.card-3d,.slide-3d'));
    var eligibleForUnderfill = cr.height >= 260 && cr.width >= 240 && owned.length > 0 && !hasMedia;
    var status = overflow ? 'overflow' : (eligibleForUnderfill && verticalFill < 0.5 && areaFill < 0.3 ? 'underfill' : 'healthy');
    return {
      selector: container.className || container.tagName.toLowerCase(),
      width: round(cr.width), height: round(cr.height),
      textNodes: owned.length,
      textLines: owned.reduce(function (sum, node) { return sum + lineCount(node); }, 0),
      verticalFill: round(verticalFill), areaFill: round(areaFill),
      hasMedia: hasMedia, overflow: overflow, status: status
    };
  }
  function recommendation(layout, titleLines, density, containers, overflowNodes, hasMedia) {
    var underfilled = containers.filter(function (item) { return item.status === 'underfill'; });
    var overflowing = containers.filter(function (item) { return item.status === 'overflow'; });
    if (overflowNodes.length || overflowing.length) return {
      action:'higher-capacity-layout-or-split-content', severity:'blocker',
      reason:'реальный рендер содержит переполнение; уменьшение системного шрифта запрещено',
      tryLayouts:['higher-capacity-canon','split-slide']
    };
    if (titleLines > 2) return {
      action:'shorten-title-or-widen-title-zone', severity:'warning',
      reason:'H1 занял больше двух строк и конкурирует с рабочей областью',
      tryLayouts:[layout]
    };
    if (underfilled.length) return {
      action:hasMedia ? 'rebalance-media-and-content' : 'change-silhouette-or-add-evidence', severity:'warning',
      reason:'контейнеры заполнены менее чем наполовину по фактической геометрии',
      tryLayouts:hasMedia ? ['photo-list','intro'] : ['statement','intro','evidence-led']
    };
    if (density < 0.055 && !hasMedia && !['cover','final','statement'].includes(layout)) return {
      action:'media-led-composition', severity:'warning',
      reason:'измеренная текстовая масса слишком мала для текущего силуэта',
      tryLayouts:['photo-list','intro','statement']
    };
    return { action:'keep-layout', severity:'ok', reason:'геометрия соответствует объёму контента', tryLayouts:[layout] };
  }
  function run() {
    var containerSelector = '.card,.service-card,.metric-card,.process-step,.journey-step,.photo-list-row,.change-table,.intro-card,.split-left,.split-right';
    var slides = Array.from(document.querySelectorAll('.slide-wrap > .slide'));
    var measured = slides.map(function (slide, index) {
      var sr = rect(slide), texts = leafTextNodes(slide);
      var title = slide.querySelector('.t-page-title,.t-cover-1,h1');
      var containers = Array.from(slide.querySelectorAll(containerSelector)).filter(visible)
        .map(function (container) { return measureContainer(container, containerSelector); });
      var overflowNodes = texts.filter(overflows).map(function (node) {
        return { text:String(node.textContent || '').trim().slice(0, 100), className:node.className || node.tagName, lines:lineCount(node) };
      });
      texts.forEach(function (node) {
        var box = rect(node);
        if (box.left < sr.left - 2 || box.right > sr.right + 2 || box.top < sr.top - 2 || box.bottom > sr.bottom + 2) {
          overflowNodes.push({ text:String(node.textContent || '').trim().slice(0, 100), className:node.className || node.tagName, lines:lineCount(node), outsideSlide:true });
        }
      });
      var textArea = texts.map(rect).reduce(function (sum, box) { return sum + box.width * box.height; }, 0);
      var density = textArea / Math.max(1, sr.width * sr.height);
      var hasMedia = Boolean(slide.querySelector('img:not(.slide-logo):not(.cover-logo),video,canvas,.card-3d,.slide-3d,.process-3d,.journey-3d'));
      var layout = layoutName(slide), titleLines = title && visible(title) ? lineCount(title) : 0;
      var decision = recommendation(layout, titleLines, density, containers, overflowNodes, hasMedia);
      return {
        number:index + 1, layout:layout,
        title:title ? String(title.textContent || '').trim() : '', titleLines:titleLines,
        measuredTextDensity:round(density), textNodes:texts.length,
        hasMedia:hasMedia, overflowNodes:overflowNodes,
        containers:containers,
        status:decision.severity === 'blocker' ? 'overflow' : (decision.severity === 'warning' ? 'needs-review' : 'healthy'),
        recommendation:decision
      };
    });
    var counts = measured.reduce(function (out, slide) { out[slide.status] = (out[slide.status] || 0) + 1; return out; }, {});
    var report = {
      deck:'${escapedName}', measuredAt:new Date().toISOString(), fontsReady:document.fonts ? document.fonts.status === 'loaded' : true,
      slides:measured, summary:{ total:measured.length, healthy:counts.healthy || 0, needsReview:counts['needs-review'] || 0, overflow:counts.overflow || 0 },
      passed:measured.every(function (slide) { return slide.status === 'healthy'; })
    };
    document.documentElement.setAttribute('data-tumodo-measurements', encodeURIComponent(JSON.stringify(report)));
  }
  function start() {
    var fontReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var ready = Promise.race([fontReady, new Promise(function (resolve) { setTimeout(resolve, 1500); })]);
    ready.then(function () { requestAnimationFrame(function () { requestAnimationFrame(function () {
      try { run(); }
      catch (error) { document.documentElement.setAttribute('data-tumodo-measure-error', encodeURIComponent(String(error && (error.stack || error.message) || error))); }
    }); }); });
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once:true });
  setTimeout(function () {
    if (document.documentElement.hasAttribute('data-tumodo-measurements')) return;
    try { run(); }
    catch (error) { document.documentElement.setAttribute('data-tumodo-measure-error', encodeURIComponent(String(error && (error.stack || error.message) || error))); }
  }, 1800);
})()
</script>`;

const source = fs.readFileSync(indexPath, 'utf8');
const probePath = path.join(deckDir, '_content-measure-probe.html');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tumodo-measure-'));
const reportPath = path.join(deckDir, 'content-measurements.json');
const debug = process.env.TUMODO_MEASURE_DEBUG === '1';
let dumped = '';

try {
  const probe = source.replace('</head>', PROBE_STYLE + '</head>').replace('</body>', PROBE_SCRIPT + '</body>');
  fs.writeFileSync(probePath, probe, 'utf8');
  let match = null;
  for (let attempt = 1; attempt <= 3 && !match; attempt += 1) {
    dumped = execFileSync(browser, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--allow-file-access-from-files', '--user-data-dir=' + path.join(profileDir, 'attempt-' + attempt),
      '--virtual-time-budget=5000', '--dump-dom', 'file:///' + probePath.split(path.sep).join('/'),
    ], { encoding:'utf8', stdio:['ignore', 'pipe', 'pipe'], timeout:60000, maxBuffer:24 * 1024 * 1024 });
    match = dumped.match(/data-tumodo-measurements="([^"]+)"/);
  }
  if (!match) {
    const errorMatch = dumped.match(/data-tumodo-measure-error="([^"]+)"/);
    throw new Error(errorMatch ? decodeURIComponent(errorMatch[1].replace(/&amp;/g, '&')) : 'браузер не вернул карту измерений');
  }
  const report = JSON.parse(decodeURIComponent(match[1].replace(/&amp;/g, '&')));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Измерено: ${report.summary.total}; здоровых: ${report.summary.healthy}; требуют решения: ${report.summary.needsReview}; переполнений: ${report.summary.overflow}`);
  for (const slide of report.slides.filter((item) => item.status !== 'healthy')) {
    console.log(`  слайд ${slide.number}: ${slide.recommendation.action} — ${slide.recommendation.reason}`);
  }
  console.log('Отчёт: output/' + name + '/content-measurements.json');
  if (strict && !report.passed) process.exitCode = 2;
} catch (error) {
  if (debug && dumped) fs.writeFileSync(path.join(deckDir, '_content-measure-dump.html'), dumped, 'utf8');
  console.error('Не удалось измерить контент: ' + error.message);
  process.exitCode = 1;
} finally {
  // Edge иногда делегирует file:// навигацию фоновому процессу и возвращает
  // управление до фактического чтения файла. Не удаляем probe мгновенно.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  if (!debug) try { fs.rmSync(probePath, { force:true }); } catch {}
  try { fs.rmSync(profileDir, { recursive:true, force:true, maxRetries:3, retryDelay:300 }); } catch {}
}
