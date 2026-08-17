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
const { selectedCreativeDirection, validateCreativeDirections } = require('./lib/creative-direction');

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
  const deckName = path.basename(file, path.extname(file));
  let creativeDocument = null;
  let creativeDirection = null;
  try {
    creativeDocument = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', deckName, 'creative-directions.json'), 'utf8'));
    const validation = validateCreativeDirections(creativeDocument);
    if (validation.passed) creativeDirection = selectedCreativeDirection(creativeDocument);
  } catch {}
  let measuredSlides = [];
  try {
    const measured = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', deckName, 'content-measurements.json'), 'utf8'));
    measuredSlides = Array.isArray(measured.slides) ? measured.slides : [];
  } catch {}
  const library = parseLibraryCatalog();
  const visualAssets = parseVisualAssets();
  const recentlyUsedAssets = [];
  const visualState = { theoAppearances: [] };
  const recentCompositions = [];
  const recentLayouts = [];
  const recentMasses = [];
  const recentSides = [];
  const recentReferences = [];
  const result = slides.map((slide, index) => {
    const recommendation = recommendReferences(slide, index, slides.length, {
      library,
      limit: 5,
      recentCompositions,
      recentLayouts,
      recentMasses,
      recentSides,
      recentReferences,
      measurement: measuredSlides[index] || null,
      creativeDirection,
    });
    const best = recommendation.references[0];
    const chosenComposition = recommendation.selectedCandidate;
    if (best || chosenComposition) {
      recentCompositions.unshift(chosenComposition ? chosenComposition.id : best.composition);
      recentLayouts.unshift(recommendation.analysis.renderLayout);
      if (chosenComposition) {
        recentMasses.unshift(chosenComposition.massDistribution);
        recentSides.unshift(chosenComposition.visualSide);
      }
      if (best) recentReferences.unshift(best.source);
      recentCompositions.splice(4);
      recentLayouts.splice(4);
      recentMasses.splice(4);
      recentSides.splice(4);
      recentReferences.splice(8);
    }
    const visual = recommendVisualAssets(slide, index, slides.length, {
      analysis: recommendation.analysis,
      assets: visualAssets,
      exclude: recentlyUsedAssets.slice(-3),
      visualState,
      creativeDirection,
      limit: 5,
    });
    const placedSuggestions = visual.suggestions.map((asset) => ({
      source: asset.source,
      kind: asset.kind,
      score: asset.score,
      reason: asset.reason,
      policy: asset.policy,
      placement: recommendVisualPlacement(slide, index, slides.length, {
        analysis: recommendation.analysis,
        asset,
      }),
    })).sort((a, b) => Number(Boolean(a.placement.rejected)) - Number(Boolean(b.placement.rejected)) || b.score - a.score);
    const firstUsable = placedSuggestions.find((asset) => !asset.placement.rejected);
    const scheduledVisual = firstUsable && (visual.required || (firstUsable.policy && firstUsable.policy.scheduled)) ? firstUsable : null;
    if (scheduledVisual) {
      recentlyUsedAssets.push(scheduledVisual.source);
      if (/theo-mascot/i.test(scheduledVisual.source)) visualState.theoAppearances.push(index);
    }
    return {
      number: index + 1,
      title: slide.title,
      semanticRole: recommendation.analysis.role,
      renderLayout: recommendation.analysis.renderLayout,
      compositionFamily: chosenComposition ? chosenComposition.id : (best ? best.composition : 'editorial'),
      silhouetteId: chosenComposition ? chosenComposition.silhouetteId : [
          recommendation.analysis.renderLayout,
          best ? best.composition : 'editorial',
          best ? best.media : recommendation.analysis.media,
        ].join(':'),
      compositionDecision: chosenComposition ? {
        score: chosenComposition.score,
        scoreBreakdown: chosenComposition.scoreBreakdown,
        reason: chosenComposition.reason,
        massDistribution: chosenComposition.massDistribution,
        visualSide: chosenComposition.visualSide,
        readingPath: chosenComposition.readingPath,
      } : null,
      compositionCandidates: recommendation.candidates,
      measurementFeedback: measuredSlides[index] || null,
      visualRequirement: visual.required ? 'required' : 'intentional-exception',
      preferredVisualKinds: visual.preferredKinds,
      assetGap: visual.assetGap,
      characterPolicy: visual.characterPolicy,
      plannedVisual: scheduledVisual ? scheduledVisual.source : '',
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
    creativeDirection: creativeDirection ? {
      id: creativeDirection.id,
      title: creativeDirection.title,
      idea: creativeDirection.idea,
      techniques: creativeDirection.techniques,
      assetPolicy: creativeDirection.assetPolicy,
    } : null,
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
