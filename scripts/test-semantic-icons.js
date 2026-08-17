#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { PHOTO_LIST_ICON_RULES, selectPhotoListIcon } = require('./lib/semantic-icons');

assert.equal(selectPhotoListIcon('Динамика и структура затрат'), 'icons/svg/icon-chart-line.svg');
assert.equal(selectPhotoListIcon('Маршруты и направления'), 'icons/svg/icon-route.svg');
assert.equal(selectPhotoListIcon('Нарушения тревел-политики'), 'icons/svg/icon-shield-alert.svg');
assert.equal(selectPhotoListIcon('Поставщики и классы обслуживания'), 'icons/svg/icon-building-2.svg');
assert.equal(selectPhotoListIcon('Статусы бронирований, возвраты и обмены'), 'icons/svg/icon-refresh-cw.svg');
assert.equal(selectPhotoListIcon('Абстрактный тезис без семантики'), '');

for (const rule of PHOTO_LIST_ICON_RULES) {
  assert.ok(
    fs.existsSync(path.join(__dirname, '..', 'design-system', rule.icon)),
    'Иконка должна существовать на платформе: ' + rule.icon
  );
}

console.log('semantic-icons: photo-list uses platform assets by meaning — OK');
