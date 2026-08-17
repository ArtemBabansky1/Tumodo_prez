#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  createCreativeDirections,
  validateCreativeDirections,
} = require('./lib/creative-direction');

const ROOT = path.resolve(__dirname, '..');

function splitDeckSource(source) {
  const clean = String(source || '').replace(/^\uFEFF/, '');
  const frontmatter = clean.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = frontmatter ? clean.slice(frontmatter[0].length) : clean;
  return body.split(/\r?\n---\r?\n/).map((block) => block.trim()).filter(Boolean);
}

function parseSlide(block) {
  const slide = { title: '', layout: '', lead: '', paragraphs: [], bullets: [], sections: [], meta: {} };
  let current = slide;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    let match;
    if ((match = line.match(/^#\s+(.*)$/))) slide.title = match[1].trim();
    else if ((match = line.match(/^##\s+(.*)$/))) {
      current = { title: match[1].trim(), paragraphs: [], bullets: [] };
      slide.sections.push(current);
    } else if ((match = line.match(/^\[(\w[\w-]*):\s*([^\]]*)\]$/))) {
      if (match[1] === 'layout') slide.layout = match[2].trim();
      else slide.meta[match[1]] = match[2].trim();
    } else if ((match = line.match(/^>\s?(.*)$/))) slide.lead += (slide.lead ? ' ' : '') + match[1].trim();
    else if ((match = line.match(/^[-*]\s+(.*)$/))) current.bullets.push(match[1].trim());
    else if (line && !/^\[/.test(line)) current.paragraphs.push(line);
  }
  return slide;
}

function main() {
  const args = process.argv.slice(2);
  const arg = args.find((item) => !item.startsWith('--'));
  if (!arg) {
    console.error('Использование: node scripts/creative-director.js <имя или input/файл.md> [--select=id] [--check]');
    process.exit(1);
  }
  const inputFile = arg.endsWith('.md') ? path.resolve(ROOT, arg) : path.join(ROOT, 'input', arg + '.md');
  if (!fs.existsSync(inputFile)) {
    console.error('Не найден входной файл: ' + inputFile);
    process.exit(1);
  }
  const deckName = path.basename(inputFile, path.extname(inputFile));
  const outputFile = path.join(ROOT, 'output', deckName, 'creative-directions.json');
  const selectedArg = args.find((item) => item.startsWith('--select='));
  const selected = selectedArg ? selectedArg.slice('--select='.length) : '';
  if (args.includes('--check')) {
    if (!fs.existsSync(outputFile)) {
      console.error('Не найден файл креативных направлений: ' + outputFile);
      process.exit(1);
    }
    const result = validateCreativeDirections(JSON.parse(fs.readFileSync(outputFile, 'utf8')));
    if (!result.passed) {
      console.error(result.errors.join('\n'));
      process.exit(2);
    }
    console.log('creative-direction: brand-bounded contract — OK');
    return;
  }
  let existingSelected = '';
  try { existingSelected = JSON.parse(fs.readFileSync(outputFile, 'utf8')).selected || ''; } catch {}
  const slides = splitDeckSource(fs.readFileSync(inputFile, 'utf8')).map(parseSlide);
  const document = createCreativeDirections({ deckName, slides, selected: selected || existingSelected });
  if (!document.validation.passed) {
    console.error(document.validation.errors.join('\n'));
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(document, null, 2) + '\n', 'utf8');
  console.log(`Креативные направления: output/${deckName}/creative-directions.json`);
  console.log(`Выбрано: ${document.selected}`);
}

main();
