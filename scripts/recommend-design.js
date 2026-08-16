#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  parseLibraryCatalog,
  parseVisualAssets,
  recommendReferences,
  recommendVisualAssets,
  recommendVisualPlacement,
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
    }
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
  const recentCompositions = [];
  const recentLayouts = [];
  const recentReferences = [];
  const result = slides.map((slide, index) => {
    const recommendation = recommendReferences(slide, index, slides.length, {
      library,
      limit: 5,
      recentCompositions,
      recentLayouts,
      recentReferences,
    });
    const best = recommendation.references[0];
    if (best) {
      recentCompositions.unshift(best.composition);
      recentLayouts.unshift(recommendation.analysis.renderLayout);
      recentReferences.unshift(best.source);
      recentCompositions.splice(4);
      recentLayouts.splice(4);
      recentReferences.splice(8);
    }
    const visual = recommendVisualAssets(slide, index, slides.length, {
      analysis: recommendation.analysis,
      assets: visualAssets,
      exclude: recentlyUsedAssets.slice(-3),
      limit: 5,
    });
    const placedSuggestions = visual.suggestions.map((asset) => ({
      source: asset.source,
      kind: asset.kind,
      score: asset.score,
      reason: asset.reason,
      placement: recommendVisualPlacement(slide, index, slides.length, {
        analysis: recommendation.analysis,
        asset,
      }),
    })).sort((a, b) => Number(Boolean(a.placement.rejected)) - Number(Boolean(b.placement.rejected)) || b.score - a.score);
    const firstUsable = placedSuggestions.find((asset) => !asset.placement.rejected);
    if (visual.required && firstUsable) recentlyUsedAssets.push(firstUsable.source);
    return {
      number: index + 1,
      title: slide.title,
      semanticRole: recommendation.analysis.role,
      renderLayout: recommendation.analysis.renderLayout,
      silhouetteId: [
        recommendation.analysis.renderLayout,
        best ? best.composition : 'editorial',
        best ? best.media : recommendation.analysis.media,
      ].join(':'),
      visualRequirement: visual.required ? 'required' : 'intentional-exception',
      preferredVisualKinds: visual.preferredKinds,
      assetGap: visual.assetGap,
      compositionBrief: {
        contentFill: recommendation.analysis.contentFill,
        spaceStrategy: recommendation.analysis.spaceStrategy,
        recommendedVisualShare: recommendation.analysis.recommendedVisualShare,
        containerPolicy: recommendation.analysis.containerPolicy,
        alignmentContract: recommendation.analysis.alignmentContract,
        titleSystem: recommendation.analysis.titleSystem,
        decorationPolicy: recommendation.analysis.decorationPolicy,
      },
      themeChapter: recommendation.analysis.themeChapter,
      penaltyRisks: recommendation.analysis.penaltyRisks,
      suggestedAssets: placedSuggestions,
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
    qualityContract: {
      minimumCardContentFill: 0.55,
      underfillAction: 'change-layout-never-shrink-container',
      comparisonMode: 'table-with-shared-columns-no-arrows',
      titleSystem: 'page-title/system-anchor',
      rowAlignment: 'shared-baselines',
      decoration: 'functional-only',
      darkTheme: 'one-contiguous-theme-chapter',
      requiredGate: 'node scripts/validate-design.js <name>',
    },
    slides: result,
  }, null, 2) + '\n');
}

main();
