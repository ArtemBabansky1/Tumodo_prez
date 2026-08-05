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

app.get('/api/assets/:cat', async (req, res) => {
  const conf = catConf(req, res);
  if (!conf) return;
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
  res.json({ items, subdirs: catSubdirs(conf) });
});

app.post('/api/assets/:cat/upload', upload.array('files'), async (req, res) => {
  const conf = catConf(req, res);
  if (!conf) return;
  const saved = [];
  const errors = [];
  for (const f of req.files || []) {
    // multer отдаёт originalname в latin1 — чиним кириллицу
    const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
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

app.post('/api/presentations/:name/build', (req, res) => {
  res.status(501).json({
    error: 'Движок сборки будет подключён на этапе 4 (scripts/build). Пока запускай сборку через Claude Code: /build ' + req.params.name,
  });
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
      const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
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

// ---------------------------------------------------------------- Claude Code (чат фабрики)

require('./claude')(app, ROOT, upload);

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
