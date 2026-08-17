/**
 * Интеграция с Codex: приложение запускает GPT-агента в headless-режиме
 * (codex exec --json) в корне проекта и транслирует события
 * (рассуждения, действия с файлами, текст, результат) в браузер через SSE.
 * Диалог продолжается через codex exec resume <session-id>.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn } = require('child_process');

/** Кандидаты на исполняемый файл Codex. Сначала — комплект текущего desktop-приложения. */
function resolveCodexBin() {
  const home = os.homedir();
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = [
    path.join(home, '.codex', 'plugins', '.plugin-appserver', exe),
    path.join(home, '.local', 'bin', exe),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return exe; // поиск по PATH
}

const CODEX_BIN = resolveCodexBin();
const SESSION_PREFIX = 'codex:';

/** Desktop/служебный запуск Windows иногда не передаёт HOME, хотя USERPROFILE есть. */
function codexProcessEnv() {
  const env = { ...process.env };
  const profile = env.USERPROFILE || env.HOME || os.homedir();
  env.HOME = profile;
  env.USERPROFILE = profile;
  // Desktop/service launches on Windows sometimes omit CODEX_HOME even when the
  // user is authenticated. Point it at the real profile directory so both the
  // status probe and chat runs see the same login/configuration as Codex Desktop.
  if (!env.CODEX_HOME) env.CODEX_HOME = path.join(profile, '.codex');
  return env;
}

/**
 * `codex login status` only reads credentials, while a real `codex exec` also
 * writes its state database and creates local app-server IPC files. Checking
 * that directory prevents a misleading green status on Windows when the web
 * server itself was started from a read-only sandbox.
 */
function codexHomeWriteError(env) {
  const dir = env.CODEX_HOME || path.join(env.USERPROFILE || os.homedir(), '.codex');
  const probe = path.join(dir, `.tumodo-write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return null;
  } catch (error) {
    try { if (fs.existsSync(probe)) fs.unlinkSync(probe); } catch {}
    return error;
  }
}

function codexExitMessage(code, stderr) {
  if (/failed to initialize in-process app-server client|readonly database|attempt to write a readonly database/i.test(stderr)) {
    return 'GPT не может запуститься: локальный сервер не имеет доступа на запись к папке Codex. Перезапустите сервер проекта вне ограниченной среды.';
  }
  const lastError = stderr.trim().split('\n').pop() || '';
  return 'GPT / Codex завершился без результата (код ' + code + ').' + (lastError ? ' ' + lastError : '');
}

const SYSTEM_APPEND = [
  'Ты работаешь внутри локального веб-приложения «Фабрика презентаций Tumodo»; рабочая директория — корень проекта.',
  'В начале задачи обязательно прочитай CLAUDE.md, rules/agent-workflow.md, rules/designer-reasoning.md, rules/creative-direction.md, rules/figma-export-rules.md и rules/mistakes.md: это контракт движка, дизайн-системы, senior-дизайнерского мышления, креативного направления, переноса в Figma и накопленных штрафных ошибок; он действует и для GPT/Codex.',
  'Пользователь — коллега-непрограммист: отвечай по-русски, коротко и без технического жаргона; твои ответы показываются в чат-панели приложения.',
  'Главный контракт находится в rules/agent-workflow.md. При первой сборке сам определи коммуникационную задачу, роль каждого слайда, макет, конкретный канон и ассеты. Не проси пользователя выбирать дизайн до первой готовой версии.',
  'Полная визуальная память бренда — 126 исходных слайдов Figma в design-system/canon/decks/library/catalog.tsv. Перед deck-plan обязательно запусти `node scripts/recommend-design.js <имя>` и затем сам выбери лучший референс по смыслу, плотности и ритму всей колоды; десять файлов в canon/layouts — только базовые HTML-семейства, а не вся дизайн-система.',
  'Перед recommend-design обязательно запусти `node scripts/creative-director.js <имя>` и прочитай output/<имя>/creative-directions.json. Если пользователь выбрал направление на платформе, поле selected обязательно; иначе для первой версии используй recommended. Креативность меняет масштаб, кроп, асимметрию, глубину и ритм только через разрешённые приёмы design-system/creative-system.json и никогда не вводит новые цвета, шрифты, компоненты или внешний визуальный язык.',
  'GPT Image допустим только для черновых styleframes ключевых слайдов: он ищет композицию по указанным канонам и ассетам платформы, но не рисует финальный текст или данные. Styleframe не вставляется в презентацию целиком. Любой новый сгенерированный визуал сначала должен быть явно подтверждён пользователем, загружен на платформу и описан; до этого движок его не использует.',
  'Визуальная политика обязательна: фото и/или 3D должны быть минимум на 80% содержательных слайдов; слайд без визуала — осознанное исключение только для разделителя, манифеста или действительно плотной сетки. Используй compositionBrief, placement, assetGap и suggestedAssets из recommend-design, не повторяй один ассет на соседних слайдах и встраивай визуал в композицию так, чтобы он не перекрывал текст. Если assetGap говорит, что подходящего 3D нет, не ставь случайный объект: выбери смысловое фото/мокап или зафиксируй, какой новый фирменный ассет нужен.',
  'Для каждого 3D сначала определи владельца. Если он относится к одной карточке — [3d-mode: card] и [3d-card: N]: объект крупный, в нижнем углу и обрезается clip content карточки. В сетке с единым левым якорем текста карточный 3D ставь справа; left допустим только как осознанное переопределение. Если объект относится ко всему слайду — [3d-mode: slide]: объект крупный, частично за нижней границей, ось только слева или справа от центра; [3d-pos: center] запрещён.',
  'Глобальный 3D запрещён поверх плотных карточных сеток и KPI: если placement возвращает mode none, rejected или requiresLayoutChange, не форсируй ассет — привяжи его к смысловой карточке, выбери другой визуал или другой макет. Текстовая безопасная зона важнее требования добавить 3D.',
  'Фото ставь только в скруглённый контейнер, fill/cover и с прижатием к верху; после скриншота отдельно проверь, что не обрезаны головы, лица, руки и предмет действия.',
  'Все скруглённые контейнеры, карточки, таблицы, плашки, кнопки и фото-контейнеры используют continuous corner smoothing 60%: в HTML обязательны токены --corner-smoothing: 0.6 и corner-shape: squircle, а при переносе в Figma — точное cornerSmoothing = 0.6 (iOS) с полным аудитом. Геометрические круги в HTML сохраняй кругами.',
  'Не заполняй пустоту мелким декором. Если остаётся случайная пустая четверть рабочей области, сначала измени силуэт: увеличь визуал, перераспредели колонки, укрупни акцент или выбери другой канон. Маленький 3D не считается исправлением композиции. Запрещено сжимать белый контейнер вокруг короткого списка: при заполнении ниже 55% обязательно выбери другое семейство; для 3–6 пунктов с фото используй photo-list, где каждой строке назначена смысловая фирменная иконка из ассетов, а не одинаковая точка.',
  'До сборки составь карту silhouetteId всей колоды. Два соседних слайда не могут иметь один макет/силуэт; повтор силуэта дальше по колоде разрешён только как осознанная серия с [sequence-group: ...] и заметным изменением визуальной массы. Для сравнения используй comparison-flow, для 4–6 шагов process-steps, для 2–5 метрик kpi-metrics — не загоняй разный смысл в title-bullets или numbered-cards-3.',
  'Предупреждение сборщика о повторе силуэта, отклонённом 3D, недостающем фото/3D или покрытии ниже 80% означает, что презентация не готова: исправь input, deck-plan и композиции, пересобери и только потом возвращай результат.',
  'Основной сценарий: пользователь описывает презентацию или прикладывает файл с её структурой и контентом. Прочитай все вложения целиком, затем создай input/<имя>.md, output/<имя>/deck-plan.json, собери через `node scripts/build.js <имя>`, обязательно сними и визуально проверь все слайды.',
  'Сохраняй заданные структуру и количество слайдов. Вопрос задавай только при содержательной неоднозначности, меняющей факты, аудиторию или смысл; недостаток дизайнерских указаний решай самостоятельно по дизайн-системе.',
  'После первого рендера сделай два прохода проверки по rules/designer-reasoning.md: сначала фокус, баланс, интеграция визуала, пустота и кроп без оглядки на канон; затем фирменная система и ритм колоды. Кратко сохрани исправление в designReview каждого слайда.',
  'Перед сдачей обязательно выполни strict-сборку, сними все слайды и запусти `node scripts/validate-design.js <имя>`. Любой [ШТРАФ] или penalty означает, что презентация не готова. Особенно проверь единый размер и якорь H1, правый край вводного lead, отсутствие висячих предлогов, заполнение белых контейнеров, лёгкую редакционную матрицу сравнений без стрелок и тяжёлой серой шапки, общие базовые линии KPI, отсутствие бессмысленного декора и непрерывность тёмной главы.',
  'Если выбранный канон не реализован текущим шаблоном, не откатывайся молча к универсальному макету: расширь движок или создай сохраняемое переопределение слайда вне design-system/. Канон — визуальная грамматика, поэтому допустима осмысленная адаптация внутри токенов и сетки, зафиксированная в deliberateDeviation.',
  'Когда презентация собрана или пересобрана, добавь В САМОМ КОНЦЕ финального ответа отдельной строкой: RESULT: output/<имя> — приложение превратит её в ссылку на предпросмотр.',
  'В финальном ответе также добавь отдельную строку TITLE: <название чата>. Название должно кратко передавать тему и назначение презентации, состоять примерно из 2–7 слов и быть понятно человеку в списке чатов. Не повторяй формулировку команды пользователя и не используй служебные слова вроде «сделай», «собери», «вариант» или «новая презентация».',
  'В режиме точечной перегенерации меняй только указанный слайд, сохраняй его смысл и факты, переснимай только его и обновляй запись в deck-plan.json.',
].join(' ');

/** Multer иногда отдаёт UTF-8 как latin1, а браузер — ещё и URL-кодированное имя. */
function decodeUploadName(value) {
  let name = Buffer.from(String(value || ''), 'latin1').toString('utf8');
  if (/%[0-9a-f]{2}/i.test(name)) {
    try { name = decodeURIComponent(name); } catch {}
  }
  return name;
}

module.exports = function mountCodex(app, ROOT, upload) {
  const REQUESTS_DIR = path.join(ROOT, 'input', 'requests');
  const runs = new Map(); // runId -> child process

  function sse(res, event) {
    res.write('data: ' + JSON.stringify(event) + '\n\n');
  }

  function cleanChatTitle(value) {
    return String(value || '')
      .replace(/[`*_"«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function extractChatTitle(text) {
    const match = String(text || '').match(/(?:^|\n)\s*TITLE:\s*([^\n]+)/i);
    return match ? cleanChatTitle(match[1]) : '';
  }

  function titleFromDeckResult(resultDir) {
    const deck = String(resultDir || '').replace(/^output\//, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(deck)) return '';
    try {
      const source = fs.readFileSync(path.join(ROOT, 'input', deck + '.md'), 'utf8');
      const titleMatch = source.match(/^title:\s*(.+)$/mi);
      const subtitleMatch = source.match(/^subtitle:\s*(.+)$/mi);
      const title = titleMatch ? cleanChatTitle(titleMatch[1]) : '';
      const subtitle = subtitleMatch ? cleanChatTitle(subtitleMatch[1]) : '';
      return title && title.split(/\s+/).length === 1 && subtitle ? title + ' — ' + subtitle : title;
    } catch {
      return '';
    }
  }

  /** Короткое человекочитаемое описание вызова инструмента. */
  function toolDetail(name, input) {
    if (!input) return '';
    const rel = (p) => {
      if (typeof p !== 'string') return '';
      const r = path.relative(ROOT, p);
      return r && !r.startsWith('..') ? r.replace(/\\/g, '/') : p;
    };
    switch (name) {
      case 'Read': return rel(input.file_path);
      case 'Write': return rel(input.file_path);
      case 'Edit':
      case 'MultiEdit': return rel(input.file_path);
      case 'Bash': return input.description || (input.command || '').slice(0, 120);
      case 'Glob': return input.pattern || '';
      case 'Grep': return input.pattern || '';
      case 'Skill': return '/' + (input.skill || '') + (input.args ? ' ' + input.args : '');
      case 'Task':
      case 'Agent': return input.description || '';
      case 'TodoWrite': return 'обновляет план';
      case 'WebFetch': return input.url || '';
      default: {
        const first = Object.values(input).find((v) => typeof v === 'string');
        return (first || '').slice(0, 120);
      }
    }
  }

  const TOOL_LABELS = {
    Read: 'Читает', Write: 'Пишет', Edit: 'Правит', MultiEdit: 'Правит',
    Glob: 'Ищет файлы', Grep: 'Ищет в файлах', Bash: 'Выполняет',
    Skill: 'Запускает', Task: 'Запускает агента', Agent: 'Запускает агента',
    TodoWrite: 'Планирует', WebFetch: 'Открывает',
  };

  /** Быстрая проверка для индикатора в UI, без запуска модельного запроса. */
  app.get('/api/agent/status', (req, res) => {
    const env = codexProcessEnv();
    const writeError = codexHomeWriteError(env);
    if (writeError) {
      return res.json({
        provider: 'GPT / Codex',
        ready: false,
        message: 'Нет доступа на запись к папке Codex. Перезапустите локальный сервер вне ограниченной среды.',
      });
    }
    let settled = false;
    let stdout = '';
    let stderr = '';
    const probe = spawn(CODEX_BIN, ['login', 'status'], {
      cwd: ROOT,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (ready, message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.json({ provider: 'GPT / Codex', ready, message });
    };
    const timer = setTimeout(() => {
      try { probe.kill(); } catch {}
      finish(false, 'Codex не ответил на проверку');
    }, 8000);
    probe.stdout.setEncoding('utf8');
    probe.stderr.setEncoding('utf8');
    probe.stdout.on('data', (chunk) => { stdout += chunk; });
    probe.stderr.on('data', (chunk) => { stderr += chunk; });
    probe.on('error', (error) => finish(false, 'Codex не найден: ' + error.message));
    probe.on('close', (code) => {
      const detail = (stdout || stderr).trim();
      finish(code === 0, code === 0 ? 'GPT подключён' : (detail || 'Требуется вход в Codex'));
    });
  });

  app.post('/api/chat', upload.array('files'), async (req, res) => {
    const text = ((req.body && req.body.text) || '').trim();
    const session = ((req.body && req.body.session) || '').trim();
    // Старые UUID относятся к Claude и несовместимы с Codex — начинаем новую GPT-сессию.
    const codexSession = session.startsWith(SESSION_PREFIX) ? session.slice(SESSION_PREFIX.length) : '';
    const mode = ((req.body && req.body.mode) || '').trim();
    const uploaded = req.files || [];
    if (!text && !uploaded.length && mode !== 'slide-refinement' && mode !== 'figma-export') {
      return res.status(400).json({ error: 'Пустое сообщение' });
    }

    // приложенные файлы — в input/requests/<метка>/, пути дописываются к промту
    let prompt = text;
    if (uploaded.length) {
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const dir = path.join(REQUESTS_DIR, stamp);
      await fsp.mkdir(dir, { recursive: true });
      const savedPaths = [];
      for (const f of uploaded) {
        const original = decodeUploadName(f.originalname);
        const name = path.basename(original).replace(/[\\/:*?"<>|]/g, '') || 'attachment';
        await fsp.writeFile(path.join(dir, name), f.buffer);
        savedPaths.push('input/requests/' + stamp + '/' + name);
      }
      prompt += (prompt ? '\n\n' : '') + 'Приложенные файлы:\n' + savedPaths.map((p) => '- ' + p).join('\n');
    }

    let expectedFigmaFrames = 0;
    let expectedFigmaSvgAssets = 0;
    let expectedFigmaProcessCards = 0;
    let expectedFigmaSectionName = '';

    if (mode === 'slide-refinement') {
      const deck = String((req.body && req.body.deck) || '').trim();
      const slide = Number((req.body && req.body.slide) || 0);
      const variant = String((req.body && req.body.variant) || '').trim();
      const requestedReference = String((req.body && req.body.reference) || '').replace(/\\/g, '/').trim();
      const reference = requestedReference || (variant ? 'layouts/' + variant : '');
      const asset = String((req.body && req.body.asset) || '').trim();
      const instruction = String((req.body && req.body.instruction) || '').trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(deck) || !Number.isInteger(slide) || slide < 1) {
        return res.status(400).json({ error: 'Некорректная цель перегенерации' });
      }
      if (!/^(?:layouts|decks\/library)\/[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(reference)) {
        return res.status(400).json({ error: 'Выберите канонический вариант' });
      }
      if (!fs.existsSync(path.join(ROOT, 'design-system', 'canon', ...reference.split('/')))) {
        return res.status(404).json({ error: 'Выбранный канон не найден' });
      }
      if (asset && (asset.includes('..') || !/^(?:photos|mockups)\/[a-zA-Z0-9._/-]+$/.test(asset))) {
        return res.status(400).json({ error: 'Некорректный ассет' });
      }
      prompt = [
        'РЕЖИМ: точечная перегенерация одного слайда.',
        'Презентация: ' + deck + '.',
        'Номер слайда: ' + slide + '.',
        'Текущий скриншот: output/' + deck + '/screenshots/slide-' + String(slide).padStart(2, '0') + '.png.',
        'Выбранный канон: design-system/canon/' + reference + '.',
        asset ? 'Выбранный ассет: design-system/' + asset + '.' : 'Новый ассет не выбран — используй текущий или подбери подходящий из дизайн-системы.',
        instruction ? 'Пожелание пользователя: ' + instruction : 'Пожелание пользователя: сохрани контент, но перестрой композицию в стиле выбранного канона.',
        '',
        'Прочитай rules/agent-workflow.md, текущий input/' + deck + '.md, output/' + deck + '/deck-plan.json при наличии, текущий скриншот и выбранный канон.',
        'Сохрани смысл, факты и текст слайда, если пожелание явно не требует другого. Измени только слайд ' + slide + '; остальные слайды не меняй.',
        'Добейся сходства с каноном по композиции, иерархии, геометрии, визуальному весу и характеру пустоты, а не просто добавь его имя в metadata.',
        'Сохрани точечную вёрстку в input/overrides/' + deck + '/slide-' + String(slide).padStart(2, '0') + '.html и при необходимости .css; общий шаблон и остальные слайды не меняй.',
        'Обнови в input/' + deck + '.md metadata выбранного слайда: layout, reference, semantic-role и выбранный ассет. Если это старый layouts-канон, также сохрани variant.',
        'Пересними только этот слайд командой `node scripts/screenshot.js ' + deck + ' ' + slide + '`, сравни изображения и выполни до трёх итераций.',
        'Обнови для этого слайда semanticRole, compositionFamily, canonReference, figmaNodeId, assets и rationale в output/' + deck + '/deck-plan.json.',
        'В конце ответь коротко и добавь отдельной строкой RESULT: output/' + deck,
      ].join('\n');
    } else if (mode === 'figma-export') {
      const deck = String((req.body && req.body.deck) || '').trim();
      const rawFigmaUrl = String((req.body && req.body.figmaUrl) || '').trim();
      const figmaUrlMatch = rawFigmaUrl.match(/https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/[^\s<>"')]+/i);
      const figmaUrl = String((figmaUrlMatch && figmaUrlMatch[0]) || rawFigmaUrl.replace(/^@+/, ''))
        .replace(/[\],.;]+$/, '')
        .trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(deck)) {
        return res.status(400).json({ error: 'Некорректная презентация для переноса' });
      }

      let target;
      let targetMatch;
      try {
        target = new URL(figmaUrl);
        targetMatch = target.pathname.match(/^\/(?:design|file)\/([a-zA-Z0-9_-]+)(?:\/|$)/);
      } catch {}
      if (!target || !/^(?:www\.)?figma\.com$/i.test(target.hostname) || !targetMatch) {
        return res.status(400).json({ error: 'Вставьте ссылку на Figma design-файл или секцию' });
      }

      const indexFile = path.join(ROOT, 'output', deck, 'index.html');
      let slideCount = 0;
      let htmlPresentationTitle = '';
      try {
        const html = await fsp.readFile(indexFile, 'utf8');
        slideCount = (html.match(/<section\b[^>]*class=["'][^"']*\bslide\b[^"']*["']/gi) || []).length;
        expectedFigmaSvgAssets = (html.match(/<img\b[^>]*\bsrc=["'][^"']+\.svg(?:[?#][^"']*)?["']/gi) || []).length;
        expectedFigmaProcessCards = (html.match(/<div\b[^>]*\bclass=["'][^"']*["'][^>]*>/gi) || [])
          .filter((tag) => {
            const classMatch = tag.match(/\bclass=["']([^"']*)["']/i);
            return classMatch && classMatch[1].split(/\s+/).includes('process-step');
          }).length;
        const htmlTitleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        htmlPresentationTitle = htmlTitleMatch
          ? cleanChatTitle(htmlTitleMatch[1].replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' '))
          : '';
      } catch {
        return res.status(404).json({ error: 'Готовая презентация не найдена' });
      }
      if (!slideCount) return res.status(400).json({ error: 'В презентации не найдены готовые слайды' });
      expectedFigmaFrames = slideCount;
      expectedFigmaSectionName = titleFromDeckResult('output/' + deck) || htmlPresentationTitle || deck;

      const nodeId = String(target.searchParams.get('node-id') || '').replace('-', ':');
      const sourceBase = 'http://localhost:3000/figma-export.html?deck=' + encodeURIComponent(deck) + '&slide=';
      prompt = [
        'РЕЖИМ: перенос уже собранной презентации с платформы в Figma.',
        'Презентация: ' + deck + '.',
        'Название презентации и целевой SECTION: ' + expectedFigmaSectionName + '.',
        'Количество слайдов: ' + slideCount + '.',
        'Количество SVG-ассетов в исходной презентации: ' + expectedFigmaSvgAssets + '.',
        'Количество карточек process-steps: ' + expectedFigmaProcessCards + '.',
        'Целевой Figma-файл: ' + figmaUrl,
        'Figma fileKey: ' + targetMatch[1] + '.',
        nodeId ? 'Целевой nodeId: ' + nodeId + '.' : 'Целевой nodeId не указан — создай отдельную секцию на текущей странице файла.',
        '',
        'Перед любыми действиями прочитай rules/figma-export-rules.md целиком и соблюдай его как обязательный контракт. Это экспорт результата, а не design-to-code из Figma. Локальные input/, output/ и дизайн-систему не изменяй.',
        'Загрузи и строго соблюдай навыки figma-use и figma-generate-design. Используй подключённые Figma MCP-инструменты.',
        'Создай в целевом файле секцию и ОБЯЗАТЕЛЬНО назови её точным названием презентации: «' + expectedFigmaSectionName + '». Если ссылка ведёт на существующую SECTION, используй её как контейнер и после размещения слайдов переименуй в «' + expectedFigmaSectionName + '». Технический slug «' + deck + '» и прежнее имя секции не используй как финальное название.',
        'Для каждого слайда от 1 до ' + slideCount + ' используй отдельный источник ' + sourceBase + '<N>. Страница уже подключает официальный https://mcp.figma.com/mcp/html-to-design/capture.js.',
        'Для каждого источника вызови generate_figma_design с новым одноразовым captureId. Затем собери полный URL источника с hash-параметрами figmacapture, figmaendpoint и figmadelay=1500 из ответа инструмента и ОБЯЗАТЕЛЬНО запусти `node scripts/run-figma-capture.js "<полный URL>"`. Этот helper заменяет недоступный тебе браузер. Не пытайся использовать browser/Playwright MCP и не открывай GUI-браузер.',
        'Не вызывай generate_figma_design повторно без captureId вместо запуска helper — это создаст новую заявку, но не перенесёт слайд.',
        'После открытия каждого capture URL опрашивай generate_figma_design с тем же captureId до статуса completed. Pending/processing не являются успехом; продолжай опрос до 10 раз с паузой 5 секунд.',
        'Импорт должен быть редактируемым DOM-захватом, а не PNG, скриншотом или единой плоской картинкой.',
        'Служебная страница перед захватом заменяет каждый локальный <img src="*.svg"> на inline <svg> с path/vector-геометрией. Не отменяй эту замену и не конвертируй inline SVG обратно в image fill.',
        'Каждый слайд должен стать отдельным фреймом 1920×1080. После completed сохрани ID созданного корневого фрейма из ссылки результата.',
        'generate_figma_design может создать фреймы рядом с секцией даже при переданном nodeId. Поэтому после всех захватов через use_figma явно appendChild каждый созданный корневой фрейм в целевую SECTION, затем сразу задай x/y заново. Сохрани порядок, назови фреймы "01 — <заголовок>", "02 — <заголовок>" и так далее, разложи слева направо с промежутком 160 px. Измени размер секции по границам содержимого.',
        'После размещения добавь ко всем корневым фреймам 1920×1080 общую Figma layout grid. Найди локальный GridStyle с точным именем "Tumodo / Presentation / 7×7 / 1920×1080"; если его нет, создай один GridStyle и переиспользуй его для всех слайдов. В style.layoutGrids должны быть: COLUMNS — count 7, alignment STRETCH, offset 120, gutterSize 30; ROWS — count 7, alignment STRETCH, offset 120, gutterSize 25. Обе сетки visible=true, color={r:1,g:0,b:0,a:0.1}. Привяжи стиль через await frame.setGridStyleIdAsync(style.id), не рисуй сетку прямоугольниками.',
        'После импорта проверь через use_figma структуру: SECTION.name строго равно «' + expectedFigmaSectionName + '», количество фреймов равно ' + slideCount + ', размеры каждого 1920×1080, текст и изображения присутствуют, ничего не обрезано.',
        'Отдельно подтверди редактируемость каждого корневого фрейма: это FRAME 1920×1080 с отдельными дочерними TEXT и визуальными/векторными узлами, а не один IMAGE/PNG на весь слайд. Плоский фрейм не засчитывай.',
        'Отдельно проверь layout-grid-аудит: у каждого из ' + slideCount + ' корневых фреймов gridStyleId указывает на общий Tumodo GridStyle, а обе layoutGrids точно совпадают с параметрами 7×7, margin 120, gutters 30/25 и красным 10%.',
        'Проверь карточки process-steps: все ' + expectedFigmaProcessCards + ' карточек должны сохранить paddingTop=30, paddingRight=30, paddingBottom=30 и paddingLeft=30. Значение 34 слева или справа является ошибкой экспорта; исправь соответствующие auto-layout фреймы через use_figma до финального подтверждения.',
        'Проверь bounds карточек process-steps относительно каждого корневого фрейма 1920×1080: нижняя граница каждой из ' + expectedFigmaProcessCards + ' карточек должна быть bottom <= 960px. Переполнение дочерней grid-сетки за родительский контейнер считается ошибкой, даже если сам родитель заканчивается на 960px. Исправь размеры grid rows/фреймов через use_figma и перепроверь absoluteBoundingBox.',
        'После всех DOM-захватов ОБЯЗАТЕЛЬНО запусти через use_figma shape post-processing целевой SECTION. Обойди все дочерние узлы, у которых Plugin API предоставляет cornerSmoothing и хотя бы один cornerRadius/верхний/нижний радиус больше 0. Для каждого такого узла задай cornerSmoothing = 0.6 — это точная настройка Figma Corner smoothing 60% (iOS). Импортированному CSS нельзя доверять как финальному значению Figma.',
        'Shape-аудит выполняй уже после исправления: повторно обойди все скруглённые узлы SECTION и подтверди, что у каждого cornerSmoothing равно 0.6 с допуском не более 0.001. Любое другое значение — FIGMA_STATUS: failed.',
        'После всех DOM-захватов ОБЯЗАТЕЛЬНО запусти через use_figma типограф по каждому TEXT-слою целевой SECTION. Figma capture может заменить NBSP обычным пробелом, поэтому нельзя доверять исходному HTML. Свяжи со следующим словом символом U+00A0 служебные слова: в, во, и, а, но, да, или, либо, на, с, со, к, ко, по, за, о, об, обо, от, до, из, изо, у, для, при, над, надо, под, подо, про, без, через, между, не, ни, же, ли, бы, то, что, как. Перед изменением каждого TEXT загрузи все его текущие fontName через getStyledTextSegments и await figma.loadFontAsync; редактируемость и стили должны сохраниться.',
        'Typography-аудит выполняй по фактическим characters всех TEXT-слоёв уже после исправления: обычных пробелов или табов после перечисленных служебных слов должно остаться ровно 0. Неразрывный пробел U+00A0 считается корректным. Любое ненулевое значение — FIGMA_STATUS: failed.',
        'Отдельно проверь SVG-аудит: ' + expectedFigmaSvgAssets + ' исходных SVG-экземпляров представлены редактируемыми VECTOR/BOOLEAN_OPERATION контурами. Считай один корневой inline SVG как один экземпляр, а не каждый path. Для иконок не должно быть IMAGE fill или растрового PNG-превью.',
        'Не перерисовывай содержание вручную и не заменяй ассеты. Источник на платформе — единственная истина для этого переноса.',
        'В финале ответь коротко по-русски и добавь отдельные строки:',
        'FIGMA_STATUS: success — только если проверка целевой секции подтвердила все слайды; иначе FIGMA_STATUS: failed.',
        'FIGMA_RESULT: ' + figmaUrl,
        'FIGMA_SECTION_NAME: ' + expectedFigmaSectionName,
        'FIGMA_FRAMES: <фактически подтверждённое число>/' + slideCount,
        'FIGMA_FRAME_SIZES: <число фреймов ровно 1920×1080>/' + slideCount,
        'FIGMA_EDITABLE_FRAMES: <число фреймов с отдельными TEXT и визуальными/векторными дочерними узлами>/' + slideCount,
        'FIGMA_LAYOUT_GRIDS: <число фреймов с подтверждённой сеткой>/' + slideCount,
        'FIGMA_PROCESS_PADDINGS: <число карточек process-steps с padding 30/30/30/30>/' + expectedFigmaProcessCards,
        'FIGMA_PROCESS_BOUNDS: <число карточек process-steps с bottom <= 960px>/' + expectedFigmaProcessCards,
        'FIGMA_ROUNDED_NODES_AUDITED: <фактически проверенное число скруглённых узлов>',
        'FIGMA_CORNER_SMOOTHING: <число узлов с cornerSmoothing 0.6>/<число проверенных скруглённых узлов>',
        'FIGMA_TEXT_NODES_AUDITED: <фактически проверенное число TEXT-слоёв>',
        'FIGMA_HANGING_WORDS: <число оставшихся обычных пробелов после коротких служебных слов; для success только 0>',
        'FIGMA_VECTOR_ASSETS: <фактически подтверждённое число>/' + expectedFigmaSvgAssets,
      ].join('\n');
    } else if (uploaded.length) {
      prompt += '\n\nРаботай в автономном режиме первой сборки по rules/agent-workflow.md: сам выбери дизайн каждого слайда, собери всю презентацию и верни уже проверенный результат.';
    }

    prompt = SYSTEM_APPEND + '\n\nЗАДАЧА ПОЛЬЗОВАТЕЛЯ:\n' + prompt;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sse(res, { type: 'run', run: runId });

    const args = ['--ask-for-approval', 'never', 'exec'];
    if (codexSession) {
      args.push('resume', codexSession, '--json', '-');
    } else {
      args.push('--json', '--sandbox', 'workspace-write', '-');
    }

    let child;
    try {
      child = spawn(CODEX_BIN, args, {
        cwd: ROOT,
        env: codexProcessEnv(),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      sse(res, { type: 'error', message: 'Не удалось запустить GPT / Codex: ' + e.message });
      return res.end();
    }
    runs.set(runId, child);

    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    let gotResult = false;
    let runError = '';
    let errorSent = false;
    let answerText = '';
    let titleSent = false;
    let activeSession = codexSession ? SESSION_PREFIX + codexSession : '';
    let stderrTail = '';

    function handleLine(line) {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'thread.started' && msg.thread_id) {
        activeSession = SESSION_PREFIX + msg.thread_id;
        sse(res, { type: 'init', session: activeSession });
      } else if (msg.type === 'item.started' && msg.item) {
        const item = msg.item;
        if (item.type === 'command_execution') {
          sse(res, { type: 'tool', name: 'Shell', label: 'Выполняет', detail: (item.command || '').slice(0, 180) });
        } else if (item.type === 'mcp_tool_call') {
          sse(res, { type: 'tool', name: item.tool || 'MCP', label: 'Использует инструмент', detail: item.server || '' });
        }
      } else if (msg.type === 'item.completed' && msg.item) {
        const item = msg.item;
        if (item.type === 'agent_message' && item.text) {
          answerText += (answerText ? '\n' : '') + item.text;
          const title = extractChatTitle(item.text);
          if (title && !titleSent) {
            titleSent = true;
            sse(res, { type: 'title', title });
          }
          sse(res, { type: 'text', text: item.text });
        } else if (item.type === 'reasoning' && item.text) {
          sse(res, { type: 'thinking', text: item.text });
        } else if (item.type === 'error') {
          runError = item.message || 'GPT завершил задачу с ошибкой';
          errorSent = true;
          sse(res, { type: 'error', message: runError });
        }
      } else if (msg.type === 'turn.failed' || msg.type === 'error') {
        runError = (msg.error && msg.error.message) || msg.message || 'Ошибка GPT / Codex';
        errorSent = true;
        sse(res, { type: 'error', message: runError });
      } else if (msg.type === 'turn.completed') {
        gotResult = true;
        const m = answerText.match(/RESULT:\s*(output\/[a-zA-Z0-9_-]+)/);
        let resultOk = !runError;
        let resultError = runError && !errorSent ? runError : null;
        if (mode === 'figma-export') {
          const statusMatch = answerText.match(/FIGMA_STATUS:\s*(success|failed)/i);
          const sectionNameMatch = answerText.match(/FIGMA_SECTION_NAME:\s*([^\n]+)/i);
          const framesMatch = answerText.match(/FIGMA_FRAMES:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const frameSizesMatch = answerText.match(/FIGMA_FRAME_SIZES:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const editableFramesMatch = answerText.match(/FIGMA_EDITABLE_FRAMES:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const gridsMatch = answerText.match(/FIGMA_LAYOUT_GRIDS:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const processPaddingsMatch = answerText.match(/FIGMA_PROCESS_PADDINGS:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const processBoundsMatch = answerText.match(/FIGMA_PROCESS_BOUNDS:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const roundedNodesAuditedMatch = answerText.match(/FIGMA_ROUNDED_NODES_AUDITED:\s*(\d+)/i);
          const cornerSmoothingMatch = answerText.match(/FIGMA_CORNER_SMOOTHING:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const textNodesAuditedMatch = answerText.match(/FIGMA_TEXT_NODES_AUDITED:\s*(\d+)/i);
          const hangingWordsMatch = answerText.match(/FIGMA_HANGING_WORDS:\s*(\d+)/i);
          const vectorsMatch = answerText.match(/FIGMA_VECTOR_ASSETS:\s*(\d+)\s*(?:\/\s*(\d+))?/i);
          const exportedFrames = framesMatch ? Number(framesMatch[1]) : 0;
          const reportedTotal = framesMatch && framesMatch[2] ? Number(framesMatch[2]) : expectedFigmaFrames;
          const reportedSectionName = sectionNameMatch ? cleanChatTitle(sectionNameMatch[1]) : '';
          const sectionNameConfirmed = Boolean(expectedFigmaSectionName)
            && reportedSectionName === expectedFigmaSectionName;
          const correctlySizedFrames = frameSizesMatch ? Number(frameSizesMatch[1]) : 0;
          const reportedFrameSizeTotal = frameSizesMatch && frameSizesMatch[2]
            ? Number(frameSizesMatch[2])
            : expectedFigmaFrames;
          const editableFrames = editableFramesMatch ? Number(editableFramesMatch[1]) : 0;
          const reportedEditableFramesTotal = editableFramesMatch && editableFramesMatch[2]
            ? Number(editableFramesMatch[2])
            : expectedFigmaFrames;
          const frameStructureConfirmed = correctlySizedFrames === expectedFigmaFrames
            && reportedFrameSizeTotal === expectedFigmaFrames
            && editableFrames === expectedFigmaFrames
            && reportedEditableFramesTotal === expectedFigmaFrames;
          const exportedGridFrames = gridsMatch ? Number(gridsMatch[1]) : 0;
          const reportedGridTotal = gridsMatch && gridsMatch[2]
            ? Number(gridsMatch[2])
            : expectedFigmaFrames;
          const exportedProcessPaddings = processPaddingsMatch ? Number(processPaddingsMatch[1]) : 0;
          const reportedProcessPaddingTotal = processPaddingsMatch && processPaddingsMatch[2]
            ? Number(processPaddingsMatch[2])
            : expectedFigmaProcessCards;
          const processPaddingsConfirmed = expectedFigmaProcessCards === 0 || (
            exportedProcessPaddings === expectedFigmaProcessCards
            && reportedProcessPaddingTotal === expectedFigmaProcessCards
          );
          const exportedProcessBounds = processBoundsMatch ? Number(processBoundsMatch[1]) : 0;
          const reportedProcessBoundsTotal = processBoundsMatch && processBoundsMatch[2]
            ? Number(processBoundsMatch[2])
            : expectedFigmaProcessCards;
          const processBoundsConfirmed = expectedFigmaProcessCards === 0 || (
            exportedProcessBounds === expectedFigmaProcessCards
            && reportedProcessBoundsTotal === expectedFigmaProcessCards
          );
          const auditedRoundedNodes = roundedNodesAuditedMatch ? Number(roundedNodesAuditedMatch[1]) : 0;
          const smoothedRoundedNodes = cornerSmoothingMatch ? Number(cornerSmoothingMatch[1]) : 0;
          const reportedRoundedTotal = cornerSmoothingMatch && cornerSmoothingMatch[2]
            ? Number(cornerSmoothingMatch[2])
            : auditedRoundedNodes;
          const cornerSmoothingConfirmed = auditedRoundedNodes > 0
            && reportedRoundedTotal === auditedRoundedNodes
            && smoothedRoundedNodes === auditedRoundedNodes;
          const auditedTextNodes = textNodesAuditedMatch ? Number(textNodesAuditedMatch[1]) : 0;
          const hangingWords = hangingWordsMatch ? Number(hangingWordsMatch[1]) : -1;
          const typographyConfirmed = auditedTextNodes > 0 && hangingWords === 0;
          const exportedVectors = vectorsMatch ? Number(vectorsMatch[1]) : 0;
          const reportedVectorTotal = vectorsMatch && vectorsMatch[2]
            ? Number(vectorsMatch[2])
            : expectedFigmaSvgAssets;
          const vectorsConfirmed = expectedFigmaSvgAssets === 0 || (
            exportedVectors === expectedFigmaSvgAssets
            && reportedVectorTotal === expectedFigmaSvgAssets
          );
          const confirmed = statusMatch && statusMatch[1].toLowerCase() === 'success'
            && sectionNameConfirmed
            && expectedFigmaFrames > 0
            && reportedTotal === expectedFigmaFrames
            && exportedFrames === expectedFigmaFrames
            && frameStructureConfirmed
            && exportedGridFrames === expectedFigmaFrames
            && reportedGridTotal === expectedFigmaFrames
            && processPaddingsConfirmed
            && processBoundsConfirmed
            && cornerSmoothingConfirmed
            && typographyConfirmed
            && vectorsConfirmed;
          resultOk = resultOk && confirmed;
          if (!confirmed && !resultError) {
            resultError = 'Figma не подтвердила полный экспорт: слайды '
              + exportedFrames + '/' + expectedFigmaFrames + ', размеры '
              + correctlySizedFrames + '/' + expectedFigmaFrames + ', редактируемые фреймы '
              + editableFrames + '/' + expectedFigmaFrames + ', сетки '
              + exportedGridFrames + '/' + expectedFigmaFrames + ', padding карточек '
              + exportedProcessPaddings + '/' + expectedFigmaProcessCards + ', bounds карточек '
              + exportedProcessBounds + '/' + expectedFigmaProcessCards + ', corner smoothing '
              + smoothedRoundedNodes + '/' + auditedRoundedNodes + ', типограф '
              + auditedTextNodes + ' слоёв / ' + hangingWords + ' нарушений, SVG '
              + exportedVectors + '/' + expectedFigmaSvgAssets + ', секция «'
              + (reportedSectionName || 'без названия') + '» вместо «'
              + expectedFigmaSectionName + '». Повторите перенос.';
          }
        }
        if (!titleSent) {
          const title = extractChatTitle(answerText) || titleFromDeckResult(m ? m[1] : '');
          if (title) {
            titleSent = true;
            sse(res, { type: 'title', title });
          }
        }
        sse(res, {
          type: 'result',
          ok: resultOk,
          session: activeSession || null,
          dir: m ? m[1] : null,
          error: resultError,
        });
      }
    }

    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderrTail = (stderrTail + chunk).slice(-2000); });

    child.on('error', (e) => {
      sse(res, { type: 'error', message: 'Ошибка запуска GPT / Codex: ' + e.message });
      cleanup();
    });

    child.on('close', (code) => {
      if (buf.trim()) handleLine(buf.trim());
      if (!gotResult) {
        const authError = /not logged in|login|authentication/i.test(stderrTail);
        sse(res, {
          type: 'error',
          message: authError
            ? 'GPT не авторизован. Откройте Codex, войдите в ChatGPT и повторите запрос.'
            : codexExitMessage(code, stderrTail),
        });
      }
      cleanup();
    });

    function cleanup() {
      clearInterval(ping);
      runs.delete(runId);
      try { res.end(); } catch {}
    }

    res.on('close', () => {
      // соединение оборвалось до конца ответа (закрыта вкладка/остановлен стрим) — гасим процесс
      if (!res.writableEnded && runs.has(runId)) {
        try { child.kill(); } catch {}
      }
    });
  });

  app.post('/api/chat/stop', (req, res) => {
    const runId = (req.body && req.body.run) || '';
    const child = runs.get(runId);
    if (!child) return res.json({ ok: false, error: 'Процесс уже завершён' });
    try { child.kill(); } catch {}
    res.json({ ok: true });
  });
};
