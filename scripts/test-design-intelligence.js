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

console.log('design-intelligence: 126 references, 6 semantic scenarios, visual assets — OK');
