/**
 * Интеграция с Claude Code: приложение запускает claude в headless-режиме
 * (--output-format stream-json) в корне проекта и транслирует события
 * (рассуждения, действия с файлами, текст, результат) в браузер через SSE.
 * Диалог продолжается через --resume <session-id>.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn } = require('child_process');

/** Кандидаты на исполняемый файл Claude Code. */
function resolveClaudeBin() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(home, '.local', 'bin', 'claude'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return process.platform === 'win32' ? 'claude.exe' : 'claude'; // поиск по PATH
}

const CLAUDE_BIN = resolveClaudeBin();

/** Разрешённые инструменты: файловые операции + Bash (сборка, скриншоты) + скиллы. */
const ALLOWED_TOOLS = 'Read,Glob,Grep,Write,Edit,MultiEdit,TodoWrite,Skill,Bash,WebFetch';

// Дизайн-система неприкосновенна: агент приложения собирает презентации, но не
// правит токены и ассеты (железное правило CLAUDE.md). Инструменты записи в
// design-system/ убраны из его набора — запрет не зависит от режима прав.
const DISALLOWED_TOOLS = [
  'Write(design-system/**)',
  'Edit(design-system/**)',
  'MultiEdit(design-system/**)',
].join(',');

const SYSTEM_APPEND = [
  'Ты работаешь внутри локального веб-приложения «Фабрика презентаций Tumodo»; рабочая директория — корень проекта.',
  'Пользователь — коллега-непрограммист: отвечай по-русски, коротко и без технического жаргона; твои ответы показываются в чат-панели приложения.',
  'Основной сценарий: пользователь описывает нужную презентацию. Действуй по CLAUDE.md: прочитай правила (rules/*, design-system/MANIFEST.md), создай или обнови input/<имя>.md (имя — латиница/цифры/дефисы), собери через `node scripts/build.js <имя>`, при просьбе про PDF — `node scripts/export-pdf.js <имя>`.',
  'Если не хватает контента или есть неоднозначность — задай вопрос прямо в ответе: пользователь ответит следующим сообщением, диалог продолжится.',
  'Когда презентация собрана или пересобрана, добавь В САМОМ КОНЦЕ финального ответа отдельной строкой: RESULT: output/<имя> — приложение превратит её в ссылку на предпросмотр.',
  'Другие просьбы (правки текста презентаций, вопросы про дизайн-систему) тоже выполняй, соблюдая железные правила CLAUDE.md.',
].join(' ');

module.exports = function mountClaude(app, ROOT, upload) {
  const REQUESTS_DIR = path.join(ROOT, 'input', 'requests');
  const runs = new Map(); // runId -> child process

  function sse(res, event) {
    res.write('data: ' + JSON.stringify(event) + '\n\n');
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

  app.post('/api/chat', upload.array('files'), async (req, res) => {
    const text = ((req.body && req.body.text) || '').trim();
    const session = ((req.body && req.body.session) || '').trim();
    const uploaded = req.files || [];
    if (!text && !uploaded.length) return res.status(400).json({ error: 'Пустое сообщение' });

    // приложенные файлы — в input/requests/<метка>/, пути дописываются к промту
    let prompt = text;
    if (uploaded.length) {
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const dir = path.join(REQUESTS_DIR, stamp);
      await fsp.mkdir(dir, { recursive: true });
      const savedPaths = [];
      for (const f of uploaded) {
        const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
        const name = path.basename(original).replace(/[\\/:*?"<>|]/g, '') || 'attachment';
        await fsp.writeFile(path.join(dir, name), f.buffer);
        savedPaths.push('input/requests/' + stamp + '/' + name);
      }
      prompt += (prompt ? '\n\n' : '') + 'Приложенные файлы:\n' + savedPaths.map((p) => '- ' + p).join('\n');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sse(res, { type: 'run', run: runId });

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      // headless (-p): окно подтверждения показать некому, поэтому любой запрос
      // прав = отказ. Сборке нужен запуск node — даём полные права на выполнение,
      // а дизайн-систему защищаем списком DISALLOWED_TOOLS.
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', ALLOWED_TOOLS,
      '--disallowedTools', DISALLOWED_TOOLS,
      '--append-system-prompt', SYSTEM_APPEND,
    ];
    if (session) args.push('--resume', session);

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, {
        cwd: ROOT,
        env: { ...process.env, ECC_GATEGUARD: 'off' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      sse(res, { type: 'error', message: 'Не удалось запустить Claude Code: ' + e.message });
      return res.end();
    }
    runs.set(runId, child);

    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    let gotResult = false;
    let stderrTail = '';

    function handleLine(line) {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'system' && msg.subtype === 'init') {
        sse(res, { type: 'init', session: msg.session_id });
      } else if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'thinking' && block.thinking) {
            sse(res, { type: 'thinking', text: block.thinking });
          } else if (block.type === 'text' && block.text) {
            sse(res, { type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            sse(res, {
              type: 'tool',
              name: block.name,
              label: TOOL_LABELS[block.name] || block.name,
              detail: toolDetail(block.name, block.input),
            });
          }
        }
      } else if (msg.type === 'result') {
        gotResult = true;
        const resultText = typeof msg.result === 'string' ? msg.result : '';
        const m = resultText.match(/RESULT:\s*(output\/[a-zA-Z0-9_-]+)/);
        sse(res, {
          type: 'result',
          ok: msg.subtype === 'success',
          session: msg.session_id || session || null,
          dir: m ? m[1] : null,
          error: msg.subtype !== 'success' ? (resultText || 'Сессия завершилась с ошибкой: ' + msg.subtype) : null,
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
      sse(res, { type: 'error', message: 'Ошибка запуска Claude Code: ' + e.message });
      cleanup();
    });

    child.on('close', (code) => {
      if (buf.trim()) handleLine(buf.trim());
      if (!gotResult) {
        sse(res, {
          type: 'error',
          message: 'Claude Code завершился без результата (код ' + code + ').' + (stderrTail ? ' ' + stderrTail.trim().split('\n').pop() : ''),
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
