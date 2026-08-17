/**
 * Фабрика презентаций Tumodo — локальный сервер приложения.
 * Читает и пишет файлы дизайн-системы, правил и презентаций прямо в папках проекта.
 * Только localhost, без внешних сервисов.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const {
  ROLE_LABELS: ENGINE_ROLE_LABELS,
  parseLibraryCatalog,
  parseVisualAssets,
  recommendReferences,
  recommendVisualAssets,
  recommendVisualPlacement,
} = require('../scripts/lib/design-intelligence');

const ROOT = path.resolve(__dirname, '..');
const DS_DIR = path.join(ROOT, 'design-system');
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files/design-system', express.static(DS_DIR));
app.use('/files/output', express.static(path.join(ROOT, 'output')));

// ---------------------------------------------------------------- helpers

async function readJsonSafe(file) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (data && data._status) return null; // заглушка этапа 1
    return data;
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Имя файла: без путей, пробелы → дефисы, только безопасные символы. */
function safeName(name) {
  return path
    .basename(name)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, '')
    .toLowerCase();
}

/** Относительный путь внутри категории: только "sub/file", без выхода наверх. */
function isSafeRelPath(rel) {
  return (
    typeof rel === 'string' &&
    !rel.includes('..') &&
    !rel.includes('\\') &&
    /^[^/]+\/[^/]+$/.test(rel)
  );
}

// ---------------------------------------------------------------- tokens

const TOKEN_FILES = {
  colors: 'colors.json',
  typography: 'typography.json',
  spacing: 'spacing.json',
  effects: 'effects.json',
};

app.get('/api/tokens', async (req, res) => {
  const out = {};
  for (const [key, file] of Object.entries(TOKEN_FILES)) {
    out[key] = await readJsonSafe(path.join(DS_DIR, 'tokens', file));
  }
  res.json(out);
});

app.put('/api/tokens/:name', async (req, res) => {
  const file = TOKEN_FILES[req.params.name];
  if (!file) return res.status(404).json({ error: 'Неизвестный файл токенов' });
  try {
    await writeJson(path.join(DS_DIR, 'tokens', file), req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------------------------------------------------------------- assets

const ASSET_CATEGORIES = {
  logo: {
    dir: 'logo',
    subByExt: { '.svg': 'svg', '.png': 'png', '.jpg': 'png', '.jpeg': 'png', '.webp': 'png' },
  },
  icons: {
    dir: 'icons',
    subByExt: { '.svg': 'svg' },
  },
  fonts: {
    dir: 'fonts',
    subByExt: { '.woff2': 'files', '.woff': 'files', '.ttf': 'files', '.otf': 'files' },
  },
  photos: {
    dir: 'photos',
    subdirs: ['people', '3d'],
    allowedExt: ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
  },
  patterns: {
    dir: 'patterns',
    subByExt: { '.svg': 'svg', '.png': 'png', '.jpg': 'png', '.jpeg': 'png', '.webp': 'png' },
  },
  mockups: {
    dir: 'mockups',
    subByExt: { '.png': 'files', '.jpg': 'files', '.jpeg': 'files', '.webp': 'files', '.svg': 'files', '.psd': 'files' },
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function catConf(req, res) {
  const conf = ASSET_CATEGORIES[req.params.cat];
  if (!conf) res.status(404).json({ error: 'Неизвестная категория' });
  return conf;
}
function catDir(conf) {
  return path.join(DS_DIR, conf.dir);
}
function catSubdirs(conf) {
  return conf.subdirs || [...new Set(Object.values(conf.subByExt))];
}
async function readCatalog(conf) {
  return (await readJsonSafe(path.join(catDir(conf), 'catalog.json'))) || {};
}
async function writeCatalog(conf, data) {
  await writeJson(path.join(catDir(conf), 'catalog.json'), data);
}

/** Восстанавливает исходное имя загрузки из latin1 и URL-кодирования браузера. */
function decodeUploadName(value) {
  let name = Buffer.from(String(value || ''), 'latin1').toString('utf8');
  if (/%[0-9a-f]{2}/i.test(name)) {
    try { name = decodeURIComponent(name); } catch {}
  }
  return name;
}

async function listAssetItems(conf) {
  const base = catDir(conf);
  const catalog = await readCatalog(conf);
  const items = [];
  for (const sub of catSubdirs(conf)) {
    let files = [];
    try {
      files = await fsp.readdir(path.join(base, sub));
    } catch {
      continue;
    }
    for (const f of files) {
      if (f === '.gitkeep' || f === 'catalog.json') continue;
      let st;
      try {
        st = await fsp.stat(path.join(base, sub, f));
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const rel = sub + '/' + f;
      const meta = catalog[rel] || {};
      items.push({
        file: rel,
        sub,
        name: f,
        size: st.size,
        mtime: st.mtimeMs,
        url: '/files/design-system/' + conf.dir + '/' + rel,
        description: meta.description || '',
        usage: meta.usage || '',
      });
    }
  }
  items.sort((a, b) => a.file.localeCompare(b.file));
  return items;
}

app.get('/api/assets/:cat', async (req, res) => {
  const conf = catConf(req, res);
  if (!conf) return;
  const items = await listAssetItems(conf);
  res.json({ items, subdirs: catSubdirs(conf) });
});

app.post('/api/assets/:cat/upload', upload.array('files'), async (req, res) => {
  const conf = catConf(req, res);
  if (!conf) return;
  const saved = [];
  const errors = [];
  for (const f of req.files || []) {
    // multer отдаёт originalname в latin1 — чиним кириллицу
    const original = decodeUploadName(f.originalname);
    const name = safeName(original);
    const ext = path.extname(name).toLowerCase();
    let sub;
    if (conf.subdirs) {
      sub = req.body.sub || conf.subdirs[0];
      if (!conf.subdirs.includes(sub)) {
        errors.push({ file: original, error: 'Неизвестная подпапка: ' + sub });
        continue;
      }
      if (!conf.allowedExt.includes(ext)) {
        errors.push({ file: original, error: 'Недопустимый формат: ' + (ext || 'без расширения') });
        continue;
      }
    } else {
      sub = conf.subByExt[ext];
      if (!sub) {
        errors.push({ file: original, error: 'Недопустимый формат: ' + (ext || 'без расширения') });
        continue;
      }
    }
    if (!name || name === ext) {
      errors.push({ file: original, error: 'Пустое имя файла после очистки' });
      continue;
    }
    try {
      const dir = path.join(catDir(conf), sub);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, name), f.buffer);
      saved.push(sub + '/' + name);
    } catch (e) {
      errors.push({ file: original, error: String(e.message || e) });
    }
  }
  res.json({ saved, errors });
});

app.patch('/api/assets/:cat/meta', async (req, res) => {
  const conf = catConf(req, res);
  if (!conf) return;
  const { file, description, usage } = req.body || {};
  if (!isSafeRelPath(file)) return res.status(400).json({ error: 'Некорректный путь файла' });
  const catalog = await readCatalog(conf);
  catalog[file] = { description: description || '', usage: usage || '' };
  await writeCatalog(conf, catalog);
  res.json({ ok: true });
});

app.delete('/api/assets/:cat', async (req, res) => {
  const conf = catConf(req, res);
  if (!conf) return;
  const file = req.query.file;
  if (!isSafeRelPath(file)) return res.status(400).json({ error: 'Некорректный путь файла' });
  try {
    await fsp.unlink(path.join(catDir(conf), file));
  } catch (e) {
    return res.status(404).json({ error: 'Файл не найден' });
  }
  const catalog = await readCatalog(conf);
  delete catalog[file];
  await writeCatalog(conf, catalog);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- rules (md)

const RULE_FILES = {
  grid: { path: 'design-system/tokens/grid.md', title: 'Сетка слайда' },
  'presentation-rules': { path: 'rules/presentation-rules.md', title: 'Структура презентации' },
  'slide-layouts': { path: 'rules/slide-layouts.md', title: 'Библиотека макетов' },
  'style-guide': { path: 'rules/style-guide.md', title: 'Стиль и дизайн' },
  'designer-reasoning': { path: 'rules/designer-reasoning.md', title: 'Мышление дизайнера' },
  'content-rules': { path: 'rules/content-rules.md', title: 'Правила текста' },
  'logo-rules': { path: 'design-system/logo/LOGO-RULES.md', title: 'Логотип — правила' },
  'icons-rules': { path: 'design-system/icons/ICONS-RULES.md', title: 'Иконки — правила' },
  'fonts-rules': { path: 'design-system/fonts/FONTS-RULES.md', title: 'Шрифты — правила' },
  'photos-rules': { path: 'design-system/photos/PHOTOS-RULES.md', title: 'Фото — правила' },
  'patterns-rules': { path: 'design-system/patterns/PATTERNS-RULES.md', title: 'Паттерны — правила' },
  'mockups-rules': { path: 'design-system/mockups/MOCKUPS-RULES.md', title: 'Мокапы — правила' },
};

app.get('/api/rules', (req, res) => {
  res.json(
    Object.entries(RULE_FILES).map(([id, r]) => ({ id, title: r.title, path: r.path }))
  );
});

app.get('/api/rules/:id', async (req, res) => {
  const rule = RULE_FILES[req.params.id];
  if (!rule) return res.status(404).json({ error: 'Неизвестный файл правил' });
  try {
    const content = await fsp.readFile(path.join(ROOT, rule.path), 'utf8');
    res.json({ id: req.params.id, title: rule.title, path: rule.path, content });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/rules/:id', async (req, res) => {
  const rule = RULE_FILES[req.params.id];
  if (!rule) return res.status(404).json({ error: 'Неизвестный файл правил' });
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'Нет content' });
  try {
    await fsp.writeFile(path.join(ROOT, rule.path), req.body.content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------------------------------------------------------------- presentations

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

app.get('/api/presentations', async (req, res) => {
  const inputs = [];
  const outputs = [];
  try {
    for (const f of await fsp.readdir(path.join(ROOT, 'input'))) {
      if (!f.endsWith('.md')) continue;
      const st = await fsp.stat(path.join(ROOT, 'input', f));
      inputs.push({ name: f.replace(/\.md$/, ''), mtime: st.mtimeMs });
    }
  } catch {}
  try {
    for (const d of await fsp.readdir(path.join(ROOT, 'output'))) {
      const full = path.join(ROOT, 'output', d);
      const st = await fsp.stat(full);
      if (!st.isDirectory()) continue;
      let hasIndex = false;
      try {
        await fsp.access(path.join(full, 'index.html'));
        hasIndex = true;
      } catch {}
      outputs.push({ name: d, hasIndex });
    }
  } catch {}
  inputs.sort((a, b) => b.mtime - a.mtime);
  res.json({ inputs, outputs });
});

app.get('/api/presentations/:name', async (req, res) => {
  if (!NAME_RE.test(req.params.name)) return res.status(400).json({ error: 'Некорректное имя' });
  try {
    const content = await fsp.readFile(path.join(ROOT, 'input', req.params.name + '.md'), 'utf8');
    res.json({ name: req.params.name, content });
  } catch {
    res.status(404).json({ error: 'Файл не найден' });
  }
});

app.post('/api/presentations', async (req, res) => {
  const { name, content } = req.body || {};
  if (!NAME_RE.test(name || '')) {
    return res.status(400).json({ error: 'Имя: латиница, цифры, дефисы, без пробелов' });
  }
  const file = path.join(ROOT, 'input', name + '.md');
  if (fs.existsSync(file)) return res.status(409).json({ error: 'Такая презентация уже есть' });
  await fsp.writeFile(file, content || '', 'utf8');
  res.json({ ok: true, name });
});

app.put('/api/presentations/:name', async (req, res) => {
  if (!NAME_RE.test(req.params.name)) return res.status(400).json({ error: 'Некорректное имя' });
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'Нет content' });
  await fsp.writeFile(path.join(ROOT, 'input', req.params.name + '.md'), req.body.content, 'utf8');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- engine workspace

const ENGINE_LAYOUTS_DIR = path.join(DS_DIR, 'canon', 'layouts');
const ENGINE_LAYOUT_NAMES = {
  cover: 'Обложка',
  final: 'Финал',
  statement: 'Ключевая мысль',
  'section-divider': 'Раздел',
  'title-bullets': 'Текст и тезисы',
  intro: 'Введение',
  'numbered-cards-3': 'Три шага',
  'pain-solution': 'Проблема и решение',
  'benefits-grid': 'Сетка преимуществ',
  'principle-detail': 'Детали принципа',
};

async function engineLayoutCatalog() {
  let files = [];
  try {
    files = await fsp.readdir(ENGINE_LAYOUTS_DIR);
  } catch {}
  const groups = new Map();
  for (const file of files.sort()) {
    if (!/\.(?:png|jpe?g|webp)$/i.test(file)) continue;
    const stem = file.replace(/\.[^.]+$/, '');
    const id = stem.replace(/\.var-\d+$/, '');
    const variantMatch = stem.match(/\.var-(\d+)$/);
    if (!groups.has(id)) groups.set(id, {
      id,
      label: ENGINE_LAYOUT_NAMES[id] || id,
      variants: [],
    });
    groups.get(id).variants.push({
      id: file,
      label: variantMatch ? 'Вариант ' + variantMatch[1] : 'Основной',
      url: '/files/design-system/canon/layouts/' + encodeURIComponent(file),
    });
  }
  return [...groups.values()];
}

function engineReferenceCatalog() {
  return parseLibraryCatalog();
}

function normalizeCanonReference(value) {
  const reference = String(value || '').replace(/\\/g, '/').trim();
  if (/^[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(reference)) return 'layouts/' + reference;
  if (/^(?:layouts|decks\/library)\/[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(reference)) return reference;
  return '';
}

async function canonReferenceExists(value) {
  const reference = normalizeCanonReference(value);
  if (!reference) return '';
  try {
    await fsp.access(path.join(DS_DIR, 'canon', ...reference.split('/')));
    return reference;
  } catch {
    return '';
  }
}

function splitDeckSource(source) {
  const clean = String(source || '').replace(/^\uFEFF/, '');
  const fm = {};
  let frontmatter = '';
  let body = clean;
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) {
    frontmatter = match[0].trimEnd();
    for (const line of match[1].split(/\r?\n/)) {
      const part = line.match(/^([\w-]+):\s*(.*)$/);
      if (part) fm[part[1]] = part[2].trim();
    }
    body = clean.slice(match[0].length);
  }
  const blocks = body
    .split(/\r?\n---\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  return { fm, frontmatter, blocks };
}

function parseEngineSlide(block, index) {
  const slide = {
    index,
    title: '',
    layout: '',
    layoutExplicit: false,
    variant: '',
    reference: '',
    semanticRole: '',
    lead: '',
    summary: '',
    image: '',
    threeD: '',
    threeDPosition: 'right',
    threeDMode: 'auto',
    threeDCard: 0,
    bullets: 0,
    sections: 0,
    bulletItems: [],
    sectionItems: [],
    paragraphs: [],
  };
  const lead = [];
  const content = [];
  let currentSection = null;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^#\s+(.*)$/))) slide.title = m[1].trim();
    else if ((m = line.match(/^##\s+(.*)$/))) {
      slide.sections += 1;
      currentSection = { title: m[1].trim(), paragraphs: [], bullets: [] };
      slide.sectionItems.push(currentSection);
    }
    else if ((m = line.match(/^\[([\w-]+):\s*([^\]]*)\]$/))) {
      const key = m[1];
      const value = m[2].trim();
      if (key === 'layout') { slide.layout = value; slide.layoutExplicit = true; }
      else if (key === 'variant') slide.variant = value;
      else if (key === 'reference') slide.reference = value;
      else if (key === 'semantic-role') slide.semanticRole = value;
      else if (key === 'image') slide.image = value;
      else if (key === '3d') slide.threeD = value;
      else if (key === '3d-pos') slide.threeDPosition = value || 'right';
      else if (key === '3d-mode') slide.threeDMode = value || 'auto';
      else if (key === '3d-card') slide.threeDCard = Number(value) || 0;
    } else if ((m = line.match(/^>\s?(.*)$/))) lead.push(m[1].trim());
    else if (/^[-*]\s+/.test(line)) {
      slide.bullets += 1;
      const item = line.replace(/^[-*]\s+/, '');
      if (currentSection) currentSection.bullets.push(item);
      else slide.bulletItems.push(item);
      content.push(item);
    } else if (line && !/^---$/.test(line)) {
      if (currentSection) currentSection.paragraphs.push(line);
      else slide.paragraphs.push(line);
      content.push(line);
    }
  }
  slide.lead = lead.join(' ');
  slide.summary = slide.lead || content[0] || '';
  slide.searchText = [slide.title, slide.lead, ...content].filter(Boolean).join(' ');
  if (!slide.layout) {
    if (index === 0) slide.layout = 'cover';
    else if (slide.sections === 3) slide.layout = 'numbered-cards-3';
    else slide.layout = 'title-bullets';
  }
  return slide;
}

function enginePlan(name, source) {
  const parsed = splitDeckSource(source);
  return {
    name,
    title: parsed.fm.title || name,
    subtitle: parsed.fm.subtitle || '',
    slides: parsed.blocks.map(parseEngineSlide),
  };
}

function updateSlideMetadata(block, changes) {
  const lines = block.split(/\r?\n/);
  const sectionAt = lines.findIndex((line) => /^##\s+/.test(line.trim()));
  const topEnd = sectionAt < 0 ? lines.length : sectionAt;
  const existing = {};
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = i < topEnd && lines[i].trim().match(/^\[([\w-]+):\s*([^\]]*)\]$/);
    if (m && Object.prototype.hasOwnProperty.call(changes, m[1])) {
      existing[m[1]] = m[2].trim();
      continue;
    }
    kept.push(lines[i]);
  }
  const values = { ...existing, ...changes };
  const order = ['layout', 'reference', 'variant', 'semantic-role', 'image', '3d', '3d-mode', '3d-card', '3d-pos'];
  const meta = order
    .filter((key) => Object.prototype.hasOwnProperty.call(values, key) && values[key])
    .map((key) => '[' + key + ': ' + values[key] + ']');
  const titleAt = kept.findIndex((line) => /^#\s+/.test(line.trim()));
  kept.splice(titleAt < 0 ? 0 : titleAt + 1, 0, ...meta);
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function runNodeScript(script, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT,
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else resolve({ stdout, stderr });
    });
  });
}

app.get('/api/engine/catalog', async (req, res) => {
  try {
    const [layouts, photos, mockups] = await Promise.all([
      engineLayoutCatalog(),
      listAssetItems(ASSET_CATEGORIES.photos),
      listAssetItems(ASSET_CATEGORIES.mockups),
    ]);
    const references = engineReferenceCatalog();
    const asset = (item, category, kind, prefix) => ({
      ...item,
      category,
      kind,
      source: prefix + '/' + item.file,
    });
    res.json({
      layouts,
      references,
      referenceRoles: Object.entries(ENGINE_ROLE_LABELS).map(([id, label]) => ({
        id,
        label,
        count: references.filter((item) => item.role === id).length,
      })).filter((item) => item.count),
      assets: {
        photos: photos.filter((item) => item.sub === 'people').map((item) => asset(item, 'photos', 'image', 'photos')),
        threeD: photos.filter((item) => item.sub === '3d').map((item) => asset(item, 'threeD', '3d', 'photos')),
        mockups: mockups.map((item) => asset(item, 'mockups', 'image', 'mockups')),
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/engine/plan/:name', async (req, res) => {
  if (!NAME_RE.test(req.params.name)) return res.status(400).json({ error: 'Некорректное имя' });
  try {
    const source = await fsp.readFile(path.join(ROOT, 'input', req.params.name + '.md'), 'utf8');
    res.json(enginePlan(req.params.name, source));
  } catch {
    res.status(404).json({ error: 'Файл не найден' });
  }
});

app.get('/api/review/:name', async (req, res) => {
  const name = req.params.name;
  if (!NAME_RE.test(name)) return res.status(400).json({ error: 'Некорректное имя' });
  try {
    const source = await fsp.readFile(path.join(ROOT, 'input', name + '.md'), 'utf8');
    const sourcePlan = enginePlan(name, source);
    const outputDir = path.join(ROOT, 'output', name);
    let deckPlan = null;
    try { deckPlan = await readJsonSafe(path.join(outputDir, 'deck-plan.json')); } catch {}

    const shots = new Map();
    try {
      for (const file of await fsp.readdir(path.join(outputDir, 'screenshots'))) {
        const m = file.match(/^slide-(\d+)\.(?:png|jpe?g|webp)$/i);
        if (!m) continue;
        const st = await fsp.stat(path.join(outputDir, 'screenshots', file));
        shots.set(Number(m[1]), {
          file,
          mtime: st.mtimeMs,
          url: '/files/output/' + name + '/screenshots/' + file + '?v=' + Math.round(st.mtimeMs),
        });
      }
    } catch {}

    let hasOutput = false;
    try { await fsp.access(path.join(outputDir, 'index.html')); hasOutput = true; } catch {}
    const plannedSlides = deckPlan && Array.isArray(deckPlan.slides) ? deckPlan.slides : [];
    const referenceLibrary = engineReferenceCatalog();
    const visualAssetLibrary = parseVisualAssets();
    const total = Math.max(sourcePlan.slides.length, plannedSlides.length, ...shots.keys(), 0);
    const slides = [];
    const recentCompositions = [];
    const recentLayouts = [];
    const recentReferences = [];
    for (let i = 0; i < total; i += 1) {
      const sourceSlide = sourcePlan.slides[i] || {};
      const planned = plannedSlides[i] || {};
      const shot = shots.get(i + 1) || null;
      const isSyntheticFinal = i >= sourcePlan.slides.length && i === total - 1;
      const intelligenceSlide = {
        ...sourceSlide,
        bullets: sourceSlide.bulletItems || [],
        sections: sourceSlide.sectionItems || [],
        paragraphs: sourceSlide.paragraphs || [],
      };
      const semantic = recommendReferences(
        isSyntheticFinal ? { ...intelligenceSlide, layout: 'final', title: 'Финальный слайд' } : intelligenceSlide,
        i,
        total,
        { library: referenceLibrary, limit: 12, recentCompositions, recentLayouts, recentReferences }
      );
      const plannedReference = planned.canonReference || sourceSlide.reference || '';
      const bestReference = semantic.references[0] || null;
      const visual = recommendVisualAssets(intelligenceSlide, i, total, {
        analysis: semantic.analysis,
        assets: visualAssetLibrary,
        limit: 6,
      });
      const visualSuggestions = visual.suggestions.map((asset) => ({
        ...asset,
        placement: recommendVisualPlacement(intelligenceSlide, i, total, {
          analysis: semantic.analysis,
          asset,
        }),
      })).sort((a, b) => Number(Boolean(a.placement.rejected)) - Number(Boolean(b.placement.rejected)) || b.score - a.score);
      const selectedThreeD = sourceSlide.threeD
        ? visualAssetLibrary.find((asset) => asset.source === sourceSlide.threeD)
        : null;
      const selectedVisualPlacement = selectedThreeD
        ? recommendVisualPlacement(intelligenceSlide, i, total, { analysis: semantic.analysis, asset: selectedThreeD })
        : null;
      const resolvedComposition = planned.compositionFamily || (bestReference && bestReference.composition) || 'editorial';
      const resolvedLayout = planned.layout || sourceSlide.layout || semantic.analysis.renderLayout || (isSyntheticFinal ? 'final' : 'title-bullets');
      if (bestReference) {
        recentCompositions.unshift(bestReference.composition);
        recentLayouts.unshift(semantic.analysis.renderLayout);
        recentReferences.unshift(bestReference.source);
        recentCompositions.splice(4);
        recentLayouts.splice(4);
        recentReferences.splice(8);
      }
      slides.push({
        index: i,
        number: i + 1,
        title: planned.title || sourceSlide.title || (isSyntheticFinal ? 'Финальный слайд' : 'Слайд ' + (i + 1)),
        purpose: planned.purpose || '',
        claim: planned.claim || sourceSlide.summary || '',
        rationale: planned.rationale || '',
        semanticRole: planned.semanticRole || sourceSlide.semanticRole || semantic.analysis.role,
        semanticRoleLabel: ENGINE_ROLE_LABELS[planned.semanticRole || sourceSlide.semanticRole || semantic.analysis.role] || semantic.analysis.roleLabel,
        compositionFamily: resolvedComposition,
        layout: resolvedLayout,
        silhouetteId: planned.silhouetteId || [resolvedLayout, resolvedComposition, sourceSlide.image ? 'photo' : (sourceSlide.threeD ? '3d' : semantic.analysis.media)].join(':'),
        variant: planned.canonVariant || sourceSlide.variant || '',
        reference: plannedReference,
        referenceNodeId: planned.figmaNodeId || '',
        recommendations: semantic.references,
        compositionBrief: {
          contentFill: semantic.analysis.contentFill,
          spaceStrategy: semantic.analysis.spaceStrategy,
          recommendedVisualShare: semantic.analysis.recommendedVisualShare,
        },
        visualRequirement: visual.required ? 'required' : 'intentional-exception',
        assetGap: visual.assetGap,
        visualSuggestions,
        image: sourceSlide.image || '',
        threeD: sourceSlide.threeD || '',
        threeDPosition: sourceSlide.threeDPosition || 'right',
        threeDMode: sourceSlide.threeDMode || 'auto',
        threeDCard: sourceSlide.threeDCard || 0,
        selectedVisualPlacement,
        assets: Array.isArray(planned.assets) ? planned.assets : [],
        screenshotUrl: shot ? shot.url : '',
        screenshotMtime: shot ? shot.mtime : 0,
      });
    }
    res.json({
      name,
      title: sourcePlan.title,
      subtitle: sourcePlan.subtitle,
      audience: deckPlan && deckPlan.audience ? deckPlan.audience : '',
      communicationJob: deckPlan && deckPlan.communicationJob ? deckPlan.communicationJob : '',
      narrativeArc: deckPlan && deckPlan.narrativeArc ? deckPlan.narrativeArc : '',
      hasOutput,
      outputUrl: hasOutput ? '/files/output/' + name + '/index.html' : '',
      slides,
    });
  } catch (e) {
    res.status(404).json({ error: 'Презентация не найдена: ' + String(e.message || e) });
  }
});

app.patch('/api/engine/plan/:name/slides/:index', async (req, res) => {
  const { name, index } = req.params;
  if (!NAME_RE.test(name)) return res.status(400).json({ error: 'Некорректное имя' });
  const slideIndex = Number(index);
  if (!Number.isInteger(slideIndex) || slideIndex < 0) return res.status(400).json({ error: 'Некорректный номер слайда' });
  try {
    const file = path.join(ROOT, 'input', name + '.md');
    const source = await fsp.readFile(file, 'utf8');
    const parsed = splitDeckSource(source);
    if (!parsed.blocks[slideIndex]) return res.status(404).json({ error: 'Слайд не найден' });

    const changes = {};
    if (typeof req.body.layout === 'string') {
      const allowed = new Set((await engineLayoutCatalog()).map((item) => item.id));
      if (!allowed.has(req.body.layout)) return res.status(400).json({ error: 'Неизвестный макет' });
      changes.layout = req.body.layout;
    }
    if (typeof req.body.variant === 'string') {
      if (!/^[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(req.body.variant)) {
        return res.status(400).json({ error: 'Некорректный вариант макета' });
      }
      try { await fsp.access(path.join(ENGINE_LAYOUTS_DIR, req.body.variant)); }
      catch { return res.status(404).json({ error: 'Вариант макета не найден' }); }
      changes.variant = req.body.variant;
    }
    if (typeof req.body.reference === 'string') {
      const reference = await canonReferenceExists(req.body.reference);
      if (!reference) return res.status(404).json({ error: 'Канонический референс не найден' });
      changes.reference = reference;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'asset')) {
      changes.image = '';
      changes['3d'] = '';
      changes['3d-mode'] = '';
      changes['3d-card'] = '';
      changes['3d-pos'] = '';
      if (req.body.asset) {
        const { kind, source: assetSource, position } = req.body.asset;
        if (
          !['image', '3d'].includes(kind) ||
          typeof assetSource !== 'string' ||
          !/^(?:photos|mockups)\/[a-zA-Z0-9._/-]+$/.test(assetSource) ||
          assetSource.includes('..')
        ) {
          return res.status(400).json({ error: 'Некорректный ассет' });
        }
        try { await fsp.access(path.join(DS_DIR, assetSource)); }
        catch { return res.status(404).json({ error: 'Ассет не найден' }); }
        changes[kind] = assetSource;
        if (kind === '3d') {
          changes['3d-mode'] = 'auto';
          changes['3d-pos'] = ['left', 'right'].includes(position) ? position : 'right';
        }
      }
    }
    if (typeof req.body.threeDPosition === 'string') {
      if (!['left', 'right'].includes(req.body.threeDPosition)) {
        return res.status(400).json({ error: 'Некорректная позиция 3D' });
      }
      changes['3d-pos'] = req.body.threeDPosition;
    }
    if (typeof req.body.threeDMode === 'string') {
      if (!['auto', 'card', 'slide'].includes(req.body.threeDMode)) {
        return res.status(400).json({ error: 'Некорректный режим 3D' });
      }
      changes['3d-mode'] = req.body.threeDMode;
    }
    if (req.body.threeDCard !== undefined) {
      const card = Number(req.body.threeDCard);
      if (!Number.isInteger(card) || card < 0 || card > 12) {
        return res.status(400).json({ error: 'Некорректный номер карточки для 3D' });
      }
      changes['3d-card'] = card ? String(card) : '';
    }

    parsed.blocks[slideIndex] = updateSlideMetadata(parsed.blocks[slideIndex], changes);
    const nextSource = (parsed.frontmatter ? parsed.frontmatter + '\n\n' : '') + parsed.blocks.join('\n\n---\n\n') + '\n';
    await fsp.writeFile(file, nextSource, 'utf8');
    res.json(enginePlan(name, nextSource));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/presentations/:name/build', async (req, res) => {
  if (!NAME_RE.test(req.params.name)) return res.status(400).json({ error: 'Некорректное имя' });
  try {
    const args = [req.params.name];
    if (req.body && req.body.strict) args.push('--strict');
    const result = await runNodeScript(path.join('scripts', 'build.js'), args);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    res.json({
      ok: true,
      dir: 'output/' + req.params.name,
      url: '/files/output/' + req.params.name + '/index.html',
      warnings: /Предупреждения/.test(output),
      output,
    });
  } catch (e) {
    const detail = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
    res.status(500).json({ error: detail || String(e.message || e) });
  }
});

// ---------------------------------------------------------------- prompt (заявки на презентацию)

const REQUESTS_DIR = path.join(ROOT, 'input', 'requests');

app.post('/api/prompt', upload.array('files'), async (req, res) => {
  const text = ((req.body && req.body.text) || '').trim();
  const uploaded = req.files || [];
  if (!text && !uploaded.length) return res.status(400).json({ error: 'Напиши промт или приложи файл' });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dir = path.join(REQUESTS_DIR, stamp);
  try {
    await fsp.mkdir(dir, { recursive: true });
    const files = [];
    if (text) {
      await fsp.writeFile(path.join(dir, 'prompt.md'), text + '\n', 'utf8');
      files.push('prompt.md');
    }
    for (const f of uploaded) {
      const original = decodeUploadName(f.originalname);
      const name = safeName(original) || 'attachment';
      await fsp.writeFile(path.join(dir, name), f.buffer);
      files.push(name);
    }
    res.json({ ok: true, dir: 'input/requests/' + stamp, files });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/prompt/requests', async (req, res) => {
  const out = [];
  try {
    for (const d of await fsp.readdir(REQUESTS_DIR)) {
      const full = path.join(REQUESTS_DIR, d);
      try {
        if (!(await fsp.stat(full)).isDirectory()) continue;
        out.push({ name: d, files: (await fsp.readdir(full)).filter((f) => f !== '.gitkeep') });
      } catch {}
    }
  } catch {}
  out.sort((a, b) => b.name.localeCompare(a.name));
  res.json(out.slice(0, 10));
});

// ---------------------------------------------------------------- chats (история диалогов)

const CHATS_DIR = path.join(__dirname, 'data', 'chats');
const CHAT_ID_RE = /^[a-z0-9]+$/;

app.get('/api/chats', async (req, res) => {
  const out = [];
  try {
    for (const f of await fsp.readdir(CHATS_DIR)) {
      if (!f.endsWith('.json')) continue;
      const data = await readJsonSafe(path.join(CHATS_DIR, f));
      if (data && data.id) out.push({ id: data.id, title: data.title || 'Без названия', updated: data.updated || 0 });
    }
  } catch {}
  out.sort((a, b) => b.updated - a.updated);
  res.json(out);
});

app.post('/api/chats', async (req, res) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const title = String((req.body && req.body.title) || 'Без названия').slice(0, 80);
  const data = { id, title, session: null, items: [], created: Date.now(), updated: Date.now() };
  try {
    await writeJson(path.join(CHATS_DIR, id + '.json'), data);
    res.json({ id, title });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/chats/:id', async (req, res) => {
  if (!CHAT_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Некорректный id' });
  const data = await readJsonSafe(path.join(CHATS_DIR, req.params.id + '.json'));
  if (!data) return res.status(404).json({ error: 'Чат не найден' });
  res.json(data);
});

app.put('/api/chats/:id', async (req, res) => {
  if (!CHAT_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Некорректный id' });
  const file = path.join(CHATS_DIR, req.params.id + '.json');
  const data = (await readJsonSafe(file)) || { id: req.params.id, created: Date.now() };
  const b = req.body || {};
  if (typeof b.title === 'string') data.title = b.title.slice(0, 80);
  if (b.session !== undefined) data.session = b.session;
  if (Array.isArray(b.items)) data.items = b.items;
  data.updated = Date.now();
  try {
    await writeJson(file, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/chats/:id', async (req, res) => {
  if (!CHAT_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Некорректный id' });
  try {
    await fsp.unlink(path.join(CHATS_DIR, req.params.id + '.json'));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Чат не найден' });
  }
});

// ---------------------------------------------------------------- экспорт презентации в PDF

const DECK_NAME_RE = /^[a-zA-Z0-9_-]+$/;

app.post('/api/export-pdf/:name', async (req, res) => {
  const name = req.params.name;
  if (!DECK_NAME_RE.test(name)) return res.status(400).json({ error: 'Некорректное имя презентации' });
  try {
    await fsp.access(path.join(ROOT, 'output', name, 'index.html'));
  } catch {
    return res.status(404).json({ error: 'Презентация не собрана' });
  }
  try {
    await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(ROOT, 'scripts', 'export-pdf.js'), name],
        { cwd: ROOT, timeout: 180000 },
        (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim().split('\n').pop())) : resolve(stdout))
      );
    });
    res.json({ url: '/files/output/' + name + '/' + name + '.pdf', file: name + '.pdf' });
  } catch (e) {
    res.status(500).json({ error: 'Не удалось собрать PDF: ' + e.message });
  }
});

// ---------------------------------------------------------------- профиль пользователя

const PROFILE_FILE = path.join(__dirname, 'data', 'profile.json');
const PROFILE_MEDIA = path.join(__dirname, 'data', 'profile'); // аватар и обои
app.use('/files/profile', express.static(PROFILE_MEDIA));

// level (уровень доступа) правится только системно — прямо в app/data/profile.json;
// через API он неизменяем, поэтому в PUT не читается.
const DEFAULT_PROFILE = { name: '', role: '', level: 'Разработчик', avatar: '', wallpaper: '' };

/** Реальный счётчик: собранные презентации в output/ (папка с index.html). */
async function countDecks() {
  let n = 0;
  try {
    for (const d of await fsp.readdir(path.join(ROOT, 'output'), { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      try {
        await fsp.access(path.join(ROOT, 'output', d.name, 'index.html'));
        n++;
      } catch {}
    }
  } catch {}
  return n;
}

app.get('/api/profile', async (req, res) => {
  const saved = (await readJsonSafe(PROFILE_FILE)) || {};
  res.json({ ...DEFAULT_PROFILE, ...saved, decks: await countDecks() });
});

app.put('/api/profile', async (req, res) => {
  const saved = (await readJsonSafe(PROFILE_FILE)) || {};
  const next = { ...DEFAULT_PROFILE, ...saved };
  const b = req.body || {};
  if (typeof b.name === 'string') next.name = b.name.trim().slice(0, 120);
  if (typeof b.role === 'string') next.role = b.role.trim().slice(0, 120);
  try {
    await writeJson(PROFILE_FILE, next);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PROFILE_IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

/** Загрузка аватара или обоев: файл кладётся в app/data/profile/<kind>.<ext>. */
app.post('/api/profile/image/:kind', upload.single('file'), async (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'avatar' && kind !== 'wallpaper') return res.status(400).json({ error: 'Неизвестный тип изображения' });
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Файл не приложен' });
  const ext = PROFILE_IMAGE_EXT[f.mimetype];
  if (!ext) return res.status(400).json({ error: 'Нужна картинка: PNG, JPG, WEBP или GIF' });
  try {
    await fsp.mkdir(PROFILE_MEDIA, { recursive: true });
    // старый файл другого формата удаляем, иначе на диске останется мусор
    for (const old of Object.values(PROFILE_IMAGE_EXT)) {
      if (old !== ext) await fsp.rm(path.join(PROFILE_MEDIA, kind + old), { force: true });
    }
    await fsp.writeFile(path.join(PROFILE_MEDIA, kind + ext), f.buffer);
    const saved = (await readJsonSafe(PROFILE_FILE)) || {};
    const next = { ...DEFAULT_PROFILE, ...saved };
    // ?v= — чтобы браузер не показывал старую картинку из кеша
    next[kind] = '/files/profile/' + kind + ext + '?v=' + Date.now();
    await writeJson(PROFILE_FILE, next);
    res.json({ url: next[kind] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------------------------------------------------------------- GPT / Codex (чат фабрики)

require('./agent')(app, ROOT, upload);

// ---------------------------------------------------------------- overview

app.get('/api/overview', async (req, res) => {
  const tokens = {};
  for (const [key, file] of Object.entries(TOKEN_FILES)) {
    const data = await readJsonSafe(path.join(DS_DIR, 'tokens', file));
    let count = 0;
    if (data) for (const group of Object.values(data)) if (group && typeof group === 'object') count += Object.keys(group).filter((k) => !k.startsWith('$')).length;
    tokens[key] = count;
  }
  const assets = {};
  for (const [key, conf] of Object.entries(ASSET_CATEGORIES)) {
    let count = 0;
    for (const sub of catSubdirs(conf)) {
      try {
        count += (await fsp.readdir(path.join(catDir(conf), sub))).filter(
          (f) => f !== '.gitkeep' && f !== 'catalog.json'
        ).length;
      } catch {}
    }
    assets[key] = count;
  }
  const rules = {};
  for (const [id, rule] of Object.entries(RULE_FILES)) {
    try {
      const content = await fsp.readFile(path.join(ROOT, rule.path), 'utf8');
      rules[id] = !content.includes('<!-- TODO');
    } catch {
      rules[id] = false;
    }
  }
  let inputs = 0;
  try {
    inputs = (await fsp.readdir(path.join(ROOT, 'input'))).filter((f) => f.endsWith('.md')).length;
  } catch {}
  res.json({ tokens, assets, rules, inputs });
});

// ---------------------------------------------------------------- start

app.listen(PORT, '127.0.0.1', () => {
  console.log('Фабрика презентаций: http://localhost:' + PORT);
  console.log('Проект: ' + ROOT);
});
