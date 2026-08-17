#!/usr/bin/env node
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  analyzeSlide,
  dedupeReferenceVariants,
  parseLibraryCatalog,
  parseCharacterPolicies,
  parseVisualAssets,
  recommendCompositionCandidates,
  recommendReferences,
  referenceStyleSignature,
  recommendVisualAssets,
  recommendVisualPlacement,
} = require('./lib/design-intelligence');

const library = parseLibraryCatalog();
const characterPolicies = parseCharacterPolicies();
assert.equal(characterPolicies.theo.minAppearances, 2);
assert.equal(characterPolicies.theo.maxAppearances, 3);
assert.equal(characterPolicies.theo.heroOnlyOnCover, true);
assert.equal(library.length, 126, 'Figma library must contain 126 full-size slide references');
assert.equal(new Set(library.map((item) => item.nodeId)).size, 126, 'Figma node ids must be unique');
for (const item of library) {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'design-system', 'canon', item.source)), `Missing ${item.source}`);
}

const distinctReferences = dedupeReferenceVariants(library);
assert.equal(
  distinctReferences.length,
  new Set(distinctReferences.map(referenceStyleSignature)).size,
  'Every selectable canon must have a distinct visual style signature'
);
assert.ok(distinctReferences.length < library.length, 'Repeated content variants must be collapsed');
assert.ok(!distinctReferences.some((item) => /дубл|duplicate|copy/i.test(item.comment)), 'Explicit duplicates must not be selectable');
assert.equal(
  distinctReferences.filter((item) => item.role === 'list' && /тумблер/i.test(item.comment)).length,
  1,
  'Three-column toggle slides with different copy must be one selectable canon'
);

const cases = [
  [{ title: 'Новая платформа для деловых поездок' }, 0, 'cover'],
  [{ title: 'Проблема ручного бронирования', bullets: ['Потеря времени', 'Ошибки'] }, 2, 'problem-solution'],
  [{ title: 'Рост выручки на 42%', bullets: ['2025', '2026'] }, 3, 'metrics'],
  [{ title: 'Как это работает', sections: [{ title: 'Шаг 1' }, { title: 'Шаг 2' }, { title: 'Шаг 3' }] }, 4, 'process'],
  [{ title: 'Команда проекта', bullets: ['CEO', 'Product', 'Design'] }, 5, 'people'],
  [{ title: 'Спасибо', lead: 'Вопросы?' }, 9, 'closing'],
];

for (const [slide, index, expected] of cases) {
  const analysis = analyzeSlide(slide, index, 10);
  assert.equal(analysis.role, expected, `Expected ${expected} for “${slide.title}”, got ${analysis.role}`);
  const recommendation = recommendReferences(slide, index, 10, { library, limit: 5 });
  assert.equal(recommendation.references[0].role, expected, `Top reference must match ${expected}`);
  assert.ok(recommendation.references[0].source.startsWith('decks/library/'));
}

const visualAssets = parseVisualAssets();
assert.ok(visualAssets.length > 0, 'The platform must expose at least one visual asset');
assert.equal(new Set(visualAssets.map((asset) => asset.source)).size, visualAssets.length, 'Platform asset paths must be unique');
for (const asset of visualAssets) {
  assert.ok(
    fs.existsSync(path.join(__dirname, '..', 'design-system', asset.source)),
    `Engine must not expose an asset missing from the platform: ${asset.source}`
  );
}
const reportsScreen = visualAssets.find((item) => /reports-travel-analytics/.test(item.source));
if (reportsScreen) {
  assert.equal(reportsScreen.meta.source.nodeId, '6982:1682');
  assert.match(reportsScreen.searchText, /командированные/);
  assert.match(reportsScreen.searchText, /metrics/);
}
const financeVisual = recommendVisualAssets({
  title: 'Продукт Tumodo: финансы, счета и закрывающие документы',
  bullets: ['Баланс компании', 'Счета и выгрузка PDF', 'Закрывающие документы'],
}, 2, 8, { assets: visualAssets, limit: 10 });
if (visualAssets.some((item) => /finance-invoices/.test(item.source))) {
  assert.ok(
    financeVisual.suggestions.some((item) => /finance-invoices/.test(item.source)),
    'Finance story must surface the matching real product screen'
  );
}
const careVisual = recommendVisualAssets({
  title: 'Забота и поддержка повышают удовлетворённость сотрудников',
  bullets: ['Живой сервис 24/7', 'Помощь в поездке'],
}, 3, 8, { assets: visualAssets, limit: 10 });
if (visualAssets.some((item) => /3d-heart-silver/.test(item.source))) {
  assert.ok(
    careVisual.suggestions.some((item) => /3d-heart-silver/.test(item.source)),
    'Care story must surface the semantic heart accent'
  );
}
const theoSlide = { title: 'С какими запросами работает Тео', bullets: ['Аналитика затрат', 'Маршруты'] };
const visual = recommendVisualAssets(theoSlide, 3, 7, { assets: visualAssets, limit: 5 });
assert.equal(visual.required, true);
assert.ok(visual.suggestions.some((item) => /theo-mascot/.test(item.source)), 'Theo slide must recommend the Theo 3D mascot');

const keys = visualAssets.find((item) => /3d-keys-blue/.test(item.source));
const cardPlacement = recommendVisualPlacement({
  title: 'Сервисы для поездки', layout: 'benefits-grid',
  sections: [
    { title: 'Авиабилеты', bullets: ['Выбор рейса'] },
    { title: 'Отели и проживание', bullets: ['Доступ и заселение'] },
    { title: 'Трансфер', bullets: ['Встреча в аэропорту'] },
    { title: 'Поддержка', bullets: ['Ответим в чате'] },
  ],
}, 2, 8, { asset: keys });
assert.equal(cardPlacement.mode, 'card');
assert.equal(cardPlacement.cardIndex, 2);
assert.equal(cardPlacement.clip, true);
assert.equal(cardPlacement.side, 'right', 'Карточный 3D не должен сдвигать общий левый текстовый якорь');

const globe = visualAssets.find((item) => /3d-globe-silver/.test(item.source));
const slidePlacement = recommendVisualPlacement({
  title: 'География поездок', layout: 'benefits-grid', meta: { '3d-pos': 'center' },
  sections: [
    { title: 'Европа', bullets: ['20 стран'] },
    { title: 'Азия', bullets: ['18 стран'] },
    { title: 'Ближний Восток', bullets: ['12 стран'] },
    { title: 'Америка', bullets: ['8 стран'] },
  ],
}, 3, 8, { asset: globe });
assert.equal(slidePlacement.mode, 'none');
assert.equal(slidePlacement.rejected, true);

const comparison = analyzeSlide({
  title: 'Онлайн-сервис меняет модель работы', layout: 'title-bullets',
  bullets: ['Каналы: почта → единая платформа', 'Бюджет: постфактум → данные в реальном времени'],
}, 2, 10);
assert.equal(comparison.role, 'comparison');
assert.equal(comparison.renderLayout, 'comparison-flow');
assert.equal(comparison.containerPolicy, 'table-fill');
assert.equal(comparison.alignmentContract, 'shared-table-columns/photo-table-edges');
assert.ok(comparison.penaltyRisks.includes('decorative-arrows'));

const labelledComparison = analyzeSlide({
  title: 'Раньше и с Tumodo', layout: 'title-bullets',
  meta: { 'before-label': 'Раньше', 'after-label': 'С Tumodo' },
  bullets: ['Каналы: почта → единая платформа', 'Бюджет: постфактум → данные в реальном времени'],
}, 2, 10);
assert.equal(labelledComparison.role, 'comparison');
assert.equal(labelledComparison.renderLayout, 'comparison-flow');

const sparseCopy = analyzeSlide({ title: 'Короткий список', bullets: ['Первый тезис', 'Второй тезис'] }, 2, 10);
assert.equal(sparseCopy.containerPolicy, 'alternate-layout-required');
assert.ok(sparseCopy.penaltyRisks.includes('empty-container'));

const sparsePhotoList = analyzeSlide({
  title: 'Короткий список с фото', layout: 'title-bullets', meta: { image: 'photos/people/example.webp' },
  bullets: ['Первый тезис', 'Второй тезис', 'Третий тезис', 'Четвёртый тезис'],
}, 2, 10);
assert.equal(sparsePhotoList.renderLayout, 'photo-list');
assert.equal(sparsePhotoList.containerPolicy, 'full-height-rows');
assert.ok(!sparsePhotoList.penaltyRisks.includes('empty-container'));

const process = analyzeSlide({
  title: 'Подключение занимает пять шагов', layout: 'title-bullets',
  bullets: ['Договор', 'Знакомство', 'Поддержка', 'Настройка', 'Контроль'],
}, 3, 10);
assert.equal(process.renderLayout, 'process-steps');

const metrics = analyzeSlide({
  title: 'Tumodo в цифрах', layout: 'numbered-cards-3',
  sections: [{ title: '1 день' }, { title: '1 000+' }, { title: '30+' }],
}, 4, 10);
assert.equal(metrics.role, 'metrics');
assert.equal(metrics.renderLayout, 'kpi-metrics');

const coins = visualAssets.find((item) => /3d-zero-commission-coins/.test(item.source));
const safeFinancePlacement = recommendVisualPlacement({
  title: 'Отчётность автоматически приходит в учётную систему', layout: 'numbered-cards-3',
  meta: { '3d-mode': 'slide' },
  sections: [
    { title: 'Онлайн-услуги', paragraphs: ['Готовый отчёт'] },
    { title: 'Дополнительные расходы', paragraphs: ['Затраты сотрудника'] },
    { title: 'Согласование', paragraphs: ['Отчёт бухгалтеру'] },
  ],
}, 5, 10, { asset: coins });
assert.equal(safeFinancePlacement.mode, 'card');
assert.equal(safeFinancePlacement.cardIndex, 2);
assert.equal(safeFinancePlacement.side, 'right');

const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'css', 'components.css'), 'utf8');
const tokensCss = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'css', 'tokens.css'), 'utf8');
const effectsTokens = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'design-system', 'tokens', 'effects.json'), 'utf8'));
assert.equal(effectsTokens.effects['corner-smoothing-ios'].$value, '60%');
assert.match(tokensCss, /--corner-smoothing:\s*0\.6\s*;/);
assert.match(tokensCss, /--corner-shape:\s*squircle\s*;/);
assert.match(componentsCss, /:where\([\s\S]*\.card[\s\S]*\.photo-card[\s\S]*\.change-table[\s\S]*\.process-step[\s\S]*\.metric-card[\s\S]*\)\s*\{[\s\S]*corner-shape:\s*var\(--corner-shape\)/);
assert.match(componentsCss, /object-position:\s*50%\s+0%/);
assert.match(componentsCss, /\.has-card-3d[\s\S]*overflow:\s*hidden/);
assert.match(componentsCss, /\.change-head\s*\{[\s\S]*background:\s*var\(--white\)/);
assert.match(componentsCss, /\.change-row::before[\s\S]*left:\s*30px[\s\S]*right:\s*30px[\s\S]*border-radius:\s*999px/);
assert.match(componentsCss, /\.change-table::before[\s\S]*top:\s*30px[\s\S]*bottom:\s*30px[\s\S]*border-radius:\s*999px/);
assert.doesNotMatch(componentsCss, /\.process-step::after/);
assert.match(componentsCss, /\.metric-card\.has-card-3d[\s\S]*justify-content:\s*space-between/);

const comparisonTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'layouts', 'comparison-flow.html'), 'utf8');
assert.doesNotMatch(comparisonTemplate, /change-arrow|>→</);
assert.match(comparisonTemplate, /categoryLabel[\s\S]*beforeLabel[\s\S]*afterLabel/);

const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'css', 'layout.css'), 'utf8');
assert.doesNotMatch(layoutCss, /media-copy-hug|\.card\.hug/);

const photoListTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'layouts', 'photo-list.html'), 'utf8');
assert.match(photoListTemplate, /photo-list-rows[\s\S]*photo-list-row/);
assert.match(photoListTemplate, /photo-list-icon[\s\S]*\{\{text\}\}/);

// Новые проверки композиционных гипотез: заголовок и отношения между данными
// важнее случайных слов внутри примеров, а разнообразие не может победить смысл.
const capabilities = {
  title: 'Что можно спросить у Тео',
  bullets: ['Сколько мы потратили?', 'Какие направления популярны?', 'Покажи расходы', 'Сравни авиа и железную дорогу'],
  paragraphs: [], sections: [], meta: {},
};
assert.equal(analyzeSlide(capabilities, 1, 8).role, 'benefits');

const people = {
  title: 'Кому помогает Тео',
  bullets: ['Тревел-менеджеры', 'Аналитики — сравнение периодов', 'Руководители', 'Сотрудники'],
  paragraphs: [], sections: [], meta: { image: 'photos/people/team.webp' },
};
assert.equal(analyzeSlide(people, 4, 8).role, 'people');
assert.equal(recommendCompositionCandidates(people, 4, 8, { library: [] }).selected.id, 'split-media');

const comparisonCandidates = recommendCompositionCandidates({
  title: 'Было и стало',
  bullets: ['Ручная сверка → автоматический отчёт', 'Неделя → несколько минут'],
  paragraphs: [], sections: [], meta: {},
}, 2, 8, { library: [] });
assert.equal(comparisonCandidates.selected.id, 'data-table');

const metricCandidates = recommendCompositionCandidates({
  title: 'Результат в цифрах', bullets: [], paragraphs: [], meta: {},
  sections: [
    { title: '30%', paragraphs: ['меньше ручной работы'], bullets: [] },
    { title: '2×', paragraphs: ['быстрее отчётность'], bullets: [] },
    { title: '99%', paragraphs: ['полнота данных'], bullets: [] },
  ],
}, 2, 8, { library: [] });
assert.equal(metricCandidates.selected.id, 'metric-focus');

const rhythmicCandidates = recommendCompositionCandidates({
  title: 'Возможности платформы', bullets: ['А', 'Б', 'В', 'Г'], paragraphs: [], sections: [], meta: {},
}, 3, 8, {
  library: [], recentFamilies: ['card-grid'], recentLayouts: ['benefits-grid'], recentMasses: ['modular-grid'],
});
assert.ok(rhythmicCandidates.selected.scoreBreakdown.semantic > 0);
assert.notEqual(rhythmicCandidates.selected.id, 'card-grid');
for (const candidate of rhythmicCandidates.candidates) {
  assert.ok(candidate.silhouetteId.includes(candidate.renderLayout));
  assert.equal(typeof candidate.scoreBreakdown.rhythm, 'number');
  assert.ok(Array.isArray(candidate.readingPath));
}

const measuredReplan = recommendCompositionCandidates({
  title: 'Возможности платформы', bullets: ['А', 'Б', 'В', 'Г'], paragraphs: [], sections: [], meta: {},
}, 2, 8, {
  library: [],
  measurement: {
    layout: 'benefits-grid', status: 'needs-review',
    recommendation: { action: 'rebalance-media-and-content', tryLayouts: ['photo-list', 'intro'] },
  },
});
assert.notEqual(measuredReplan.selected.renderLayout, 'benefits-grid', 'браузерное измерение должно менять геометрически неподходящий layout');
assert.notEqual(measuredReplan.selected.renderLayout, 'intro', 'layout без поддержки bullet-структуры не должен терять контент');

const coverVisual = recommendVisualAssets({ title: 'Знакомьтесь, Тео', meta: {}, bullets: [], sections: [], paragraphs: [] }, 0, 8, {
  assets: visualAssets, visualState: { theoAppearances: [] }, limit: 6,
});
const coverTheo = coverVisual.suggestions.find((asset) => /theo-mascot/.test(asset.source));
assert.ok(coverTheo && coverTheo.policy.scheduled, 'Тео должен быть запланирован на обложке');
assert.doesNotMatch(coverTheo.source, /avatar/i, 'для hero нужна полнофигурная версия, а не аватар');
assert.equal(recommendVisualPlacement({ title: 'Знакомьтесь, Тео' }, 0, 8, { asset: coverTheo }).size, 'hero');

const supportingVisual = recommendVisualAssets({
  title: 'Как Тео помогает анализировать данные', layout: 'title-bullets', meta: {},
  bullets: ['Расходы', 'Маршруты', 'Статусы', 'Политика'], sections: [], paragraphs: [],
}, 2, 8, { assets: visualAssets, visualState: { theoAppearances: [0] }, limit: 6 });
const supportingTheo = supportingVisual.suggestions.find((asset) => /theo-mascot/.test(asset.source));
assert.ok(supportingTheo, 'второе редкое появление Тео должно оставаться доступным');
const supportingPlacement = recommendVisualPlacement({
  title: 'Как Тео помогает анализировать данные',
  layout: 'title-bullets',
  bullets: ['Расходы', 'Маршруты', 'Статусы', 'Политика'],
}, 2, 8, { asset: supportingTheo });
assert.equal(supportingPlacement.size, 'medium');
assert.equal(supportingPlacement.supportingOnly, true);

const exhaustedVisual = recommendVisualAssets({
  title: 'Команда и данные', meta: {}, bullets: ['Менеджер', 'Аналитик', 'Руководитель'], sections: [], paragraphs: [],
}, 5, 8, { assets: visualAssets, visualState: { theoAppearances: [0, 2] }, limit: 12 });
assert.ok(!/theo-mascot/.test(exhaustedVisual.suggestions[0].source), 'после целевых двух появлений должны лидировать люди, продукт или данные');

console.log('design-intelligence: senior semantics, geometry contracts, visual safety, candidates and anti-patterns — OK');
