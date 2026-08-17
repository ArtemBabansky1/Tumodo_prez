const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [
  path.join(root, 'scripts', 'recommend-design.js'),
  'theo-corporate-analytics',
], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

if (result.status !== 0) {
  process.stderr.write(result.stderr || `recommend-design failed: ${result.status}`);
  process.exit(result.status || 1);
}

const destination = path.join(root, 'output', 'theo-corporate-analytics', 'recommendations.json');
fs.writeFileSync(destination, result.stdout, 'utf8');
process.stdout.write(destination + '\n');
