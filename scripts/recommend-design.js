#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  parseLibraryCatalog,
  parseVisualAssets,
  recommendReferences,
  recommendVisualAssets,
} = require('./lib/design-intelligence');

const ROOT = path.resolve(__dirname, '..');

function splitDeckSource(source) {
  const clean = String(source || '').replace(/^\uFEFF/, '');
  let body = clean;
  const frontmatter = clean.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (frontmatter) body = clean.slice(frontmatter[0].length);
  return body.split(/\r?\n---\r?\n/).map((block) => block.trim()).filter(Boolean);
}

function parseSlide(block) {
  const slide = { title: '', layout: '', lead: '', paragraphs: [], bullets: [], sections: [] };
  let current = slide;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    let match;
    if ((match = line.match(/^#\s+(.*)$/))) slide.title = match[1].trim();
    else if ((match = line.match(/^##\s+(.*)$/))) {
      current = { title: match[1].trim(), paragraphs: [], bullets: [] };
      slide.sections.push(current);
    } else if ((match = line.match(/^\[layout:\s*([^\]]+)\]$/))) slide.layout = match[1].trim();
    else if ((match = line.match(/^>\s?(.*)$/))) slide.lead += (slide.lead ? ' ' : '') + match[1].trim();
    else if ((match = line.match(/^[-*]\s+(.*)$/))) current.bullets.push(match[1].trim());
    else if (line && !/^\[/.test(line)) current.paragraphs.push(line);
  }
  return slide;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Использование: node scripts/recommend-design.js <имя или input/файл.md>');
    process.exit(1);
  }
  const file = arg.endsWith('.md') ? path.resolve(ROOT, arg) : path.join(ROOT, 'input', arg + '.md');
  if (!fs.existsSync(file)) {
    console.error('Не найден входной файл: ' + file);
    process.exit(1);
  }
  const slides = splitDeckSource(fs.readFileSync(file, 'utf8')).map(parseSlide);
  const library = parseLibraryCatalog();
  const visualAssets = parseVisualAssets();
  const recentlyUsedAssets = [];
  let previousComposition = '';
  const result = slides.map((slide, index) => {
    const recommendation = recommendReferences(slide, index, slides.length, {
      library,
      limit: 5,
      previousComposition,
    });
    const best = recommendation.references[0];
    previousComposition = best ? best.composition : previousComposition;
    const visual = recommendVisualAssets(slide, index, slides.length, {
      analysis: recommendation.analysis,
      assets: visualAssets,
      exclude: recentlyUsedAssets.slice(-3),
      limit: 5,
    });
    if (visual.required && visual.suggestions[0]) recentlyUsedAssets.push(visual.suggestions[0].source);
    return {
      number: index + 1,
      title: slide.title,
      semanticRole: recommendation.analysis.role,
      renderLayout: recommendation.analysis.renderLayout,
      visualRequirement: visual.required ? 'required' : 'intentional-exception',
      preferredVisualKinds: visual.preferredKinds,
      suggestedAssets: visual.suggestions.map((asset) => ({
        source: asset.source,
        kind: asset.kind,
        score: asset.score,
        reason: asset.reason,
      })),
      recommended: recommendation.references.map((ref) => ({
        nodeId: ref.nodeId,
        source: ref.source,
        role: ref.role,
        composition: ref.composition,
        theme: ref.theme,
        score: ref.score,
        reason: ref.reason,
      })),
    };
  });
  process.stdout.write(JSON.stringify({
    figma: {
      fileKey: 'SZpOoVhI07GPa3Vf7BRc10',
      sectionNodeId: '855:401',
      references: library.length,
    },
    slides: result,
  }, null, 2) + '\n');
}

main();
