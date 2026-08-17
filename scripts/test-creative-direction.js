#!/usr/bin/env node
const assert = require('assert/strict');
const {
  parseLibraryCatalog,
  parseVisualAssets,
  recommendCompositionCandidates,
  recommendVisualAssets,
} = require('./lib/design-intelligence');
const {
  createCreativeDirections,
  validateCreativeDirections,
  selectedCreativeDirection,
} = require('./lib/creative-direction');

const library = parseLibraryCatalog();
const assets = parseVisualAssets();
const slides = [
  { title: 'Tumodo — командировки без хаоса', layout: 'cover', bullets: [], sections: [], paragraphs: [], meta: {} },
  { title: 'Единая платформа для всей поездки', bullets: ['Билеты', 'Отели', 'Отчётность'], sections: [], paragraphs: [], meta: {} },
  { title: 'Расходы под контролем', bullets: ['−30% ручных операций', '2× быстрее согласование'], sections: [], paragraphs: [], meta: {} },
  { title: 'Люди получают поддержку в дороге', bullets: ['Сотрудник', 'Тревел-менеджер', 'Бухгалтер'], sections: [], paragraphs: [], meta: {} },
  { title: 'Спасибо', layout: 'final', bullets: [], sections: [], paragraphs: [], meta: {} },
];

const document = createCreativeDirections({ deckName: 'creative-test', slides, library, assets });
assert.equal(document.mode, 'brand-bounded');
assert.equal(document.systemContract.assetPolicy, 'platform-only');
assert.equal(document.directions.length, 3);
assert.equal(document.validation.passed, true, document.validation.errors.join('\n'));
assert.ok(selectedCreativeDirection(document));

const knownReferences = new Set(library.map((item) => item.source));
const knownAssets = new Set(assets.map((item) => item.source));
for (const direction of document.directions) {
  assert.equal(direction.assetPolicy, 'platform-only');
  assert.ok(direction.styleframes.length >= 3 && direction.styleframes.length <= 4);
  for (const styleframe of direction.styleframes) {
    assert.match(styleframe.prompt, /только приложенные каноны Tumodo и ассеты платформы/i);
    assert.ok(styleframe.referenceSources.every((source) => knownReferences.has(source)));
    assert.ok(styleframe.assetSources.every((source) => knownAssets.has(source)));
  }
}

const productDirection = document.directions.find((item) => item.id === 'product-as-proof');
const productCandidates = recommendCompositionCandidates({
  title: 'Продукт Tumodo',
  sections: [{ title: 'Платформа', paragraphs: ['Единый интерфейс'], bullets: [] }],
  bullets: [], paragraphs: [], meta: {},
}, 1, 5, { library, creativeDirection: productDirection });
const productShowcase = productCandidates.candidates.find((item) => item.id === 'product-showcase');
assert.ok(productShowcase && productShowcase.scoreBreakdown.creative > 0);
assert.ok(productCandidates.candidates.every((item) => item.scoreBreakdown.risk <= 0));

const visualSuggestions = recommendVisualAssets({
  title: 'Продукт Tumodo: дашборд и отчётность', bullets: ['Интерфейс', 'Данные'], sections: [], paragraphs: [], meta: {},
}, 1, 5, { assets, creativeDirection: productDirection, limit: 12 });
const mockup = visualSuggestions.suggestions.find((item) => item.kind === 'mockup');
assert.ok(mockup && mockup.creativeScore > 0, 'Selected direction must influence only platform asset ranking');

const invalidDocument = JSON.parse(JSON.stringify(document));
invalidDocument.directions[0].techniques.push('invent-a-new-brand-language');
const invalidValidation = validateCreativeDirections(invalidDocument, { library, assets });
assert.equal(invalidValidation.passed, false);
assert.ok(invalidValidation.errors.some((message) => /отсутствует в дизайн-системе/.test(message)));

console.log('creative-direction: three brand-bounded concepts, platform assets and safety validation — OK');
