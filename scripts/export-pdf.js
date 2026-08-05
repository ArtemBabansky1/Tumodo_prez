#!/usr/bin/env node
/**
 * Экспорт собранной презентации в PDF через headless Edge/Chrome.
 * Запуск: node scripts/export-pdf.js <имя>   (output/<имя>/index.html → output/<имя>/<имя>.pdf)
 * Каждый слайд — страница 1920×1080 (см. @media print в layout.css).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const name = process.argv[2];
if (!name) { console.error('Использование: node scripts/export-pdf.js <имя>'); process.exit(1); }

const indexPath = path.join(ROOT, 'output', name, 'index.html');
if (!fs.existsSync(indexPath)) { console.error('Сначала соберите: node scripts/build.js ' + name); process.exit(1); }

const pdfPath = path.join(ROOT, 'output', name, name + '.pdf');
const candidates = [
  [process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
].filter((p) => p[0]).map((p) => path.join(...p));
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error('Не найден Edge/Chrome для headless-печати'); process.exit(1); }

execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--print-to-pdf=' + pdfPath,
  'file:///' + indexPath.split(path.sep).join('/'),
], { stdio: 'inherit', timeout: 120000 });
console.log('PDF: output/' + name + '/' + name + '.pdf');
