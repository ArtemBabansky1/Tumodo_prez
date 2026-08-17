const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIBRARY_DIR = path.join(ROOT, 'design-system', 'canon', 'decks', 'library');
const CATALOG_FILE = path.join(LIBRARY_DIR, 'catalog.tsv');
const PHOTO_CATALOG_FILE = path.join(ROOT, 'design-system', 'photos', 'catalog.json');
const MOCKUP_CATALOG_FILE = path.join(ROOT, 'design-system', 'mockups', 'catalog.json');
const CHARACTER_POLICY_FILE = path.join(ROOT, 'design-system', 'characters.json');
let characterPoliciesCache = null;

const ROLE_LABELS = {
  cover: 'Обложка',
  closing: 'Финал',
  section: 'Раздел',
  statement: 'Ключевой тезис',
  'problem-solution': 'Проблема и решение',
  metrics: 'Метрики и данные',
  comparison: 'Сравнение',
  process: 'Процесс и этапы',
  product: 'Продукт и интерфейс',
  people: 'Люди и роли',
  geography: 'География',
  evidence: 'Доказательства',
  benefits: 'Выгоды и возможности',
  principle: 'Принцип или позиционирование',
  introduction: 'Введение',
  list: 'Структурированный контент',
};

const COMPOSITION_LABELS = {
  hero: 'Крупный hero',
  manifesto: 'Манифест',
  'sparse-divider': 'Воздушный разделитель',
  'two-panel': 'Две смысловые панели',
  'split-media': 'Текст и визуал',
  'card-grid': 'Сетка карточек',
  'metric-focus': 'Акцент на цифрах',
  'data-table': 'Таблица',
  'process-flow': 'Сценарий или таймлайн',
  'product-showcase': 'Продуктовый showcase',
  'profile-grid': 'Карточки людей',
  'map-layout': 'Карта и подписи',
  'layered-cards': 'Слои и карточки',
  editorial: 'Редакционная композиция',
  columns: 'Колонки',
};

// Смысл 3D важнее его формального типа. Эти правила не выбирают дизайн вместо
// агента, а не дают случайному объекту получить высокий балл только потому, что
// он «тоже 3D». Паттерны также используются, чтобы понять, относится ли объект
// к одной конкретной карточке или ко всему слайду.
const THREE_D_CONCEPTS = [
  { test: /theo-mascot|маскот|робот/i, content: /\btheo\b|\bai\b|\bии\b|тео|искусственн.{0,12}интеллект|аналитик/i },
  { test: /globe|глобус/i, content: /географ|стран|регион|направлен|международ|глобал|виз|маршрут/i },
  { test: /folder|document|папк|документ/i, content: /документ|отч[её]т|акт|архив|бумаг|заявк|анк[eе]т|пакет/i },
  { test: /chat|bubble|чат|сообщ/i, content: /чат|поддержк|сообщ|коммуникац|связ|консультац|сопровожд/i },
  { test: /keys|ключ/i, content: /отел|прожив|заселен|доступ|безопасн|кабинет|ключ/i },
  { test: /ticket|билет|ваучер/i, content: /билет|ваучер|брон|авиа|рейс|поезд|железнодорож|перел[её]т/i },
  { test: /commission|coins|комисс|монет/i, content: /комисс|стоимост|цен|тариф|эконом|бюджет|оплат|сбор|расход|затрат/i },
  { test: /badge|lanyard|бейдж/i, content: /профил|рол[ьи]|сотрудник|участник|мероприят|конференц|доступ/i },
  { test: /heart|сердц|забот/i, content: /забот|поддержк|сервис|лояльност|удовлетвор[её]н|эмпати|human/i },
  { test: /calculator|калькулятор/i, content: /расч[её]т|бюджет|эконом|финанс|стоимост|цен|расход|затрат/i },
  { test: /access-cards|access cards|карта|карт[аы].{0,12}доступ/i, content: /профил|рол[ьи]|сотрудник|доступ|идентификац|аккаунт|пользовател/i },
  { test: /phone-tumodo|app-icon|смартфон.{0,12}икон/i, content: /мобильн|приложен|смартфон|телефон|в дороге|self-service/i },
  { test: /glass-product|product-cards|модул|экосистем/i, content: /платформ|модул|экосистем|workflow|процесс|аналит|документ|единый/i },
  { test: /abstract|curved|абстракт/i, content: /мисси|видени|принцип|позиционир|облож|раздел|итог|будущ/i },
];

function explicitMeta(slide, key) {
  if (slide && slide.meta && slide.meta[key] !== undefined) return slide.meta[key];
  const aliases = {
    '3d-pos': 'threeDPosition',
    '3d-mode': 'threeDMode',
    '3d-card': 'threeDCard',
  };
  if (slide && aliases[key] && slide[aliases[key]] !== undefined) return slide[aliases[key]];
  const camel = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return slide && slide[camel] !== undefined ? slide[camel] : '';
}

function contentFillScore(slide) {
  const text = slideText(slide);
  const sections = Array.isArray(slide.sections) ? slide.sections.length : 0;
  const bullets = Array.isArray(slide.bullets) ? slide.bullets.length : 0;
  // Это не геометрическая площадь, а быстрый сигнал для выбора силуэта:
  // короткий тезис требует крупного визуала, плотный материал — большей площади текста.
  return Math.max(0.12, Math.min(1, text.length / 760 + (sections + bullets) * 0.045));
}

function assetConcept(asset) {
  const source = [asset && asset.source, asset && asset.searchText].filter(Boolean).join(' ');
  return THREE_D_CONCEPTS.find((concept) => concept.test.test(source)) || null;
}

function conceptMatchScore(text, asset) {
  const concept = assetConcept(asset);
  if (!concept) return 0;
  return concept.content.test(String(text || '')) ? 72 : -38;
}

const RENDER_LAYOUT_BY_ROLE = {
  cover: 'cover',
  closing: 'final',
  section: 'section-divider',
  statement: 'statement',
  'problem-solution': 'pain-solution',
  process: 'process-steps',
  benefits: 'benefits-grid',
  principle: 'principle-detail',
  introduction: 'intro',
  metrics: 'kpi-metrics',
  comparison: 'comparison-flow',
  product: 'intro',
  people: 'benefits-grid',
  geography: 'intro',
  evidence: 'benefits-grid',
  list: 'title-bullets',
};
const SUPPORTED_RENDER_LAYOUTS = new Set([
  ...Object.values(RENDER_LAYOUT_BY_ROLE),
  'numbered-cards-3',
  'process-journey',
  'photo-list',
]);

// Композиции — это не ещё один набор жёстких шаблонов. Каждая запись описывает
// допустимую интерпретацию контента внутри существующей дизайн-системы. Движок
// сравнивает несколько интерпретаций и только затем выбирает renderLayout.
const COMPOSITION_CANDIDATES = [
  { id: 'hero', layout: 'cover', roles: ['cover'], fill: [0.12, 0.72], mass: 'center-hero', side: 'center', path: ['title', 'subtitle', 'hero-visual'] },
  { id: 'hero', layout: 'final', roles: ['closing'], fill: [0.12, 0.64], mass: 'center-hero', side: 'center', path: ['tagline', 'call-to-action', 'brand'] },
  { id: 'sparse-divider', layout: 'section-divider', roles: ['section'], fill: [0.12, 0.48], mass: 'single-anchor', side: 'center', path: ['section-number', 'title'] },
  { id: 'manifesto', layout: 'statement', roles: ['statement', 'principle', 'metrics'], fill: [0.12, 0.52], mass: 'single-focus', side: 'center', path: ['claim', 'supporting-proof'] },
  { id: 'two-panel', layout: 'pain-solution', roles: ['problem-solution', 'comparison', 'principle'], fill: [0.42, 0.92], mass: 'balanced-halves', side: 'both', path: ['title', 'left-panel', 'right-panel'] },
  { id: 'data-table', layout: 'comparison-flow', roles: ['comparison', 'metrics', 'evidence'], fill: [0.3, 1], mass: 'wide-structured', side: 'none', path: ['title', 'column-headers', 'rows'] },
  { id: 'metric-focus', layout: 'kpi-metrics', roles: ['metrics', 'evidence'], fill: [0.12, 0.88], mass: 'metric-cluster', side: 'none', path: ['title', 'hero-metric', 'supporting-metrics'] },
  { id: 'process-flow', layout: 'process-steps', roles: ['process', 'list'], fill: [0.48, 1], mass: 'horizontal-sequence', side: 'right', path: ['title', 'steps-left-to-right', 'outcome'] },
  { id: 'layered-cards', layout: 'numbered-cards-3', roles: ['process', 'benefits', 'list'], fill: [0.38, 0.82], mass: 'three-beat-grid', side: 'none', path: ['title', 'card-1', 'card-2', 'card-3'] },
  { id: 'card-grid', layout: 'benefits-grid', roles: ['benefits', 'people', 'evidence', 'list'], fill: [0.5, 1], mass: 'modular-grid', side: 'none', path: ['title', 'grid-scan', 'conclusion'] },
  { id: 'product-showcase', layout: 'intro', roles: ['product', 'introduction', 'geography'], fill: [0.28, 0.78], mass: 'visual-dominant-split', side: 'right', path: ['title', 'product-visual', 'supporting-points'] },
  { id: 'split-media', layout: 'photo-list', roles: ['people', 'benefits', 'product', 'introduction', 'list'], fill: [0.3, 0.72], mass: 'media-text-split', side: 'left', path: ['title', 'media', 'structured-list'] },
  { id: 'editorial', layout: 'intro', roles: ['introduction', 'principle', 'product', 'list'], fill: [0.24, 0.72], mass: 'asymmetric-editorial', side: 'right', path: ['title', 'lead', 'supporting-blocks'] },
  { id: 'columns', layout: 'title-bullets', roles: ['list', 'benefits', 'introduction', 'evidence'], fill: [0.42, 0.9], mass: 'text-columns', side: 'none', path: ['title', 'lead', 'items'] },
];

function referenceRole(layout, comment) {
  const text = String(comment || '').toLowerCase();
  if (layout === 'cover') return 'cover';
  if (layout === 'final') return 'closing';
  if (layout === 'section-divider') return 'section';
  if (layout === 'statement') return 'statement';
  if (layout === 'pain-solution') return 'problem-solution';
  if (layout === 'chart' || layout === 'kpi-metrics' || /график|диаграм|метрик|процент|цифр|roi|kpi/.test(text)) return 'metrics';
  if (layout === 'table' || layout === 'comparison-flow' || /таблиц|сравнен| versus | vs\b/.test(' ' + text)) return 'comparison';
  if (/спикер|команд|персон|портрет|рол[ьи]|сотрудник/.test(text)) return 'people';
  if (/карт[аы]|географ|стран|регион|мир/.test(text)) return 'geography';
  if (/логотип|клиент|партн|медиа|доказ|валидац/.test(text)) return 'evidence';
  if (/мокап|ноутбук|телефон|интерфейс|скриншот|продукт|дашборд/.test(text)) return 'product';
  if (/таймлайн|схем|этап|процесс|воронк|шаг|маршрут|дорожн/.test(text) || layout === 'numbered-cards-3' || layout === 'process-steps') return 'process';
  if (/vision|mission|ценност|принцип|позиционир|обещани/.test(text) || layout === 'principle-detail') return 'principle';
  if (layout === 'benefits-grid' || /выгод|преимуществ|возможност|сервис|функц/.test(text)) return 'benefits';
  if (layout === 'intro') return 'introduction';
  return 'list';
}

function referenceComposition(layout, comment, role) {
  const text = String(comment || '').toLowerCase();
  if (role === 'cover' || role === 'closing') return 'hero';
  if (role === 'section') return 'sparse-divider';
  if (role === 'statement') return 'manifesto';
  if (role === 'problem-solution' || /две (?:большие )?карточки|слева.+справа/.test(text)) return 'two-panel';
  if (role === 'metrics' || /процент|крупн.+цифр/.test(text)) return 'metric-focus';
  if (role === 'comparison' || layout === 'table') return 'data-table';
  if (role === 'process' || /таймлайн|схем|шаг|этап/.test(text)) return 'process-flow';
  if (role === 'product' || /мокап|интерфейс|скриншот/.test(text)) return 'product-showcase';
  if (role === 'people') return 'profile-grid';
  if (role === 'geography') return 'map-layout';
  if (/стопк|каскад|сло[иё]/.test(text)) return 'layered-cards';
  if (layout === 'photo') return 'split-media';
  if (layout === 'benefits-grid' || /сетк|карточ/.test(text)) return 'card-grid';
  if (/колон/.test(text) || layout === 'title-bullets') return 'columns';
  return 'editorial';
}

function referenceMedia(comment, role) {
  const text = String(comment || '').toLowerCase();
  if (/мокап|ноутбук|телефон|интерфейс|скриншот/.test(text) || role === 'product') return 'product-mockup';
  if (/фото/.test(text)) return role === 'people' ? 'portrait' : 'photo';
  if (role === 'people') return 'portrait';
  if (role === 'geography') return 'map';
  if (role === 'metrics') return 'chart';
  if (role === 'evidence') return 'logos';
  if (/икон/.test(text)) return 'icons';
  return 'none';
}

function referenceDensity(layout, comment, role) {
  const text = String(comment || '').toLowerCase();
  if (['cover', 'closing', 'section', 'statement'].includes(role)) return 'low';
  if (/4×3|3×3|таблиц|много|список|три колон|шесть|6 карточ/.test(text)) return 'high';
  if (['benefits-grid', 'title-bullets', 'table'].includes(layout)) return 'medium';
  return 'medium';
}

function parseLibraryCatalog(file = CATALOG_FILE) {
  const source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line, index) => {
      const [filename, layout, theme, quality, ...tail] = line.split('\t');
      const comment = tail.join('\t').trim();
      const nodeMatch = filename.match(/__([0-9]+)-([0-9]+)\.[^.]+$/);
      const role = referenceRole(layout, comment);
      const composition = referenceComposition(layout, comment, role);
      const media = referenceMedia(comment, role);
      const density = referenceDensity(layout, comment, role);
      return {
        id: 'figma-' + (nodeMatch ? nodeMatch[1] + '-' + nodeMatch[2] : index + 1),
        file: filename,
        source: 'decks/library/' + filename,
        url: '/files/design-system/canon/decks/library/' + encodeURIComponent(filename),
        nodeId: nodeMatch ? nodeMatch[1] + ':' + nodeMatch[2] : '',
        figmaUrl: nodeMatch
          ? 'https://www.figma.com/design/SZpOoVhI07GPa3Vf7BRc10/?node-id=' + nodeMatch[1] + '-' + nodeMatch[2] + '&m=dev'
          : '',
        legacyLayout: layout,
        renderLayout: RENDER_LAYOUT_BY_ROLE[role] || 'title-bullets',
        theme,
        quality,
        comment,
        role,
        roleLabel: ROLE_LABELS[role] || role,
        composition,
        compositionLabel: COMPOSITION_LABELS[composition] || composition,
        media,
        density,
        searchText: [comment, layout, theme, ROLE_LABELS[role], COMPOSITION_LABELS[composition], media].join(' ').toLowerCase(),
      };
    });
}

/**
 * Контент и Figma node могут отличаться, но для выбора пользователю важен сам
 * визуальный приём. Этот ключ описывает геометрию и характер канона без текста.
 */
function referenceStyleSignature(reference) {
  const text = String(reference && reference.comment || '').toLowerCase();
  const geometryMarkers = [
    ['grid-4x3', /4\s*[×xх]\s*3/],
    ['grid-4x2', /4\s*[×xх]\s*2/],
    ['grid-3x4', /3\s*[×xх]\s*4/],
    ['grid-3x2', /3\s*[×xх]\s*2/],
    ['grid-2x2', /2\s*[×xх]\s*2/],
    ['grid-2plus3', /2\s*\+\s*3/],
    ['columns-4', /четыре колон|4\s*колон/],
    ['columns-3', /три колон|3\s*колон/],
    ['columns-2', /две колон|2\s*колон/],
    ['cards-5', /пять (?:нумерованн(?:ых|ые) )?карточ/],
    ['cards-4', /четыре (?:нумерованн(?:ых|ые) )?карточ/],
    ['cards-3', /три (?:[а-яё-]+ )?карточ/],
    ['cards-2', /две (?:[а-яё-]+ )?карточ/],
    ['split-left-right', /слева.+справа/],
    ['toggle', /тумблер/],
    ['numbered', /нумерован|номер(?:ами|ов)|\b1\/2\/3\b|\b3\/4\b/],
    ['stacked', /стопк|каскад|сло[еёий]/],
    ['timeline', /таймлайн|онбординг|вех/],
    ['map', /карт[аы] мира|карта|рынк/],
    ['table', /таблиц/],
    ['chart', /диаграм|орг-схем|график/],
    ['photo', /фото|фотограф/],
    ['mockup-phone', /мокап.{0,18}телефон|телефон.{0,18}мокап/],
    ['mockup-laptop', /мокап.{0,18}ноутбук|ноутбук.{0,18}мокап/],
    ['mockup-interface', /мокап|интерфейс|калькулятор/],
    ['logos', /логотип/],
    ['icons', /икон/],
    ['badges', /бейдж/],
    ['checks', /чек|галоч/],
    ['crosses', /крест/],
    ['quotes', /цитат/],
    ['tags', /тег|облако/],
    ['percentages', /процент|%/],
    ['cta', /\bcta\b|кнопк|learn more/],
    ['gradient', /градиент/],
    ['co-brand', /ко-бренд/],
    ['minimal', /минимум контента|пустой/],
    ['bottom-anchor', /внизу/],
    ['arcs', /арк/],
    ['bento', /бенто/],
    ['blue-card', /син(?:яя|ие|юю) карточ/],
    ['dark-card', /т[её]мн(?:ая|ые|ую) карточ/],
    ['green-card', /зел[её]н(?:ая|ые|ую) карточ/],
    ['purple-card', /фиолетов(?:ая|ые|ую) карточ/],
  ].filter(([, pattern]) => pattern.test(text)).map(([marker]) => marker);
  return [
    reference && reference.role,
    reference && reference.composition,
    reference && (reference.legacyLayout || reference.renderLayout),
    reference && reference.theme,
    reference && reference.media,
    reference && reference.density,
    geometryMarkers.join(',') || 'base',
  ].map((value) => String(value || 'none').toLowerCase()).join('|');
}

/** Оставляет первый (а после ранжирования — лучший) канон каждого визуального типа. */
function dedupeReferenceVariants(references) {
  const seen = new Set();
  return (references || []).filter((reference) => {
    if (/(?:дубл|duplicate|copy)/i.test(String(reference && reference.comment || ''))) return false;
    const signature = referenceStyleSignature(reference);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function slideText(slide) {
  const sections = Array.isArray(slide.sections) ? slide.sections : [];
  const paragraphs = Array.isArray(slide.paragraphs) ? slide.paragraphs : [];
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  const sectionText = sections.map((section) => [section.title, ...(section.paragraphs || []), ...(section.bullets || [])].join(' '));
  return [
    slide.title,
    slide.lead,
    slide.summary,
    slide.searchText,
    ...paragraphs,
    ...bullets,
    ...sectionText,
  ].filter(Boolean).join(' ').toLowerCase();
}

function inferSemanticRole(slide, index, total, facts) {
  const { text, titleText, explicit, sections, itemCount, changePairs } = facts;
  const declared = String(explicitMeta(slide, 'semantic-role') || '').toLowerCase();
  if (ROLE_LABELS[declared]) return declared;
  if (index === 0 || explicit === 'cover') return 'cover';
  if (explicit === 'final' || /^(спасибо|контакты|thank you|questions|вопросы)(?:$|\s|[.!?:—-])/.test(titleText)) return 'closing';
  if (explicit === 'section-divider' || /^(раздел|глава|часть)(?:$|\s|[.!?:—-])/.test(titleText)) return 'section';
  if (explicit === 'statement') return 'statement';

  // Заголовок формулирует коммуникационную задачу слайда и поэтому сильнее
  // отдельных ключевых слов внутри примеров и подписей.
  if (/проблем|боль|вызов|хаос|ошиб|challenge|pain|как .{0,50}(решает|solves?)/.test(titleText)) return 'problem-solution';
  if (/сравнен|\bvs\b|до и после|раньше.{0,40}теперь|было.{0,40}стало|альтернатив/.test(titleText)) return 'comparison';
  if (/процесс|этап|шаг|цикл|таймлайн|roadmap|workflow|как (?:это )?работает|сценари|алгоритм/.test(titleText)) return 'process';
  if (/команд|спикер|персон|сотрудник|рол[ьи]|аудитор|кому помогает|для кого/.test(titleText)) return 'people';
  if (/географ|стран|регион|направлен|рынк|карта|global|worldwide/.test(titleText)) return 'geography';
  if (/продукт|платформ|интерфейс|дашборд|приложен|демо|product|platform/.test(titleText)) return 'product';
  if (/метрик|динамик|выручк|прогноз|цифр|числ|статист|kpi|roi|revenue|growth|forecast/.test(titleText)) return 'metrics';
  if (/клиент|партн|доказ|результат|кейс|отзыв|trusted|logo/.test(titleText)) return 'evidence';
  if (/что (?:можно|умеет)|возможност|функц|выгод|преимуществ|почему выбира|формат|как выглядит ответ|ограничен/.test(titleText)) return 'benefits';
  if (/мисси|видени|vision|mission|принцип|позиционир|обещани/.test(titleText)) return 'principle';
  if (/о ч[её]м (?:расскажем|поговорим)|содержание|agenda|в этой презентации/.test(titleText)) return 'list';

  // Явная метаинформация и структура важнее лексики тела. Случайное слово
  // «сравнить» в одном примере больше не превращает перечень возможностей в
  // сравнительную таблицу.
  if (explicit === 'comparison-flow' || explicit === 'table' || explicitMeta(slide, 'before-label') || explicitMeta(slide, 'after-label')) return 'comparison';
  if (changePairs >= 2) return 'comparison';
  if (explicit === 'process-steps' || explicit === 'process-journey') return 'process';
  if (explicit === 'kpi-metrics') return 'metrics';
  if (explicit === 'pain-solution') return 'problem-solution';

  const numericEvidence = (text.match(/(?:^|\s)[+-]?\d[\d\s.,]*(?:%|₽|€|\$|млн|тыс|x|×)?/g) || []).length;
  if (numericEvidence >= 2 && /метрик|динамик|выручк|прогноз|расход|эконом|рост|снижен/.test(text)) return 'metrics';
  if (itemCount >= 2 && /тревел-менеджер|координатор|аналитик|бухгалтер|руководител|сотрудник|пользовател/.test(text)) return 'people';
  if (/географ|регион|рынок|worldwide/.test(text)) return 'geography';
  if (/интерфейс|дашборд|приложен|product|platform/.test(text)) return 'product';
  if (/клиент|партн|доказ|кейс|отзыв/.test(text)) return 'evidence';
  if (/мисси|видени|vision|mission|позиционир|обещани/.test(text)) return 'principle';
  if (explicit === 'benefits-grid' || itemCount >= 4) return 'benefits';
  if (index === 1 || explicit === 'intro') return 'introduction';
  if (itemCount === 0 && text.length <= 220) return 'statement';
  if (sections === 3 && explicit === 'numbered-cards-3') return 'process';
  return 'list';
}

function analyzeSlide(slide, index = 0, total = 0) {
  const text = slideText(slide);
  const titleText = String(slide.title || '').toLowerCase();
  const explicit = String(slide.layout || '').toLowerCase();
  const sections = Array.isArray(slide.sections) ? slide.sections.length : Number(slide.sections || 0);
  const bullets = Array.isArray(slide.bullets) ? slide.bullets.length : Number(slide.bullets || 0);
  const itemCount = bullets + sections;
  const changePairs = Array.isArray(slide.bullets)
    ? slide.bullets.filter((item) => /(?:→|⇒|->|—>|\bдо\b.{0,80}\bпосле\b)/i.test(String(item))).length
    : 0;
  const role = inferSemanticRole(slide, index, total, { text, titleText, explicit, sections, itemCount, changePairs });

  const hasImage = Boolean(slide.image || explicitMeta(slide, 'image'));
  const hasMedia = Boolean(hasImage || slide.threeD || explicitMeta(slide, '3d') || /фото|мокап|скриншот|изображен/.test(text));
  const media = role === 'product' ? 'product-mockup'
    : role === 'people' ? 'portrait'
      : role === 'geography' ? 'map'
        : role === 'metrics' ? 'chart'
          : role === 'evidence' ? 'logos'
            : hasMedia ? 'photo' : 'none';
  const density = text.length > 700 || itemCount >= 7 ? 'high' : (text.length < 240 && itemCount <= 2 ? 'low' : 'medium');
  const contentFill = contentFillScore(slide);
  let renderLayout = chooseRenderableLayout({ role, itemCount, sections, text, explicit, changePairs });
  // Недозаполненную общую карточку запрещено просто сжимать. Для короткого
  // списка с фото меняем семейство: полноразмерное фото + равномерные строки.
  if (contentFill < 0.55 && hasImage && bullets >= 3 && bullets <= 6 && !['comparison', 'process', 'metrics'].includes(role)) {
    renderLayout = 'photo-list';
  }
  const denseTextException = itemCount >= 6 && ['benefits-grid', 'process-steps', 'comparison-flow'].includes(renderLayout);
  const visualException = ['cover', 'closing', 'section', 'statement'].includes(role);
  const requiresVisual = !visualException && !denseTextException;
  const preferredVisualKinds = role === 'people' ? ['photo']
    : role === 'product' ? ['mockup', '3d']
      : role === 'geography' ? ['mockup', '3d']
        : role === 'metrics' ? ['3d', 'mockup']
          : ['3d', 'photo'];

  const containerPolicy = renderLayout === 'photo-list'
    ? 'full-height-rows'
    : visualException
    ? 'hero-or-structural'
    : role === 'comparison'
    ? 'table-fill'
    : (contentFill < 0.55 ? 'alternate-layout-required' : (contentFill > 0.82 ? 'capacity-risk' : 'standard'));
  const alignmentContract = role === 'metrics'
    ? 'values-top/text-bottom'
    : role === 'comparison'
      ? 'shared-table-columns/photo-table-edges'
      : role === 'process'
        ? 'shared-card-edges/step-grid'
        : itemCount >= 2
          ? 'shared-row-axes'
          : 'system-title-anchor';
  const penaltyRisks = [];
  if (!visualException && contentFill < 0.55 && renderLayout !== 'photo-list') penaltyRisks.push('empty-container');
  if (role === 'comparison') penaltyRisks.push('detached-table-header', 'decorative-arrows');
  if (role === 'metrics') penaltyRisks.push('metric-baseline', '3d-text-collision');
  if (requiresVisual) penaltyRisks.push('visual-crop-or-collision');

  return {
    role,
    roleLabel: ROLE_LABELS[role] || role,
    itemCount,
    changePairs,
    density,
    media,
    renderLayout,
    requiresVisual,
    preferredVisualKinds,
    contentFill,
    spaceStrategy: contentFill < 0.38 ? 'media-led' : (contentFill < 0.72 ? 'balanced' : 'content-led'),
    recommendedVisualShare: contentFill < 0.38 ? 0.5 : (contentFill < 0.72 ? 0.36 : 0.26),
    containerPolicy,
    alignmentContract,
    titleSystem: 'page-title/system-anchor',
    decorationPolicy: 'functional-only',
    theme: String(explicitMeta(slide, 'theme') || ''),
    themeChapter: String(explicitMeta(slide, 'theme-chapter') || explicitMeta(slide, 'sequence-group') || ''),
    penaltyRisks,
    isLast: Boolean(total && index === total - 1),
  };
}

function parseVisualAssets() {
  const photoCatalog = JSON.parse(fs.readFileSync(PHOTO_CATALOG_FILE, 'utf8'));
  const mockupCatalog = JSON.parse(fs.readFileSync(MOCKUP_CATALOG_FILE, 'utf8'));
  const renderableExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
  const searchableMeta = (value) => {
    if (Array.isArray(value)) return value.map(searchableMeta).join(' ');
    if (value && typeof value === 'object') return Object.values(value).map(searchableMeta).join(' ');
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  };
  const listFiles = (prefix, roots) => {
    const base = path.join(ROOT, 'design-system', prefix);
    const files = [];
    const walk = (dir, rel) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name === '.gitkeep' || entry.name === 'catalog.json') continue;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        const childPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(childPath, childRel);
        else if (entry.isFile() && renderableExtensions.has(path.extname(entry.name).toLowerCase())) files.push(childRel);
      }
    };
    for (const root of roots) walk(path.join(base, root), root);
    return files.sort((a, b) => a.localeCompare(b));
  };
  const normalize = (catalog, prefix, roots) => listFiles(prefix, roots).map((file) => {
    const meta = catalog[file] || {};
    return {
      source: prefix + '/' + file,
      kind: prefix === 'mockups' ? 'mockup' : (file.startsWith('3d/') ? '3d' : 'photo'),
      description: meta.description || '',
      usage: meta.usage || '',
      meta,
      searchText: [file, searchableMeta(meta)].filter(Boolean).join(' ').toLowerCase(),
    };
  });
  return [
    ...normalize(photoCatalog, 'photos', ['people', '3d']),
    ...normalize(mockupCatalog, 'mockups', ['files', 'screens', 'devices']),
  ];
}

function visualConceptScore(analysis, slide, asset) {
  const text = slideText(slide);
  let score = analysis.preferredVisualKinds.includes(asset.kind) ? 28 : 0;
  // В продуктовой истории реальный экран сильнее тематического 3D: он доказывает
  // функцию, а не только поддерживает настроение. Аналогично, в истории о людях
  // сначала показываем человека, а предметный акцент оставляем вторым слоем.
  if (analysis.role === 'product' && asset.kind === 'mockup') score += 42;
  if (analysis.role === 'metrics' && asset.kind === 'mockup') score += 18;
  if (analysis.role === 'people' && asset.kind === 'photo') score += 24;
  const rolePatterns = {
    cover: /облож|hero|титул|абстракт|маскот|команд/,
    closing: /финал|призыв|команд|поддержк|маскот/,
    statement: /абстракт|маскот|акцент|цитат/,
    'problem-solution': /рутин|хаос|ошиб|стикер|документ|поддержк|маскот/,
    metrics: /аналит|данн|отч[её]т|дашборд|график|глобус|маскот/,
    comparison: /аналит|данн|ноутбук|сверк|маскот/,
    process: /маршрут|документ|папк|поддержк|ноутбук|маскот/,
    product: /дашборд|приложен|интерфейс|ноутбук|iphone|маскот/,
    people: /портрет|сотрудник|руководитель|координатор|бухгалтер|команд/,
    geography: /карт[аы]|глобус|международ|направлен/,
    evidence: /команд|клиент|партн|результат|встреч/,
    benefits: /сервис|поддержк|комфорт|маскот|мобильн|документ/,
    principle: /абстракт|маскот|команд|портрет/,
    introduction: /ноутбук|приложен|команд|маскот/,
    list: /маскот|документ|ноутбук|команд/,
  };
  if ((rolePatterns[analysis.role] || /маскот|команд/).test(asset.searchText)) score += 30;
  if (asset.kind === '3d') score += conceptMatchScore(text, asset);
  if (/тео|theo|\bai\b|\bии\b|аналит/.test(text) && /theo|тео|аналит|маскот/.test(asset.searchText)) score += 55;
  if (/theo-mascot|маскот|робот/.test(asset.searchText) && !/тео|theo|\bai\b|\bии\b|искусственн.{0,12}интеллект|аналитик/.test(text)) score -= 120;
  const words = [...new Set(text.match(/[а-яёa-z]{5,}/gi) || [])].slice(0, 40);
  score += Math.min(24, words.filter((word) => asset.searchText.includes(word)).length * 4);
  const semanticTags = Array.isArray(asset.meta && asset.meta.tags) ? asset.meta.tags : [];
  const tagScore = semanticTags.reduce((sum, tag) => {
    const normalized = String(tag || '').toLowerCase().trim();
    if (!normalized) return sum;
    if (normalized.length >= 5 && text.includes(normalized)) return sum + 18;
    const tagWords = [...new Set(normalized.match(/[а-яёa-z]{5,}/gi) || [])];
    return sum + Math.min(16, tagWords.filter((word) => text.includes(word)).length * 8);
  }, 0);
  score += Math.min(72, tagScore);
  return score;
}

function isTheoMascot(asset) {
  return /theo-mascot|тео.{0,12}маскот|маскот.{0,12}тео/i.test([asset && asset.source, asset && asset.searchText].filter(Boolean).join(' '));
}

function parseCharacterPolicies(file = CHARACTER_POLICY_FILE) {
  if (file === CHARACTER_POLICY_FILE && characterPoliciesCache) return characterPoliciesCache;
  let policies = {};
  try { policies = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (file === CHARACTER_POLICY_FILE) characterPoliciesCache = policies;
  return policies;
}

function characterPolicy(total, options = {}) {
  const configured = options.visualPolicy && options.visualPolicy.theo;
  const stored = parseCharacterPolicies().theo || {};
  const source = configured || stored;
  const targetAppearances = total >= Number(source.longDeckFromSlides || 12)
    ? Number(source.longDeckTarget || 3)
    : Number(source.shortDeckTarget || 2);
  const middle = Math.max(2, Math.min(Math.max(2, total - 2), Math.floor((Math.max(total, 2) - 1) * 0.5)));
  return {
    ...source,
    targetAppearances,
    minAppearances: Number(source.minAppearances || 2),
    maxAppearances: Number(source.maxAppearances || 3),
    minGap: Number(source.minGap || 2),
    heroOnlyOnCover: source.heroOnlyOnCover !== false,
    preferredIndices: targetAppearances === 3 ? [0, middle, Math.max(middle + 2, total - 2)] : [0, middle],
  };
}

function characterPolicyScore(asset, index, total, options = {}) {
  if (!isTheoMascot(asset)) return { score: 0, scheduled: false, reason: '' };
  const policy = characterPolicy(total, options);
  const state = options.visualState || {};
  const appearances = Array.isArray(state.theoAppearances) ? state.theoAppearances : [];
  const last = appearances.length ? appearances[appearances.length - 1] : -Infinity;
  if (appearances.length >= policy.maxAppearances) {
    return { score: -1000, scheduled: false, reason: 'лимит персонажа исчерпан: максимум три появления на колоду' };
  }
  if (index - last < policy.minGap) {
    return { score: -800, scheduled: false, reason: 'персонаж не повторяется на соседних слайдах' };
  }
  if (index === 0) {
    const source = String(asset.source || '');
    const heroAssetFit = /avatar/i.test(source) ? -120 : (/analyst-1/i.test(source) ? 46 : 0);
    return { score: 180 + heroAssetFit, scheduled: true, reason: 'главное hero-появление персонажа запланировано на обложке; предпочтительна полнофигурная версия' };
  }
  if (appearances.length >= policy.targetAppearances) {
    return { score: -220, scheduled: false, reason: 'целевой бюджет персонажа уже достигнут; приоритет у продукта, людей и данных' };
  }
  const distance = Math.min(...policy.preferredIndices.slice(1).map((slot) => Math.abs(slot - index)));
  if (distance === 0) return { score: 86, scheduled: true, reason: 'редкое поддерживающее появление в запланированной точке истории' };
  if (distance === 1) return { score: 18, scheduled: false, reason: 'допустимо рядом с плановой точкой, но не является предпочтительным' };
  return { score: -90, scheduled: false, reason: 'в этой части истории доказательство должны нести продукт, люди или данные' };
}

function recommendVisualAssets(slide, index = 0, total = 0, options = {}) {
  const analysis = options.analysis || analyzeSlide(slide, index, total);
  const assets = options.assets || parseVisualAssets();
  const text = slideText(slide);
  const excluded = new Set(options.exclude || []);
  const limit = Number(options.limit || 6);
  const creativeDirection = options.creativeDirection || null;
  const visualPriority = creativeDirection && Array.isArray(creativeDirection.visualPriority)
    ? creativeDirection.visualPriority
    : [];
  const suggestions = assets
    .filter((asset) => !excluded.has(asset.source))
    .map((asset) => {
      const policy = characterPolicyScore(asset, index, total, options);
      const priorityIndex = visualPriority.indexOf(asset.kind);
      const creativeScore = priorityIndex >= 0 ? Math.max(4, 18 - priorityIndex * 6) : 0;
      return {
        ...asset,
        score: visualConceptScore(analysis, slide, asset) + policy.score + creativeScore,
        policy,
        creativeScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source, 'ru'))
    .slice(0, limit)
    .map((asset) => ({
      ...asset,
      reason: analysis.roleLabel + ' · ' + (asset.kind === '3d' ? '3D-акцент' : asset.kind === 'photo' ? 'смысловое фото' : 'продуктовый мокап') + (asset.policy.reason ? ' · ' + asset.policy.reason : ''),
    }));
  return {
    required: analysis.requiresVisual,
    preferredKinds: analysis.preferredVisualKinds,
    relevantThreeDAvailable: assets.some((asset) => asset.kind === '3d' && conceptMatchScore(text, asset) > 0),
    assetGap: assets.some((asset) => asset.kind === '3d' && conceptMatchScore(text, asset) > 0)
      ? ''
      : 'В библиотеке нет 3D, который прямо соответствует смыслу; используйте фото/мокап или добавьте новый фирменный объект, но не случайный 3D.',
    characterPolicy: characterPolicy(total, options),
    suggestions,
  };
}

function cardCandidates(slide) {
  const sections = Array.isArray(slide.sections) ? slide.sections : [];
  if (sections.length) {
    return sections.map((section, index) => ({
      index,
      text: [section.title, ...(section.paragraphs || []), ...(section.bullets || [])].filter(Boolean).join(' ').toLowerCase(),
    }));
  }
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  if (bullets.length >= 2 && bullets.length <= 4) {
    return bullets.map((item, index) => ({ index, text: String(item).toLowerCase() }));
  }
  return [];
}

function recommendVisualPlacement(slide, index = 0, total = 0, options = {}) {
  const analysis = options.analysis || analyzeSlide(slide, index, total);
  const asset = options.asset || null;
  const kind = (asset && asset.kind) || options.kind || '';

  if (kind === 'photo' || kind === 'mockup') {
    return {
      mode: 'container',
      ownership: 'slide',
      fit: 'cover',
      objectPosition: '50% 0%',
      visualShare: analysis.recommendedVisualShare,
      size: analysis.spaceStrategy === 'media-led' ? 'half' : 'third',
      reason: analysis.spaceStrategy === 'media-led'
        ? 'мало текста: визуал принимает на себя около половины композиции'
        : 'фото — самостоятельная колонка, а не декоративная вставка',
    };
  }

  if (kind !== '3d') {
    return {
      mode: 'none',
      ownership: 'none',
      visualShare: analysis.recommendedVisualShare,
      reason: 'тип визуала не определён',
    };
  }

  const theoMascot = isTheoMascot(asset);
  if (theoMascot && index === 0) {
    return {
      mode: 'slide',
      ownership: 'slide',
      zone: 'hero',
      side: 'right',
      fit: 'contain',
      clip: true,
      size: 'hero',
      height: 860,
      bury: 0.16,
      x: 0.7,
      reason: 'единственное крупное появление Тео: hero на обложке',
    };
  }

  const explicitMode = String(explicitMeta(slide, '3d-mode') || 'auto').toLowerCase();
  const explicitCard = Number(explicitMeta(slide, '3d-card') || 0);
  const requestedSide = String(explicitMeta(slide, '3d-pos') || '').toLowerCase();
  const cards = cardCandidates(slide);
  const cardLayouts = new Set(['benefits-grid', 'pain-solution', 'numbered-cards-3', 'kpi-metrics', 'principle-detail', 'title-bullets']);
  const noGlobalThreeDLayouts = new Set(['benefits-grid', 'numbered-cards-3', 'kpi-metrics', 'comparison-flow']);
  const rankedCards = cards.map((card) => ({
    ...card,
    score: conceptMatchScore(card.text, asset) + Math.min(20, card.text.length / 18),
  })).sort((a, b) => b.score - a.score);
  const best = rankedCards[0] || null;
  const runnerUp = rankedCards[1] || null;
  const uniqueCardMatch = Boolean(
    best &&
    cardLayouts.has(analysis.renderLayout) &&
    best.score >= 42 &&
    (!runnerUp || best.score - runnerUp.score >= 24) &&
    best.text.length <= 260
  );
  let mode = explicitMode === 'card' || explicitMode === 'slide'
    ? explicitMode
    : (uniqueCardMatch ? 'card' : 'slide');

  // Плотные сетки не имеют свободного нижнего слоя: глобальный 3D неизбежно
  // пересекает подписи. Безопасность важнее явно заданного `3d-mode: slide`.
  // Если объект однозначно относится к карточке, привязываем его к ней; иначе
  // отклоняем ассет и заставляем агента сменить визуал или силуэт.
  if (mode === 'slide' && noGlobalThreeDLayouts.has(analysis.renderLayout)) {
    if (uniqueCardMatch && cards.length) mode = 'card';
    else {
      return {
        mode: 'none',
        ownership: 'none',
        rejected: true,
        requiresLayoutChange: true,
        reason: 'глобальный 3D отклонён: в плотной сетке нет безопасной зоны; выберите карточку, другой визуал или другой силуэт',
      };
    }
  }

  if (theoMascot && mode === 'card' && cards.length) {
    const cardIndex = explicitCard >= 1 && explicitCard <= cards.length
      ? explicitCard
      : ((best ? best.index : 0) + 1);
    return {
      mode: 'card',
      ownership: 'card',
      cardIndex,
      side: requestedSide === 'left' || requestedSide === 'right' ? requestedSide : 'right',
      fit: 'contain',
      clip: true,
      size: 'medium',
      height: 0.58,
      bury: 0.1,
      textShare: 0.7,
      supportingOnly: true,
      reason: 'Тео вне обложки — редкий поддерживающий акцент внутри смысловой карточки',
    };
  }

  if (theoMascot) {
    const side = requestedSide === 'left' || requestedSide === 'right' ? requestedSide : (index % 2 === 0 ? 'right' : 'left');
    return {
      mode: 'slide',
      ownership: 'slide',
      zone: 'supporting-corner',
      side,
      fit: 'contain',
      clip: true,
      size: 'medium',
      height: 420,
      bury: 0.12,
      x: side === 'left' ? 0.24 : 0.78,
      supportingOnly: true,
      reason: 'Тео вне обложки уменьшен до поддерживающего акцента; основную массу несут продукт, люди или данные',
    };
  }

  if (mode === 'card' && cards.length) {
    const cardIndex = explicitCard >= 1 && explicitCard <= cards.length
      ? explicitCard
      : ((best ? best.index : 0) + 1);
    // Карточные сетки Tumodo имеют общий левый текстовый якорь. По умолчанию
    // объект всегда занимает правую часть карточки; левая сторона допустима
    // только как осознанное явное переопределение.
    const side = requestedSide === 'left' || requestedSide === 'right'
      ? requestedSide
      : 'right';
    return {
      mode: 'card',
      ownership: 'card',
      cardIndex,
      side,
      fit: 'contain',
      clip: true,
      size: 'large',
      height: 0.9,
      bury: 0.12,
      textShare: 0.58,
      reason: 'объект относится к одной карточке: крупно, в её нижнем углу, с обрезкой карточкой',
    };
  }

  if (analysis.renderLayout === 'process-steps' || analysis.renderLayout === 'process-journey') {
    const side = requestedSide === 'left' || requestedSide === 'right' ? requestedSide : 'right';
    return {
      mode: 'slide',
      ownership: 'slide',
      zone: 'side-visual',
      side,
      fit: 'contain',
      clip: true,
      size: 'hero',
      height: 700,
      bury: 0.16,
      x: side === 'left' ? 0.27 : 0.76,
      reason: 'процесс получает отдельную боковую визуальную зону: 3D крупный, асимметричный и не пересекает шаги',
    };
  }

  // Центр намеренно не используется: глобальный 3D должен создавать диагональ и
  // визуальный ритм, а не выглядеть как симметричная иконка под сеткой.
  const side = requestedSide === 'left' || requestedSide === 'right'
    ? requestedSide
    : (index % 2 === 0 ? 'right' : 'left');
  return {
    mode: 'slide',
    ownership: 'slide',
    side,
    fit: 'contain',
    clip: true,
    size: analysis.spaceStrategy === 'media-led' ? 'hero' : 'large',
    height: analysis.spaceStrategy === 'media-led' ? 780 : 700,
    bury: 0.2,
    x: side === 'left' ? 0.37 : 0.67,
    reason: 'объект относится ко всему слайду: крупный нижний акцент, смещённый от центра',
  };
}

function chooseRenderableLayout(analysis) {
  if (['comparison-flow', 'process-steps', 'process-journey', 'kpi-metrics'].includes(analysis.explicit)) return analysis.explicit;
  // Семантические safety-overrides исправляют неподходящий макет даже тогда,
  // когда его ранее явно записал агент. Это защищает первую сборку от шаблонного
  // мышления: сравнение, процесс и KPI имеют собственные силуэты.
  if (analysis.role === 'comparison' && analysis.itemCount >= 2) return 'comparison-flow';
  if (analysis.role === 'process' && analysis.itemCount >= 4 && analysis.itemCount <= 6) return 'process-steps';
  if (analysis.role === 'metrics' && analysis.itemCount >= 2 && analysis.itemCount <= 5) return 'kpi-metrics';
  if (analysis.explicit && SUPPORTED_RENDER_LAYOUTS.has(analysis.explicit)) return analysis.explicit;
  if (analysis.role === 'process' && analysis.sections !== 3) return 'process-steps';
  if (analysis.role === 'benefits' && analysis.itemCount < 4) return 'title-bullets';
  if (analysis.role === 'metrics' && analysis.itemCount < 2) return 'statement';
  if (analysis.role === 'people' && analysis.itemCount < 4) return 'intro';
  return RENDER_LAYOUT_BY_ROLE[analysis.role] || 'title-bullets';
}

function compatibleRoleScore(target, candidate) {
  if (target === candidate) return 100;
  const compatible = {
    statement: ['principle', 'section'],
    principle: ['statement', 'introduction'],
    introduction: ['product', 'list', 'principle'],
    benefits: ['list', 'evidence', 'product'],
    list: ['benefits', 'introduction', 'process'],
    product: ['introduction', 'benefits'],
    evidence: ['benefits', 'metrics'],
    metrics: ['evidence', 'comparison'],
    process: ['list', 'comparison'],
    comparison: ['problem-solution', 'metrics'],
    'problem-solution': ['comparison', 'benefits'],
    people: ['introduction'],
    geography: ['metrics', 'introduction'],
  };
  return (compatible[target] || []).includes(candidate) ? 22 : 0;
}

function candidateSide(candidate, slide, index) {
  const requested = String(explicitMeta(slide, 'media-side') || explicitMeta(slide, '3d-pos') || '').toLowerCase();
  if (['left', 'right'].includes(requested) && !['none', 'center', 'both'].includes(candidate.side)) return requested;
  if (candidate.side === 'left' || candidate.side === 'right') return index % 2 === 0 ? candidate.side : (candidate.side === 'left' ? 'right' : 'left');
  return candidate.side;
}

function contentFitScore(analysis, candidate) {
  const [min, max] = candidate.fill;
  if (analysis.contentFill >= min && analysis.contentFill <= max) return 24;
  const distance = analysis.contentFill < min ? min - analysis.contentFill : analysis.contentFill - max;
  return Math.max(-56, 8 - Math.round(distance * 120));
}

function structureFitScore(analysis, candidate, slide) {
  const count = analysis.itemCount;
  const text = slideText(slide);
  const sections = Array.isArray(slide.sections) ? slide.sections.length : 0;
  const bullets = Array.isArray(slide.bullets) ? slide.bullets.length : 0;
  const hasImage = Boolean(slide.image || explicitMeta(slide, 'image'));
  if (candidate.layout === 'comparison-flow') return analysis.role === 'comparison' && count >= 2 ? 40 : (count >= 2 ? 4 : -70);
  if (candidate.layout === 'kpi-metrics') {
    const numericEvidence = (text.match(/(?:^|\s)[+-]?\d[\d\s.,]*(?:%|₽|€|\$|млн|тыс|x|×)?/g) || []).length;
    return ['metrics', 'evidence'].includes(analysis.role) && numericEvidence >= 2 && count >= 2 && count <= 5 ? 34 : -56;
  }
  if (candidate.layout === 'process-steps') {
    const sequential = analysis.role === 'process' || /сначала|затем|после|шаг|этап|→|->/.test(text);
    return sequential && count >= 4 && count <= 6 ? 34 : (sequential && count >= 2 && count <= 7 ? 4 : -42);
  }
  if (candidate.layout === 'numbered-cards-3') return sections === 3 ? 32 : -72;
  if (candidate.layout === 'benefits-grid') return count >= 4 && count <= 12 ? 26 : (count === 3 ? 4 : -38);
  if (candidate.layout === 'photo-list') return hasImage && count >= 3 && count <= 6 ? 38 : -64;
  if (candidate.layout === 'pain-solution') return sections >= 2 && (analysis.role === 'problem-solution' || analysis.role === 'comparison') ? 24 : -72;
  if (candidate.layout === 'intro') {
    if (sections >= 1 && sections <= 2) return 22;
    if (!bullets && count === 0 && (slide.lead || (Array.isArray(slide.paragraphs) && slide.paragraphs.length))) return 8;
    return -80;
  }
  if (candidate.layout === 'statement') {
    if (analysis.role === 'metrics' && count >= 2) return -44;
    return analysis.contentFill <= 0.52 ? 24 : -48;
  }
  if (candidate.layout === 'cover' || candidate.layout === 'final' || candidate.layout === 'section-divider') {
    return candidate.roles.includes(analysis.role) ? 50 : -100;
  }
  return 10;
}

function compositionReason(analysis, candidate, breakdown) {
  const reasons = [];
  if (breakdown.semantic >= 60) reasons.push('прямое соответствие смысловой роли');
  else if (breakdown.semantic > 0) reasons.push('допустимая соседняя смысловая модель');
  if (breakdown.content >= 20) reasons.push('контент соответствует ёмкости композиции');
  if (breakdown.structure >= 24) reasons.push('структура данных поддерживает формат');
  if (breakdown.rhythm < 0) reasons.push('есть штраф за повтор ритма');
  if (breakdown.creative > 0) reasons.push('поддерживает выбранное креативное направление');
  if (breakdown.risk < 0) reasons.push('есть риск геометрии или визуала');
  if (breakdown.measurement > 0) reasons.push('подтверждено браузерным измерением');
  if (breakdown.measurement < 0) reasons.push('текущий рендер геометрически отклонён');
  return reasons.join(' · ') || 'резервная композиция внутри системных ограничений';
}

function measurementFitScore(candidate, measurement) {
  if (!measurement || measurement.status === 'healthy' || !measurement.recommendation) return 0;
  const recommendation = measurement.recommendation;
  const alternatives = Array.isArray(recommendation.tryLayouts) ? recommendation.tryLayouts : [];
  if (measurement.layout === candidate.layout) return -140;
  if (alternatives.includes(candidate.layout)) return 120;
  if (recommendation.action === 'media-led-composition' && ['split-media', 'product-showcase', 'editorial', 'manifesto'].includes(candidate.id)) return 42;
  if (recommendation.action === 'rebalance-media-and-content' && ['split-media', 'product-showcase', 'editorial'].includes(candidate.id)) return 36;
  if (recommendation.action === 'higher-capacity-layout-or-split-content' && ['data-table', 'card-grid', 'columns', 'process-flow'].includes(candidate.id)) return 30;
  return 0;
}

/**
 * Креативное направление влияет только на допустимые композиции и никогда не
 * перекрывает смысловой/геометрический запрет. Максимальный бонус намеренно ниже
 * штрафов за неверную роль, неподдерживаемую структуру и коллизии.
 */
function creativeDirectionFitScore(candidate, index, direction) {
  if (!direction) return 0;
  const preferred = Array.isArray(direction.preferredFamilies) ? direction.preferredFamilies : [];
  const rank = preferred.indexOf(candidate.id);
  let score = rank >= 0 ? Math.max(8, 34 - rank * 6) : 0;
  const beat = Array.isArray(direction.beats)
    ? direction.beats.find((item) => Number(item.slide) === index + 1)
    : null;
  if (!beat) return score;
  if (beat.energy === 'hero' && ['hero', 'product-showcase', 'split-media', 'metric-focus'].includes(candidate.id)) score += 14;
  if (beat.energy === 'quiet' && ['manifesto', 'sparse-divider', 'editorial'].includes(candidate.id)) score += 12;
  if (beat.energy === 'dense' && ['data-table', 'metric-focus', 'process-flow', 'card-grid'].includes(candidate.id)) score += 12;
  if (beat.energy === 'editorial' && ['editorial', 'split-media', 'columns', 'two-panel'].includes(candidate.id)) score += 8;
  return Math.min(48, score);
}

/**
 * Создаёт несколько независимых композиционных гипотез. В отличие от
 * analyzeSlide, функция не сводит роль сразу к одному layout и явно показывает,
 * почему одна интерпретация победила другую.
 */
function recommendCompositionCandidates(slide, index = 0, total = 0, options = {}) {
  const analysis = options.analysis || analyzeSlide(slide, index, total);
  const library = options.library || [];
  const recentFamilies = options.recentFamilies || options.recentCompositions || [];
  const recentLayouts = options.recentLayouts || [];
  const recentMasses = options.recentMasses || [];
  const recentSides = options.recentSides || [];
  const explicit = String(slide.layout || '').toLowerCase();
  const candidates = COMPOSITION_CANDIDATES.map((candidate) => {
    const side = candidateSide(candidate, slide, index);
    const rawSemantic = candidate.roles.includes(analysis.role)
      ? 80
      : Math.max(...candidate.roles.map((role) => compatibleRoleScore(analysis.role, role)));
    // Разнообразие не может оправдать неверный формат. Нерелевантная композиция
    // остаётся в shortlist как диагностическая альтернатива, но получает жёсткий
    // смысловой штраф и не побеждает только за счёт нового силуэта.
    const semantic = rawSemantic > 0 ? rawSemantic : -42;
    const content = contentFitScore(analysis, candidate);
    const structure = structureFitScore(analysis, candidate, slide);
    let rhythm = 18;
    if (recentFamilies[0] === candidate.id) rhythm -= 82;
    else if (recentFamilies.slice(0, 3).includes(candidate.id)) rhythm -= 28;
    if (recentLayouts[0] === candidate.layout) rhythm -= 48;
    else if (recentLayouts.slice(0, 3).includes(candidate.layout)) rhythm -= 16;
    if (recentMasses[0] === candidate.mass) rhythm -= 24;
    if (side !== 'none' && side !== 'center' && recentSides[0] === side) rhythm -= 14;

    let visual = 0;
    if (analysis.requiresVisual && ['split-media', 'product-showcase', 'profile-grid', 'map-layout'].includes(candidate.id)) visual += 18;
    if (analysis.spaceStrategy === 'media-led' && ['split-media', 'product-showcase', 'hero', 'manifesto'].includes(candidate.id)) visual += 14;
    if (analysis.spaceStrategy === 'content-led' && ['data-table', 'card-grid', 'columns', 'process-flow'].includes(candidate.id)) visual += 12;

    let risk = 0;
    const hasVisualImage = Boolean(slide.image || explicitMeta(slide, 'image'));
    const renderable = structure > -70 && (candidate.layout !== 'photo-list' || hasVisualImage);
    if (!renderable) risk -= 260;
    if (rawSemantic <= 0) risk -= 160;
    if (analysis.contentFill < 0.55 && ['card-grid', 'columns', 'two-panel'].includes(candidate.id)) risk -= 26;
    if (analysis.contentFill > 0.82 && ['manifesto', 'editorial', 'split-media'].includes(candidate.id)) risk -= 32;
    if (candidate.layout === 'photo-list' && !Boolean(slide.image || explicitMeta(slide, 'image'))) risk -= 50;
    const explicitFit = explicit && candidate.layout === explicit ? 72 : 0;
    const referenceCount = library.filter((ref) => ref.composition === candidate.id || ref.renderLayout === candidate.layout).length;
    const referenceSupport = Math.min(12, referenceCount * 2);
    const measurement = measurementFitScore(candidate, options.measurement);
    const creative = creativeDirectionFitScore(candidate, index, options.creativeDirection);
    const breakdown = { semantic, content, structure, visual, rhythm, creative, explicit: explicitFit, referenceSupport, measurement, risk };
    const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    return {
      id: candidate.id,
      label: COMPOSITION_LABELS[candidate.id] || candidate.id,
      renderLayout: candidate.layout,
      massDistribution: candidate.mass,
      visualSide: side,
      readingPath: candidate.path,
      silhouetteId: [candidate.layout, candidate.mass, side, candidate.path.join('-')].join(':'),
      score,
      renderable,
      scoreBreakdown: breakdown,
      referenceCount,
      reason: compositionReason(analysis, candidate, breakdown),
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const limit = Math.max(2, Number(options.limit || 5));
  return { analysis, selected: candidates[0] || null, candidates: candidates.slice(0, limit) };
}

function recommendationReason(analysis, ref) {
  const parts = [analysis.role === ref.role ? 'совпадает смысловая роль' : 'подходит соседняя смысловая модель'];
  if (analysis.density === ref.density) parts.push('совпадает плотность');
  if (analysis.media !== 'none' && analysis.media === ref.media) parts.push('нужный тип визуала');
  parts.push(ref.compositionLabel.toLowerCase());
  return parts.join(' · ');
}

function recommendReferences(slide, index = 0, total = 0, options = {}) {
  const library = options.library || parseLibraryCatalog();
  const baseAnalysis = analyzeSlide(slide, index, total);
  const recentCompositions = options.recentCompositions || (options.previousComposition ? [options.previousComposition] : []);
  const recentLayouts = options.recentLayouts || [];
  const recentReferences = options.recentReferences || [];
  const compositionPlan = recommendCompositionCandidates(slide, index, total, {
    ...options,
    analysis: baseAnalysis,
    library,
    recentFamilies: recentCompositions,
    limit: options.candidateLimit || 5,
  });
  const selectedCandidate = compositionPlan.selected;
  const analysis = selectedCandidate
    ? { ...baseAnalysis, renderLayout: selectedCandidate.renderLayout, compositionFamily: selectedCandidate.id, silhouetteId: selectedCandidate.silhouetteId }
    : baseAnalysis;
  const limit = Number(options.limit || 12);
  const ranked = library.map((ref) => {
    let score = compatibleRoleScore(analysis.role, ref.role);
    if (analysis.density === ref.density) score += 12;
    else if (analysis.density === 'high' && ref.density === 'low') score -= 12;
    if (analysis.media !== 'none' && analysis.media === ref.media) score += 16;
    if (analysis.media === 'none' && ref.media === 'none') score += 5;
    if (recentCompositions[0] === ref.composition) score -= 90;
    else if (recentCompositions.slice(0, 3).includes(ref.composition)) score -= 34;
    if (recentLayouts[0] === ref.renderLayout) score -= 64;
    else if (recentLayouts.slice(0, 3).includes(ref.renderLayout)) score -= 20;
    if (recentReferences.slice(0, 6).includes(ref.source)) score -= 140;
    if (ref.quality === 'clean') score += 2;
    if (analysis.renderLayout === ref.renderLayout) score += 6;
    if (selectedCandidate && selectedCandidate.id === ref.composition) score += 34;
    if (selectedCandidate && selectedCandidate.renderLayout === ref.renderLayout) score += 22;
    return {
      ...ref,
      score,
      reason: recommendationReason(analysis, ref),
    };
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file, 'ru'));

  return {
    analysis,
    selectedCandidate,
    candidates: compositionPlan.candidates,
    references: dedupeReferenceVariants(ranked).slice(0, limit),
  };
}

module.exports = {
  CATALOG_FILE,
  CHARACTER_POLICY_FILE,
  ROLE_LABELS,
  COMPOSITION_LABELS,
  RENDER_LAYOUT_BY_ROLE,
  parseLibraryCatalog,
  referenceStyleSignature,
  dedupeReferenceVariants,
  parseVisualAssets,
  parseCharacterPolicies,
  analyzeSlide,
  recommendCompositionCandidates,
  recommendReferences,
  recommendVisualAssets,
  recommendVisualPlacement,
  characterPolicyScore,
};
