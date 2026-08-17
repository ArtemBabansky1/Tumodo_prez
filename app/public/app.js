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
  sparkles: '<path d="m12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4L12 3Z"/><path d="m5 14-.9 2.1L2 17l2.1.9L5 20l.9-2.1L8 17l-2.1-.9L5 14Z"/><path d="m19 13-1 2.5-2.5 1L18 17.5l1 2.5 1-2.5 2.5-1-2.5-1L19 13Z"/>',
  play: '<path d="m6 3 14 9-14 9V3Z"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  'file-pen': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"/><path d="M14 2v6h6"/><path d="m9 16 4.5-4.5 2 2L11 18H9v-2Z"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
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
      { id: 'rule:designer-reasoning', label: 'Мышление дизайнера' },
      { id: 'rule:creative-direction', label: 'Креативное направление' },
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
        onclick: () => {
          sidebarMode = 'chats';
          if (chatState.streaming) goChat();
          else renderNav(currentHash());
        },
      }, uiIcon('arrow-left'), chatState.streaming ? 'К активному чату' : 'К чатам')
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
  $nav.append(el('button', {
    class: 'nav-item engine-nav' + (activeId === 'engine' ? ' active' : ''),
    onclick: () => (location.hash = '#/engine'),
  }, uiIcon('sparkles'), 'Готовые презентации'));
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

// ---------------------------------------------------------------- чат фабрики (GPT / Codex)

function displayFileName(name) {
  try { return decodeURIComponent(name); } catch { return name; }
}

function displayChatText(text) {
  return String(text).replace(/(?:%[0-9a-f]{2}){2,}/gi, (encoded) => displayFileName(encoded));
}

function displayToolDetail(detail) {
  let value = displayChatText(detail || '').trim();
  const command = value.match(/\s+-Command\s+([\s\S]+)$/i);
  if (command) value = command[1].trim();
  return value.replace(/^['"]|['"]$/g, '');
}

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
  if (chatState.streaming) return toast('Агент ещё работает — дождитесь окончания', true);
  resetChat();
  goChat();
}

async function loadChat(id) {
  // Активный диалог уже живёт в памяти и продолжает получать события агента,
  // даже когда пользователь находится в другом разделе приложения.
  if (chatState.id === id) {
    sidebarMode = 'chats';
    goChat();
    return;
  }
  if (chatState.streaming) return toast('Агент ещё работает — дождитесь окончания', true);
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
    if (/^TITLE:\s*/.test(line.trim())) continue; // служебная строка — название чата в сайдбаре
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
  if (item.kind === 'user') return el('div', { class: 'chat-msg user' }, displayChatText(item.text));
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
    const icon = /пиш|прав|редакт/i.test(item.label || '') ? 'file-pen' : 'terminal';
    return el('div', { class: 'chat-tool' },
      uiIcon(icon),
      el('span', { class: 'chat-tool-label' }, item.label),
      item.detail ? el('span', { class: 'chat-tool-detail' }, displayToolDetail(item.detail)) : null);
  }
  if (item.kind === 'error') return el('div', { class: 'chat-msg error' }, item.text);
  if (item.kind === 'result') {
    return el('div', { class: 'chat-result' },
      el('div', { class: 'chat-result-title' }, 'Презентация готова: ' + item.name),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary', onclick: () => (location.hash = '#/engine:' + item.name) }, 'Открыть и доработать'),
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
  if (chatState.streaming) feed.append(el('div', { class: 'chat-working' }, 'Агент собирает презентацию…'));
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
  else if (ev.type === 'title') {
    // чат называет сам агент — по сути презентации, а не по формулировке запроса
    if (ev.title && ev.title !== chatState.title) {
      chatState.title = ev.title;
      if (sidebarMode === 'chats') renderNav(currentHash());
    }
  }
  else if (ev.type === 'error') chatState.items.push({ kind: 'error', text: ev.message });
  else if (ev.type === 'result') {
    if (ev.session) chatState.session = ev.session;
    if (ev.dir) {
      const name = ev.dir.replace(/^output\//, '');
      chatState.items.push({ kind: 'result', dir: ev.dir, name });
      location.hash = '#/engine:' + name;
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
    text: (text || '') + (files && files.length ? (text ? '\n' : '') + '📎 ' + files.map((f) => displayFileName(f.name)).join(', ') : ''),
  });
  chatState.streaming = true;
  rerenderChat();

  // первый запрос в новом диалоге — заводим чат в истории
  if (!chatState.id) {
    try {
      // название придёт от агента событием `title` (строка TITLE: в его ответе);
      // до этого в списке стоит нейтральная заглушка, а не текст запроса
      const title = 'Новая презентация…';
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
    chatState.items.push({ kind: 'error', text: 'Связь с агентом прервалась: ' + e.message });
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

let previewDeck = null; // имя презентации, открытой в панели предпросмотра

function openPreview(dir) {
  const name = dir.replace(/^output\//, '');
  previewDeck = name;
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

function normalizeFigmaTarget(value) {
  const raw = String(value || '').trim();
  const markdown = raw.match(/\]\((https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/[^\s<>"')]+)\)/i);
  const direct = raw.match(/https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/[^\s<>"')]+/i);
  return String((markdown && markdown[1]) || (direct && direct[0]) || raw.replace(/^@+/, ''))
    .replace(/[\],.;]+$/, '')
    .trim();
}

function validFigmaTarget(value) {
  try {
    const url = new URL(normalizeFigmaTarget(value));
    return /^(?:www\.)?figma\.com$/i.test(url.hostname)
      && /^\/(?:design|file)\/[a-zA-Z0-9_-]+(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

async function streamFigmaExport(deck, figmaUrl, onEvent) {
  const fd = new FormData();
  fd.append('mode', 'figma-export');
  fd.append('deck', deck);
  fd.append('figmaUrl', figmaUrl);
  const response = await fetch('/api/chat', { method: 'POST', body: fd });
  if (!response.ok) {
    let message = response.status + ' ' + response.statusText;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        onEvent(event);
        if (event.type === 'error') throw new Error(event.message || 'Ошибка переноса в Figma');
        if (event.type === 'result') {
          if (!event.ok) throw new Error(event.error || 'Перенос в Figma завершился с ошибкой');
          complete = true;
        }
      }
    }
  }
  if (!complete) throw new Error('Агент завершился без подтверждения переноса');
}

function openFigmaExportDialog(deck) {
  if (!/^[a-zA-Z0-9_-]+$/.test(deck)) return toast('Не выбрана готовая презентация', true);

  let busy = false;
  const savedTarget = localStorage.getItem('tumodo-figma-target') || '';
  const targetInput = el('input', {
    type: 'text',
    value: savedTarget,
    placeholder: 'https://www.figma.com/design/…',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const status = el('div', { class: 'figma-export-status', hidden: true });
  const statusIcon = el('span', { class: 'figma-export-status-icon' }, uiIcon('sparkles'));
  const statusText = el('span', null, 'Подключаемся к Figma…');
  status.append(statusIcon, statusText);
  const close = () => {
    if (busy) return;
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  };
  const cancel = el('button', { class: 'btn', type: 'button', onclick: close }, 'Отмена');
  const submit = el('button', { class: 'btn primary', type: 'button' }, 'Перенести презентацию');
  const openTarget = el('a', {
    class: 'btn primary',
    href: '#',
    target: '_blank',
    rel: 'noopener',
    hidden: true,
  }, 'Открыть в Figma');
  const closeButton = el('button', {
    class: 'btn-circle modal-close',
    type: 'button',
    title: 'Закрыть',
    onclick: close,
  }, uiIcon('x'));
  const actions = el('div', { class: 'figma-export-actions' }, cancel, submit, openTarget);
  const modal = el('section', {
    class: 'figma-export-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'figma-export-title',
  },
  closeButton,
  el('div', { class: 'figma-export-mark' }, uiIcon('sparkles')),
  el('div', { class: 'figma-export-copy' },
    el('h2', { id: 'figma-export-title' }, 'Перенести презентацию в Figma'),
    el('p', null, 'Вставьте ссылку на дизайн-файл или секцию. Агент добавит туда готовые слайды по порядку — каждый как редактируемый фрейм 1920×1080.'),
    el('label', { class: 'figma-export-field' },
      el('span', null, 'Ссылка на Figma'),
      targetInput
    ),
    el('div', { class: 'figma-export-note' }, 'Исходная презентация на платформе не изменится. Повторный экспорт создаст новую секцию.'),
    status,
    actions
  ));
  const overlay = el('div', {
    class: 'modal-overlay figma-export-overlay',
    onclick: (event) => { if (event.target === overlay) close(); },
  }, modal);

  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }

  submit.addEventListener('click', async () => {
    const figmaUrl = normalizeFigmaTarget(targetInput.value);
    if (!validFigmaTarget(figmaUrl)) {
      targetInput.focus();
      return toast('Вставьте ссылку на Figma design-файл или секцию', true);
    }
    targetInput.value = figmaUrl;
    busy = true;
    localStorage.setItem('tumodo-figma-target', figmaUrl);
    targetInput.disabled = true;
    submit.disabled = true;
    cancel.disabled = true;
    closeButton.disabled = true;
    submit.textContent = 'Переносим…';
    status.hidden = false;
    status.classList.remove('done', 'error');
    statusText.textContent = 'Подключаемся к Figma…';
    try {
      await streamFigmaExport(deck, figmaUrl, (event) => {
        if (event.type === 'tool') {
          statusText.textContent = event.detail || event.label || 'Собираем фреймы…';
        } else if (event.type === 'thinking') {
          statusText.textContent = 'Проверяем структуру и порядок слайдов…';
        } else if (event.type === 'text') {
          statusText.textContent = 'Завершаем перенос и проверяем Figma…';
        }
      });
      status.classList.add('done');
      statusIcon.replaceChildren(uiIcon('check'));
      statusText.textContent = 'Готово. Презентация добавлена в Figma.';
      submit.hidden = true;
      cancel.textContent = 'Закрыть';
      cancel.disabled = false;
      openTarget.href = figmaUrl;
      openTarget.hidden = false;
      closeButton.disabled = false;
      busy = false;
      toast('Презентация перенесена в Figma');
    } catch (error) {
      status.classList.add('error');
      statusIcon.replaceChildren(uiIcon('x'));
      statusText.textContent = error.message;
      submit.disabled = false;
      submit.textContent = 'Попробовать снова';
      cancel.disabled = false;
      closeButton.disabled = false;
      targetInput.disabled = false;
      busy = false;
    }
  });

  document.body.append(overlay);
  document.addEventListener('keydown', onKeydown);
  queueMicrotask(() => targetInput.focus());
}

document.getElementById('preview-figma').addEventListener('click', () => {
  if (previewDeck) openFigmaExportDialog(previewDeck);
});

// «Скачать PDF»: сервер прогоняет scripts/export-pdf.js и отдаёт ссылку на файл
document.getElementById('preview-download').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!previewDeck || btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Готовлю PDF…';
  try {
    const r = await api('/api/export-pdf/' + previewDeck, { method: 'POST' });
    const a = el('a', { href: r.url, download: r.file });
    document.body.append(a);
    a.click();
    a.remove();
    toast('PDF готов: ' + r.file);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// ---------------------------------------------------------------- обзор (главная: чат)

async function viewOverview() {
  const files = [];
  const agentStatus = el('div', { class: 'agent-status checking' },
    el('span', { class: 'agent-status-dot' }),
    el('span', { class: 'agent-status-text' }, 'GPT · проверяем подключение…')
  );
  api('/api/agent/status').then((status) => {
    agentStatus.className = 'agent-status ' + (status.ready ? 'ready' : 'offline');
    agentStatus.querySelector('.agent-status-text').textContent = status.ready
      ? 'GPT · подключён'
      : 'GPT · требуется вход в Codex';
    agentStatus.title = status.message || '';
  }).catch(() => {
    agentStatus.className = 'agent-status offline';
    agentStatus.querySelector('.agent-status-text').textContent = 'GPT · соединение недоступно';
  });
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
      }, displayFileName(f.name) + '  ✕'))
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
      agentStatus,
      el('div', { class: 'home-note chat-note' }, 'Приложите структуру и контент. Агент сам выберет каноны и ассеты, проверит каждый слайд и откроет готовый результат.'),
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

const SUB_LABELS = {
  people: 'люди', '3d': '3D', figma: 'Figma',
  screens: 'экраны продукта', devices: 'устройства',
  svg: 'SVG', png: 'PNG', files: 'файлы',
};

function assetFolderLabel(item) {
  return String(item.folder || item.sub || '')
    .split('/')
    .filter(Boolean)
    .map((part) => SUB_LABELS[part] || part)
    .join(' / ');
}

const CAT_HINTS = {
  logo: 'Все варианты логотипа: основной, монохром, инверсия, знак. SVG кладётся в svg/, растровые — в png/.',
  icons: 'Набор иконок в SVG с осмысленными именами (kebab-case латиницей).',
  fonts: 'Файлы шрифтов woff2/ttf/otf. Имена должны совпадать с семействами в «Типографике».',
  photos: 'Фото людей и 3D-рендеры. «Все» показывает обе подпапки; перед загрузкой выбери конкретную.',
  patterns: 'Фирменные паттерны и текстуры (SVG/PNG).',
  mockups: 'Мокапы, реальные экраны продукта и устройства. «Все» показывает три подпапки; перед загрузкой можно выбрать нужную.',
};

const CAT_RULES = { logo: 'logo-rules', icons: 'icons-rules', fonts: 'fonts-rules', photos: 'photos-rules', patterns: 'patterns-rules', mockups: 'mockups-rules' };

let fontFaceCounter = 0;

async function viewAssets(cat) {
  const label = ASSET_LABELS[cat];
  const data = await api('/api/assets/' + cat);

  let currentSub = ''; // '' — «все» (без фильтра)
  let subDropdown = null;
  if (data.subdirs.length > 1) {
    const options = [{ value: '', label: 'Все' }, ...data.subdirs.map((value) => ({ value, label: SUB_LABELS[value] || value }))];
    const menu = el('div', { class: 'asset-subfolder-menu', role: 'listbox', hidden: true });
    const valueLabel = el('span', { class: 'asset-subfolder-value' }, options[0].label);
    let outsideClickHandler = null;
    const trigger = el('button', {
      type: 'button',
      class: 'btn asset-subfolder-trigger',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      onclick: (event) => {
        event.stopPropagation();
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
        subDropdown.classList.toggle('open', willOpen);
        if (willOpen) {
          queueMicrotask(() => {
            outsideClickHandler = (outsideEvent) => {
              if (!subDropdown.contains(outsideEvent.target)) closeMenu();
            };
            document.addEventListener('click', outsideClickHandler);
          });
        }
      },
      onkeydown: (event) => {
        if (event.key === 'Escape') closeMenu();
      },
    }, valueLabel, uiIcon('chevron-down'));

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      subDropdown.classList.remove('open');
      if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler);
      outsideClickHandler = null;
    }

    function renderOptions() {
      menu.replaceChildren(...options.map((option) => el('button', {
        type: 'button',
        class: 'asset-subfolder-option' + (option.value === currentSub ? ' selected' : ''),
        role: 'option',
        'aria-selected': String(option.value === currentSub),
        onclick: (event) => {
          event.stopPropagation();
          currentSub = option.value;
          valueLabel.textContent = option.label;
          renderOptions();
          renderAssets();
          closeMenu();
          trigger.focus();
        },
      }, option.label)));
    }

    subDropdown = el('div', { class: 'asset-subfolder' }, trigger, menu);
    renderOptions();
  }

  const fileInput = el('input', { type: 'file', multiple: true, style: 'display:none', onchange: (e) => uploadFiles(e.target.files) });

  async function uploadFiles(files) {
    if (!files || !files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (subDropdown && currentSub) fd.append('sub', currentSub);
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
            el('span', { class: 'pill-badge' }, assetFolderLabel(item))
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
          el('span', { class: 'pill-badge' }, assetFolderLabel(item))
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

  const pageNodes = [header];
  if (subDropdown) {
    pageNodes.push(el('div', { class: 'asset-subfolder-row' },
      el('span', { class: 'asset-subfolder-label' }, 'Подпапка:'), subDropdown));
  }
  pageNodes.push(dropzone, fileInput, gridHost);
  $main.append(...pageNodes);
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
      el('div', { class: 'page-sub' }, 'Markdown-файл: ' + rule.path + '. Эти инструкции определяют работу агента при сборке презентаций.')
    ),
    textarea
  );
}

// ---------------------------------------------------------------- визуальный движок

const ENGINE_ASSET_GROUPS = {
  photos: 'Фото',
  threeD: '3D',
  mockups: 'Мокапы',
};

async function viewEngine(requestedName) {
  const decks = await api('/api/presentations');
  const readyDecks = decks.outputs.filter((item) => item.hasIndex);
  if (!readyDecks.length) {
    $main.append(
      el('div', { class: 'engine-empty' },
        el('div', { class: 'engine-empty-icon' }, uiIcon('sparkles')),
        el('h1', null, 'Здесь появится готовая презентация'),
        el('div', { class: 'page-sub' }, 'Загрузите в чат файл со структурой и контентом. Агент сам выберет дизайн, соберёт и проверит все слайды.'),
        el('button', { class: 'btn primary', onclick: newChat }, 'Создать в чате')
      )
    );
    return;
  }

  const knownNames = new Set(readyDecks.map((item) => item.name));
  const name = knownNames.has(requestedName) ? requestedName : readyDecks[0].name;
  if (requestedName !== name) history.replaceState(null, '', '#/engine:' + name);

  await api('/api/creative-directions/' + name);
  const [catalog, initialReview] = await Promise.all([
    api('/api/engine/catalog'),
    api('/api/review/' + name),
  ]);
  const state = {
    review: initialReview,
    slideIndex: 0,
    tab: 'layouts',
    assetGroup: 'photos',
    query: '',
    referenceRole: 'recommended',
    selectedVariant: null,
    selectedAsset: null,
    instruction: '',
    status: '',
    busy: false,
    showStyleframe: Boolean(initialReview.slides[0] && initialReview.slides[0].styleframeUrl),
  };

  const shell = el('div', { class: 'engine-shell' });
  const headerHost = el('div', { class: 'engine-header-host' });
  const stageHost = el('section', { class: 'engine-stage-host' });
  const inspectorHost = el('aside', { class: 'engine-inspector-host' });
  const workspace = el('div', { class: 'engine-workspace' }, stageHost, inspectorHost);
  shell.append(headerHost, workspace);
  $main.append(shell);

  const currentSlide = () => state.review.slides[state.slideIndex];
  const layoutGroup = (id) => catalog.layouts.find((item) => item.id === id);
  const selectedReference = (slide) => {
    if (state.selectedVariant) return state.selectedVariant;
    const current = (catalog.references || []).find((item) => item.source === slide.reference || item.file === slide.variant);
    return current || (slide.recommendations || [])[0] || null;
  };

  async function regenerateSlide(button) {
    if (state.busy) return;
    const slide = currentSlide();
    const reference = selectedReference(slide);
    if (!reference) return toast('Выберите канонический вариант', true);
    state.busy = true;
    state.status = 'Агент изучает текущий слайд и выбранный канон…';
    shell.classList.add('is-busy');
    button.disabled = true;
    renderInspector();
    try {
      const fd = new FormData();
      fd.append('mode', 'slide-refinement');
      fd.append('deck', name);
      fd.append('slide', String(state.slideIndex + 1));
      fd.append('reference', reference.source);
      if (state.selectedAsset) fd.append('asset', state.selectedAsset.source);
      if (state.instruction.trim()) fd.append('instruction', state.instruction.trim());
      const res = await fetch('/api/chat', { method: 'POST', body: fd });
      if (!res.ok) {
        let message = res.status + ' ' + res.statusText;
        try { message = (await res.json()).error || message; } catch {}
        throw new Error(message);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let complete = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            let event;
            try { event = JSON.parse(line.slice(6)); } catch { continue; }
            if (event.type === 'tool') state.status = event.label + (event.detail ? ' · ' + event.detail : '');
            else if (event.type === 'thinking') state.status = 'Агент сравнивает композицию…';
            else if (event.type === 'result') {
              if (!event.ok) throw new Error(event.error || 'Перегенерация завершилась с ошибкой');
              complete = true;
            } else if (event.type === 'error') throw new Error(event.message || 'Ошибка агента');
            renderInspector();
          }
        }
      }
      if (!complete) throw new Error('Агент завершился без обновлённого результата');
      state.review = await api('/api/review/' + name + '?v=' + Date.now());
      state.selectedVariant = null;
      state.selectedAsset = null;
      state.instruction = '';
      state.status = '';
      renderStage();
      toast('Слайд ' + (state.slideIndex + 1) + ' обновлён');
    } catch (e) {
      state.status = '';
      toast(e.message, true);
    } finally {
      state.busy = false;
      shell.classList.remove('is-busy');
      button.disabled = false;
      renderInspector();
    }
  }

  async function selectCreativeDirection(id) {
    if (state.busy || !id) return;
    if (id === (state.review.creativeDirections && state.review.creativeDirections.selected)) {
      const slide = currentSlide();
      if (slide && slide.styleframeUrl) {
        state.showStyleframe = true;
        renderStage();
        toast('Направление уже выбрано — показываю его styleframe');
      } else {
        toast('Направление уже выбрано. Оно применится при следующей пересборке');
      }
      return;
    }
    state.busy = true;
    shell.classList.add('is-busy');
    try {
      await api('/api/creative-directions/' + name, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: id }),
      });
      state.review = await api('/api/review/' + name + '?v=' + Date.now());
      state.selectedVariant = null;
      state.selectedAsset = null;
      state.showStyleframe = Boolean(currentSlide() && currentSlide().styleframeUrl);
      renderHeader();
      renderStage();
      renderInspector();
      toast('Креативное направление выбрано — рекомендации обновлены');
    } catch (e) {
      toast(e.message, true);
    } finally {
      state.busy = false;
      shell.classList.remove('is-busy');
      renderHeader();
      renderInspector();
    }
  }

  function renderHeader() {
    headerHost.innerHTML = '';
    const deckMenu = el('div', { class: 'engine-deck-menu', role: 'listbox', hidden: true });
    const deckValue = el('span', { class: 'engine-deck-value' }, name);
    let deckOutsideClickHandler = null;
    const deckTrigger = el('button', {
      type: 'button',
      class: 'btn engine-deck-trigger',
      'aria-label': 'Презентация: ' + name,
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      onclick: (event) => {
        event.stopPropagation();
        const willOpen = deckMenu.hidden;
        deckMenu.hidden = !willOpen;
        deckTrigger.setAttribute('aria-expanded', String(willOpen));
        deckDropdown.classList.toggle('open', willOpen);
        if (willOpen) {
          queueMicrotask(() => {
            deckOutsideClickHandler = (outsideEvent) => {
              if (!deckDropdown.contains(outsideEvent.target)) closeDeckMenu();
            };
            document.addEventListener('click', deckOutsideClickHandler);
          });
        }
      },
      onkeydown: (event) => {
        if (event.key === 'Escape') closeDeckMenu();
      },
    }, deckValue, uiIcon('chevron-down'));

    function closeDeckMenu() {
      deckMenu.hidden = true;
      deckTrigger.setAttribute('aria-expanded', 'false');
      deckDropdown.classList.remove('open');
      if (deckOutsideClickHandler) document.removeEventListener('click', deckOutsideClickHandler);
      deckOutsideClickHandler = null;
    }

    deckMenu.replaceChildren(...readyDecks.map((item) => el('button', {
      type: 'button',
      class: 'engine-deck-option' + (item.name === name ? ' selected' : ''),
      role: 'option',
      'aria-selected': String(item.name === name),
      onclick: (event) => {
        event.stopPropagation();
        closeDeckMenu();
        if (item.name !== name) location.hash = '#/engine:' + item.name;
      },
    }, item.name)));
    const deckDropdown = el('div', { class: 'engine-deck-dropdown' }, deckTrigger, deckMenu);
    const creativeDocument = state.review.creativeDirections;
    const directions = creativeDocument && Array.isArray(creativeDocument.directions) ? creativeDocument.directions : [];
    headerHost.append(
      el('header', { class: 'engine-header' },
        el('div', { class: 'engine-title-block' },
          el('div', { class: 'engine-title-row' },
            deckDropdown
          )
        ),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn ghost',
          onclick: () => { sidebarMode = 'settings'; location.hash = '#/presentations:' + name; },
        }, 'Исходник'),
        el('button', { class: 'btn', onclick: () => openFigmaExportDialog(name) }, 'Перенести в Figma'),
        el('button', { class: 'btn primary engine-build', onclick: () => openPreview('output/' + name) }, uiIcon('play'), 'Открыть презентацию')
      ),
      directions.length ? el('div', { class: 'engine-direction-strip' },
        el('div', { class: 'engine-direction-intro' },
          el('strong', null, 'Креативное направление'),
          el('span', null, 'Все варианты внутри дизайн-системы')
        ),
        el('div', { class: 'engine-direction-options' }, directions.map((direction) => {
          const selected = creativeDocument.selected === direction.id;
          return el('button', {
            class: 'engine-direction-card' + (selected ? ' selected' : ''),
            'aria-pressed': String(selected),
            title: direction.idea,
            onclick: () => selectCreativeDirection(direction.id),
          },
          el('span', { class: 'engine-direction-title-row' },
            el('span', { class: 'engine-direction-title' }, direction.title),
            selected ? el('span', { class: 'engine-direction-selected' }, uiIcon('check'), 'Выбрано') : null
          ),
          el('span', { class: 'engine-direction-idea' }, direction.tension));
        })),
        el('span', { class: 'engine-direction-safe' }, uiIcon('check'), 'Brand-safe')
      ) : null
    );
  }

  function renderStage() {
    stageHost.innerHTML = '';
    const slide = currentSlide();
    if (!slide) return;
    const group = layoutGroup(slide.layout);
    const showingStyleframe = Boolean(state.showStyleframe && slide.styleframeUrl);

    const resultFrame = el('div', { class: 'engine-canon-frame engine-result-frame' },
      showingStyleframe
        ? el('img', { src: slide.styleframeUrl, alt: 'Styleframe направления для слайда ' + slide.number })
        : slide.screenshotUrl
        ? el('img', { src: slide.screenshotUrl, alt: 'Готовый слайд ' + slide.number })
        : el('div', { class: 'engine-canon-missing' }, 'Скриншот ещё не создан')
    );

    const filmstrip = el('div', { class: 'engine-filmstrip' }, state.review.slides.map((item, index) => {
      return el('button', {
        class: 'engine-slide-thumb' + (index === state.slideIndex ? ' selected' : ''),
        title: item.title,
        onclick: () => {
          state.slideIndex = index;
          state.referenceRole = 'recommended';
          state.selectedVariant = null;
          state.selectedAsset = null;
          state.instruction = '';
          state.query = '';
          state.showStyleframe = Boolean(item.styleframeUrl);
          if (state.tab === 'assets') {
            state.assetGroup = item.threeD ? 'threeD' : (item.image && item.image.startsWith('mockups/') ? 'mockups' : 'photos');
          }
          renderStage();
          renderInspector();
        },
      },
      el('span', { class: 'engine-thumb-number' }, String(index + 1).padStart(2, '0')),
      item.screenshotUrl ? el('img', { src: item.screenshotUrl, alt: '' }) : null,
      el('span', { class: 'engine-thumb-title' }, item.title || 'Без заголовка'));
    }));

    stageHost.append(
      el('div', { class: 'engine-stage' },
        el('div', { class: 'engine-stage-topline' },
          el('div', null,
            el('span', { class: 'engine-slide-kicker' }, 'Слайд ' + (state.slideIndex + 1) + ' из ' + state.review.slides.length),
            el('strong', null, group ? group.label : slide.layout)
          ),
          el('div', { class: 'engine-stage-actions' },
            slide.styleframeUrl ? el('div', { class: 'engine-view-switch', role: 'group', 'aria-label': 'Режим просмотра' },
              el('button', {
                class: showingStyleframe ? '' : 'selected',
                'aria-pressed': String(!showingStyleframe),
                onclick: () => { state.showStyleframe = false; renderStage(); },
              }, 'Текущий слайд'),
              el('button', {
                class: showingStyleframe ? 'selected' : '',
                'aria-pressed': String(showingStyleframe),
                onclick: () => { state.showStyleframe = true; renderStage(); },
              }, 'Styleframe')
            ) : null,
            el('span', { class: 'pill-badge' }, showingStyleframe ? 'Концепт · GPT Image' : 'Собран агентом')
          )
        ),
        resultFrame
      ),
      filmstrip
    );
  }

  function layoutInspector(slide) {
    const roleId = state.referenceRole || 'recommended';
    const familyItems = [
      { id: 'recommended', label: 'Подходит слайду', count: (slide.recommendations || []).length },
      ...(catalog.referenceRoles || []),
    ];
    const currentFamily = familyItems.find((item) => item.id === roleId) || familyItems[0];
    const sourceItems = roleId === 'recommended'
      ? (slide.recommendations || [])
      : (catalog.references || []).filter((item) => item.role === roleId);
    const items = sourceItems.slice(0, 30);
    const familyMenu = el('div', { class: 'engine-family-menu', role: 'listbox', hidden: true });
    const familyValue = el('span', { class: 'engine-family-value' },
      el('span', null, currentFamily.label),
      el('small', null, currentFamily.count));
    let familyOutsideClickHandler = null;
    const familyTrigger = el('button', {
      type: 'button',
      class: 'btn engine-family-trigger',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      onclick: (event) => {
        event.stopPropagation();
        const willOpen = familyMenu.hidden;
        familyMenu.hidden = !willOpen;
        familyTrigger.setAttribute('aria-expanded', String(willOpen));
        familyDropdown.classList.toggle('open', willOpen);
        if (willOpen) {
          queueMicrotask(() => {
            familyOutsideClickHandler = (outsideEvent) => {
              if (!familyDropdown.contains(outsideEvent.target)) closeFamilyMenu();
            };
            document.addEventListener('click', familyOutsideClickHandler);
          });
        }
      },
      onkeydown: (event) => {
        if (event.key === 'Escape') closeFamilyMenu();
      },
    }, familyValue, uiIcon('chevron-down'));

    function closeFamilyMenu() {
      familyMenu.hidden = true;
      familyTrigger.setAttribute('aria-expanded', 'false');
      familyDropdown.classList.remove('open');
      if (familyOutsideClickHandler) document.removeEventListener('click', familyOutsideClickHandler);
      familyOutsideClickHandler = null;
    }

    familyMenu.replaceChildren(...familyItems.map((item) => el('button', {
      type: 'button',
      class: 'engine-family-option' + (item.id === roleId ? ' selected' : ''),
      role: 'option',
      'aria-selected': String(item.id === roleId),
      onclick: (event) => {
        event.stopPropagation();
        closeFamilyMenu();
        state.referenceRole = item.id;
        state.query = '';
        renderInspector({ preserveScroll: true });
      },
    }, el('span', null, item.label), el('small', null, item.count))));
    const familyDropdown = el('div', { class: 'engine-family-dropdown' }, familyTrigger, familyMenu);

    return [
      familyDropdown,
      el('div', { class: 'engine-section-label' }, (roleId === 'recommended' ? 'Лучшие совпадения' : 'Семейство') + ' · ' + items.length),
      items.length ? el('div', { class: 'engine-choice-grid engine-reference-grid' }, items.map((reference) => {
        const selected = state.selectedVariant ? state.selectedVariant.id === reference.id : slide.reference === reference.source;
        return el('button', {
           class: 'engine-choice-card' + (selected ? ' selected' : ''),
           'aria-pressed': String(selected),
           'aria-label': reference.comment || 'Канон слайда',
           onclick: () => { state.selectedVariant = reference; renderInspector({ preserveScroll: true }); },
        },
        el('span', { class: 'engine-choice-preview' }, el('img', { src: reference.url, alt: '', loading: 'lazy' })));
      })) : el('div', { class: 'engine-no-results' }, 'В этом семействе ничего не найдено'),
      el('div', { class: 'engine-inspector-note' }, 'Референс задаёт геометрию и характер пустоты. Агент адаптирует его к вашему тексту, а не копирует содержимое исходного слайда.'),
    ];
  }

  function assetInspector(slide) {
    const selectedPath = state.selectedAsset ? state.selectedAsset.source : '';
    const query = state.query.trim().toLowerCase();
    const sourceItems = catalog.assets[state.assetGroup] || [];
    const items = sourceItems.filter((item) => !query || [item.name, item.description, item.usage].join(' ').toLowerCase().includes(query));
    const search = el('input', {
      type: 'text',
      class: 'engine-search',
      placeholder: 'Найти по названию или смыслу',
      value: state.query,
      oninput: (e) => {
        state.query = e.target.value;
        renderInspector();
        const nextSearch = inspectorHost.querySelector('.engine-search');
        if (nextSearch) {
          nextSearch.focus();
          nextSearch.setSelectionRange(state.query.length, state.query.length);
        }
      },
    });
    const nodes = [
      el('div', { class: 'engine-asset-toolbar' },
        el('div', { class: 'engine-segments compact' }, Object.entries(ENGINE_ASSET_GROUPS).map(([id, label]) =>
          el('button', {
            class: id === state.assetGroup ? 'selected' : '',
            onclick: () => { state.assetGroup = id; state.query = ''; renderInspector(); },
          }, label, el('span', null, (catalog.assets[id] || []).length))
        )),
        search
      ),
    ];
    if (selectedPath) nodes.push(el('button', { class: 'engine-remove-asset', onclick: () => { state.selectedAsset = null; renderInspector({ preserveScroll: true }); } }, 'Не использовать новый ассет'));
    nodes.push(
      el('div', { class: 'engine-section-label' }, ENGINE_ASSET_GROUPS[state.assetGroup] + ' · ' + items.length),
      items.length
        ? el('div', { class: 'engine-choice-grid asset-choices' }, items.map((item) => {
            const selected = selectedPath === item.source;
            return el('button', {
               class: 'engine-choice-card asset-choice' + (selected ? ' selected' : ''),
               'aria-label': item.name,
               'aria-pressed': String(selected),
               onclick: () => { state.selectedAsset = selected ? null : item; renderInspector({ preserveScroll: true }); },
            },
            el('span', { class: 'engine-choice-preview' }, el('img', { src: item.url, alt: '', loading: 'lazy' })));
          }))
        : el('div', { class: 'engine-no-results' }, 'Ничего не найдено'),
      el('div', { class: 'engine-inspector-note' },
        state.assetGroup === 'threeD'
          ? 'Движок определит владельца 3D: конкретная карточка получит крупный объект с clip content; общий объект уйдёт за низ слайда и будет смещён от центра.'
          : 'Ассет — пожелание для новой версии, а не механическая вставка в существующий шаблон.'
      )
    );
    if (state.assetGroup === 'threeD' && slide.assetGap) {
      nodes.push(el('div', { class: 'engine-inspector-note' }, slide.assetGap));
    }
    return nodes;
  }

  function renderInspector({ preserveScroll = false } = {}) {
    const previousBody = inspectorHost.querySelector('.engine-inspector-body');
    const previousScrollTop = preserveScroll && previousBody ? previousBody.scrollTop : 0;
    inspectorHost.innerHTML = '';
    const slide = currentSlide();
    const tabs = el('div', { class: 'engine-tabs' },
      el('button', {
        class: state.tab === 'layouts' ? 'active' : '',
        onclick: () => { state.tab = 'layouts'; state.query = ''; renderInspector(); },
      }, 'Канон'),
      el('button', {
        class: state.tab === 'assets' ? 'active' : '',
        onclick: () => {
          state.tab = 'assets';
          state.query = '';
          state.assetGroup = slide.threeD ? 'threeD' : (slide.image && slide.image.startsWith('mockups/') ? 'mockups' : 'photos');
          renderInspector();
        },
      }, 'Ассет')
    );
    const body = el('div', { class: 'engine-inspector-body' },
      state.tab === 'layouts' ? layoutInspector(slide) : assetInspector(slide)
    );
    const instruction = el('textarea', {
      class: 'engine-refine-input',
      rows: 3,
      placeholder: 'Опционально: что ещё изменить в этом слайде?',
      oninput: (e) => (state.instruction = e.target.value),
    }, state.instruction);
    const applyButton = el('button', {
      class: 'btn primary engine-refine-button',
      disabled: state.busy,
      onclick: () => regenerateSlide(applyButton),
    }, uiIcon('sparkles'), state.busy ? 'Агент работает…' : 'Сделать новый вариант');
    inspectorHost.append(
      el('div', { class: 'engine-inspector-head' },
        el('div', null, el('strong', null, 'Изменить готовый слайд'), el('span', null, String(state.slideIndex + 1).padStart(2, '0'))),
        tabs
      ),
      body,
      el('div', { class: 'engine-refine-panel' },
        state.status ? el('div', { class: 'engine-refine-status' }, state.status) : null,
        instruction,
        applyButton
       )
     );
    if (preserveScroll) body.scrollTop = previousScrollTop;
  }

  renderHeader();
  renderStage();
  renderInspector();
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
      el('div', { class: 'page-sub' }, 'Input/*.md хранит содержание, output/ — готовые сборки. Первую версию агент оформляет сам; здесь доступны исходник и результат.')
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
      : el('div', { class: 'empty' }, 'Сборок ещё нет — открой презентацию в движке и нажми «Собрать».')
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
      const result = await api('/api/presentations/' + name + '/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strict: false }),
      });
      toast(result.warnings ? 'Собрано — есть замечания по объёму текста' : 'Презентация собрана');
      openPreview(result.dir);
    } catch (e) { toast(e.message, true); }
  }

  $main.append(
    el('div', { class: 'page-header' },
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost', onclick: () => (location.hash = '#/presentations') }, '←'),
        el('h1', null, name),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn',
          onclick: () => { sidebarMode = 'chats'; location.hash = '#/engine:' + name; },
        }, uiIcon('sparkles'), 'Открыть результат'),
        el('button', { class: 'btn', onclick: build }, 'Локальная сборка'),
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

  const activeNav = hash.startsWith('presentations:') ? 'presentations' : (hash.startsWith('engine') ? 'engine' : hash);
  renderNav(activeNav);
  $main.innerHTML = '';
  $main.classList.toggle('engine-mode', hash.startsWith('engine'));
  try {
    if (hash === 'overview') await viewOverview();
    else if (hash === 'colors') await viewColors();
    else if (hash === 'typography') await viewTypography();
    else if (hash === 'spacing' || hash === 'effects') await viewSimpleTokens(hash);
    else if (hash.startsWith('assets:')) await viewAssets(hash.slice(7));
    else if (hash.startsWith('rule:')) await viewRule(hash.slice(5));
    else if (hash.startsWith('engine')) await viewEngine(hash.startsWith('engine:') ? hash.slice(7) : null);
    else if (hash.startsWith('presentations')) await viewPresentations(hash.startsWith('presentations:') ? hash.slice(14) : null);
    else await viewOverview();
  } catch (e) {
    $main.append(el('div', { class: 'empty' }, 'Ошибка: ' + e.message));
  }
}

window.addEventListener('hashchange', route);
route();

// ---------------------------------------------------------------- футер сайдбара: профиль и настройки

/** Карточка профиля: обои, аватар, имя, должность, уровень доступа и счётчик презентаций. */
async function openProfileModal() {
  let p;
  try { p = await api('/api/profile'); } catch (e) { return toast('Не удалось открыть профиль: ' + e.message, true); }

  // раньше профиль лежал в localStorage — переносим на сервер один раз
  if (!p.name && !p.role) {
    let old = {};
    try { old = JSON.parse(localStorage.getItem('factory-profile') || '{}'); } catch {}
    if (old.name || old.role) {
      try {
        await api('/api/profile', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: old.name || '', role: old.role || '' }),
        });
        localStorage.removeItem('factory-profile');
        p = await api('/api/profile');
      } catch {}
    }
  }

  const overlay = el('div', {
    class: 'modal-overlay',
    onclick: (e) => { if (e.target === overlay) overlay.remove(); },
  });

  const cover = el('div', { class: 'profile-cover' + (p.wallpaper ? '' : ' empty') });
  if (p.wallpaper) cover.style.backgroundImage = 'url("' + p.wallpaper + '")';

  const avatar = el('div', { class: 'profile-avatar' });
  if (p.avatar) avatar.append(el('img', { src: p.avatar, alt: '' }));
  else avatar.append(uiIcon('user'));

  overlay.append(
    el('div', { class: 'profile-card' },
      cover,
      el('button', { class: 'btn-circle modal-close', title: 'Закрыть', onclick: () => overlay.remove() }, uiIcon('x')),
      avatar,
      el('div', { class: 'profile-body' },
        el('div', { class: 'profile-name' }, p.name || 'Без имени'),
        el('div', { class: 'profile-role' }, p.role || 'Должность не указана'),
        el('div', { class: 'profile-meta' },
          el('span', { class: 'profile-level-label' }, 'Уровень доступа'),
          el('span', { class: 'profile-level' }, p.level || '—'),
          el('div', { class: 'profile-actions' },
            el('button', {
              class: 'btn-circle', title: 'Настройки профиля',
              onclick: () => { overlay.remove(); openProfileSettings(); },
            }, uiIcon('settings')),
            el('button', {
              class: 'btn-circle', title: 'Выйти',
              onclick: () => {
                // авторизации в приложении пока нет: «выйти» = закрыть текущую
                // сессию работы (сброс активного чата) и вернуться на главную
                if (!confirm('Выйти из аккаунта? Текущий диалог закроется, история чатов останется.')) return;
                overlay.remove();
                resetChat();
                location.hash = '#/overview';
                route();
              },
            }, uiIcon('log-out'))
          )
        ),
        el('div', { class: 'profile-stat' },
          el('span', { class: 'profile-count' }, String(p.decks ?? 0)),
          el('span', { class: 'profile-count-label' }, 'Презентаций разработано')
        )
      )
    )
  );
  document.body.append(overlay);
}

/** Настройки профиля: ФИО, должность, аватар и обои. Уровень доступа только для чтения. */
async function openProfileSettings() {
  let p;
  try { p = await api('/api/profile'); } catch (e) { return toast('Не удалось открыть настройки: ' + e.message, true); }
  const data = { name: p.name || '', role: p.role || '' };

  const overlay = el('div', {
    class: 'modal-overlay',
    onclick: (e) => { if (e.target === overlay) overlay.remove(); },
  });

  /** Строка загрузки картинки: превью + кнопка выбора файла. */
  function imageRow(kind, label, hint) {
    const preview = el('div', { class: 'profile-upload-preview' + (kind === 'avatar' ? ' round' : '') });
    const paint = (url) => {
      preview.innerHTML = '';
      if (url) preview.append(el('img', { src: url, alt: '' }));
      else preview.append(uiIcon('image'));
    };
    paint(p[kind]);
    const input = el('input', {
      type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none',
      onchange: async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const r = await api('/api/profile/image/' + kind, { method: 'POST', body: fd });
          p[kind] = r.url;
          paint(r.url);
          toast(label + ': загружено');
        } catch (err) { toast(err.message, true); }
      },
    });
    return el('div', { class: 'field-block profile-upload' },
      el('span', { class: 'field-chip' }, label),
      el('div', { class: 'row', style: 'align-items:center; gap:12px' },
        preview,
        el('button', { class: 'btn', onclick: () => input.click() }, 'Загрузить'),
        el('span', { class: 'helper' }, hint)
      ),
      input
    );
  }

  overlay.append(
    el('div', { class: 'profile-modal' },
      el('button', { class: 'btn-circle modal-close', title: 'Закрыть', onclick: () => overlay.remove() }, uiIcon('x')),
      el('h2', { class: 'modal-title' }, 'Настройки профиля'),
      el('div', { class: 'field-block' },
        el('span', { class: 'field-chip' }, 'ФИО'),
        el('textarea', { rows: 1, placeholder: 'Фамилия Имя Отчество', oninput: (e) => (data.name = e.target.value) }, data.name)
      ),
      el('div', { class: 'field-block' },
        el('span', { class: 'field-chip' }, 'Должность'),
        el('textarea', { rows: 1, placeholder: 'Например: Web дизайнер', oninput: (e) => (data.role = e.target.value) }, data.role)
      ),
      imageRow('avatar', 'Аватарка', 'Квадратная картинка, PNG или JPG'),
      imageRow('wallpaper', 'Обои', 'Горизонтальная картинка, PNG или JPG'),
      el('div', { class: 'field-block locked' },
        el('span', { class: 'field-chip' }, 'Уровень доступа'),
        el('div', { class: 'profile-level-value' }, p.level || '—'),
        el('span', { class: 'helper' }, 'Меняется только системно — в файле app/data/profile.json')
      ),
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          try {
            await api('/api/profile', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: data.name, role: data.role }),
            });
            toast('Профиль сохранён');
            overlay.remove();
            openProfileModal();
          } catch (e) { toast(e.message, true); }
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
