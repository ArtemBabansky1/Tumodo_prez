const fs = require('fs');
const path = require('path');
const {
  analyzeSlide,
  parseLibraryCatalog,
  parseVisualAssets,
  recommendReferences,
  recommendVisualAssets,
} = require('./design-intelligence');

const ROOT = path.resolve(__dirname, '..', '..');
const CREATIVE_SYSTEM_FILE = path.join(ROOT, 'design-system', 'creative-system.json');

const DIRECTION_PROTOTYPES = [
  {
    id: 'product-as-proof',
    title: 'Продукт как доказательство',
    idea: 'Крупные фрагменты интерфейса становятся главным аргументом, а текст объясняет увиденное.',
    tension: 'Точный продуктовый кадр против большого спокойного поля.',
    roles: ['product', 'introduction', 'process', 'metrics'],
    preferredFamilies: ['product-showcase', 'split-media', 'data-table', 'metric-focus', 'hero'],
    visualPriority: ['mockup', 'photo', '3d'],
    techniques: ['detail-crop', 'asymmetric-balance', 'directed-empty-space', 'rhythm-contrast'],
  },
  {
    id: 'human-momentum',
    title: 'Люди в движении',
    idea: 'Историю ведут реальные рабочие ситуации и эмоции, а продукт появляется как естественный инструмент.',
    tension: 'Живой человеческий момент против строгой продуктовой структуры.',
    roles: ['people', 'evidence', 'benefits', 'problem-solution'],
    preferredFamilies: ['split-media', 'editorial', 'two-panel', 'card-grid', 'hero'],
    visualPriority: ['photo', 'mockup', '3d'],
    techniques: ['detail-crop', 'layered-depth', 'asymmetric-balance', 'rhythm-contrast'],
  },
  {
    id: 'data-with-drama',
    title: 'Данные с драматургией',
    idea: 'Цифры, сравнения и процессы получают выразительный масштаб, но сохраняют общие оси и читаемость.',
    tension: 'Одна крупная истина против плотной системы подтверждений.',
    roles: ['metrics', 'comparison', 'process', 'evidence'],
    preferredFamilies: ['metric-focus', 'data-table', 'process-flow', 'manifesto', 'product-showcase'],
    visualPriority: ['mockup', 'photo', '3d'],
    techniques: ['scale-shift', 'directed-empty-space', 'serial-repetition', 'rhythm-contrast'],
  },
];

function loadCreativeSystem(file = CREATIVE_SYSTEM_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeSlide(slide) {
  return {
    ...slide,
    bullets: slide.bullets || slide.bulletItems || [],
    sections: slide.sections || slide.sectionItems || [],
    paragraphs: slide.paragraphs || [],
    meta: slide.meta || {},
  };
}

function directionBeat(role, direction) {
  if (role === 'cover') return 'hero';
  if (role === 'closing' || role === 'section' || role === 'statement') return 'quiet';
  if (direction.roles.includes(role)) return role === 'metrics' || role === 'comparison' ? 'dense' : 'hero';
  if (role === 'metrics' || role === 'comparison' || role === 'process') return 'dense';
  return 'editorial';
}

function prototypeScore(prototype, analyses, assets) {
  const roleScore = analyses.reduce((sum, analysis) => sum + (prototype.roles.includes(analysis.role) ? 18 : 0), 0);
  const availableKinds = new Set(assets.map((asset) => asset.kind));
  const assetScore = prototype.visualPriority.reduce((sum, kind, index) => sum + (availableKinds.has(kind) ? 8 - index * 2 : -10), 0);
  return roleScore + assetScore;
}

function keySlideIndices(analyses, direction) {
  const selected = new Set();
  if (analyses.length) selected.add(0);
  for (const role of direction.roles) {
    const index = analyses.findIndex((analysis, slideIndex) => slideIndex > 0 && analysis.role === role);
    if (index >= 0) selected.add(index);
    if (selected.size >= 4) break;
  }
  if (selected.size < 3) {
    analyses.forEach((analysis, index) => {
      if (selected.size < 3 && !['closing', 'section'].includes(analysis.role)) selected.add(index);
    });
  }
  return [...selected].slice(0, 4);
}

function styleframeForSlide(slide, analysis, index, total, direction, library, assets) {
  const references = recommendReferences(slide, index, total, {
    library,
    creativeDirection: direction,
    limit: 3,
  }).references;
  const visualAssets = recommendVisualAssets(slide, index, total, {
    analysis,
    assets,
    creativeDirection: direction,
    limit: 3,
  }).suggestions;
  return {
    slide: index + 1,
    title: slide.title || `Слайд ${index + 1}`,
    purpose: analysis.roleLabel,
    beat: directionBeat(analysis.role, direction),
    referenceSources: references.map((item) => item.source),
    assetSources: visualAssets.map((item) => item.source),
    prompt: [
      `Создай черновой styleframe слайда ${index + 1} в направлении «${direction.title}».`,
      `Идея: ${direction.idea}`,
      `Роль: ${analysis.roleLabel}. Ритмический акцент: ${directionBeat(analysis.role, direction)}.`,
      'Используй только приложенные каноны Tumodo и ассеты платформы.',
      'Не придумывай цвета, шрифты, логотипы, паттерны или новые изображения.',
      'Текст показывай только как условную иерархию: финальная типографика и данные собираются движком.',
    ].join(' '),
  };
}

function createCreativeDirections({ deckName, slides, selected = '', library, assets } = {}) {
  const system = loadCreativeSystem();
  const normalizedSlides = (slides || []).map(normalizeSlide);
  const referenceLibrary = library || parseLibraryCatalog();
  const visualAssets = assets || parseVisualAssets();
  const analyses = normalizedSlides.map((slide, index) => analyzeSlide(slide, index, normalizedSlides.length));
  const directions = DIRECTION_PROTOTYPES.map((prototype) => {
    const beats = analyses.map((analysis, index) => ({
      slide: index + 1,
      role: analysis.role,
      energy: directionBeat(analysis.role, prototype),
    }));
    const styleframes = keySlideIndices(analyses, prototype).map((index) => styleframeForSlide(
      normalizedSlides[index], analyses[index], index, normalizedSlides.length,
      prototype, referenceLibrary, visualAssets
    ));
    return {
      ...prototype,
      score: prototypeScore(prototype, analyses, visualAssets),
      beats,
      styleframes,
      assetPolicy: system.assetPolicy,
      systemVersion: system.version,
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selectedId = directions.some((item) => item.id === selected) ? selected : (directions[0] && directions[0].id) || '';
  const document = {
    version: 1,
    deck: deckName || '',
    mode: system.mode,
    selected: selectedId,
    selectionSource: selected ? 'user' : 'recommended',
    systemContract: {
      file: 'design-system/creative-system.json',
      version: system.version,
      assetPolicy: system.assetPolicy,
      styleframePolicy: system.styleframePolicy,
    },
    directions,
  };
  document.validation = validateCreativeDirections(document, { system, library: referenceLibrary, assets: visualAssets });
  return document;
}

function validateCreativeDirections(document, options = {}) {
  const system = options.system || loadCreativeSystem();
  const library = options.library || parseLibraryCatalog();
  const assets = options.assets || parseVisualAssets();
  const allowedFamilies = new Set(system.allowedCompositionFamilies || []);
  const allowedTechniques = new Set(Object.keys(system.allowedTechniques || {}));
  const allowedKinds = new Set(system.allowedVisualKinds || []);
  const referenceSources = new Set(library.map((item) => item.source));
  const assetSources = new Set(assets.map((item) => item.source));
  const errors = [];
  const directions = Array.isArray(document && document.directions) ? document.directions : [];
  if (document && document.mode !== 'brand-bounded') errors.push('Креативный режим должен быть brand-bounded');
  if (document && document.systemContract && document.systemContract.assetPolicy !== 'platform-only') errors.push('Разрешены только ассеты платформы');
  if (directions.length !== 3) errors.push('Нужно ровно три креативных направления');
  if (!directions.some((item) => item.id === document.selected)) errors.push('Выбранное направление отсутствует');
  if (new Set(directions.map((item) => item.id)).size !== directions.length) errors.push('ID направлений должны быть уникальны');
  for (const direction of directions) {
    for (const family of direction.preferredFamilies || []) {
      if (!allowedFamilies.has(family)) errors.push(`${direction.id}: неизвестная композиционная семья ${family}`);
    }
    for (const technique of direction.techniques || []) {
      if (!allowedTechniques.has(technique)) errors.push(`${direction.id}: приём ${technique} отсутствует в дизайн-системе`);
    }
    for (const kind of direction.visualPriority || []) {
      if (!allowedKinds.has(kind)) errors.push(`${direction.id}: тип визуала ${kind} не разрешён`);
    }
    if (direction.assetPolicy !== 'platform-only') errors.push(`${direction.id}: разрешены только ассеты платформы`);
    for (const styleframe of direction.styleframes || []) {
      for (const source of styleframe.referenceSources || []) {
        if (!referenceSources.has(source)) errors.push(`${direction.id}: канон не найден ${source}`);
      }
      for (const source of styleframe.assetSources || []) {
        if (!assetSources.has(source)) errors.push(`${direction.id}: ассет отсутствует на платформе ${source}`);
      }
    }
  }
  return { passed: errors.length === 0, errors };
}

function selectedCreativeDirection(document) {
  return document && Array.isArray(document.directions)
    ? document.directions.find((item) => item.id === document.selected) || null
    : null;
}

module.exports = {
  CREATIVE_SYSTEM_FILE,
  DIRECTION_PROTOTYPES,
  loadCreativeSystem,
  createCreativeDirections,
  validateCreativeDirections,
  selectedCreativeDirection,
};
