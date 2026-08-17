#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const rules = read('rules', 'figma-export-rules.md');
const agent = read('app', 'agent.js');
const capture = read('app', 'public', 'figma-export.js');
const registry = read('app', 'server.js');

assert.match(rules, /Сначала агент полностью собирает и проверяет презентацию на платформе/);
assert.match(rules, /редактируемым DOM-capture/);
assert.match(rules, /1920×1080/);
assert.match(rules, /точное человекочитаемое название презентации/);
assert.match(rules, /Columns[\s\S]*7[\s\S]*120px[\s\S]*30px/);
assert.match(rules, /Rows[\s\S]*7[\s\S]*120px[\s\S]*25px/);
assert.match(rules, /#FF0000[\s\S]*10%/);
assert.match(rules, /VECTOR[\s\S]*BOOLEAN_OPERATION/);
assert.match(rules, /paddingTop = paddingRight = paddingBottom = paddingLeft = 30/);
assert.match(rules, /bottom <= 960px/);
assert.match(rules, /аудит обязан найти \*\*0\*\* обычных пробелов/);
assert.match(rules, /cornerSmoothing = 0\.6/);

for (const marker of [
  'FIGMA_SECTION_NAME',
  'FIGMA_FRAMES',
  'FIGMA_FRAME_SIZES',
  'FIGMA_EDITABLE_FRAMES',
  'FIGMA_LAYOUT_GRIDS',
  'FIGMA_PROCESS_PADDINGS',
  'FIGMA_PROCESS_BOUNDS',
  'FIGMA_ROUNDED_NODES_AUDITED',
  'FIGMA_CORNER_SMOOTHING',
  'FIGMA_TEXT_NODES_AUDITED',
  'FIGMA_HANGING_WORDS',
  'FIGMA_VECTOR_ASSETS',
]) {
  assert.match(agent, new RegExp(marker + ':'));
}

assert.match(agent, /rules\/figma-export-rules\.md/);
assert.match(agent, /rawFigmaUrl\.match/);
assert.match(agent, /reportedEditableFramesTotal/);
assert.match(agent, /cornerSmoothingConfirmed/);
assert.match(agent, /typographyConfirmed/);
assert.match(agent, /vectorsConfirmed/);
assert.match(capture, /inlineLocalSvgImages/);
assert.match(capture, /data-figma-svg-source/);
assert.match(registry, /'figma-export-rules':\s*\{\s*path:\s*'rules\/figma-export-rules\.md'/);

console.log('figma-export contract: direction, editable frames, grids, SVG, geometry, typography and smoothing — OK');
