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
const {
  analyzeSlide,
  parseVisualAssets,
  recommendVisualPlacement,
} = require('./lib/design-intelligence');

const ROOT = path.join(__dirname, '..');
const DS = path.join(ROOT, 'design-system');
const TPL = path.join(ROOT, 'templates', 'html');
const VISUAL_ASSETS = parseVisualAssets();
const VISUAL_ASSET_BY_SOURCE = new Map(VISUAL_ASSETS.map((asset) => [asset.source, asset]));

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
  // у сеточных макетов собственные лимиты
  if (layout === 'benefits-grid') {
    if (slide.bullets.length > 12) warn(`ячеек ${slide.bullets.length} (лимит 12) — делить слайд`);
  } else if (layout === 'photo-list') {
    if (slide.bullets.length < 3 || slide.bullets.length > 6) warn(`photo-list рассчитан на 3–6 коротких пунктов`);
    if (!slide.meta.image) warn(`photo-list требует смысловое [image: ...]`);
  } else if (layout === 'process-steps' || layout === 'process-journey') {
    const count = slide.bullets.length || slide.sections.length;
    if (count < 4 || count > 6) warn(`шагов ${count}; process-steps рассчитан на 4–6 — сменить макет или структуру`);
  } else if (layout === 'kpi-metrics') {
    const count = slide.sections.length || slide.bullets.length;
    if (count < 2 || count > 5) warn(`метрик ${count}; kpi-metrics рассчитан на 2–5 — сменить макет или структуру`);
  } else if (slide.bullets.length > 6) {
    warn(`пунктов в списке ${slide.bullets.length} (лимит 6) — делить слайд`);
  }
}

// ---------------------------------------------------------------- выбор макета (slide-layouts.md «Правила выбора»)

const LAYOUT_ALIASES = { title: 'cover', 'text-1col': 'title-bullets', 'text-2col': 'title-bullets' };
const KNOWN = ['cover', 'final', 'statement', 'section-divider', 'title-bullets', 'photo-list', 'comparison-flow', 'process-steps', 'process-journey', 'kpi-metrics', 'intro', 'numbered-cards-3', 'pain-solution', 'benefits-grid', 'principle-detail'];

function pickLayout(slide, index, report, total) {
  let l = slide.layout ? (LAYOUT_ALIASES[slide.layout] || slide.layout) : null;
  const semantic = analyzeSlide(slide, index, total);
  const safetyLayouts = new Set(['comparison-flow', 'process-steps', 'kpi-metrics', 'photo-list']);
  if (l && safetyLayouts.has(semantic.renderLayout) && l !== semantic.renderLayout) {
    report(`слайд ${index + 1}: макет «${l}» противоречит смыслу — safety-layer заменил его на «${semantic.renderLayout}»`);
    l = semantic.renderLayout;
  }
  if (l && !KNOWN.includes(l)) {
    report(`слайд ${index + 1}: семейство «${l}» пока не имеет общего HTML-шаблона — выбран ближайший рендер «${semantic.renderLayout}»; для точного Figma-канона агент должен создать override`);
    l = semantic.renderLayout;
  }
  if (l && !KNOWN.includes(l)) {
    l = null;
  }
  if (l) return l;
  return analyzeSlide(slide, index, total).renderLayout;
}

function attachCardThreeD(cards, plan, src) {
  if (!plan || plan.mode !== 'card' || !src) return cards;
  return cards.map((card, index) => index === plan.cardIndex - 1 ? {
    ...card,
    threeD: src,
    threeDSide: plan.side,
    threeDClass: ' has-card-3d has-card-3d--' + plan.side,
  } : card);
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
const DEFAULT_THEME = { cover: 'blue', final: 'blue', statement: 'blue', 'numbered-cards-3': 'dark', 'kpi-metrics': 'dark', 'section-divider': 'dark' };

function buildSlide(slide, layout, num, total, fm, usedAssets, report) {
  const lang = fm.lang || 'ru';
  const S = L(lang);
  const theme = slide.meta.theme || DEFAULT_THEME[layout] || 'light';
  const threeDRel = slide.meta['3d'] || '';
  const threeDSrc = threeDRel ? useAsset(threeDRel, usedAssets, report) : '';
  const semantic = analyzeSlide({
    ...slide,
    threeD: threeDRel,
    threeDMode: slide.meta['3d-mode'] || 'auto',
    threeDCard: slide.meta['3d-card'] || '',
    threeDPosition: slide.meta['3d-pos'] || '',
  }, num - 1, total);
  const threeDPlan = threeDSrc ? recommendVisualPlacement({
    ...slide,
    meta: slide.meta,
  }, num - 1, total, {
    analysis: { ...semantic, renderLayout: layout },
    asset: VISUAL_ASSET_BY_SOURCE.get(threeDRel) || { source: threeDRel, kind: '3d', searchText: threeDRel.toLowerCase() },
  }) : null;
  if (threeDPlan && slide.meta['3d-pos'] === 'center') {
    report(`слайд ${num}: позиция 3D center заменена на ${threeDPlan.side} — глобальный объект не ставится строго по центру`);
  }
  if (threeDPlan && slide.meta['3d-mode'] === 'card' && threeDPlan.mode !== 'card') {
    report(`слайд ${num}: 3D не удалось безопасно привязать к карточке — ассет отклонён; смените карточку, визуал или силуэт`);
  }
  if (threeDPlan && threeDPlan.rejected) {
    report(`слайд ${num}: ${threeDPlan.reason}`);
  }
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
      ctx.cards = attachCardThreeD(slide.sections.map((sec) => ({
        title: sec.title,
        text: sec.paragraphs.join(' '),
        items: sec.bullets.length ? sec.bullets : null,
      })), threeDPlan, threeDSrc);
      ctx.colCount = Math.min(ctx.cards.length, 4);
      ctx.label = slide.meta.label || '';
    } else {
      // плоский режим: одна карточка с абзацами/буллетами (+фото)
      ctx.paragraphs = slide.paragraphs;
      // В контейнер-колонку идёт только фото/скриншот/мокап. 3D в контейнер не
      // ставится никогда — он накладывается поверх карточек (см. блок [3d:] ниже).
      if (slide.meta.image) ctx.image = useAsset(slide.meta.image, usedAssets, report);
      ctx.mediaLeft = String(slide.meta['media-side'] || '').toLowerCase() === 'left';
      const b = slide.bullets.length ? slide.bullets : slide.sections.flatMap((x) => x.bullets);

      // работа с пустотой (presentation-rules.md §5): считаем, сколько места займёт текст
      const sparse = fillRatio([...slide.paragraphs, ...b], 1600) < 0.6;
      if (sparse && !ctx.image) {
        report(`[ШТРАФ] слайд ${num}: короткий контент нельзя сжимать в маленькую карточку — выберите другой макет и смысловой визуал`);
      }
      {
        ctx.flat = true;
        ctx.noImage = !ctx.image;
        ctx.cardFit = '';
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
    ctx.cards = attachCardThreeD(slide.sections.slice(0, 2).map((sec, i) => ({
      cardNum: i + 1,
      title: sec.title,
      text: sec.paragraphs.join(' '),
      items: sec.bullets.length ? sec.bullets : null,
    })), threeDPlan, threeDSrc);
  }
  if (layout === 'comparison-flow') {
    if (slide.meta.image) ctx.image = useAsset(slide.meta.image, usedAssets, report);
    const sourceItems = slide.bullets.length ? slide.bullets : slide.sections.flatMap((sec) => sec.bullets);
    ctx.changes = sourceItems.map((item, index) => {
      const [rawLabel, ...rawRest] = String(item).split(':');
      const body = rawRest.length ? rawRest.join(':').trim() : rawLabel.trim();
      const parts = body.split(/\s*(?:→|⇒|->|—>)\s*/);
      return {
        index: index + 1,
        label: rawRest.length ? rawLabel.trim() : '',
        before: (parts[0] || '').trim(),
        after: (parts[1] || '').trim(),
      };
    });
    ctx.changeCount = ctx.changes.length;
    ctx.beforeLabel = slide.meta['before-label'] || 'Раньше';
    ctx.afterLabel = slide.meta['after-label'] || 'С Tumodo';
    ctx.categoryLabel = slide.meta['category-label'] || 'Параметр';
  }
  if (layout === 'process-steps' || layout === 'process-journey') {
    const items = slide.bullets.length
      ? slide.bullets.map((item) => ({ title: item, text: '' }))
      : slide.sections.map((sec) => ({ title: sec.title, text: sec.paragraphs.join(' ') }));
    ctx.steps = items.slice(0, 6).map((step, index) => ({ ...step, stepNum: String(index + 1).padStart(2, '0') }));
    ctx.stepCount = ctx.steps.length;
    if (slide.meta.image) {
      ctx.processImage = useAsset(slide.meta.image, usedAssets, report);
      ctx.processImageCover = true;
    } else if (threeDPlan && threeDPlan.mode === 'slide' && threeDSrc) {
      ctx.processThreeD = threeDSrc;
      ctx.processThreeDSide = threeDPlan.side;
    }
    ctx.hasProcessVisual = Boolean(ctx.processImage || ctx.processThreeD);
  }
  if (layout === 'kpi-metrics') {
    const rawMetrics = slide.sections.length
      ? slide.sections.map((sec) => ({ value: sec.title, text: sec.paragraphs.join(' ') }))
      : slide.bullets.map((item) => {
        const [value, ...rest] = String(item).split(/\s+—\s+/);
        return { value, text: rest.join(' — ') };
      });
    ctx.metrics = attachCardThreeD(rawMetrics.slice(0, 5).map((metric, index) => ({
      ...metric,
      metricIndex: index + 1,
      primary: index === 0,
    })), threeDPlan, threeDSrc);
    ctx.metricsCount = ctx.metrics.length;
    ctx.conclusion = slide.meta.conclusion || '';
  }
  if (layout === 'numbered-cards-3') {
    ctx.cards = attachCardThreeD(slide.sections.slice(0, 3).map((sec, i) => ({
      cardNum: i + 1,
      isTitle: !/^\d+$/.test(sec.title),
      title: sec.title,
      text: sec.paragraphs.join(' ').replace(/\*\*/g, ''),
    })), threeDPlan, threeDSrc);
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
    if (threeDPlan && threeDPlan.mode === 'card') {
      if (threeDPlan.cardIndex === 1) {
        ctx.painThreeD = threeDSrc;
        ctx.painThreeDSide = threeDPlan.side;
      } else {
        ctx.solutionThreeD = threeDSrc;
        ctx.solutionThreeDSide = threeDPlan.side;
      }
    }
  }
  if (layout === 'photo-list') {
    ctx.image = slide.meta.image ? useAsset(slide.meta.image, usedAssets, report) : '';
    ctx.items = slide.bullets.slice(0, 6);
    ctx.itemCount = ctx.items.length;
    ctx.photoLeft = String(slide.meta['media-side'] || '').toLowerCase() === 'left';
    if (!ctx.image || ctx.itemCount < 3 || ctx.itemCount > 6) {
      report(`[ШТРАФ] слайд ${num}: photo-list требует фото и 3–6 коротких пунктов; выберите другой макет`);
    }
  }
  if (layout === 'benefits-grid') {
    // canon-режим: секции → синие карточки с иконками (+боковая белая [side: true])
    const boldify = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const secs = slide.sections;
    if (secs.length) {
      const side = secs.find((x) => x.side);
      ctx.cards = attachCardThreeD(secs.filter((x) => !x.side).map((sec) => ({
        title: sec.title,
        icon: sec.icon ? useAsset(sec.icon, usedAssets, report) : null,
        text: sec.paragraphs.length ? sec.paragraphs.join(' ') : null,
        items: sec.bullets.length ? sec.bullets : null,
      })), threeDPlan, threeDSrc);
      ctx.sideTitle = side ? side.title : '';
      ctx.sideItems = side ? side.bullets.map(boldify) : [];
      ctx.noSide = !side;
    } else {
      // плоский режим: буллеты «лид — текст» → карточки без иконок
      // описание из одного пункта — это абзац, а не список: точку-буллет
      // перед единственной строкой не ставим (правило пользователя 2026-08-07)
      ctx.cards = attachCardThreeD(slide.bullets.map((item) => {
        const [lead, ...rest] = item.split(' — ');
        return { title: lead, text: rest.length ? rest.join(' — ') : null, items: null };
      }), threeDPlan, threeDSrc);
      ctx.noSide = true;
    }
    // Явно задаём и колонки, и строки: неявная третья строка раньше выходила
    // за контейнер и съедала нижнее поле 120px.
    if (ctx.noSide) {
      const count = ctx.cards.length;
      ctx.gridFit = count <= 2 ? 'grid-2x1'
        : count <= 4 ? 'grid-2x2'
          : count <= 6 ? 'grid-2x3'
            : count <= 9 ? 'grid-3x3'
              : 'grid-4x3';
    } else ctx.gridFit = '';
  }
  if (layout === 'principle-detail') {
    ctx.conclusion = slide.meta.conclusion || '';
    ctx.cards = attachCardThreeD(slide.sections.slice(0, 2).map((sec, i) => ({
      title: sec.title,
      items: sec.bullets.length ? sec.bullets : null,
      blue: i === 1,
      curve: i === 0,
      spacerTop: i === 0,
    })), threeDPlan, threeDSrc);
  }

  let html = render(readTpl(layout), ctx);
  // Глобальный 3D — крупный нижний акцент. Позиция всегда асимметрична; если
  // объект принадлежит карточке, он уже встроен в её DOM и обрезается карточкой.
  if (threeDPlan && threeDPlan.mode === 'slide' && threeDSrc && layout !== 'cover' && layout !== 'final' && layout !== 'process-steps' && layout !== 'process-journey') {
    const img = '<img class="slide-3d slide-3d--' + threeDPlan.side + ' slide-3d--' + threeDPlan.size + '" src="' + threeDSrc + '" alt="" style="--three-d-x:' + Math.round(threeDPlan.x * 100) + '%;--three-d-height:' + threeDPlan.height + 'px;--three-d-bury:' + Math.round(threeDPlan.bury * 100) + '%;">';
    html = html.replace(new RegExp('</section>' + String.fromCharCode(92) + 's*$'), img + '</section>');
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
  const overridesDir = path.join(ROOT, 'input', 'overrides', name);

  // финальный слайд обязателен (presentation-rules.md §1.1)
  const last = slides[slides.length - 1];
  if (!last || last.layout !== 'final') slides.push({ title: '', layout: 'final', meta: {}, lead: '', paragraphs: [], bullets: [], sections: [] });

  // Визуальная политика: почти каждый содержательный слайд должен иметь фото
  // и/или 3D. Исключения — разделитель, манифест и действительно плотная сетка.
  const visualEligible = slides.filter((slide) => {
    const layout = slide.layout || '';
    const denseGrid = layout === 'table' || (layout === 'benefits-grid' && (slide.bullets.length + slide.sections.length) >= 6);
    return !['cover', 'final', 'section-divider', 'statement'].includes(layout) && !denseGrid;
  });
  const withVisual = visualEligible.filter((slide) => slide.meta.image || slide.meta['3d']);
  for (const slide of visualEligible) {
    if (!slide.meta.image && !slide.meta['3d']) {
      report(`слайд «${slide.title || 'без заголовка'}»: нет обязательного фото/3D — добавьте [image: ...] или [3d: ...]`);
    }
  }
  if (visualEligible.length && withVisual.length / visualEligible.length < 0.8) {
    report(`визуальное покрытие ${withVisual.length}/${visualEligible.length} содержательных слайдов; требуется минимум 80%`);
  }
  if (visualEligible.length >= 4 && !visualEligible.some((slide) => slide.meta.image)) {
    report('в колоде нет фото/мокапов: один только 3D не создаёт нужного человеческого и продуктового ритма');
  }
  if (visualEligible.length >= 4 && !visualEligible.some((slide) => slide.meta['3d'])) {
    report('в колоде нет 3D-объектов: требуется сочетать фото людей и фирменные объёмные акценты');
  }
  for (let i = 1; i < slides.length; i += 1) {
    for (const key of ['image', '3d']) {
      const current = slides[i].meta[key];
      if (current && current === slides[i - 1].meta[key]) {
        report(`слайды ${i} и ${i + 1}: соседние слайды повторяют ассет ${current}`);
      }
    }
  }
  slides.forEach((slide, index) => {
    const analysis = analyzeSlide(slide, index, slides.length);
    if (analysis.contentFill < 0.38 && !slide.meta.image && !slide.meta['3d'] && !['cover', 'final', 'statement', 'section-divider'].includes(slide.layout || '')) {
      report(`слайд ${index + 1} «${slide.title || 'без заголовка'}»: media-led композиция осталась без крупного визуала — вероятна случайная пустота`);
    }
    if (analysis.role === 'process') {
      const namedCounts = { один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6 };
      const match = String(slide.title || '').toLowerCase().match(/\b(один|два|три|четыре|пять|шесть)\b/);
      if (match && namedCounts[match[1]] !== analysis.itemCount) {
        report(`слайд ${index + 1}: заголовок обещает ${namedCounts[match[1]]} шагов, а в контенте ${analysis.itemCount} — синхронизируйте тезис и структуру`);
      }
    }
  });

  const plannedLayouts = slides.map((slide, index) => pickLayout(slide, index, report, slides.length));
  for (let i = 1; i < plannedLayouts.length; i += 1) {
    if (plannedLayouts[i] === 'process-steps' && plannedLayouts[i - 1] === 'process-steps') {
      plannedLayouts[i] = 'process-journey';
      report(`слайд ${i + 1}: соседний process-steps уже использован — выбран альтернативный силуэт «process-journey»`);
    }
  }

  // Тёмная тема — глава, а не случайный эффект. Все dark-слайды должны идти
  // непрерывно и иметь одно имя тематической серии. Светлый слайд внутри тёмной
  // главы разрушает ритм и считается штрафной ошибкой.
  const darkIndices = slides
    .map((slide, index) => ({
      index,
      theme: slide.meta.theme || DEFAULT_THEME[plannedLayouts[index]] || 'light',
      chapter: slide.meta['theme-chapter'] || slide.meta['sequence-group'] || '',
    }))
    .filter((item) => item.theme === 'dark');
  if (darkIndices.length > 1) {
    const contiguous = darkIndices.every((item, index) => index === 0 || item.index === darkIndices[index - 1].index + 1);
    if (!contiguous) {
      report('[ШТРАФ] тёмные слайды разорваны светлыми: соберите их в одну непрерывную тематическую главу');
    }
    const chapters = new Set(darkIndices.map((item) => item.chapter).filter(Boolean));
    if (darkIndices.some((item) => !item.chapter) || chapters.size !== 1) {
      report('[ШТРАФ] тёмная серия должна иметь общий [theme-chapter: ...] или [sequence-group: ...] на каждом слайде');
    }
  }
  const seenSilhouettes = new Map();
  for (let i = 0; i < slides.length; i += 1) {
    const slide = slides[i];
    const layout = plannedLayouts[i];
    const overridePath = path.join(overridesDir, 'slide-' + String(i + 1).padStart(2, '0') + '.html');
    const visual = slide.meta.image ? 'photo' : (slide.meta['3d'] ? `3d-${slide.meta['3d-mode'] || 'auto'}` : 'no-visual');
    const side = slide.meta['media-side'] || slide.meta['3d-pos'] || (slide.meta.image ? 'right' : 'none');
    const signature = fs.existsSync(overridePath) ? `override-${i + 1}` : `${layout}:${visual}:${side}`;
    const sequenceGroup = slide.meta['sequence-group'] || '';
    if (i > 0 && layout === plannedLayouts[i - 1] && !sequenceGroup && !['cover', 'final', 'statement', 'section-divider'].includes(layout)) {
      report(`слайды ${i} и ${i + 1}: соседние слайды повторяют макет «${layout}» — выберите другой силуэт или явно задайте [sequence-group: ...] для осознанной серии`);
    }
    if (seenSilhouettes.has(signature) && !sequenceGroup && !['cover', 'final', 'statement', 'section-divider'].includes(layout)) {
      report(`слайды ${seenSilhouettes.get(signature)} и ${i + 1}: повторяется силуэт «${signature}» — смените макет, сторону визуала или композиционную семью`);
    } else seenSilhouettes.set(signature, i + 1);
  }

  const usedAssets = new Map();
  const rendered = slides.map((slide, i) => {
    const layout = plannedLayouts[i];
    checkLimits(slide, layout, (msg) => report(`слайд ${i + 1} (${layout}): ${msg}`));
    const overridePath = path.join(overridesDir, 'slide-' + String(i + 1).padStart(2, '0') + '.html');
    let html;
    if (fs.existsSync(overridePath)) {
      // Переопределение создаёт агент при точечной доработке слайда. Оно хранится
      // рядом с input, поэтому не теряется при следующей полной сборке и не влияет
      // на общие шаблоны или другие презентации.
      html = fs.readFileSync(overridePath, 'utf8').trim();
      for (const key of ['image', '3d']) {
        const rel = slide.meta[key];
        if (!rel) continue;
        const local = useAsset(rel, usedAssets, report);
        if (local) html = html.split('design-system/' + rel).join(local);
      }
    } else {
      html = buildSlide(slide, layout, i + 1, slides.length, fm, usedAssets, report);
    }
    const canonVariant = slide.meta.variant ? ` data-canon-variant="${esc(slide.meta.variant)}"` : '';
    const canonReference = slide.meta.reference ? ` data-canon-reference="${esc(slide.meta.reference)}"` : '';
    const semanticRole = slide.meta['semantic-role'] ? ` data-semantic-role="${esc(slide.meta['semantic-role'])}"` : '';
    return `<div class="slide-wrap"${canonVariant}${canonReference}${semanticRole}>\n${html}</div>`;
  });

  let page = render(fs.readFileSync(path.join(TPL, 'base.html'), 'utf8'), {
    lang: fm.lang || 'ru',
    title: fm.title || name,
    slides: rendered.join('\n'),
  });

  // CSS-переопределения также изолированы на уровне конкретной презентации.
  // Агенту рекомендуется именовать их slide-XX.css и ограничивать селекторы #sN.
  if (fs.existsSync(overridesDir)) {
    const css = fs.readdirSync(overridesDir)
      .filter((file) => file.endsWith('.css'))
      .sort()
      .map((file) => fs.readFileSync(path.join(overridesDir, file), 'utf8'))
      .join('\n');
    if (css.trim()) page = page.replace('</head>', '<style id="deck-overrides">\n' + css + '\n</style>\n</head>');
  }

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
