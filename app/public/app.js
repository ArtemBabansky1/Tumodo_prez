/* Фабрика презентаций — фронтенд. Ванильный JS, без сборки. */

'use strict';

// ---------------------------------------------------------------- утилиты

const $main = document.getElementById('main');
const $nav = document.getElementById('nav');
const $toast = document.getElementById('toast');

let toastTimer = null;
function toast(msg, isError) {
  $toast.textContent = msg;
  $toast.classList.toggle('error', !!isError);
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), isError ? 6000 : 2500);
}

async function api(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || res.status + ' ' + res.statusText);
  return data;
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
}

/**
 * Иконки интерфейса приложения — встроены в код (Lucide, штрих 1.5px).
 * Специально не берутся из design-system/: библиотека меняется, интерфейс от неё не зависит.
 */
const UI_ICONS = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
};

function uiIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = UI_ICONS[name] || '';
  return svg;
}

// ---------------------------------------------------------------- навигация

const ASSET_LABELS = {
  logo: 'Логотип',
  icons: 'Иконки',
  fonts: 'Шрифты',
  photos: 'Фото',
  patterns: 'Паттерны',
  mockups: 'Мокапы',
};

const NAV = [
  { title: null, items: [{ id: 'overview', label: 'Главная' }] },
  {
    title: 'Токены',
    items: [
      { id: 'colors', label: 'Цвета' },
      { id: 'typography', label: 'Типографика' },
      { id: 'spacing', label: 'Отступы' },
      { id: 'effects', label: 'Эффекты' },
      { id: 'rule:grid', label: 'Сетка' },
    ],
  },
  {
    title: 'Ассеты',
    items: Object.entries(ASSET_LABELS).map(([k, label]) => ({ id: 'assets:' + k, label })),
  },
  {
    title: 'Правила',
    items: [
      { id: 'rule:presentation-rules', label: 'Структура презентации' },
      { id: 'rule:slide-layouts', label: 'Макеты слайдов' },
      { id: 'rule:style-guide', label: 'Стиль и дизайн' },
      { id: 'rule:content-rules', label: 'Текст' },
    ],
  },
  { title: 'Презентации', items: [{ id: 'presentations', label: 'Input / Output' }] },
];

/** Режим сайдбара: 'chats' — история диалогов (по умолчанию), 'settings' — токены/ассеты/правила. */
let sidebarMode = 'chats';

function currentHash() {
  return location.hash.replace(/^#\//, '') || 'overview';
}

function renderNav(activeId) {
  $nav.innerHTML = '';
  const $settings = document.getElementById('btn-settings');
  if ($settings) $settings.classList.toggle('active', sidebarMode === 'settings');

  if (sidebarMode === 'settings') {
    $nav.append(
      el('button', {
        class: 'nav-item',
        onclick: () => { sidebarMode = 'chats'; renderNav(currentHash()); },
      }, uiIcon('arrow-left'), 'К чатам')
    );
    for (const group of NAV) {
      if (group.title) $nav.append(el('div', { class: 'nav-group-title' }, group.title));
      for (const item of group.items) {
        if (item.id === 'overview') continue; // главная — это чат, доступен из режима чатов
        $nav.append(
          el('button', {
            class: 'nav-item' + (item.id === activeId ? ' active' : ''),
            onclick: () => (location.hash = '#/' + item.id),
          }, item.label)
        );
      }
    }
    return;
  }

  // режим чатов
  $nav.append(el('button', { class: 'nav-item', onclick: newChat }, uiIcon('plus'), 'Новый чат'));
  $nav.append(el('div', { class: 'nav-group-title' }, 'Чаты'));
  const host = el('div');
  $nav.append(host);
  api('/api/chats').then((list) => {
    if (!list.length) {
      host.append(el('div', { class: 'nav-empty' }, 'Чатов пока нет'));
      return;
    }
    for (const c of list) {
      const delBtn = el('span', {
        class: 'chat-del', title: 'Удалить чат',
        onclick: async (e) => {
          e.stopPropagation();
          if (!confirm('Удалить чат «' + (c.title || 'Без названия') + '»?')) return;
          try {
            await api('/api/chats/' + c.id, { method: 'DELETE' });
            if (chatState.id === c.id) resetChat();
            renderNav(currentHash());
            rerenderChat();
          } catch (e2) { toast(e2.message, true); }
        },
      }, '✕');
      host.append(
        el('button', {
          class: 'nav-item chat-item' + (chatState.id === c.id ? ' active' : ''),
          title: c.title,
          onclick: () => loadChat(c.id),
        }, el('span', { class: 'chat-item-title' }, c.title || 'Без названия'), delBtn)
      );
    }
  }).catch(() => {});
}

// ---------------------------------------------------------------- чат фабрики (Claude)

/** Состояние диалога живёт вне вида: при уходе со страницы стрим продолжается. */
const chatState = { id: null, title: '', items: [], session: null, run: null, streaming: false, pending: null };
let chatDom = null; // активная разметка чата на главной

function resetChat() {
  chatState.id = null;
  chatState.title = '';
  chatState.items = [];
  chatState.session = null;
  chatState.run = null;
  chatState.streaming = false;
}

function goChat() {
  if (currentHash() === 'overview') route();
  else location.hash = '#/overview';
}

function newChat() {
  if (chatState.streaming) return toast('Claude ещё работает — дождись окончания', true);
  resetChat();
  goChat();
}

async function loadChat(id) {
  if (chatState.streaming) return toast('Claude ещё работает — дождись окончания', true);
  try {
    const c = await api('/api/chats/' + id);
    resetChat();
    chatState.id = c.id;
    chatState.title = c.title || '';
    chatState.session = c.session || null;
    chatState.items = Array.isArray(c.items) ? c.items : [];
    goChat();
  } catch (e) {
    toast(e.message, true);
  }
}

/** Сохранение чата на сервер (app/data/chats/) — с задержкой, чтобы не писать на каждое событие. */
let chatSaveTimer = null;
function scheduleSaveChat() {
  if (!chatState.id) return;
  clearTimeout(chatSaveTimer);
  chatSaveTimer = setTimeout(saveChat, 800);
}
async function saveChat() {
  if (!chatState.id) return;
  try {
    await api('/api/chats/' + chatState.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: chatState.title, session: chatState.session, items: chatState.items }),
    });
  } catch {}
}

/** Мини-markdown для ответов: абзацы, списки, **жирный**, `код`, заголовки. */
function mdLite(src) {
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  for (const raw of String(src).split('\n')) {
    const line = raw.trimEnd();
    if (/^RESULT:\s*output\//.test(line.trim())) continue; // служебная строка для панели предпросмотра
    const mUl = line.match(/^\s*[-*]\s+(.*)$/);
    const mOl = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const mH = line.match(/^#{1,4}\s+(.*)$/);
    if (mUl) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(mUl[1]) + '</li>'); }
    else if (mOl) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(mOl[1]) + '</li>'); }
    else if (mH) { closeList(); out.push('<p><strong>' + inline(mH[1]) + '</strong></p>'); }
    else if (!line.trim()) closeList();
    else { closeList(); out.push('<p>' + inline(line) + '</p>'); }
  }
  closeList();
  return out.join('');
}

function chatItemNode(item) {
  if (item.kind === 'user') return el('div', { class: 'chat-msg user' }, item.text);
  if (item.kind === 'text') {
    const d = el('div', { class: 'chat-msg assistant' });
    d.innerHTML = mdLite(item.text);
    return d;
  }
  if (item.kind === 'thinking') {
    return el('details', { class: 'chat-think' },
      el('summary', null, 'Рассуждение'),
      el('div', { class: 'chat-think-body' }, item.text));
  }
  if (item.kind === 'tool') {
    return el('div', { class: 'chat-tool' },
      el('span', { class: 'chat-tool-label' }, item.label),
      item.detail ? ' ' + item.detail : '');
  }
  if (item.kind === 'error') return el('div', { class: 'chat-msg error' }, item.text);
  if (item.kind === 'result') {
    return el('div', { class: 'chat-result' },
      el('div', { class: 'chat-result-title' }, 'Презентация готова: ' + item.name),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary', onclick: () => openPreview(item.dir) }, 'Открыть предпросмотр'),
        el('a', { class: 'btn', href: '/files/' + item.dir + '/index.html', target: '_blank', rel: 'noopener' }, 'В новой вкладке')
      )
    );
  }
  return null;
}

function rerenderChat() {
  if (!chatDom || !chatDom.feed.isConnected) return;
  const { feed, screen, sendBtn } = chatDom;
  screen.classList.toggle('empty', !chatState.items.length);
  feed.innerHTML = '';
  for (const item of chatState.items) {
    const n = chatItemNode(item);
    if (n) feed.append(n);
  }
  if (chatState.streaming) feed.append(el('div', { class: 'chat-working' }, 'Claude работает…'));
  feed.scrollTop = feed.scrollHeight;
  sendBtn.classList.toggle('stop', chatState.streaming);
  sendBtn.title = chatState.streaming ? 'Остановить' : 'Отправить';
  sendBtn.innerHTML = '';
  sendBtn.append(uiIcon(chatState.streaming ? 'square' : 'arrow-up'));
}

function handleChatEvent(ev) {
  if (ev.type === 'run') chatState.run = ev.run;
  else if (ev.type === 'init') chatState.session = ev.session;
  else if (ev.type === 'thinking') chatState.items.push({ kind: 'thinking', text: ev.text });
  else if (ev.type === 'text') chatState.items.push({ kind: 'text', text: ev.text });
  else if (ev.type === 'tool') chatState.items.push({ kind: 'tool', label: ev.label, detail: ev.detail });
  else if (ev.type === 'error') chatState.items.push({ kind: 'error', text: ev.message });
  else if (ev.type === 'result') {
    if (ev.session) chatState.session = ev.session;
    if (ev.dir) {
      chatState.items.push({ kind: 'result', dir: ev.dir, name: ev.dir.replace(/^output\//, '') });
      openPreview(ev.dir);
    }
    if (!ev.ok && ev.error) chatState.items.push({ kind: 'error', text: ev.error });
  }
  scheduleSaveChat();
  rerenderChat();
}

async function chatSend(text, files) {
  if (chatState.streaming) return;
  chatState.items.push({
    kind: 'user',
    text: (text || '') + (files && files.length ? (text ? '\n' : '') + '📎 ' + files.map((f) => f.name).join(', ') : ''),
  });
  chatState.streaming = true;
  rerenderChat();

  // первый запрос в новом диалоге — заводим чат в истории
  if (!chatState.id) {
    try {
      const title = (text || (files && files.length ? files.map((f) => f.name).join(', ') : 'Без названия')).slice(0, 60);
      const r = await api('/api/chats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      chatState.id = r.id;
      chatState.title = r.title;
      if (sidebarMode === 'chats') renderNav(currentHash());
    } catch {}
  }
  scheduleSaveChat();

  const fd = new FormData();
  if (text) fd.append('text', text);
  if (chatState.session) fd.append('session', chatState.session);
  for (const f of files || []) fd.append('files', f);

  try {
    const res = await fetch('/api/chat', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try { handleChatEvent(JSON.parse(line.slice(6))); } catch {}
          }
        }
      }
    }
  } catch (e) {
    chatState.items.push({ kind: 'error', text: 'Связь с Claude прервалась: ' + e.message });
  }
  chatState.streaming = false;
  chatState.run = null;
  saveChat();
  if (sidebarMode === 'chats') renderNav(currentHash());
  rerenderChat();
}

async function chatStop() {
  if (!chatState.run) return;
  try {
    await api('/api/chat/stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run: chatState.run }),
    });
  } catch {}
}

// ---------------------------------------------------------------- панель предпросмотра (справа)

const $preview = document.getElementById('preview-panel');

function openPreview(dir) {
  const name = dir.replace(/^output\//, '');
  const url = '/files/output/' + name + '/index.html';
  document.getElementById('preview-title').textContent = name;
  document.getElementById('preview-open-tab').href = url;
  const frame = document.getElementById('preview-frame');
  if (frame.getAttribute('src') !== url) frame.src = url;
  else try { frame.contentWindow.location.reload(); } catch {}
  $preview.hidden = false;
  document.body.classList.add('preview-open');
}

function closePreview() {
  $preview.hidden = true;
  document.body.classList.remove('preview-open');
}

document.getElementById('preview-close').append(uiIcon('x'));
document.getElementById('preview-close').addEventListener('click', closePreview);

// ---------------------------------------------------------------- обзор (главная: чат)

async function viewOverview() {
  const files = [];
  const fileInput = el('input', {
    type: 'file', multiple: true, style: 'display:none',
    accept: '.md,.markdown,.txt,.docx,.doc,.pptx,.ppt,.pdf,.png,.jpg,.jpeg,.webp',
    onchange: (e) => { for (const f of e.target.files) files.push(f); renderChips(); fileInput.value = ''; },
  });
  const chips = el('div', { class: 'chat-chips row wrap' });
  function renderChips() {
    chips.innerHTML = '';
    files.forEach((f, i) =>
      chips.append(el('span', {
        class: 'pill-badge chat-chip', title: 'Убрать',
        onclick: () => { files.splice(i, 1); renderChips(); },
      }, f.name + '  ✕'))
    );
  }
  const input = el('input', {
    type: 'text',
    placeholder: 'Опиши презентацию — например: питч на 10 слайдов по итогам квартала',
    onkeydown: (e) => { if (e.key === 'Enter') send(); },
  });
  const sendBtn = el('button', {
    class: 'btn-circle send', title: 'Отправить',
    onclick: () => (chatState.streaming ? chatStop() : send()),
  }, uiIcon('arrow-up'));

  function send() {
    if (chatState.streaming) return;
    const text = input.value.trim();
    if (!text && !files.length) return toast('Напиши запрос или приложи файл', true);
    input.value = '';
    const attach = files.splice(0);
    renderChips();
    chatSend(text, attach);
  }

  const feed = el('div', { class: 'chat-feed' });
  const screen = el('div', { class: 'chat-screen' },
    el('div', { class: 'chat-hero' },
      el('div', { class: 'home-title' }, 'Какую презентацию соберём?')
    ),
    feed,
    el('div', { class: 'chat-bottom' },
      chips,
      el('div', { class: 'chat-bar' },
        el('button', { class: 'btn-circle flat', title: 'Прикрепить фото или файлы', onclick: () => fileInput.click() }, uiIcon('plus')),
        input,
        sendBtn
      ),
      el('div', { class: 'home-note chat-note' }, 'Claude соберёт её по правилам фабрики. Ход работы появится здесь, готовая презентация откроется в панели справа.'),
      fileInput
    )
  );
  chatDom = { feed, screen, sendBtn };
  $main.append(screen);
  rerenderChat();

  // сообщение, отправленное с другой страницы (боковая панель, кнопка «Собрать»)
  if (chatState.pending && !chatState.streaming) {
    const p = chatState.pending;
    chatState.pending = null;
    chatSend(p.text, p.files || []);
  }
}

// ---------------------------------------------------------------- токены: цвета

function tokenGroupToRows(group) {
  return Object.entries(group || {})
    .filter(([k]) => !k.startsWith('$'))
    .map(([name, t]) => ({ name, value: t.$value, description: t.$description || '' }));
}

function rowsToTokenGroup(rows, type) {
  const group = {};
  for (const r of rows) {
    if (!r.name) continue;
    group[r.name] = { $value: r.value, $type: type, $description: r.description || '' };
  }
  return group;
}

function normHex(v) {
  return /^#?[0-9a-fA-F]{3,8}$/.test(v || '') ? (v.startsWith('#') ? v : '#' + v) : null;
}

async function viewColors() {
  const tokens = await api('/api/tokens');
  const rows = tokenGroupToRows(tokens.colors && tokens.colors.color);

  const tbody = el('tbody');
  const liveRows = new Set();

  function addRow(r) {
    const row = { name: r.name || '', value: r.value || '#000000', description: r.description || '' };
    const sw = el('div', { class: 'swatch', style: '--sw:' + row.value });
    const nameInput = el('input', {
      type: 'text', value: row.name, placeholder: 'brand-primary',
      oninput: (e) => (row.name = e.target.value.trim()),
    });
    const hexInput = el('input', {
      type: 'text', value: row.value, placeholder: '#0d0d0d',
      oninput: (e) => {
        row.value = e.target.value.trim();
        const hex = normHex(row.value);
        if (hex) sw.style.setProperty('--sw', hex);
      },
    });
    const descInput = el('textarea', {
      rows: 1, placeholder: 'Роль: где и когда используется этот цвет',
      oninput: (e) => (row.description = e.target.value),
    }, row.description);
    const tr = el('tr', null,
      el('td', { style: 'width:48px' }, sw),
      el('td', { style: 'width:220px' }, nameInput),
      el('td', { style: 'width:150px' }, hexInput),
      el('td', null, descInput),
      el('td', { style: 'width:40px' },
        el('button', { class: 'btn ghost danger', title: 'Удалить', onclick: () => { tr.remove(); liveRows.delete(row); } }, '✕'))
    );
    liveRows.add(row);
    tbody.append(tr);
  }

  rows.forEach(addRow);

  async function save() {
    const list = [...liveRows];
    for (const r of list) {
      if (r.name && !/^[a-z0-9-]+$/.test(r.name)) return toast('Имя «' + r.name + '»: только латиница, цифры, дефисы', true);
      if (r.name && !normHex(r.value) && !/^rgba?\(/.test(r.value)) return toast('Цвет «' + r.name + '»: некорректное значение ' + r.value, true);
    }
    const data = tokens.colors && !tokens.colors._status ? tokens.colors : {};
    data.color = rowsToTokenGroup(list, 'color');
    await api('/api/tokens/colors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    toast('Палитра сохранена в design-system/tokens/colors.json');
  }

  $main.append(
    el('div', { class: 'page-header' },
      el('h1', null, 'Цвета'),
      el('div', { class: 'page-sub' }, 'Палитра бренда. Для каждого цвета опиши роль: фон, текст, акцент — когда его использовать. Хранится в design-system/tokens/colors.json.')
    ),
    el('table', { class: 'token-table' },
      el('thead', null, el('tr', null,
        el('th', null, ''), el('th', null, 'Имя'), el('th', null, 'Значение'), el('th', null, 'Роль / когда использовать'), el('th', null, ''))),
      tbody
    ),
    el('div', { class: 'row', style: 'margin-top:16px' },
      el('button', { class: 'btn', onclick: () => addRow({}) }, '+ Добавить цвет'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => save().catch((e) => toast(e.message, true)) }, 'Сохранить')
    )
  );
}

// ---------------------------------------------------------------- токены: типографика

async function viewTypography() {
  const tokens = await api('/api/tokens');
  const data = tokens.typography && !tokens.typography._status ? tokens.typography : {};
  const families = Object.entries(data.font || {}).filter(([k]) => !k.startsWith('$'))
    .map(([name, t]) => ({ name, value: t.$value, description: t.$description || '' }));
  const steps = Object.entries(data.typography || {}).filter(([k]) => !k.startsWith('$'))
    .map(([name, t]) => ({ name, description: t.$description || '', ...(typeof t.$value === 'object' ? t.$value : {}) }));

  const famRows = new Set();
  const famBody = el('tbody');
  function addFamily(r) {
    const row = { name: r.name || '', value: r.value || '', description: r.description || '' };
    const tr = el('tr', null,
      el('td', { style: 'width:200px' }, el('input', { type: 'text', value: row.name, placeholder: 'heading', oninput: (e) => (row.name = e.target.value.trim()) })),
      el('td', null, el('input', { type: 'text', value: row.value, placeholder: 'Inter, sans-serif', oninput: (e) => (row.value = e.target.value) })),
      el('td', null, el('textarea', { rows: 1, placeholder: 'Для чего это семейство', oninput: (e) => (row.description = e.target.value) }, row.description)),
      el('td', { style: 'width:40px' }, el('button', { class: 'btn ghost', onclick: () => { tr.remove(); famRows.delete(row); } }, '✕'))
    );
    famRows.add(row);
    famBody.append(tr);
  }
  families.forEach(addFamily);

  const stepRows = new Set();
  const stepBody = el('tbody');
  function addStep(r) {
    const row = {
      name: r.name || '', fontFamily: r.fontFamily || '', fontSize: r.fontSize || '',
      fontWeight: r.fontWeight || 400, lineHeight: r.lineHeight || 1.3, description: r.description || '',
    };
    const tr = el('tr', null,
      el('td', { style: 'width:130px' }, el('input', { type: 'text', value: row.name, placeholder: 'h1', oninput: (e) => (row.name = e.target.value.trim()) })),
      el('td', { style: 'width:170px' }, el('input', { type: 'text', value: row.fontFamily, placeholder: 'семейство', oninput: (e) => (row.fontFamily = e.target.value) })),
      el('td', { style: 'width:100px' }, el('input', { type: 'text', value: row.fontSize, placeholder: '96px', oninput: (e) => (row.fontSize = e.target.value.trim()) })),
      el('td', { style: 'width:90px' }, el('input', { type: 'number', value: row.fontWeight, step: 100, min: 100, max: 900, oninput: (e) => (row.fontWeight = +e.target.value) })),
      el('td', { style: 'width:90px' }, el('input', { type: 'number', value: row.lineHeight, step: 0.01, oninput: (e) => (row.lineHeight = +e.target.value) })),
      el('td', null, el('textarea', { rows: 1, placeholder: 'Роль: заголовок слайда, буллет, подпись…', oninput: (e) => (row.description = e.target.value) }, row.description)),
      el('td', { style: 'width:40px' }, el('button', { class: 'btn ghost', onclick: () => { tr.remove(); stepRows.delete(row); } }, '✕'))
    );
    stepRows.add(row);
    stepBody.append(tr);
  }
  steps.forEach(addStep);

  async function save() {
    const out = { ...data };
    out.font = {};
    for (const r of famRows) if (r.name) out.font[r.name] = { $value: r.value, $type: 'fontFamily', $description: r.description || '' };
    out.typography = {};
    for (const r of stepRows) {
      if (!r.name) continue;
      out.typography[r.name] = {
        $value: { fontFamily: r.fontFamily, fontSize: r.fontSize, fontWeight: r.fontWeight, lineHeight: r.lineHeight },
        $type: 'typography',
        $description: r.description || '',
      };
    }
    await api('/api/tokens/typography', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
    toast('Типографика сохранена в design-system/tokens/typography.json');
  }

  $main.append(
    el('div', { class: 'page-header' },
      el('h1', null, 'Типографика'),
      el('div', { class: 'page-sub' }, 'Семейства шрифтов и шкала размеров с ролями. Файлы шрифтов загружаются в разделе «Шрифты». Хранится в design-system/tokens/typography.json.')
    ),
    el('h2', null, 'Семейства'),
    el('table', { class: 'token-table' },
      el('thead', null, el('tr', null, el('th', null, 'Имя'), el('th', null, 'CSS-стек'), el('th', null, 'Описание'), el('th', null, ''))),
      famBody
    ),
    el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { class: 'btn', onclick: () => addFamily({}) }, '+ Добавить семейство')),
    el('h2', null, 'Шкала (роли текста)'),
    el('table', { class: 'token-table' },
      el('thead', null, el('tr', null,
        el('th', null, 'Имя'), el('th', null, 'Семейство'), el('th', null, 'Размер'), el('th', null, 'Вес'), el('th', null, 'Интерлиньяж'), el('th', null, 'Роль'), el('th', null, ''))),
      stepBody
    ),
    el('div', { class: 'row', style: 'margin-top:16px' },
      el('button', { class: 'btn', onclick: () => addStep({}) }, '+ Добавить шаг'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => save().catch((e) => toast(e.message, true)) }, 'Сохранить')
    )
  );
}

// ---------------------------------------------------------------- токены: отступы и эффекты

async function viewSimpleTokens(kind) {
  const conf = {
    spacing: {
      title: 'Отступы', group: 'spacing', type: 'dimension', file: 'spacing.json',
      sub: 'Шкала отступов слайда. Значения в px. Хранится в design-system/tokens/spacing.json.',
      placeholderName: '24', placeholderValue: '24px', placeholderDesc: 'Например: отступ между буллетами',
    },
    effects: {
      title: 'Эффекты', group: 'effects', type: 'effect', file: 'effects.json',
      sub: 'Тени, скругления, градиенты, блюры. Значение — CSS-строка. Хранится в design-system/tokens/effects.json.',
      placeholderName: 'shadow-card', placeholderValue: '0 4px 24px rgba(0,0,0,.08)', placeholderDesc: 'Когда применяется эффект',
    },
  }[kind];

  const tokens = await api('/api/tokens');
  const data = tokens[kind] && !tokens[kind]._status ? tokens[kind] : {};
  const rows = tokenGroupToRows(data[conf.group]);

  const liveRows = new Set();
  const tbody = el('tbody');
  function addRow(r) {
    const row = { name: r.name || '', value: r.value || '', description: r.description || '' };
    const tr = el('tr', null,
      el('td', { style: 'width:200px' }, el('input', { type: 'text', value: row.name, placeholder: conf.placeholderName, oninput: (e) => (row.name = e.target.value.trim()) })),
      el('td', { style: 'width:260px' }, el('input', { type: 'text', value: row.value, placeholder: conf.placeholderValue, oninput: (e) => (row.value = e.target.value) })),
      el('td', null, el('textarea', { rows: 1, placeholder: conf.placeholderDesc, oninput: (e) => (row.description = e.target.value) }, row.description)),
      el('td', { style: 'width:40px' }, el('button', { class: 'btn ghost', onclick: () => { tr.remove(); liveRows.delete(row); } }, '✕'))
    );
    liveRows.add(row);
    tbody.append(tr);
  }
  rows.forEach(addRow);

  async function save() {
    const out = { ...data };
    out[conf.group] = rowsToTokenGroup([...liveRows], conf.type);
    await api('/api/tokens/' + kind, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
    toast(conf.title + ' сохранены в design-system/tokens/' + conf.file);
  }

  $main.append(
    el('div', { class: 'page-header' }, el('h1', null, conf.title), el('div', { class: 'page-sub' }, conf.sub)),
    el('table', { class: 'token-table' },
      el('thead', null, el('tr', null, el('th', null, 'Имя'), el('th', null, 'Значение'), el('th', null, 'Описание / когда использовать'), el('th', null, ''))),
      tbody
    ),
    el('div', { class: 'row', style: 'margin-top:16px' },
      el('button', { class: 'btn', onclick: () => addRow({}) }, '+ Добавить'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => save().catch((e) => toast(e.message, true)) }, 'Сохранить')
    )
  );
}

// ---------------------------------------------------------------- ассеты

const SUB_LABELS = { people: 'люди', '3d': '3D', svg: 'SVG', png: 'PNG', files: 'файлы' };

const CAT_HINTS = {
  logo: 'Все варианты логотипа: основной, монохром, инверсия, знак. SVG кладётся в svg/, растровые — в png/.',
  icons: 'Набор иконок в SVG с осмысленными именами (kebab-case латиницей).',
  fonts: 'Файлы шрифтов woff2/ttf/otf. Имена должны совпадать с семействами в «Типографике».',
  photos: 'Фото людей и 3D-рендеры. «Все» показывает обе подпапки; перед загрузкой выбери конкретную.',
  patterns: 'Фирменные паттерны и текстуры (SVG/PNG).',
  mockups: 'Мокапы устройств и носителей.',
};

const CAT_RULES = { logo: 'logo-rules', icons: 'icons-rules', fonts: 'fonts-rules', photos: 'photos-rules', patterns: 'patterns-rules', mockups: 'mockups-rules' };

let fontFaceCounter = 0;

async function viewAssets(cat) {
  const label = ASSET_LABELS[cat];
  const data = await api('/api/assets/' + cat);

  let currentSub = cat === 'photos' ? '' : data.subdirs[0]; // '' — «все» (без фильтра)
  const subSelect = cat === 'photos'
    ? el('select', { style: 'width:auto', onchange: (e) => { currentSub = e.target.value; renderAssets(); } },
        [el('option', { value: '' }, 'все'), ...data.subdirs.map((s) => el('option', { value: s }, SUB_LABELS[s] || s))])
    : null;

  const fileInput = el('input', { type: 'file', multiple: true, style: 'display:none', onchange: (e) => uploadFiles(e.target.files) });

  async function uploadFiles(files) {
    if (!files || !files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (subSelect && currentSub) fd.append('sub', currentSub);
    try {
      const r = await api('/api/assets/' + cat + '/upload', { method: 'POST', body: fd });
      if (r.errors && r.errors.length) toast(r.errors.map((e2) => e2.file + ': ' + e2.error).join('; '), true);
      else toast('Загружено: ' + r.saved.length + ' файл(ов) в design-system/' + cat);
      route(); // перерисовать
    } catch (e) {
      toast(e.message, true);
    }
  }

  const dropzone = el('div', {
    class: 'dropzone',
    onclick: () => fileInput.click(),
    ondragover: (e) => { e.preventDefault(); dropzone.classList.add('dragover'); },
    ondragleave: () => dropzone.classList.remove('dragover'),
    ondrop: (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); uploadFiles(e.dataTransfer.files); },
  }, 'Перетащи файлы сюда или нажми, чтобы выбрать');

  function makePreview(item) {
    if (cat === 'fonts') {
      const faceName = 'preview-font-' + (++fontFaceCounter);
      const sample = el('div', { class: 'font-sample' }, 'Аа Бб 123');
      try {
        const face = new FontFace(faceName, 'url("' + item.url + '")');
        face.load().then((f) => { document.fonts.add(f); sample.style.fontFamily = "'" + faceName + "'"; }).catch(() => {});
      } catch {}
      return sample;
    }
    if (/\.(svg|png|jpe?g|webp)$/i.test(item.name)) {
      return el('img', { src: item.url, alt: item.name, loading: 'lazy' });
    }
    return el('div', { class: 'font-sample' }, item.name.split('.').pop().toUpperCase());
  }

  async function removeAsset(item) {
    if (!confirm('Удалить ' + item.name + ' из библиотеки?')) return false;
    await api('/api/assets/' + cat + '?file=' + encodeURIComponent(item.file), { method: 'DELETE' });
    toast('Удалено: ' + item.name);
    route();
    return true;
  }

  function openAssetModal(item) {
    const meta = { description: item.description, usage: item.usage };
    const overlay = el('div', {
      class: 'modal-overlay',
      onclick: (e) => { if (e.target === overlay) overlay.remove(); },
    });

    async function save() {
      await api('/api/assets/' + cat + '/meta', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: item.file, ...meta }),
      });
      item.description = meta.description;
      item.usage = meta.usage;
      toast('Сохранено (design-system/' + cat + '/catalog.json)');
      overlay.remove();
      route();
    }

    overlay.append(
      el('div', { class: 'asset-modal' },
        el('button', { class: 'btn-circle modal-close', title: 'Закрыть', onclick: () => overlay.remove() }, uiIcon('x')),
        el('div', { class: 'modal-media' + (cat === 'photos' ? ' cover' : '') }, makePreview(item)),
        el('div', { class: 'modal-body' },
          el('h2', { class: 'modal-title' }, item.name),
          el('div', { class: 'row wrap' },
            el('span', { class: 'pill-badge' }, fmtSize(item.size)),
            el('span', { class: 'pill-badge' }, SUB_LABELS[item.sub] || item.sub)
          ),
          el('div', { class: 'field-block' },
            el('span', { class: 'field-chip' }, 'Описание'),
            el('textarea', { placeholder: 'Что это, краткое описание', oninput: (e) => (meta.description = e.target.value) }, meta.description)
          ),
          el('div', { class: 'field-block' },
            el('span', { class: 'field-chip' }, 'Назначение'),
            el('textarea', { placeholder: 'Для каких слайдов и случаев использовать', oninput: (e) => (meta.usage = e.target.value) }, meta.usage)
          ),
          el('div', { class: 'row' },
            el('button', { class: 'btn', onclick: () => save().catch((e) => toast(e.message, true)) }, 'Подтвердить изменения'),
            el('div', { class: 'spacer' }),
            el('button', {
              class: 'btn-circle danger', title: 'Удалить',
              onclick: () => removeAsset(item).then((ok) => ok && overlay.remove()).catch((e) => toast(e.message, true)),
            }, uiIcon('trash-2'))
          )
        )
      )
    );
    document.body.append(overlay);
  }

  function assetCard(item) {
    return el('div', { class: 'asset-card' },
      el('div', { class: 'asset-preview' + (cat === 'photos' ? ' cover' : '') }, makePreview(item)),
      el('div', { class: 'asset-body' },
        el('div', { class: 'row' },
          el('div', { class: 'asset-name', title: item.name }, item.name),
          el('span', { class: 'pill-badge' }, fmtSize(item.size)),
          el('span', { class: 'pill-badge' }, SUB_LABELS[item.sub] || item.sub)
        ),
        el('div', { class: 'asset-desc' + (item.description ? '' : ' none') }, item.description || 'Описания пока нет'),
        el('div', { class: 'row', style: 'margin-top:auto' },
          el('button', { class: 'btn', onclick: () => openAssetModal(item) }, 'Изменить описание'),
          el('div', { class: 'spacer' }),
          el('button', {
            class: 'btn-circle danger', title: 'Удалить',
            onclick: () => removeAsset(item).catch((e) => toast(e.message, true)),
          }, uiIcon('trash-2'))
        )
      )
    );
  }

  const header = el('div', { class: 'page-header' },
    el('div', { class: 'row' },
      el('h1', null, label),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn ghost', onclick: () => (location.hash = '#/rule:' + CAT_RULES[cat]) }, 'Правила категории →')
    ),
    el('div', { class: 'page-sub' }, CAT_HINTS[cat])
  );

  // Иконки: плотная сетка как на lucide.dev, панель выбранной иконки — сверху
  if (cat === 'icons') {
    let selected = null;
    let filter = '';
    const detailHost = el('div', { class: 'icon-detail-host' });
    const grid = el('div', { class: 'icon-grid' });

    function renderDetail() {
      detailHost.innerHTML = '';
      if (!selected) return;
      const item = selected;
      const meta = { description: item.description, usage: item.usage };
      detailHost.append(
        el('div', { class: 'icon-detail' },
          el('div', { class: 'icon-detail-preview' }, el('img', { src: item.url, alt: item.name })),
          el('div', { class: 'icon-detail-body' },
            el('div', { class: 'row' },
              el('div', { class: 'asset-name' }, item.name),
              el('span', { class: 'badge' }, 'SVG'),
              el('span', { class: 'asset-meta' }, fmtSize(item.size)),
              el('div', { class: 'spacer' }),
              el('button', { class: 'btn ghost', title: 'Закрыть', onclick: () => { selected = null; renderDetail(); renderGrid(); } }, '✕')
            ),
            el('textarea', { rows: 1, placeholder: 'Что это (краткое описание)', oninput: (e) => (meta.description = e.target.value) }, meta.description),
            el('textarea', { rows: 1, placeholder: 'Когда использовать', oninput: (e) => (meta.usage = e.target.value) }, meta.usage),
            el('div', { class: 'row' },
              el('button', {
                class: 'btn primary',
                onclick: () => api('/api/assets/icons/meta', {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ file: item.file, ...meta }),
                }).then(() => {
                  item.description = meta.description;
                  item.usage = meta.usage;
                  toast('Описание сохранено');
                }).catch((e) => toast(e.message, true)),
              }, 'Сохранить описание'),
              el('div', { class: 'spacer' }),
              el('button', {
                class: 'btn ghost danger',
                onclick: async () => {
                  if (!confirm('Удалить ' + item.name + '?')) return;
                  try {
                    await api('/api/assets/icons?file=' + encodeURIComponent(item.file), { method: 'DELETE' });
                    toast('Удалено: ' + item.name);
                    route();
                  } catch (e) { toast(e.message, true); }
                },
              }, 'Удалить')
            )
          )
        )
      );
    }

    function renderGrid() {
      grid.innerHTML = '';
      const items = data.items.filter(
        (i) => !filter || (i.name + ' ' + i.description + ' ' + i.usage).toLowerCase().includes(filter)
      );
      for (const item of items) {
        grid.append(
          el('button', {
            class: 'icon-tile' + (item === selected ? ' selected' : ''),
            title: item.name + (item.description ? ' — ' + item.description : ''),
            onclick: () => { selected = item; renderDetail(); renderGrid(); },
          }, el('img', { src: item.url, alt: item.name, loading: 'lazy' }))
        );
      }
      if (!items.length) grid.append(el('div', { class: 'empty' }, 'Ничего не найдено'));
    }

    renderGrid();

    $main.append(
      header,
      el('input', {
        type: 'text', class: 'icon-search',
        placeholder: 'Поиск по ' + data.items.length + ' иконкам…',
        oninput: (e) => { filter = e.target.value.trim().toLowerCase(); renderGrid(); },
      }),
      dropzone,
      fileInput,
      detailHost,
      data.items.length ? grid : el('div', { class: 'empty' }, 'Пока пусто. Загрузи первые файлы — они лягут в design-system/icons/.')
    );
    return;
  }

  const gridHost = el('div', null);
  function renderAssets() {
    gridHost.innerHTML = '';
    const items = currentSub ? data.items.filter((i) => i.sub === currentSub) : data.items;
    gridHost.append(
      items.length
        ? el('div', { class: 'asset-grid' + (cat === 'photos' ? ' photos-grid' : '') }, items.map(assetCard))
        : el('div', { class: 'empty' }, 'Пока пусто. Загрузи первые файлы — они лягут в design-system/' + cat + '/.')
    );
  }
  renderAssets();

  $main.append(
    header,
    subSelect ? el('div', { class: 'row', style: 'margin-bottom:12px' }, el('label', { class: 'field', style: 'margin:0' }, 'Подпапка:'), subSelect) : null,
    dropzone,
    fileInput,
    gridHost
  );
}

// ---------------------------------------------------------------- правила (md)

async function viewRule(id) {
  const rule = await api('/api/rules/' + id);
  let content = rule.content;
  const textarea = el('textarea', { class: 'md-editor', oninput: (e) => (content = e.target.value) }, content);

  async function save() {
    await api('/api/rules/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    toast('Сохранено: ' + rule.path);
  }

  $main.append(
    el('div', { class: 'page-header' },
      el('div', { class: 'row' },
        el('h1', null, rule.title),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn primary', onclick: () => save().catch((e) => toast(e.message, true)) }, 'Сохранить')
      ),
      el('div', { class: 'page-sub' }, 'Markdown-файл: ' + rule.path + '. Пиши правила словами — Claude Code следует им при сборке презентаций.')
    ),
    textarea
  );
}

// ---------------------------------------------------------------- презентации

const EXAMPLE_TEMPLATE = [
  '---',
  'title: Название презентации',
  'subtitle: Подзаголовок',
  'author: Имя / компания',
  'date: ' + new Date().toISOString().slice(0, 10),
  'lang: ru',
  '---',
  '',
  '# Заголовок первого слайда',
  '[layout: title]',
  '',
  '---',
  '',
  '# Первый смысловой слайд',
  '',
  '- Первый тезис',
  '- Второй тезис',
  '- Третий тезис',
  '',
].join('\n');

async function viewPresentations(name) {
  if (name) return viewPresentationEditor(name);
  const data = await api('/api/presentations');

  const nameInput = el('input', { type: 'text', placeholder: 'pitch-q3 (латиница, цифры, дефисы)', style: 'max-width:320px' });

  async function create() {
    const n = nameInput.value.trim();
    if (!n) return toast('Укажи имя презентации', true);
    await api('/api/presentations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, content: EXAMPLE_TEMPLATE }),
    });
    location.hash = '#/presentations:' + n;
  }

  $main.append(
    el('div', { class: 'page-header' },
      el('h1', null, 'Презентации'),
      el('div', { class: 'page-sub' }, 'Слева контент (input/*.md — «содержание, а не вёрстка»), справа готовые сборки (output/). Сборку запускает Claude — кнопкой «Собрать HTML» в редакторе или запросом в чате на главной.')
    ),
    el('div', { class: 'row', style: 'margin-bottom:24px' },
      nameInput,
      el('button', { class: 'btn primary', onclick: () => create().catch((e) => toast(e.message, true)) }, '+ Новая презентация')
    ),
    el('h2', null, 'Input — содержание'),
    data.inputs.length
      ? el('div', null, data.inputs.map((p) =>
          el('div', { class: 'list-item', onclick: () => (location.hash = '#/presentations:' + p.name) },
            el('span', null, p.name + '.md'),
            el('span', { class: 'spacer' }),
            el('span', { class: 'muted' }, new Date(p.mtime).toLocaleString('ru'))
          )))
      : el('div', { class: 'empty' }, 'Пока нет ни одной презентации.'),
    el('hr', { class: 'divider' }),
    el('h2', null, 'Output — готовые сборки'),
    data.outputs.length
      ? el('div', null, data.outputs.map((o) =>
          el('div', { class: 'list-item', onclick: () => o.hasIndex && window.open('/files/output/' + o.name + '/index.html', '_blank') },
            el('span', null, o.name),
            el('span', { class: 'spacer' }),
            el('span', { class: 'muted' }, o.hasIndex ? 'открыть index.html →' : 'нет index.html')
          )))
      : el('div', { class: 'empty' }, 'Сборок ещё нет — собери первую презентацию через чат на главной.')
  );
}

async function viewPresentationEditor(name) {
  const data = await api('/api/presentations/' + name);
  let content = data.content;
  const textarea = el('textarea', { class: 'md-editor', oninput: (e) => (content = e.target.value) }, content);

  async function save() {
    await api('/api/presentations/' + name, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    toast('Сохранено: input/' + name + '.md');
  }

  async function build() {
    try {
      await save();
    } catch (e) {
      return toast(e.message, true);
    }
    if (chatState.streaming) return toast('Claude ещё работает — дождись окончания', true);
    chatState.pending = { text: 'Собери презентацию «' + name + '» из input/' + name + '.md и покажи результат.' };
    location.hash = '#/overview';
  }

  $main.append(
    el('div', { class: 'page-header' },
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost', onclick: () => (location.hash = '#/presentations') }, '←'),
        el('h1', null, name),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', onclick: build }, 'Собрать HTML'),
        el('button', { class: 'btn primary', onclick: () => save().catch((e) => toast(e.message, true)) }, 'Сохранить')
      ),
      el('div', { class: 'page-sub' },
        'Файл input/' + name + '.md. Слайды разделяются «---». Пометки [layout: ...] и [image: ...] опциональны — при сборке макет подберётся по правилам.')
    ),
    textarea
  );
}

// ---------------------------------------------------------------- роутер

async function route() {
  const hash = location.hash.replace(/^#\//, '') || 'overview';

  renderNav(hash.startsWith('presentations:') ? 'presentations' : hash);
  $main.innerHTML = '';
  try {
    if (hash === 'overview') await viewOverview();
    else if (hash === 'colors') await viewColors();
    else if (hash === 'typography') await viewTypography();
    else if (hash === 'spacing' || hash === 'effects') await viewSimpleTokens(hash);
    else if (hash.startsWith('assets:')) await viewAssets(hash.slice(7));
    else if (hash.startsWith('rule:')) await viewRule(hash.slice(5));
    else if (hash.startsWith('presentations')) await viewPresentations(hash.startsWith('presentations:') ? hash.slice(14) : null);
    else await viewOverview();
  } catch (e) {
    $main.append(el('div', { class: 'empty' }, 'Ошибка: ' + e.message));
  }
}

window.addEventListener('hashchange', route);
route();

// ---------------------------------------------------------------- футер сайдбара: профиль и настройки

function openProfileModal() {
  let profile = {};
  try { profile = JSON.parse(localStorage.getItem('factory-profile') || '{}'); } catch {}
  const data = { name: profile.name || '', role: profile.role || '' };

  const overlay = el('div', {
    class: 'modal-overlay',
    onclick: (e) => { if (e.target === overlay) overlay.remove(); },
  });
  overlay.append(
    el('div', { class: 'profile-modal' },
      el('button', { class: 'btn-circle modal-close', title: 'Закрыть', onclick: () => overlay.remove() }, uiIcon('x')),
      el('div', { class: 'profile-avatar' }, uiIcon('user')),
      el('h2', { class: 'modal-title' }, 'Профиль'),
      el('div', { class: 'field-block' },
        el('span', { class: 'field-chip' }, 'ФИО'),
        el('textarea', { rows: 1, placeholder: 'Фамилия Имя Отчество', oninput: (e) => (data.name = e.target.value) }, data.name)
      ),
      el('div', { class: 'field-block' },
        el('span', { class: 'field-chip' }, 'Должность'),
        el('textarea', { rows: 1, placeholder: 'Например: менеджер по продажам', oninput: (e) => (data.role = e.target.value) }, data.role)
      ),
      el('button', {
        class: 'btn primary',
        onclick: () => {
          localStorage.setItem('factory-profile', JSON.stringify({ name: data.name.trim(), role: data.role.trim() }));
          toast('Профиль сохранён');
          overlay.remove();
        },
      }, 'Сохранить')
    )
  );
  document.body.append(overlay);
}

(function initSidebarActions() {
  const $profile = document.getElementById('btn-profile');
  const $settings = document.getElementById('btn-settings');
  if (!$profile || !$settings) return;
  $profile.prepend(uiIcon('user'));
  $settings.prepend(uiIcon('settings'));
  $profile.addEventListener('click', openProfileModal);
  $settings.addEventListener('click', () => {
    sidebarMode = sidebarMode === 'settings' ? 'chats' : 'settings';
    renderNav(currentHash());
  });
})();
