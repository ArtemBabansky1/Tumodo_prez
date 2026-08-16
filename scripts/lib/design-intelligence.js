const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIBRARY_DIR = path.join(ROOT, 'design-system', 'canon', 'decks', 'library');
const CATALOG_FILE = path.join(LIBRARY_DIR, 'catalog.tsv');
const PHOTO_CATALOG_FILE = path.join(ROOT, 'design-system', 'photos', 'catalog.json');
const MOCKUP_CATALOG_FILE = path.join(ROOT, 'design-system', 'mockups', 'catalog.json');

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
  let role = 'list';

  if (index === 0 || explicit === 'cover') role = 'cover';
  else if (explicit === 'final' || /(?:^|\s)(спасибо|контакты|thank you|questions|вопросы)(?:\s|$)/.test(text)) role = 'closing';
  else if (explicit === 'section-divider' || /^(?:раздел|глава|часть)\b/.test(text)) role = 'section';
  else if (explicit === 'pain-solution' || /проблем|боль|вызов|хаос|разрознен|потер|ошиб|challenge|pain/.test(titleText) || /как.{0,80}(?:решает|solves?\b)/.test(text)) role = 'problem-solution';
  else if (explicit === 'statement') role = 'statement';
  else if (/о ч[её]м (?:расскажем|поговорим)|содержание|agenda|в этой презентации/.test(text)) role = 'list';
  else if (explicit === 'comparison-flow' || explicit === 'table' || explicitMeta(slide, 'before-label') || explicitMeta(slide, 'after-label')) role = 'comparison';
  else if (/\b(?:kpi|roi|revenue|growth|metric|forecast)\b|метрик|динамик|выручк|прогноз|(?:^|\s)(?:цифра|цифры|цифрах|числах|статистика|статистике)(?:\s|$)|рост\s+(?:на\s+)?\d|\d+[,.]?\d*\s?%/.test(text)) role = 'metrics';
  else if (changePairs >= 2 || /сравнен|таблиц|\bvs\b|до и после|раньше.{0,80}(?:с tumodo|теперь)|было.{0,80}стало|альтернатив/.test(text)) role = 'comparison';
  else if (/процесс|этап|шаг|цикл|таймлайн|roadmap|workflow|как (?:это )?работает|сценари|алгоритм/.test(titleText) || (sections === 3 && ['numbered-cards-3', 'process-steps'].includes(explicit))) role = 'process';
  else if (/команд|спикер|персон|сотрудник|рол[ьи]|аудитор|traveller|manager|accountant/.test(text)) role = 'people';
  else if (/географ|стран|регион|направлен|рынк|карта|global|worldwide/.test(text)) role = 'geography';
  else if (/продукт|платформ|интерфейс|дашборд|приложен|демо|product|platform/.test(text)) role = 'product';
  else if (/клиент|партн|доказ|результат|кейс|отзыв|trusted|logo/.test(text)) role = 'evidence';
  else if (/выгод|преимуществ|возможност|функц|ценност|почему выбира|выбирают|benefit|feature|services?\b/.test(text) || itemCount >= 4) role = 'benefits';
  else if (/мисси|видени|vision|mission|принцип|позиционир|обещани/.test(text)) role = 'principle';
  else if (index === 1 || explicit === 'intro') role = 'introduction';
  else if (itemCount === 0 && text.length <= 220) role = 'statement';

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
  const normalize = (catalog, prefix) => Object.entries(catalog).map(([file, meta]) => ({
    source: prefix + '/' + file,
    kind: prefix === 'mockups' ? 'mockup' : (file.startsWith('3d/') ? '3d' : 'photo'),
    description: meta.description || '',
    usage: meta.usage || '',
    meta,
    searchText: [file, meta.description, meta.usage].filter(Boolean).join(' ').toLowerCase(),
  }));
  return [...normalize(photoCatalog, 'photos'), ...normalize(mockupCatalog, 'mockups')];
}

function visualConceptScore(analysis, slide, asset) {
  const text = slideText(slide);
  let score = analysis.preferredVisualKinds.includes(asset.kind) ? 28 : 0;
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
  return score;
}

function recommendVisualAssets(slide, index = 0, total = 0, options = {}) {
  const analysis = options.analysis || analyzeSlide(slide, index, total);
  const assets = options.assets || parseVisualAssets();
  const text = slideText(slide);
  const excluded = new Set(options.exclude || []);
  const limit = Number(options.limit || 6);
  const suggestions = assets
    .filter((asset) => !excluded.has(asset.source))
    .map((asset) => ({ ...asset, score: visualConceptScore(analysis, slide, asset) }))
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source, 'ru'))
    .slice(0, limit)
    .map((asset) => ({
      ...asset,
      reason: analysis.roleLabel + ' · ' + (asset.kind === '3d' ? '3D-акцент' : asset.kind === 'photo' ? 'смысловое фото' : 'продуктовый мокап'),
    }));
  return {
    required: analysis.requiresVisual,
    preferredKinds: analysis.preferredVisualKinds,
    relevantThreeDAvailable: assets.some((asset) => asset.kind === '3d' && conceptMatchScore(text, asset) > 0),
    assetGap: assets.some((asset) => asset.kind === '3d' && conceptMatchScore(text, asset) > 0)
      ? ''
      : 'В библиотеке нет 3D, который прямо соответствует смыслу; используйте фото/мокап или добавьте новый фирменный объект, но не случайный 3D.',
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

  if (mode === 'card' && cards.length) {
    const cardIndex = explicitCard >= 1 && explicitCard <= cards.length
      ? explicitCard
      : ((best ? best.index : 0) + 1);
    const side = requestedSide === 'left' || requestedSide === 'right'
      ? requestedSide
      : (cardIndex % 2 === 0 ? 'left' : 'right');
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
  if (target === candidate) return 60;
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

function recommendationReason(analysis, ref) {
  const parts = [analysis.role === ref.role ? 'совпадает смысловая роль' : 'подходит соседняя смысловая модель'];
  if (analysis.density === ref.density) parts.push('совпадает плотность');
  if (analysis.media !== 'none' && analysis.media === ref.media) parts.push('нужный тип визуала');
  parts.push(ref.compositionLabel.toLowerCase());
  return parts.join(' · ');
}

function recommendReferences(slide, index = 0, total = 0, options = {}) {
  const library = options.library || parseLibraryCatalog();
  const analysis = analyzeSlide(slide, index, total);
  const recentCompositions = options.recentCompositions || (options.previousComposition ? [options.previousComposition] : []);
  const recentLayouts = options.recentLayouts || [];
  const recentReferences = options.recentReferences || [];
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
    return {
      ...ref,
      score,
      reason: recommendationReason(analysis, ref),
    };
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file, 'ru'));

  return { analysis, references: ranked.slice(0, limit) };
}

module.exports = {
  CATALOG_FILE,
  ROLE_LABELS,
  COMPOSITION_LABELS,
  RENDER_LAYOUT_BY_ROLE,
  parseLibraryCatalog,
  parseVisualAssets,
  analyzeSlide,
  recommendReferences,
  recommendVisualAssets,
  recommendVisualPlacement,
};
