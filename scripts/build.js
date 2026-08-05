#!/usr/bin/env node
/**
 * Сборка презентации: input/<имя>.md → output/<имя>/index.html
 * Правила: rules/presentation-rules.md, rules/slide-layouts.md, rules/style-guide.md.
 * Сборка ТОЛЬКО читает design-system/ и templates/, пишет ТОЛЬКО в output/<имя>/.
 *
 * Запуск:  node scripts/build.js <имя> [--strict]
 *   --strict  завершиться с ошибкой при нарушении лимитов текста (по умолчанию — предупреждения)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DS = path.join(ROOT, 'design-system');
const TPL = path.join(ROOT, 'templates', 'html');

// ---------------------------------------------------------------- утилиты

const PREP_RE = /(^|[\s(«„'"])(в|во|и|на|с|со|к|ко|по|за|о|об|от|до|из|у|не|ни|а|но|да|для|при|над|под|про|без|же|ли|бы|то|что|как)(\s+)/gi;
const nbsp = (s) => String(s).replace(PREP_RE, '$1$2 ').replace(PREP_RE, '$1$2 ');
const nbhyph = (s) => { s = String(s); return s.includes(' ') ? s.replace(/([а-яёa-z])-([а-яёa-z])/gi, '$1‑$2') : s; };
const esc = (s) => nbhyph(nbsp(String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));

function readTpl(name) {
  return fs.readFileSync(path.join(TPL, 'layouts', name + '.html'), 'utf8');
}

// --- микро-шаблонизатор: {{x}} (экранир.), {{{x}}} (raw), {{#if x}}…{{/if}}, {{#each x}}…{{/each}}, {{.}} ---

function lookup(ctx, key) {
  if (key === '.') return ctx['.'] !== undefined ? ctx['.'] : ctx;
  for (let c = ctx; c; c = c.__parent) {
    if (c && typeof c === 'object' && key in c) return c[key];
  }
  return undefined;
}

function findBlock(tpl, tag, from) {
  // ищет {{#tag X}} … {{/tag}} с учётом вложенности; возвращает {start,end,inner,arg}
  const openRe = new RegExp('\\{\\{#' + tag + '\\s+([\\w.]+)\\}\\}', 'g');
  openRe.lastIndex = from;
  const m = openRe.exec(tpl);
  if (!m) return null;
  const start = m.index;
  const innerStart = start + m[0].length;
  const tokRe = new RegExp('\\{\\{#' + tag + '\\s+[\\w.]+\\}\\}|\\{\\{\\/' + tag + '\\}\\}', 'g');
  tokRe.lastIndex = innerStart;
  let depth = 1, t;
  while ((t = tokRe.exec(tpl))) {
    depth += t[0].startsWith('{{#') ? 1 : -1;
    if (depth === 0) return { start, end: tokRe.lastIndex, inner: tpl.slice(innerStart, t.index), arg: m[1] };
  }
  throw new Error('Незакрытый блок {{#' + tag + ' ' + m[1] + '}}');
}

function render(tpl, ctx) {
  // блоки each/if — от первого к последнему, рекурсивно
  for (const tag of ['each', 'if']) {
    let b;
    while ((b = findBlock(tpl, tag, 0))) {
      const val = lookup(ctx, b.arg);
      let out = '';
      if (tag === 'each' && Array.isArray(val)) {
        out = val.map((item) => {
          const child = typeof item === 'object' && item !== null ? { ...item } : { '.': item };
          child.__parent = ctx;
          return render(b.inner, child);
        }).join('');
      } else if (tag === 'if' && val && (!Array.isArray(val) || val.length)) {
        out = render(b.inner, ctx);
      }
      tpl = tpl.slice(0, b.start) + out + tpl.slice(b.end);
    }
  }
  tpl = tpl.replace(/\{\{\{([\w.]+)\}\}\}/g, (_, k) => String(lookup(ctx, k) ?? ''));
  tpl = tpl.replace(/\{\{([\w.]+)\}\}/g, (_, k) => esc(lookup(ctx, k) ?? ''));
  return tpl;
}

// ---------------------------------------------------------------- парсинг входного md

function parseInput(md) {
  const fm = { lang: 'ru' };
  md = md.replace(/^﻿/, '');
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const m = line.match(/^([\w-]+):\s*(.*)$/);
      if (m) fm[m[1]] = m[2].trim();
    }
    md = md.slice(fmMatch[0].length);
  }
  const blocks = md.split(/\r?\n---\r?\n/).map((b) => b.trim()).filter(Boolean);
  const slides = blocks.map(parseSlide);
  return { fm, slides };
}

function parseSlide(block) {
  const s = { title: '', layout: null, meta: {}, lead: [], paragraphs: [], bullets: [], sections: [] };
  let cur = s; // куда падают буллеты/абзацы: слайд или текущая секция
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^#\s+(.*)/))) { s.title = m[1].trim(); continue; }
    if ((m = line.match(/^\[(\w[\w-]*):\s*([^\]]*)\]$/))) {
      if (m[1] === 'layout') s.layout = m[2].trim();
      else if (cur !== s) cur[m[1]] = m[2].trim();
      else s.meta[m[1]] = m[2].trim();
      continue;
    }
    if ((m = line.match(/^##\s+(.*)/))) {
      cur = { title: m[1].trim(), paragraphs: [], bullets: [] };
      s.sections.push(cur);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)/))) { s.lead.push(m[1].trim()); continue; }
    if ((m = line.match(/^[-*]\s+(.*)/))) { cur.bullets.push(m[1].trim()); continue; }
    cur.paragraphs.push(line.trim());
  }
  s.lead = s.lead.join(' ');
  return s;
}

// ---------------------------------------------------------------- лимиты (presentation-rules.md §5)

function checkLimits(slide, layout, warn) {
  const t = slide.title || '';
  if (t.length > 90) warn(`H1 длиннее 2×45 знаков (${t.length}): «${t.slice(0, 40)}…»`);
  if (slide.lead && slide.lead.length > 220) warn(`лид длиннее 220 знаков (${slide.lead.length})`);
  const allBullets = [...slide.bullets, ...slide.sections.flatMap((x) => x.bullets)];
  for (const b of allBullets) if (b.length > 120) warn(`пункт длиннее 120 знаков (${b.length}): «${b.slice(0, 40)}…»`);
  // у benefits-grid свой лимит: 6–12 ячеек (slide-layouts.md)
  if (layout === 'benefits-grid') {
    if (slide.bullets.length > 12) warn(`ячеек ${slide.bullets.length} (лимит 12) — делить слайд`);
  } else if (slide.bullets.length > 6) {
    warn(`пунктов в списке ${slide.bullets.length} (лимит 6) — делить слайд`);
  }
}

// ---------------------------------------------------------------- выбор макета (slide-layouts.md «Правила выбора»)

const LAYOUT_ALIASES = { title: 'cover', 'text-1col': 'title-bullets', 'text-2col': 'title-bullets' };
const KNOWN = ['cover', 'final', 'statement', 'title-bullets', 'intro', 'numbered-cards-3', 'pain-solution', 'benefits-grid', 'principle-detail'];

function pickLayout(slide, index, report) {
  let l = slide.layout ? (LAYOUT_ALIASES[slide.layout] || slide.layout) : null;
  if (l && !KNOWN.includes(l)) {
    report(`слайд ${index + 1}: макет «${l}» не реализован в v1 — заменён на title-bullets`);
    l = null;
  }
  if (l) return l;
  if (index === 0) return 'cover';
  if (slide.meta.pain) return 'pain-solution';
  if (slide.sections.length === 3 && slide.sections.every((x) => x.bullets.length || x.paragraphs.length)) return 'numbered-cards-3';
  return 'title-bullets';
}

// ---------------------------------------------------------------- рендер слайдов

const L = (lang) => (lang === 'en'
  ? { challenge: 'The challenge', meaning: 'Meaning', pain: 'Pain', tagline: 'Tumodo. Simplifying business travel' }
  : { challenge: 'Вызов', meaning: 'Смысл', pain: 'Pain', tagline: 'Tumodo. Simplifying business travel' });

function furniture(deckLabel, num, theme) {
  const logo = theme === 'light' ? 'logo-dark.svg' : 'logo-white.svg';
  return `<div class="deck-label">${esc(deckLabel)}</div>` +
    `<img class="slide-logo" src="assets/logo/${logo}" alt="Tumodo">` +
    `<div class="slide-num">${num}</div>`;
}

function buildSlide(slide, layout, num, fm, usedAssets, report) {
  const lang = fm.lang || 'ru';
  const S = L(lang);
  const theme = ['cover', 'final', 'statement'].includes(layout) ? 'blue' : 'light';
  const ctx = {
    num,
    title: slide.title || fm.title || '',
    lead: slide.lead || '',
    furniture: layout === 'cover' || layout === 'final' ? '' : furniture(fm.title || '', num, theme),
  };

  if (layout === 'cover') {
    ctx.title = slide.title || fm.title || '';
    ctx.titleClass = ctx.title.length > 50 ? 't-cover-2' : 't-cover-1';
    ctx.subtitle = slide.meta.subtitle || slide.lead || fm.subtitle || '';
    ctx.cta = slide.meta.cta || '';
  }
  if (layout === 'final') {
    ctx.tagline = slide.meta.tagline || slide.title || S.tagline;
  }
  if (layout === 'statement') {
    ctx.statement = slide.lead || slide.paragraphs.join(' ');
  }
  if (layout === 'title-bullets') {
    ctx.paragraphs = slide.paragraphs;
    if (slide.meta.image) ctx.image = useAsset(slide.meta.image, usedAssets, report);
    ctx.noImage = !ctx.image;
    const b = slide.bullets.length ? slide.bullets : slide.sections.flatMap((x) => x.bullets);
    if (b.length > 4) {
      const half = Math.ceil(b.length / 2);
      ctx.bullets1 = b.slice(0, half);
      ctx.bullets2 = b.slice(half);
      ctx.colsClass = 'cols-2';
    } else if (b.length) {
      ctx.bullets1 = b;
      ctx.colsClass = 'cols-2';
    }
  }
  if (layout === 'intro') {
    ctx.paragraphs = slide.paragraphs;
    if (slide.meta['image-bg']) ctx.imageBg = useAsset(slide.meta['image-bg'], usedAssets, report);
    if (slide.meta.image) ctx.image = useAsset(slide.meta.image, usedAssets, report);
  }
  if (layout === 'numbered-cards-3') {
    ctx.cards = slide.sections.slice(0, 3).map((sec, i) => ({
      cardNum: i + 1,
      showNum: !sec.icon,
      icon: sec.icon ? useAsset(sec.icon, usedAssets, report) : null,
      title: sec.title,
      text: sec.paragraphs.join(' '),
      items: sec.bullets.length ? sec.bullets : null,
    }));
  }
  if (layout === 'pain-solution') {
    ctx.lead = slide.lead || slide.paragraphs.join(' ');
    const secs = slide.sections;
    ctx.leadsTitle = secs[0] ? secs[0].title : '';
    ctx.leads = secs[0] ? secs[0].bullets : [];
    ctx.solvesTitle = secs[1] ? secs[1].title : '';
    ctx.solves = secs[1] ? secs[1].bullets : [];
    if (slide.meta.image) ctx.accentImage = useAsset(slide.meta.image, usedAssets, report);
  }
  if (layout === 'benefits-grid') {
    const b = slide.bullets.length ? slide.bullets : slide.sections.flatMap((x) => x.bullets);
    const cols = b.length > 6 ? 4 : 2;
    ctx.gridClass = cols === 4 ? 'g4' : 'g2';
    const rows = Math.ceil(b.length / cols);
    ctx.cells = b.map((item, i) => {
      const [lead, ...rest] = item.split(' — ');
      const col = i % cols, row = Math.floor(i / cols);
      let style = '';
      if (col === cols - 1) style += 'border-right:none;';
      if (row === rows - 1) style += 'border-bottom:none;';
      return { lead, rest: rest.join(' — '), style };
    });
  }
  if (layout === 'principle-detail') {
    ctx.lead = slide.lead || slide.paragraphs.join(' ');
    ctx.cards = slide.sections.slice(0, 3).map((sec) => ({ title: sec.title, items: sec.bullets }));
  }

  let html = render(readTpl(layout), ctx);
  // [3d: photos/3d/...] — 3D-объект по нижней грани, скрыт за краем на 20% (style-guide §4)
  if (slide.meta['3d'] && layout !== 'cover' && layout !== 'final') {
    const src = useAsset(slide.meta['3d'], usedAssets, report);
    if (src) {
      const pos = slide.meta['3d-pos'] || 'right';
      const leftPct = pos === 'left' ? '35%' : (pos === 'center' ? '50%' : '65%');
      const img = '<img src="' + src + '" alt="" style="position:absolute;left:' + leftPct + ';bottom:0;height:460px;transform:translate(-50%,20%);z-index:5;">';
      html = html.replace(new RegExp('</section>' + String.fromCharCode(92) + 's*$'), img + '</section>');
    }
  }
  return html;
}

// ---------------------------------------------------------------- ассеты

function useAsset(rel, usedAssets, report) {
  // rel — путь внутри design-system, например photos/3d/theo-аналитик-1.png
  const src = path.join(DS, rel);
  if (!fs.existsSync(src)) {
    report(`ассет не найден в design-system: ${rel}`);
    return '';
  }
  const out = 'assets/img/' + path.basename(rel);
  usedAssets.set(out, src);
  return out;
}

function copyStatic(outDir, usedAssets) {
  const jobs = [
    ['css/tokens.css', path.join(TPL, 'css', 'tokens.css')],
    ['css/layout.css', path.join(TPL, 'css', 'layout.css')],
    ['css/components.css', path.join(TPL, 'css', 'components.css')],
    ['assets/fonts/NunitoSans-Variable.woff2', path.join(DS, 'fonts', 'files', 'NunitoSans-Variable.woff2')],
    ['assets/logo/logo-white.svg', path.join(DS, 'logo', 'svg', 'logo-tumodo-white-on-dark.svg')],
    ['assets/logo/logo-dark.svg', path.join(DS, 'logo', 'svg', 'logo-tumodo-dark-on-light.svg')],
    ['assets/patterns/main-pattern.svg', path.join(DS, 'patterns', 'svg', 'main-pattern.svg')],
  ];
  for (const [rel, src] of jobs) {
    const dst = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  // серый росчерк для белых карточек: Curve 2 с перекраской штриха white → light-gray (#EEEFF2)
  const curve = fs.readFileSync(path.join(DS, 'patterns', 'svg', 'патерн-1.1.svg'), 'utf8')
    .replace(/stroke="white"/g, 'stroke="#EEEFF2"');
  fs.mkdirSync(path.join(outDir, 'assets', 'patterns'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'assets', 'patterns', 'curve-gray.svg'), curve);
  for (const [rel, src] of usedAssets) {
    const dst = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

// ---------------------------------------------------------------- main

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Использование: node scripts/build.js <имя> [--strict]  (input/<имя>.md)');
    process.exit(1);
  }
  const inputPath = path.join(ROOT, 'input', name + '.md');
  if (!fs.existsSync(inputPath)) {
    console.error('Не найден входной файл: ' + inputPath);
    process.exit(1);
  }

  const warnings = [];
  const report = (msg) => warnings.push(msg);

  const { fm, slides } = parseInput(fs.readFileSync(inputPath, 'utf8'));

  // финальный слайд обязателен (presentation-rules.md §1.1)
  const last = slides[slides.length - 1];
  if (!last || last.layout !== 'final') slides.push({ title: '', layout: 'final', meta: {}, lead: '', paragraphs: [], bullets: [], sections: [] });

  const usedAssets = new Map();
  const rendered = slides.map((slide, i) => {
    const layout = pickLayout(slide, i, report);
    checkLimits(slide, layout, (msg) => report(`слайд ${i + 1} (${layout}): ${msg}`));
    const html = buildSlide(slide, layout, i + 1, fm, usedAssets, report);
    return `<div class="slide-wrap">\n${html}</div>`;
  });

  const page = render(fs.readFileSync(path.join(TPL, 'base.html'), 'utf8'), {
    lang: fm.lang || 'ru',
    title: fm.title || name,
    slides: rendered.join('\n'),
  });

  const outDir = path.join(ROOT, 'output', name);
  fs.mkdirSync(outDir, { recursive: true });
  copyStatic(outDir, usedAssets);
  fs.writeFileSync(path.join(outDir, 'index.html'), page);

  console.log(`Собрано: output/${name}/index.html — слайдов: ${slides.length}`);
  if (warnings.length) {
    console.log('\nПредупреждения (политика переполнения — presentation-rules.md §5):');
    for (const w of warnings) console.log('  • ' + w);
    if (strict) process.exit(2);
  }
}

main();
