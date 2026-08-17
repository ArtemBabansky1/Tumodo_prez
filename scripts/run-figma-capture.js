#!/usr/bin/env node
/**
 * Opens one local slide source with a single-use Figma capture URL.
 * Usage: node scripts/run-figma-capture.js "http://localhost:3000/figma-export.html?...#figmacapture=..."
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const rawUrl = String(process.argv[2] || '').trim();
if (!rawUrl) {
  console.error('Передайте полный локальный Figma capture URL');
  process.exit(1);
}

let target;
try { target = new URL(rawUrl); } catch {
  console.error('Некорректный capture URL');
  process.exit(1);
}

const captureId = target.hash.match(/(?:^|[&#])figmacapture=([0-9a-f-]{36})(?:&|$)/i)?.[1];
const endpointRaw = target.hash.match(/(?:^|[&#])figmaendpoint=([^&]+)(?:&|$)/i)?.[1];
let endpoint;
try { endpoint = new URL(decodeURIComponent(endpointRaw || '')); } catch {}
const endpointCaptureId = endpoint && endpoint.pathname.match(/^\/mcp\/capture\/([0-9a-f-]{36})\/submit$/i)?.[1];

if (!/^(?:localhost|127\.0\.0\.1)$/i.test(target.hostname)
  || target.port !== '3000'
  || target.pathname !== '/figma-export.html'
  || !captureId
  || !endpoint
  || endpoint.protocol !== 'https:'
  || endpoint.hostname !== 'mcp.figma.com'
  || endpointCaptureId !== captureId) {
  console.error('Разрешён только локальный источник figma-export.html с согласованным Figma captureId');
  process.exit(1);
}

const candidates = [
  [process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
  [process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
  [process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
].filter((parts) => parts[0]).map((parts) => path.join(...parts));
const browser = candidates.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('Не найден Edge или Chrome для локального Figma-захвата');
  process.exit(1);
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tumodo-figma-capture-'));
const expectedTempRoot = path.resolve(os.tmpdir()) + path.sep;
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const bundled = path.join(
    process.env.USERPROFILE || '',
    '.cache', 'codex-runtimes', 'codex-primary-runtime',
    'dependencies', 'node', 'node_modules', 'playwright'
  );
  if (fs.existsSync(bundled)) return require(bundled);
  throw new Error('Playwright не найден. Запустите проект из Codex Desktop или установите playwright локально.');
}

(async () => {
  const { chromium } = loadPlaywright();
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath: browser,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run'],
    viewport: { width: 1920, height: 1080 },
  });
  try {
    const page = await context.newPage();
    const captureUrl = new URL(target.href);
    const localSubmitEndpoint = new URL(
      '/figma-submit/' + captureId + '?bindVariables=true',
      captureUrl.origin
    ).href;
    const captureParams = new URLSearchParams(captureUrl.hash.replace(/^#/, ''));
    captureParams.set('figmacapture', captureId);
    captureParams.set('figmaendpoint', localSubmitEndpoint);
    captureParams.set('figmadelay', '1500');
    captureUrl.hash = captureParams.toString();
    const submission = page.waitForResponse(
      (response) => response.url().includes('/figma-submit/' + captureId),
      { timeout: 120000 }
    );
    await page.goto(captureUrl.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.figmaReady === 'true',
      null,
      { timeout: 30000 }
    );
    const response = await submission;
    if (!response.ok()) {
      throw new Error('Figma submit вернул HTTP ' + response.status() + ': ' + await response.text());
    }
    console.log('FIGMA_CAPTURE_SUBMITTED: ' + captureId);
    console.log('FIGMA_CAPTURE_HTTP: ' + response.status());
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}).finally(() => {
  const resolvedProfile = path.resolve(profileDir);
  if (resolvedProfile.startsWith(expectedTempRoot) && path.basename(resolvedProfile).startsWith('tumodo-figma-capture-')) {
    try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }); } catch {}
  }
});
