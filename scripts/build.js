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

// Оценка заполнения белого контейнера текстом — «работа с пустотой»
// (presentation-rules.md §5). Считаем в строках: средняя ширина знака Nunito Sans
// ≈ 0.5 кегля; рабочая высота контейнера = область контента 618px − паддинги 2×40.
function fillRatio(items, colWidth, { font = 25, lineH = 1.25, gap = 18, boxHeight = 538 } = {}) {
  const perLine = Math.max(10, Math.floor(colWidth / (font * 0.5)));
  const texts = items.filter(Boolean);
  if (!texts.length) return 0;
  const lines = texts.reduce((n, t) => n + Math.max(1, Math.ceil(String(t).length / perLine)), 0);
  return (lines * font * lineH + (texts.length - 1) * gap) / boxHeight;
}

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
const KNOWN = ['cover', 'final', 'statement', 'section-divider', 'title-bullets', 'intro', 'numbered-cards-3', 'pain-solution', 'benefits-grid', 'principle-detail'];

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

// темы по умолчанию — из canon/AUDIT.md (эталоны макетов)
const DEFAULT_THEME = { cover: 'blue', final: 'blue', statement: 'blue', 'numbered-cards-3': 'dark', 'section-divider': 'dark' };

function buildSlide(slide, layout, num, fm, usedAssets, report) {
  const lang = fm.lang || 'ru';
  const S = L(lang);
  const theme = slide.meta.theme || DEFAULT_THEME[layout] || 'light';
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
    ctx.statement = slide.lead || '';
    ctx.sub = slide.paragraphs.join(' ');
    if (!ctx.statement) { ctx.statement = ctx.sub; ctx.sub = ''; }
  }
  if (layout === 'section-divider') {
    ctx.theme = theme;
    ctx.isBlue = theme === 'blue';
  }
  if (layout === 'title-bullets') {
    // canon-режим: 2+ секций → шапка + label-строка + карточки-колонки
    if (slide.sections.length >= 2) {
      ctx.cards = slide.sections.map((sec) => ({
        title: sec.title,
        text: sec.paragraphs.join(' '),
        items: sec.bullets.length ? sec.bullets : null,
      }));
      ctx.colCount = Math.min(ctx.cards.length, 4);
      ctx.label = slide.meta.label || '';
    } else {
      // плоский режим: одна карточка с абзацами/буллетами (+фото)
      ctx.paragraphs = slide.paragraphs;
      // В контейнер-колонку идёт только фото/скриншот/мокап. 3D в контейнер не
      // ставится никогда — он накладывается поверх карточек (см. блок [3d:] ниже).
      if (slide.meta.image) ctx.image = useAsset(slide.meta.image, usedAssets, report);
      const b = slide.bullets.length ? slide.bullets : slide.sections.flatMap((x) => x.bullets);

      // работа с пустотой (presentation-rules.md §5): считаем, сколько места займёт текст
      const sparse = fillRatio([...slide.paragraphs, ...b], 1600) < 0.6;
      if (sparse && !ctx.image) {
        // нет фото — уводим заголовок с лидом влево, контейнер ставим справа на 50%
        ctx.aside = true;
        ctx.bullets1 = b.length ? b : null;
      } else {
        ctx.flat = true;
        ctx.noImage = !ctx.image;
        // контейнер по высоте контента — только когда рядом НЕТ изображения:
        // в паре «текст + фото» оба блока тянутся почти на всю высоту (≥560px)
        ctx.cardFit = sparse && !ctx.image ? 'hug' : '';
        if (ctx.image) {
          // фото, скриншоты и мокапы — всегда в скруглённый контейнер, fill внутри;
          // без карточки идут только 3D-объекты на прозрачном фоне
          const contain = /\/3d\//i.test(ctx.image);
          ctx.mediaContain = contain;
          ctx.mediaCover = !contain;
        }
        // вторая колонка — только когда пунктов реально много; иначе список во всю карточку
        if (b.length > 6) {
          const half = Math.ceil(b.length / 2);
          ctx.bullets1 = b.slice(0, half);
          ctx.bullets2 = b.slice(half);
        } else if (b.length) {
          ctx.bullets1 = b;
          ctx.oneCol = true;
        }
      }
    }
  }
  if (layout === 'intro') {
    ctx.conclusion = slide.meta.conclusion || '';
    ctx.more = slide.meta.more || '';
    ctx.cards = slide.sections.slice(0, 2).map((sec, i) => ({
      cardNum: i + 1,
      title: sec.title,
      text: sec.paragraphs.join(' '),
      items: sec.bullets.length ? sec.bullets : null,
    }));
  }
  if (layout === 'numbered-cards-3') {
    ctx.cards = slide.sections.slice(0, 3).map((sec, i) => ({
      cardNum: i + 1,
      isTitle: !/^\d+$/.test(sec.title),
      title: sec.title,
      text: sec.paragraphs.join(' ').replace(/\*\*/g, ''),
    }));
  }
  if (layout === 'pain-solution') {
    ctx.lead = slide.lead || slide.paragraphs.join(' ');
    ctx.painNum = slide.meta.pain || '';
    ctx.challengeLabel = S.challenge;
    const secs = slide.sections;
    ctx.leadsTitle = secs[0] ? secs[0].title : '';
    ctx.leads = secs[0] ? secs[0].bullets : [];
    ctx.solvesTitle = secs[1] ? secs[1].title : '';
    ctx.solves = secs[1] ? secs[1].bullets : [];
    if (slide.meta.image) ctx.accentImage = useAsset(slide.meta.image, usedAssets, report);
  }
  if (layout === 'benefits-grid') {
    // canon-режим: секции → синие карточки с иконками (+боковая белая [side: true])
    const boldify = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const secs = slide.sections;
    if (secs.length) {
      const side = secs.find((x) => x.side);
      ctx.cards = secs.filter((x) => !x.side).map((sec) => ({
        title: sec.title,
        icon: sec.icon ? useAsset(sec.icon, usedAssets, report) : null,
        items: sec.bullets.length ? sec.bullets : null,
      }));
      ctx.sideTitle = side ? side.title : '';
      ctx.sideItems = side ? side.bullets.map(boldify) : [];
      ctx.noSide = !side;
    } else {
      // плоский режим: буллеты «лид — текст» → карточки без иконок
      // описание из одного пункта — это абзац, а не список: точку-буллет
      // перед единственной строкой не ставим (правило пользователя 2026-08-07)
      ctx.cards = slide.bullets.map((item) => {
        const [lead, ...rest] = item.split(' — ');
        return { title: lead, text: rest.length ? rest.join(' — ') : null, items: null };
      });
      ctx.noSide = true;
    }
    // Сетка карточек всегда занимает всю доступную область: 100% ширины и
    // 560–580px по высоте, зазоры 20px (правило пользователя 2026-08-07).
    // Сжимать карточки по контенту нельзя — пустота вокруг ряда запрещена.
    ctx.gridFit = '';
  }
  if (layout === 'principle-detail') {
    ctx.conclusion = slide.meta.conclusion || '';
    ctx.cards = slide.sections.slice(0, 2).map((sec, i) => ({
      title: sec.title,
      items: sec.bullets.length ? sec.bullets : null,
      blue: i === 1,
      curve: i === 0,
      spacerTop: i === 0,
    }));
  }

  let html = render(readTpl(layout), ctx);
  // [3d: photos/3d/...] — 3D-объект по нижней грани, скрыт за краем на 20% (style-guide §4)
  if (slide.meta['3d'] && layout !== 'cover' && layout !== 'final') {
    const src = useAsset(slide.meta['3d'], usedAssets, report);
    if (src) {
      const pos = slide.meta['3d-pos'] || 'right';
      const leftPct = pos === 'left' ? '35%' : (pos === 'center' ? '50%' : '65%');
      // 3D поверх контейнеров, уходит за нижнюю границу слайда на ~25%,
      // смещён от центра по x, текст не перекрывает (presentation-rules.md §5.1)
      const img = '<img src="' + src + '" alt="" style="position:absolute;left:' + leftPct + ';bottom:0;height:560px;transform:translate(-50%,25%);z-index:5;">';
      html = html.replace(new RegExp('</section>' + String.fromCharCode(92) + 's*$'), img + '</section>');
    }
  }
  return html;
}

// ---------------------------------------------------------------- ассеты

function useAsset(rel, usedAssets, report) {
  // rel — путь внутри design-system, например photos/3d/theo-mascot-analyst-1.png
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
  const curve = fs.readFileSync(path.join(DS, 'patterns', 'svg', 'pattern-1-1.svg'), 'utf8')
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
