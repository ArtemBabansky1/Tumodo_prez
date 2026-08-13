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

const RENDER_LAYOUT_BY_ROLE = {
  cover: 'cover',
  closing: 'final',
  section: 'section-divider',
  statement: 'statement',
  'problem-solution': 'pain-solution',
  process: 'numbered-cards-3',
  benefits: 'benefits-grid',
  principle: 'principle-detail',
  introduction: 'intro',
  metrics: 'benefits-grid',
  comparison: 'title-bullets',
  product: 'intro',
  people: 'benefits-grid',
  geography: 'intro',
  evidence: 'benefits-grid',
  list: 'title-bullets',
};

function referenceRole(layout, comment) {
  const text = String(comment || '').toLowerCase();
  if (layout === 'cover') return 'cover';
  if (layout === 'final') return 'closing';
  if (layout === 'section-divider') return 'section';
  if (layout === 'statement') return 'statement';
  if (layout === 'pain-solution') return 'problem-solution';
  if (layout === 'chart' || /график|диаграм|метрик|процент|цифр|roi|kpi/.test(text)) return 'metrics';
  if (layout === 'table' || /таблиц|сравнен| versus | vs\b/.test(' ' + text)) return 'comparison';
  if (/спикер|команд|персон|портрет|рол[ьи]|сотрудник/.test(text)) return 'people';
  if (/карт[аы]|географ|стран|регион|мир/.test(text)) return 'geography';
  if (/логотип|клиент|партн|медиа|доказ|валидац/.test(text)) return 'evidence';
  if (/мокап|ноутбук|телефон|интерфейс|скриншот|продукт|дашборд/.test(text)) return 'product';
  if (/таймлайн|схем|этап|процесс|воронк|шаг|маршрут|дорожн/.test(text) || layout === 'numbered-cards-3') return 'process';
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
  const explicit = String(slide.layout || '').toLowerCase();
  const sections = Array.isArray(slide.sections) ? slide.sections.length : Number(slide.sections || 0);
  const bullets = Array.isArray(slide.bullets) ? slide.bullets.length : Number(slide.bullets || 0);
  const itemCount = bullets + sections;
  let role = 'list';

  if (index === 0 || explicit === 'cover') role = 'cover';
  else if (explicit === 'final' || /(?:^|\s)(спасибо|контакты|thank you|questions|вопросы)(?:\s|$)/.test(text)) role = 'closing';
  else if (explicit === 'section-divider' || /^(?:раздел|глава|часть)\b/.test(text)) role = 'section';
  else if (explicit === 'pain-solution' || /проблем|боль|вызов|challenge|pain/.test(text) || /как.{0,80}(?:решает|solves?\b)/.test(text)) role = 'problem-solution';
  else if (explicit === 'statement') role = 'statement';
  else if (/о ч[её]м (?:расскажем|поговорим)|содержание|agenda|в этой презентации/.test(text)) role = 'list';
  else if (/\b(?:kpi|roi|revenue|growth|metric|forecast)\b|метрик|динамик|выручк|рост|прогноз|\d+[,.]?\d*\s?%/.test(text)) role = 'metrics';
  else if (/сравнен|таблиц|\bvs\b|до и после|альтернатив/.test(text)) role = 'comparison';
  else if (/процесс|этап|шаг|таймлайн|roadmap|workflow|как (?:это )?работает|сценари|алгоритм/.test(text) || sections === 3) role = 'process';
  else if (/команд|спикер|персон|сотрудник|рол[ьи]|аудитор|traveller|manager|accountant/.test(text)) role = 'people';
  else if (/географ|стран|регион|направлен|рынк|карта|global|worldwide/.test(text)) role = 'geography';
  else if (/продукт|платформ|интерфейс|дашборд|приложен|демо|product|platform/.test(text)) role = 'product';
  else if (/клиент|партн|доказ|результат|кейс|отзыв|trusted|logo/.test(text)) role = 'evidence';
  else if (/выгод|преимуществ|возможност|функц|ценност|benefit|feature|services?\b/.test(text) || itemCount >= 4) role = 'benefits';
  else if (/мисси|видени|vision|mission|принцип|позиционир|обещани/.test(text)) role = 'principle';
  else if (index === 1 || explicit === 'intro') role = 'introduction';
  else if (itemCount === 0 && text.length <= 220) role = 'statement';

  const hasMedia = Boolean(slide.image || slide.threeD || /фото|мокап|скриншот|изображен/.test(text));
  const media = role === 'product' ? 'product-mockup'
    : role === 'people' ? 'portrait'
      : role === 'geography' ? 'map'
        : role === 'metrics' ? 'chart'
          : role === 'evidence' ? 'logos'
            : hasMedia ? 'photo' : 'none';
  const density = text.length > 700 || itemCount >= 7 ? 'high' : (text.length < 240 && itemCount <= 2 ? 'low' : 'medium');
  const renderLayout = chooseRenderableLayout({ role, itemCount, sections, text, explicit });
  const denseTextException = itemCount >= 6 && ['benefits-grid', 'title-bullets'].includes(renderLayout);
  const requiresVisual = role !== 'section' && !denseTextException;
  const preferredVisualKinds = role === 'people' ? ['photo']
    : role === 'product' ? ['mockup', '3d']
      : role === 'geography' ? ['mockup', '3d']
        : role === 'metrics' ? ['3d', 'mockup']
          : ['3d', 'photo'];

  return {
    role,
    roleLabel: ROLE_LABELS[role] || role,
    itemCount,
    density,
    media,
    renderLayout,
    requiresVisual,
    preferredVisualKinds,
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
  if (/тео|theo|ai|ии|аналит/.test(text) && /theo|тео|аналит|маскот/.test(asset.searchText)) score += 55;
  const words = [...new Set(text.match(/[а-яёa-z]{5,}/gi) || [])].slice(0, 40);
  score += Math.min(24, words.filter((word) => asset.searchText.includes(word)).length * 4);
  return score;
}

function recommendVisualAssets(slide, index = 0, total = 0, options = {}) {
  const analysis = options.analysis || analyzeSlide(slide, index, total);
  const assets = options.assets || parseVisualAssets();
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
    suggestions,
  };
}

function chooseRenderableLayout(analysis) {
  if (analysis.explicit && Object.values(RENDER_LAYOUT_BY_ROLE).includes(analysis.explicit)) return analysis.explicit;
  if (analysis.role === 'process' && analysis.sections !== 3) return 'title-bullets';
  if (analysis.role === 'benefits' && analysis.itemCount < 4) return 'title-bullets';
  if (analysis.role === 'metrics' && analysis.itemCount < 4) return 'statement';
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
  const previousComposition = options.previousComposition || '';
  const limit = Number(options.limit || 12);
  const ranked = library.map((ref) => {
    let score = compatibleRoleScore(analysis.role, ref.role);
    if (analysis.density === ref.density) score += 12;
    else if (analysis.density === 'high' && ref.density === 'low') score -= 12;
    if (analysis.media !== 'none' && analysis.media === ref.media) score += 16;
    if (analysis.media === 'none' && ref.media === 'none') score += 5;
    if (previousComposition && previousComposition === ref.composition) score -= 10;
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
};
