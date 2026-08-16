#!/usr/bin/env node
/** Один обязательный quality loop: strict build → screenshots → geometry gate. */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const name = process.argv[2];
if (!name) {
  console.error('Использование: node scripts/check-deck.js <имя>');
  process.exit(1);
}

const steps = [
  ['build.js', [name, '--strict'], 'Strict-сборка'],
  ['screenshot.js', [name], 'Скриншоты'],
  ['validate-design.js', [name], 'Геометрический quality gate'],
];

for (const [script, args, label] of steps) {
  console.log('\n' + label);
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\nQUALITY GATE: PASSED');
