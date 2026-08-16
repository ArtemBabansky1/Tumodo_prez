#!/usr/bin/env node
/**
 * Геометрический quality gate собранной презентации.
 *
 * Проверяет вычисленную браузером геометрию, а не только markdown:
 *   - единый H1;
 *   - пустые белые контейнеры;
 *   - табличную структуру сравнений;
 *   - общие оси KPI;
 *   - фото cover/top;
 *   - пересечения 3D и текста;
 *   - непрерывность dark-главы;
 *   - бессмысленный автоматический декор шагов.
 *
 * Запуск: node scripts/validate-design.js <имя>
 * Отчёт: output/<имя>/quality-report.json
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const name = process.argv[2];
if (!name) {
  console.error('Использование: node scripts/validate-design.js <имя>');
  process.exit(1);
}

const deckDir = path.join(ROOT, 'output', name);
const indexPath = path.join(deckDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('Сначала соберите презентацию: node scripts/build.js ' + name);
  process.exit(1);
}

const candidates = [
  [process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
].filter((parts) => parts[0]).map((parts) => path.join(...parts));
const browser = candidates.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('Не найден Edge/Chrome для геометрической проверки');
  process.exit(1);
}

const PROBE_STYLE = [
  '<style id="quality-probe-style">',
  'body{margin:0!important;overflow:visible!important}',
  '.deck{display:block!important;padding:0!important}',
  '.slide-wrap{width:1920px!important;height:1080px!important;margin:0!important}',
  '.slide-wrap .slide{transform:none!important}',
  '</style>',
].join('');

const PROBE_SCRIPT = String.raw`<script>
(function () {
  function round(value) { return Math.round(value * 10) / 10; }
  function rect(node) {
    var r = node.getBoundingClientRect();
    return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
  }
  function intersectionRatio(a, b) {
    var x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    var y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    var area = x * y;
    return area / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  }
  function spread(values) {
    return values.length ? Math.max.apply(Math, values) - Math.min.apply(Math, values) : 0;
  }
  function visible(node) {
    var style = getComputedStyle(node);
    var r = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 1 && r.height > 1;
  }
  function slideNumber(slide, index) {
    return Number(String(slide.id || '').replace(/^s/, '')) || index + 1;
  }
  function add(list, slide, code, message, data) {
    list.push({ slide:slide, code:code, message:message, data:data || null });
  }

  function run() {
    var penalties = [];
    var warnings = [];
    var slides = Array.from(document.querySelectorAll('.slide-wrap > .slide'));

    slides.forEach(function (slide, index) {
      var number = slideNumber(slide, index);
      var slideRect = rect(slide);
      var title = slide.querySelector('.h1-row .t-page-title, .split-left .t-page-title, :scope > .t-page-title');
      if (title && visible(title)) {
        var titleStyle = getComputedStyle(title);
        var size = parseFloat(titleStyle.fontSize);
        var top = rect(title).top - slideRect.top;
        if (Math.abs(size - 50) > 0.6) {
          add(penalties, number, 'TITLE_SCALE', 'H1 содержательного слайда должен использовать page-title 50px', { fontSize:round(size) });
        }
        if (top < 180 || top > 270) {
          add(penalties, number, 'TITLE_ANCHOR', 'H1 стоит вне системной вертикальной зоны', { top:round(top) });
        }
      }

      var sparseCards = Array.from(slide.querySelectorAll('.content > .cols > .card'));
      sparseCards.forEach(function (card) {
        if (card.querySelector('img') || card.classList.contains('has-card-3d') || !visible(card)) return;
        var cardRect = rect(card);
        var pairedPhoto = card.parentElement && card.parentElement.querySelector(':scope > .photo-card');
        if (pairedPhoto && visible(pairedPhoto) && cardRect.height < rect(pairedPhoto).height * 0.9) {
          add(penalties, number, 'COMPRESSED_CONTAINER', 'Текстовый контейнер сжат относительно соседнего фото; требуется другое семейство макета', { cardHeight:round(cardRect.height), photoHeight:round(rect(pairedPhoto).height) });
          return;
        }
        if (cardRect.height < 330) return;
        var textNodes = Array.from(card.querySelectorAll('p, li, .card-title, .t-body-middle, .t-body-small')).filter(visible);
        if (!textNodes.length) return;
        var first = Math.min.apply(Math, textNodes.map(function (node) { return rect(node).top; }));
        var last = Math.max.apply(Math, textNodes.map(function (node) { return rect(node).bottom; }));
        var occupied = (last - first) / Math.max(1, cardRect.height - 80);
        if (occupied < 0.55) {
          add(penalties, number, 'EMPTY_CONTAINER', 'Белая карточка не соответствует объёму текста; контейнер нельзя сжимать — нужен другой силуэт', { height:round(cardRect.height), textFill:round(occupied) });
        }
      });

      var comparison = slide.querySelector('.comparison-content');
      if (comparison) {
        var table = comparison.querySelector('.change-table');
        var photo = comparison.querySelector('.comparison-photo');
        var headerCells = table ? table.querySelectorAll('.change-head > span').length : 0;
        if (!table || headerCells !== 3) {
          add(penalties, number, 'COMPARISON_TABLE', 'Сравнение должно иметь единую таблицу из трёх колонок', { headerCells:headerCells });
        }
        if (comparison.querySelector('.change-arrow')) {
          add(penalties, number, 'DECORATIVE_ARROWS', 'Стрелки внутри сравнительной таблицы запрещены');
        }
        if (table && photo) {
          var tr = rect(table), pr = rect(photo);
          if (Math.abs(tr.top - pr.top) > 3 || Math.abs(tr.bottom - pr.bottom) > 3) {
            add(penalties, number, 'PAIRED_EDGES', 'Фото и сравнительная таблица должны иметь общие верхний и нижний края', { topDelta:round(tr.top-pr.top), bottomDelta:round(tr.bottom-pr.bottom) });
          }
        }
      }

      var photoList = slide.querySelector('.photo-list-content');
      if (photoList) {
        var listPhoto = photoList.querySelector('.photo-list-photo');
        var listRows = photoList.querySelector('.photo-list-rows');
        var rowItems = Array.from(photoList.querySelectorAll('.photo-list-row')).filter(visible);
        if (!listPhoto || !listRows || rowItems.length < 3 || rowItems.length > 6) {
          add(penalties, number, 'PHOTO_LIST_STRUCTURE', 'photo-list требует полноразмерное фото и 3–6 отдельных строк');
        } else {
          var photoRect = rect(listPhoto), rowsRect = rect(listRows);
          if (Math.abs(photoRect.top - rowsRect.top) > 3 || Math.abs(photoRect.bottom - rowsRect.bottom) > 3) {
            add(penalties, number, 'PHOTO_LIST_EDGES', 'Фото и система строк должны занимать одну полную рабочую высоту');
          }
          var rowHeights = rowItems.map(function (row) { return rect(row).height; });
          if (spread(rowHeights) > 3) {
            add(penalties, number, 'PHOTO_LIST_RHYTHM', 'Строки photo-list должны иметь равную высоту', { spread:round(spread(rowHeights)) });
          }
        }
      }

      var metricCards = Array.from(slide.querySelectorAll('.metric-card')).filter(visible);
      if (metricCards.length > 1) {
        var valueTops = metricCards.map(function (card) { return rect(card.querySelector('.metric-value')).top; });
        var textBottoms = metricCards.map(function (card) { return rect(card.querySelector('.metric-text')).bottom; });
        if (spread(valueTops) > 3) {
          add(penalties, number, 'KPI_VALUE_AXIS', 'Значения KPI должны стоять на общей верхней оси', { spread:round(spread(valueTops)) });
        }
        if (spread(textBottoms) > 3) {
          add(penalties, number, 'KPI_TEXT_AXIS', 'Подписи KPI должны стоять на общей нижней оси', { spread:round(spread(textBottoms)) });
        }
      }

      Array.from(slide.querySelectorAll('.photo-card img')).filter(visible).forEach(function (image) {
        var style = getComputedStyle(image);
        var position = String(style.objectPosition || '').toLowerCase();
        if (style.objectFit !== 'cover' || !/(^|\s)0(?:px|%)?$/.test(position.split(/\s+/).pop())) {
          add(penalties, number, 'PHOTO_CROP', 'Фото должно использовать cover/fill и быть прижато к верху контейнера', { objectFit:style.objectFit, objectPosition:style.objectPosition });
        }
      });

      Array.from(slide.querySelectorAll('.card-3d, .slide-3d, .process-3d, .journey-3d')).filter(visible).forEach(function (image) {
        var imageRect = rect(image);
        var scope = image.classList.contains('card-3d') ? image.parentElement : slide;
        var textSelectors = '.t-page-title, .lead, .card-title, .card-text, .metric-value, .metric-text, .process-step-title, .process-step-text, .journey-title, .journey-text, li, p';
        var collisions = Array.from(scope.querySelectorAll(textSelectors)).filter(visible).filter(function (node) {
          return !image.contains(node) && intersectionRatio(imageRect, rect(node)) > 0.3;
        });
        if (collisions.length) {
          add(penalties, number, 'VISUAL_TEXT_COLLISION', '3D пересекает безопасную зону текста', { elements:collisions.length });
        }
      });

      var hasFunctionlessStepDecor = Array.from(slide.querySelectorAll('.process-step')).some(function (step) {
        var pseudo = getComputedStyle(step, '::after');
        return parseFloat(pseudo.width) > 1 && parseFloat(pseudo.height) > 1 &&
          pseudo.backgroundColor !== 'rgba(0, 0, 0, 0)' && pseudo.backgroundColor !== 'transparent';
      });
      if (hasFunctionlessStepDecor) {
        add(penalties, number, 'FUNCTIONLESS_DECOR', 'Автоматический декор в углу карточки шага запрещён');
      }
    });

    var dark = slides.map(function (slide, index) { return { slide:slide, index:index }; })
      .filter(function (item) { return item.slide.classList.contains('theme-dark'); });
    if (dark.length > 1) {
      var contiguous = dark.every(function (item, index) { return index === 0 || item.index === dark[index - 1].index + 1; });
      if (!contiguous) {
        add(penalties, 0, 'DARK_CHAPTER', 'Тёмные слайды должны идти одним непрерывным тематическим блоком', { slides:dark.map(function (item) { return item.index + 1; }) });
      }
    }

    var report = {
      deck:'${name.replace(/'/g, "\\'")}',
      checkedAt:new Date().toISOString(),
      slides:slides.length,
      passed:penalties.length === 0,
      summary:{ penalties:penalties.length, warnings:warnings.length },
      penalties:penalties,
      warnings:warnings
    };
    document.documentElement.setAttribute('data-tumodo-quality', encodeURIComponent(JSON.stringify(report)));
  }
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once:true });
})();
</script>`;

const source = fs.readFileSync(indexPath, 'utf8');
const probePath = path.join(deckDir, '_quality-probe.html');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tumodo-quality-'));
const reportPath = path.join(deckDir, 'quality-report.json');

try {
  const probe = source
    .replace('</head>', PROBE_STYLE + '</head>')
    .replace('</body>', PROBE_SCRIPT + '</body>');
  fs.writeFileSync(probePath, probe, 'utf8');
  const dumped = execFileSync(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profileDir,
    '--virtual-time-budget=2500',
    '--dump-dom',
    'file:///' + probePath.split(path.sep).join('/'),
  ], { encoding:'utf8', stdio:['ignore', 'pipe', 'pipe'], timeout:60000, maxBuffer:20 * 1024 * 1024 });
  const match = dumped.match(/data-tumodo-quality="([^"]+)"/);
  if (!match) throw new Error('Браузер не вернул quality-report');
  const report = JSON.parse(decodeURIComponent(match[1].replace(/&amp;/g, '&')));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Проверено: ${report.slides} слайдов`);
  console.log(`Штрафы: ${report.summary.penalties}; предупреждения: ${report.summary.warnings}`);
  for (const issue of report.penalties) {
    console.log(`  [ШТРАФ] ${issue.slide ? 'слайд ' + issue.slide + ': ' : ''}${issue.message} (${issue.code})`);
  }
  console.log('Отчёт: output/' + name + '/quality-report.json');
  if (!report.passed) process.exitCode = 2;
} catch (error) {
  console.error('Не удалось выполнить геометрическую проверку: ' + error.message);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(probePath, { force:true }); } catch {}
  try { fs.rmSync(profileDir, { recursive:true, force:true, maxRetries:3, retryDelay:300 }); } catch {}
}
