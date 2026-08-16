#!/usr/bin/env node
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  analyzeSlide,
  parseLibraryCatalog,
  parseVisualAssets,
  recommendReferences,
  recommendVisualAssets,
  recommendVisualPlacement,
} = require('./lib/design-intelligence');

const library = parseLibraryCatalog();
assert.equal(library.length, 126, 'Figma library must contain 126 full-size slide references');
assert.equal(new Set(library.map((item) => item.nodeId)).size, 126, 'Figma node ids must be unique');
for (const item of library) {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'design-system', 'canon', item.source)), `Missing ${item.source}`);
}

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
const theoSlide = { title: 'С какими запросами работает Тео', bullets: ['Аналитика затрат', 'Маршруты'] };
const visual = recommendVisualAssets(theoSlide, 3, 7, { assets: visualAssets, limit: 5 });
assert.equal(visual.required, true);
assert.ok(visual.suggestions.some((item) => /theo-mascot/.test(item.source)), 'Theo slide must recommend the Theo 3D mascot');

const keys = visualAssets.find((item) => /3d-keys-blue/.test(item.source));
const cardPlacement = recommendVisualPlacement({
  title: 'Сервисы для поездки',
  layout: 'benefits-grid',
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

const globe = visualAssets.find((item) => /3d-globe-silver/.test(item.source));
const slidePlacement = recommendVisualPlacement({
  title: 'География поездок',
  layout: 'benefits-grid',
  meta: { '3d-pos': 'center' },
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
  title: 'Онлайн-сервис меняет модель работы',
  layout: 'title-bullets',
  bullets: ['Каналы: почта → единая платформа', 'Бюджет: постфактум → данные в реальном времени'],
}, 2, 10);
assert.equal(comparison.role, 'comparison');
assert.equal(comparison.renderLayout, 'comparison-flow');
assert.equal(comparison.containerPolicy, 'table-fill');
assert.equal(comparison.alignmentContract, 'shared-table-columns/photo-table-edges');
assert.ok(comparison.penaltyRisks.includes('decorative-arrows'));

const labelledComparison = analyzeSlide({
  title: 'Раньше и с Tumodo',
  layout: 'title-bullets',
  meta: { 'before-label': 'Раньше', 'after-label': 'С Tumodo' },
  bullets: ['Каналы: почта → единая платформа', 'Бюджет: постфактум → данные в реальном времени'],
}, 2, 10);
assert.equal(labelledComparison.role, 'comparison');
assert.equal(labelledComparison.renderLayout, 'comparison-flow');

const sparseCopy = analyzeSlide({
  title: 'Короткий список',
  bullets: ['Первый тезис', 'Второй тезис'],
}, 2, 10);
assert.equal(sparseCopy.containerPolicy, 'alternate-layout-required');
assert.ok(sparseCopy.penaltyRisks.includes('empty-container'));

const sparsePhotoList = analyzeSlide({
  title: 'Короткий список с фото',
  layout: 'title-bullets',
  meta: { image: 'photos/people/example.webp' },
  bullets: ['Первый тезис', 'Второй тезис', 'Третий тезис', 'Четвёртый тезис'],
}, 2, 10);
assert.equal(sparsePhotoList.renderLayout, 'photo-list');
assert.equal(sparsePhotoList.containerPolicy, 'full-height-rows');
assert.ok(!sparsePhotoList.penaltyRisks.includes('empty-container'));

const process = analyzeSlide({
  title: 'Подключение занимает пять шагов',
  layout: 'title-bullets',
  bullets: ['Договор', 'Знакомство', 'Поддержка', 'Настройка', 'Контроль'],
}, 3, 10);
assert.equal(process.renderLayout, 'process-steps');

const metrics = analyzeSlide({
  title: 'Tumodo в цифрах',
  layout: 'numbered-cards-3',
  sections: [{ title: '1 день' }, { title: '1 000+' }, { title: '30+' }],
}, 4, 10);
assert.equal(metrics.role, 'metrics');
assert.equal(metrics.renderLayout, 'kpi-metrics');

const coins = visualAssets.find((item) => /3d-zero-commission-coins/.test(item.source));
const safeFinancePlacement = recommendVisualPlacement({
  title: 'Отчётность автоматически приходит в учётную систему',
  layout: 'numbered-cards-3',
  meta: { '3d-mode': 'slide' },
  sections: [
    { title: 'Онлайн-услуги', paragraphs: ['Готовый отчёт'] },
    { title: 'Дополнительные расходы', paragraphs: ['Затраты сотрудника'] },
    { title: 'Согласование', paragraphs: ['Отчёт бухгалтеру'] },
  ],
}, 5, 10, { asset: coins });
assert.equal(safeFinancePlacement.mode, 'card');
assert.equal(safeFinancePlacement.cardIndex, 2);

const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'css', 'components.css'), 'utf8');
assert.match(componentsCss, /object-position:\s*50%\s+0%/);
assert.match(componentsCss, /\.has-card-3d[\s\S]*overflow:\s*hidden/);
assert.doesNotMatch(componentsCss, /\.process-step::after/);
assert.match(componentsCss, /\.metric-card\.has-card-3d[\s\S]*justify-content:\s*space-between/);

const comparisonTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'layouts', 'comparison-flow.html'), 'utf8');
assert.doesNotMatch(comparisonTemplate, /change-arrow|>→</);
assert.match(comparisonTemplate, /categoryLabel[\s\S]*beforeLabel[\s\S]*afterLabel/);

const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'css', 'layout.css'), 'utf8');
assert.doesNotMatch(layoutCss, /media-copy-hug|\.card\.hug/);

const photoListTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'html', 'layouts', 'photo-list.html'), 'utf8');
assert.match(photoListTemplate, /photo-list-rows[\s\S]*photo-list-row/);

console.log('design-intelligence: senior semantics, geometry contracts, visual safety and anti-patterns — OK');
