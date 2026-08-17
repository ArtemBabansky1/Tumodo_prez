#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const { NBSP, bindShortWords, bindCompoundWords, typographHtml } = require('./lib/typograph');

assert.equal(bindShortWords('Тео работает с данными'), 'Тео работает с' + NBSP + 'данными');
assert.equal(bindShortWords('И в рамках отчёта'), 'И' + NBSP + 'в' + NBSP + 'рамках отчёта');
assert.equal(bindShortWords('данные по отделам и поставщикам'), 'данные по' + NBSP + 'отделам и' + NBSP + 'поставщикам');
assert.equal(bindCompoundWords('AI-аналитик'), 'AI‑аналитик');
assert.equal(
  typographHtml('<div class="lead">Диалог с данными</div>'),
  '<div class="lead">Диалог с' + NBSP + 'данными</div>'
);
assert.equal(
  typographHtml('<img src="assets/by-user/image-file.png" alt="">'),
  '<img src="assets/by-user/image-file.png" alt="">'
);

console.log('typograph: hanging short words, compound words and override HTML — OK');
