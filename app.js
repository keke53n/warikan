/**
 * 割り勘アプリ 画面のプログラム(app.js)
 *
 * 処理のプログラム(Google Apps Script)に依頼を送り、結果を画面に表示します。
 * 画面は「ログイン」「招待への参加」「ホーム」「ルーム(記録・精算・集計・設定)」です。
 */
'use strict';

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyaB_yR3MVVOSmA9jSk65UWxNUMp3N4MDqQaYJE8F7ThPrPBITgMzXoI4ubVL4wV7nldg/exec',
  CLIENT_ID: '614975532327-f34ubr874cedk0fegmpldotlkrq33t1i.apps.googleusercontent.com',
  APP_URL: 'https://keke53n.github.io/warikan/',
};

const STORAGE_KEYS = { token: 'warikan.token', user: 'warikan.user', invite: 'warikan.invite' };
const TABS = [
  { id: 'records', label: '記録' },
  { id: 'settle', label: '精算' },
  { id: 'summary', label: '集計' },
  { id: 'settings', label: '設定' },
];
const STATUS_LABELS = { open: '未精算', settling: '精算中', settled: '精算済み' };
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WIDE_QUERY = window.matchMedia('(min-width: 960px)');

// ===== アイコン =====

function icon(paths) {
  return '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
}
const ICONS = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  back: icon('<path d="M15 18l-6-6 6-6"/>'),
  chevron: icon('<path d="M9 18l6-6-6-6"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  copy: icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  line: icon('<path d="M4 5h16v11H9l-4 4v-4H4z"/>'),
  logout: icon('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>'),
};
const TAB_ICONS = {
  records: icon('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  settle: icon('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  summary: icon('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
  settings: icon('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
};
const LOGO_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" class="logo-bg"/>' +
  '<path class="logo-fg" d="M24 24L34.39 30A12 12 0 1 1 24 12Z"/>' +
  '<path class="logo-cut" d="M26.6 22.5L26.6 10.5A12 12 0 0 1 36.99 28.5Z"/></svg>';

// ===== 小さな共通部品 =====

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try {
    if (value === null || value === undefined || value === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (e) { /* 保存できない環境では何もしない */ }
}
function parseJson(text) {
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
}
function esc(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function yen(n) {
  return '¥' + Number(n || 0).toLocaleString('ja-JP');
}
function sum(list) {
  return list.reduce(function (a, b) { return a + b; }, 0);
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function currentMonth() {
  return todayStr().slice(0, 7);
}
function shiftMonth(month, diff) {
  const parts = month.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1 + diff, 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}
function monthLabel(month) {
  const parts = month.split('-').map(Number);
  return parts[0] + '年' + parts[1] + '月';
}
function dateLabel(date) {
  const parts = String(date || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return String(date || '');
  return parts[1] + '/' + parts[2] + '(' + WEEKDAYS[new Date(parts[0], parts[1] - 1, parts[2]).getDay()] + ')';
}
function dateTimeLabel(text) {
  if (!text) return '';
  const pieces = String(text).split(' ');
  return dateLabel(pieces[0]) + (pieces[1] ? ' ' + pieces[1].slice(0, 5) : '');
}
// 全角数字やカンマが入っていても金額として読めるようにする
function parseAmount(text) {
  const normalized = String(text === undefined || text === null ? '' : text)
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
    .replace(/[,，円¥￥\s]/g, '');
  if (!/^\d+$/.test(normalized)) return NaN;
  return Number(normalized);
}
function byCreatedDesc(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}
function byDateDesc(a, b) {
  return (String(b.date) + String(b.createdAt)).localeCompare(String(a.date) + String(a.createdAt));
}

// ===== 家計簿の欄と、店名からのカテゴリ候補 =====

const KAKEIBO_KEY_LABELS = {
  other: '家具・家電 インテリア・日用品の欄',
  food: '食費(アイス・デザート除く)の欄',
  dining: '外食費の欄',
  rent: '固定費の「家賃」',
  gas: '固定費の「ガス」',
  electric: '固定費の「電気」',
  water: '固定費の「水道」',
};
// お店の種類ごとの名前の例。前に同じお店で登録したことがあれば、そちらを優先する
const STORE_PATTERNS = [
  { key: 'food', pattern: /まいばす|イオン|aeon|ライフ|西友|ヨーカ|サミット|オーケー|マルエツ|成城石井|業務スーパー|ベルク|ヤオコー|いなげや|東急ストア|コープ|生協|ロピア|ハナマサ|ピーコック|オオゼキ|ダイエー|マックスバリュ|スーパー/ },
  { key: 'dining', pattern: /セブン|7-?11|ファミマ|ファミリーマート|ローソン|ミニストップ|デイリー|newdays|ニューデイズ|ポプラ|セイコーマート|uber|ウーバー|出前館|wolt|スタバ|スターバックス|ドトール|タリーズ|コメダ|マクド|マック|モス|ケンタッキー|すき家|吉野家|松屋|サイゼ|ガスト|餃子|ラーメン|居酒屋|寿司|鮨|カフェ|弁当|ほっともっと|オリジン|酒場|食堂|レストラン|ピザ|焼肉|そば|うどん|バインミー/ },
  { key: 'other', pattern: /無印|ニトリ|ikea|イケア|ヨドバシ|ビック|ヤマダ|ケーズ|エディオン|ノジマ|ダイソー|セリア|キャンドゥ|ロフト|ハンズ|カインズ|コーナン|マツキヨ|マツモトキヨシ|ウエルシア|ツルハ|サンドラッグ|ココカラ|スギ薬局|ドラッグ|amazon|アマゾン|楽天|3coins|スリーコインズ|フランフラン|francfranc|ホームセンター/ },
];

function normalizeStore(text) {
  return String(text === undefined || text === null ? '' : text).normalize('NFKC').trim().toLowerCase();
}

function categoryOf(room, categoryId) {
  return room.categories.find(function (c) { return c.categoryId === categoryId; }) || null;
}

// 店名からカテゴリを選ぶ。前に同じ店で登録していればそのカテゴリ、なければお店の種類から
function suggestCategory(room, title, excludePaymentId) {
  const name = normalizeStore(title);
  if (!name) return null;
  const active = room.categories.filter(function (c) { return c.isActive; });
  const past = room.payments.filter(function (p) {
    return p.paymentId !== excludePaymentId && p.categoryId && normalizeStore(p.title) === name;
  }).sort(byDateDesc)[0];
  if (past && active.some(function (c) { return c.categoryId === past.categoryId; })) {
    return { categoryId: past.categoryId, reason: 'history' };
  }
  const hit = STORE_PATTERNS.find(function (s) { return s.pattern.test(name); });
  const cat = hit ? active.find(function (c) { return c.kakeiboKey === hit.key; }) : null;
  return cat ? { categoryId: cat.categoryId, reason: 'store' } : null;
}

// 家計簿と連携しているルームで、カテゴリが家計簿のどの欄にも対応していない支払い
function needsKakeiboCheck(room, p) {
  if (!room.kakeibo || !room.kakeibo.configured) return false;
  const c = categoryOf(room, p.categoryId);
  return !c || !c.kakeiboKey;
}

// ===== 割り勘と精算の計算(処理のプログラムと同じ計算) =====

function splitEqually(amount, payerId, participantIds) {
  const count = participantIds.length;
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  const bearer = participantIds.indexOf(payerId) >= 0 ? payerId : participantIds[0];
  return participantIds.map(function (id) {
    return { memberId: id, amount: base + (id === bearer ? remainder : 0) };
  });
}
function computeBalances(payments, transfers) {
  const balances = {};
  const add = function (id, value) { balances[id] = (balances[id] || 0) + value; };
  payments.forEach(function (p) {
    add(p.payerMemberId, p.amount);
    p.shares.forEach(function (s) { add(s.memberId, -s.amount); });
  });
  transfers.forEach(function (t) {
    add(t.fromMemberId, t.amount);
    add(t.toMemberId, -t.amount);
  });
  return balances;
}
function planTransfers(balances, memberOrder) {
  const rank = {};
  memberOrder.forEach(function (id, i) { rank[id] = i; });
  const rankOf = function (id) { return id in rank ? rank[id] : memberOrder.length; };
  const creditors = [];
  const debtors = [];
  Object.keys(balances).forEach(function (id) {
    if (balances[id] > 0) creditors.push({ id: id, rest: balances[id] });
    if (balances[id] < 0) debtors.push({ id: id, rest: -balances[id] });
  });
  const byLarger = function (a, b) { return b.rest - a.rest || rankOf(a.id) - rankOf(b.id); };
  creditors.sort(byLarger);
  debtors.sort(byLarger);
  const result = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].rest, creditors[j].rest);
    result.push({ from: debtors[i].id, to: creditors[j].id, amount: amount });
    debtors[i].rest -= amount;
    creditors[j].rest -= amount;
    if (debtors[i].rest === 0) i++;
    if (creditors[j].rest === 0) j++;
  }
  return result;
}

// ===== 状態 =====

const state = {
  token: storageGet(STORAGE_KEYS.token) || '',
  user: parseJson(storageGet(STORAGE_KEYS.user)),
  month: currentMonth(),
  view: { name: 'home' },
  home: null,
  rooms: {},
  invite: null,
  loginError: '',
  loggingIn: false,
};
const loadSeq = { home: 0, rooms: {} };

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  storageSet(STORAGE_KEYS.token, token);
  storageSet(STORAGE_KEYS.user, JSON.stringify(user));
}
function clearSession() {
  state.token = '';
  state.user = null;
  state.home = null;
  state.rooms = {};
  storageSet(STORAGE_KEYS.token, null);
  storageSet(STORAGE_KEYS.user, null);
}
function currentRoom() {
  return state.view.name === 'room' ? state.rooms[state.view.roomId] : null;
}
function memberName(room, memberId) {
  const m = room.members.find(function (x) { return x.memberId === memberId; });
  return m ? m.displayName : '(不明)';
}
function memberOrder(room) {
  return room.members.map(function (m) { return m.memberId; });
}
function inviteLink(room) {
  return CONFIG.APP_URL + '?openExternalBrowser=1#/join/' + encodeURIComponent(room.room.inviteToken);
}

// ===== 処理のプログラムとのやりとり =====

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function api(action, params) {
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: state.token, params: params || {} }),
    });
  } catch (e) {
    throw new ApiError('NETWORK', '通信できませんでした。電波の状態を確かめて、もう一度お試しください');
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new ApiError('NETWORK', '処理のプログラムから正しい返事がありませんでした。時間をおいてお試しください');
  }
  if (!json.ok) {
    const err = new ApiError(json.error.code, json.error.message);
    if (err.code === 'AUTH_REQUIRED') {
      clearSession();
      showLogin(err.message);
    }
    throw err;
  }
  return json.data;
}

// 保存の依頼を出す。シートは先に閉じ、保存中もほかの操作を続けられるようにする
async function saveAction(action, params, opts) {
  opts = opts || {};
  showToast('保存しています…', 'busy');
  try {
    const data = await api(action, params);
    if (opts.roomId) await loadRoom(opts.roomId);
    if (state.view.name === 'home') loadHome();
    showToast(opts.success || '保存しました', 'ok');
    if (data && data.kakeiboWarning) showToast(data.kakeiboWarning, 'error');
    if (opts.after) opts.after(data);
    return data;
  } catch (e) {
    if (e.code === 'AUTH_REQUIRED') return null;
    showToast(e.message, 'error');
    if (opts.reopen) opts.reopen();
    return null;
  }
}

async function loadHome() {
  const seq = ++loadSeq.home;
  try {
    const data = await api('home', { month: state.month });
    if (seq !== loadSeq.home) return;
    state.home = data;
    if (data.displayName && state.user) state.user.displayName = data.displayName;
    if (state.view.name === 'home') render();
  } catch (e) {
    if (e.code !== 'AUTH_REQUIRED') showToast(e.message, 'error');
  }
}

async function loadRoom(roomId) {
  const seq = (loadSeq.rooms[roomId] || 0) + 1;
  loadSeq.rooms[roomId] = seq;
  try {
    const data = await api('getRoom', { roomId: roomId });
    if (loadSeq.rooms[roomId] !== seq) return;
    state.rooms[roomId] = data;
    if (state.view.name === 'room' && state.view.roomId === roomId) render();
  } catch (e) {
    if (e.code === 'AUTH_REQUIRED') return;
    showToast(e.message, 'error');
    if ((e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') && state.view.roomId === roomId) {
      delete state.rooms[roomId];
      go('#/');
    }
  }
}

async function ensureRoom(roomId) {
  if (!state.rooms[roomId]) {
    showToast('読み込んでいます…', 'busy');
    await loadRoom(roomId);
    hideToast();
  }
  return state.rooms[roomId];
}

async function loadInvite(token) {
  if (state.invite && state.invite.token === token) return;
  state.invite = { token: token };
  render();
  try {
    const info = await api('getInviteInfo', { inviteToken: token });
    if (!state.invite || state.invite.token !== token) return;
    if (info.alreadyMember) {
      storageSet(STORAGE_KEYS.invite, null);
      state.invite = null;
      go('#/room/' + encodeURIComponent(info.roomId) + '/records');
      return;
    }
    state.invite.info = info;
  } catch (e) {
    if (e.code === 'AUTH_REQUIRED') return;
    storageSet(STORAGE_KEYS.invite, null);
    if (state.invite) state.invite.error = e.message;
  }
  if (state.view.name === 'join') render();
}

// ===== Googleでログイン =====

let gsiInitialized = false;

function onGoogleLibraryLoad() {
  if (gsiInitialized || !window.google || !google.accounts || !google.accounts.id) return;
  gsiInitialized = true;
  google.accounts.id.initialize({
    client_id: CONFIG.CLIENT_ID,
    callback: onCredential,
    ux_mode: 'popup',
    auto_select: false,
  });
  renderGoogleButton();
}
window.onGoogleLibraryLoad = onGoogleLibraryLoad;

function renderGoogleButton() {
  const el = document.getElementById('gsi-button');
  if (!el || !gsiInitialized || state.loggingIn) return;
  el.innerHTML = '';
  google.accounts.id.renderButton(el, {
    type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ja', width: 280,
  });
}

async function onCredential(response) {
  state.loginError = '';
  state.loggingIn = true;
  render();
  try {
    const data = await api('login', {
      idToken: response.credential,
      inviteToken: storageGet(STORAGE_KEYS.invite) || '',
    });
    saveSession(data.token, data.user);
    state.loggingIn = false;
    route();
  } catch (e) {
    state.loggingIn = false;
    state.loginError = e.message;
    state.view = { name: 'login' };
    render();
  }
}

function showLogin(message) {
  state.loginError = message || '';
  state.view = { name: 'login' };
  closeSheet();
  render();
}

// ===== 画面の切り替え =====

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(function (s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  });
  if (parts[0] === 'room' && parts[1]) {
    const tab = TABS.some(function (t) { return t.id === parts[2]; }) ? parts[2] : 'records';
    return { name: 'room', roomId: parts[1], tab: tab };
  }
  if (parts[0] === 'join' && parts[1]) return { name: 'join', inviteToken: parts[1] };
  return { name: 'home' };
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const view = parseHash();
  if (view.name === 'join') storageSet(STORAGE_KEYS.invite, view.inviteToken);
  if (!state.token) {
    state.view = { name: 'login' };
    render();
    return;
  }
  const pendingInvite = storageGet(STORAGE_KEYS.invite);
  if (pendingInvite && view.name !== 'join') {
    location.replace('#/join/' + encodeURIComponent(pendingInvite));
    return;
  }
  closeSheet();
  state.view = view;
  render();
  window.scrollTo(0, 0);
  if (view.name === 'home') loadHome();
  if (view.name === 'room') loadRoom(view.roomId);
  if (view.name === 'join') loadInvite(view.inviteToken);
}

function render() {
  const app = document.getElementById('app');
  const name = state.view.name;
  if (name === 'login') app.innerHTML = renderLogin();
  else if (name === 'join') app.innerHTML = renderJoin();
  else if (name === 'room') app.innerHTML = renderRoom();
  else app.innerHTML = renderHome();
  document.body.dataset.view = name;
  if (name === 'login') renderGoogleButton();
  const room = currentRoom();
  document.title = room ? room.room.name + ' | 割り勘アプリ' : '割り勘アプリ';
}

// ===== 共通の部品(見た目) =====

function appHeader(title, backHref, right) {
  const left = backHref
    ? '<a class="icon-btn" href="' + backHref + '" aria-label="戻る">' + ICONS.back + '</a>'
    : '<span class="brand-mark">' + LOGO_SVG + '</span>';
  return '<header class="app-header">' + left + '<h1 class="app-title">' + esc(title) + '</h1>' +
    '<div class="header-right">' + (right || '') + '</div></header>';
}

function monthSwitcher() {
  return '<div class="month-switcher">' +
    '<button type="button" class="icon-btn" data-action="month" data-diff="-1" aria-label="前の月">' + ICONS.back + '</button>' +
    '<span class="month-label">' + esc(monthLabel(state.month)) + '</span>' +
    '<button type="button" class="icon-btn" data-action="month" data-diff="1" aria-label="次の月">' + ICONS.chevron + '</button>' +
    '</div>';
}

function statusChip(status) {
  return '<span class="chip status ' + esc(status) + '">' + esc(STATUS_LABELS[status] || status) + '</span>';
}

function settlementChip(status) {
  const labels = { settling: '送金待ち', settled: '精算済み', canceled: '取り消し' };
  const cls = { settling: 'settling', settled: 'settled', canceled: 'open' };
  return '<span class="chip status ' + (cls[status] || 'open') + '">' + esc(labels[status] || status) + '</span>';
}

// ===== ログイン画面 =====

function renderLogin() {
  const invited = !!storageGet(STORAGE_KEYS.invite);
  const inLine = /\bLine\//i.test(navigator.userAgent);
  return '<main class="login">' +
    '<div class="login-mark">' + LOGO_SVG + '</div>' +
    '<h1>割り勘アプリ</h1>' +
    '<p class="lead">ルームを閉じずに、これまでの分や特定の支払いだけを精算できる割り勘アプリです。' +
    '精算しても記録は消えないので、月ごとの使用額をいつでも確認できます。</p>' +
    (invited ? '<p class="notice">ルームに招待されています。Googleでログインすると参加できます。</p>' : '') +
    (inLine ? '<p class="notice warn">LINEの中のブラウザでは、Googleでログインできません。' +
      '右上のメニューから「ブラウザで開く」を選んでください。</p>' : '') +
    (state.loginError ? '<p class="notice error">' + esc(state.loginError) + '</p>' : '') +
    '<div id="gsi-button" class="gsi-slot"><p class="muted">' +
    (state.loggingIn ? 'ログインしています…' : 'ログインボタンを読み込んでいます…') + '</p></div>' +
    '<p class="login-foot"><a href="privacy.html">プライバシーポリシー</a></p>' +
    '</main>';
}

// ===== 招待への参加 =====

function renderJoin() {
  const inv = state.invite;
  let body;
  if (!inv || (!inv.info && !inv.error)) {
    body = '<p class="loading">招待を確認しています…</p>';
  } else if (inv.error) {
    body = '<p class="notice error">' + esc(inv.error) + '</p><p><a class="btn" href="#/">ホームへ</a></p>';
  } else {
    const info = inv.info;
    const choices = info.nameOnlyMembers.length
      ? '<fieldset class="field"><legend>あなたは、すでに名前だけで登録されていますか?</legend>' +
        '<p class="muted small">自分の名前を選ぶと、これまでの記録をそのまま引き継げます。</p><div class="radio-list">' +
        info.nameOnlyMembers.map(function (m) {
          return '<label class="radio"><input type="radio" name="claim" value="' + esc(m.memberId) + '">' +
            '<span>' + esc(m.displayName) + '</span></label>';
        }).join('') +
        '<label class="radio"><input type="radio" name="claim" value="" checked><span>この中にいない(新しく参加する)</span></label>' +
        '</div></fieldset>'
      : '';
    body = '<h2 class="join-title">「' + esc(info.roomName) + '」に参加します</h2>' +
      '<form class="form" id="join-form">' + choices +
      '<div class="form-actions"><button type="submit" class="btn primary">参加する</button>' +
      '<button type="button" class="btn" data-action="cancel-join">やめる</button></div></form>';
  }
  return appHeader('ルームに参加', null, '') + '<main class="page narrow">' + body + '</main>';
}

// ===== ホーム画面 =====

function renderHome() {
  const h = state.home;
  const header = appHeader('割り勘アプリ', null,
    '<button type="button" class="icon-btn" data-action="logout" aria-label="ログアウト" title="ログアウト">' + ICONS.logout + '</button>');
  if (!h) return header + '<main class="page">' + monthSwitcher() + '<p class="loading">読み込んでいます…</p></main>';

  const active = h.rooms.filter(function (r) { return !r.archived; });
  const archived = h.rooms.filter(function (r) { return r.archived; });
  const body = monthSwitcher() +
    '<section class="summary-panel" aria-label="' + esc(monthLabel(h.month)) + 'のあなたの数字">' +
    '<p class="summary-label">' + esc(monthLabel(h.month)) + 'のあなたの負担額</p>' +
    '<p class="summary-amount">' + yen(h.totals.myBurden) + '</p>' +
    '<dl class="summary-split"><div><dt>受け取る予定</dt><dd>' + yen(h.totals.toReceive) + '</dd></div>' +
    '<div><dt>払う予定</dt><dd>' + yen(h.totals.toPay) + '</dd></div></dl>' +
    '</section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">ルーム</h2>' +
    '<button type="button" class="btn small" data-action="create-room">' + ICONS.plus + 'ルームを作る</button></div>' +
    (active.length
      ? '<ul class="list">' + active.map(homeRoomRow).join('') + '</ul>'
      : '<p class="empty">まだルームがありません。「ルームを作る」から始めましょう。</p>') +
    '</section>' +
    (archived.length
      ? '<details class="section fold"><summary>アーカイブしたルーム(' + archived.length + ')</summary>' +
        '<ul class="list">' + archived.map(homeRoomRow).join('') + '</ul></details>'
      : '');
  const fab = active.length
    ? '<button type="button" class="fab" data-action="quick-add">' + ICONS.plus + '<span>支払いを登録</span></button>'
    : '';
  return header + '<main class="page">' + body + '</main>' + fab;
}

function homeRoomRow(r) {
  const badges = (r.toReceive ? '<span class="badge receive">受け取る ' + yen(r.toReceive) + '</span>' : '') +
    (r.toPay ? '<span class="badge pay">払う ' + yen(r.toPay) + '</span>' : '');
  return '<li><a class="row link" href="#/room/' + encodeURIComponent(r.roomId) + '/records">' +
    '<span class="row-main"><span class="row-title">' + esc(r.name) + '</span>' +
    '<span class="row-sub">今月の負担 ' + yen(r.myBurden) + '</span>' +
    (badges ? '<span class="badges">' + badges + '</span>' : '') + '</span>' +
    '<span class="chev">' + ICONS.chevron + '</span></a></li>';
}

// ===== ルーム画面 =====

function renderRoom() {
  const v = state.view;
  const room = state.rooms[v.roomId];
  if (!room) return appHeader('読み込み中', '#/') + '<main class="page"><p class="loading">読み込んでいます…</p></main>';
  const header = appHeader(room.room.name, '#/', room.room.archived ? '<span class="chip">アーカイブ中</span>' : '');
  const panel = function (id) {
    if (id === 'records') return renderRecords(room);
    if (id === 'settle') return renderSettle(room);
    if (id === 'summary') return renderSummary(room);
    return renderSettings(room);
  };
  const fab = '<button type="button" class="fab" data-action="add-record">' + ICONS.plus + '<span>記録する</span></button>';
  if (WIDE_QUERY.matches) {
    const sideTab = v.tab === 'records' ? 'settle' : v.tab;
    return header + '<main class="room-wide">' +
      '<section class="pane">' + panel('records') + '</section>' +
      '<section class="pane">' + tabBar(TABS.slice(1), sideTab, room, 'side-tabs') + panel(sideTab) + '</section>' +
      '</main>' + fab;
  }
  return header + '<main class="page room-page">' + panel(v.tab) + '</main>' +
    (v.tab === 'records' ? fab : '') + tabBar(TABS, v.tab, room, 'bottom-tabs');
}

function tabBar(tabs, active, room, cls) {
  const pending = room.settlements.filter(function (s) { return s.status === 'settling'; }).length;
  return '<nav class="' + cls + '" aria-label="ルームのメニュー">' + tabs.map(function (t) {
    const isActive = t.id === active;
    return '<a href="#/room/' + encodeURIComponent(room.room.roomId) + '/' + t.id + '" class="tab' + (isActive ? ' active' : '') + '"' +
      (isActive ? ' aria-current="page"' : '') + '>' + TAB_ICONS[t.id] + '<span>' + t.label + '</span>' +
      (t.id === 'settle' && pending ? '<span class="tab-count" aria-label="送金待ち' + pending + '件">' + pending + '</span>' : '') +
      '</a>';
  }).join('') + '</nav>';
}

// --- 記録 ---

function renderRecords(room) {
  const month = state.month;
  const payments = room.payments.filter(function (p) { return String(p.date).slice(0, 7) === month; });
  const transfers = room.transfers.filter(function (t) { return String(t.date).slice(0, 7) === month; });
  const items = payments.map(function (p) { return { kind: 'payment', data: p }; })
    .concat(transfers.map(function (t) { return { kind: 'transfer', data: t }; }));
  items.sort(function (a, b) { return byDateDesc(a.data, b.data); });
  return '<div class="pane-head"><h2 class="pane-title">記録</h2>' + monthSwitcher() + '</div>' +
    '<p class="month-total"><span>' + esc(monthLabel(month)) + 'の使用額</span><strong>' + yen(sum(payments.map(function (p) { return p.amount; }))) + '</strong></p>' +
    (items.length
      ? '<ul class="list records">' + items.map(function (it) {
          return it.kind === 'payment' ? paymentRow(room, it.data) : transferRow(room, it.data);
        }).join('') + '</ul>'
      : '<p class="empty">この月の記録はまだありません。「記録する」から支払いを登録しましょう。</p>');
}

function paymentRow(room, p) {
  let sub;
  if (p.shares.length === 1) {
    const only = p.shares[0].memberId;
    sub = only === p.payerMemberId
      ? memberName(room, only) + 'の個人'
      : memberName(room, p.payerMemberId) + '立替・' + memberName(room, only) + 'の分';
  } else {
    sub = memberName(room, p.payerMemberId) + '立替・' + p.shares.length + '人で割り勘';
  }
  const tags = (p.fixedCostId ? '<span class="tag">固定費</span>' : '') +
    (p.parts && p.parts.length ? '<span class="tag">分割</span>' : '') +
    (needsKakeiboCheck(room, p) ? '<span class="tag warn">カテゴリを確認</span>' : '');
  return '<li><button type="button" class="row record" data-action="open-payment" data-id="' + esc(p.paymentId) + '">' +
    '<span class="row-date">' + esc(dateLabel(p.date)) + '</span>' +
    '<span class="row-main"><span class="row-title">' + esc(p.title) + '</span>' +
    '<span class="row-sub">' + esc(sub) + '</span>' + (tags ? '<span class="tags">' + tags + '</span>' : '') + '</span>' +
    '<span class="row-end"><span class="row-amount">' + yen(p.amount) + '</span>' + statusChip(p.status) + '</span>' +
    '</button></li>';
}

function transferRow(room, t) {
  return '<li><button type="button" class="row record" data-action="open-transfer" data-id="' + esc(t.transferId) + '">' +
    '<span class="row-date">' + esc(dateLabel(t.date)) + '</span>' +
    '<span class="row-main"><span class="row-title">お金の受け渡し</span>' +
    '<span class="row-sub">' + esc(memberName(room, t.fromMemberId)) + ' → ' + esc(memberName(room, t.toMemberId)) +
    (t.origin === 'settlement_cancel' ? '(精算の取り消しで記録)' : '') + '</span></span>' +
    '<span class="row-end"><span class="row-amount">' + yen(t.amount) + '</span>' + statusChip(t.status) + '</span>' +
    '</button></li>';
}

// --- 精算 ---

function myNumbers(room) {
  const me = room.myMemberId;
  const openBalance = computeBalances(
    room.payments.filter(function (p) { return p.status === 'open'; }),
    room.transfers.filter(function (t) { return t.status === 'open'; })
  )[me] || 0;
  let receive = Math.max(openBalance, 0);
  let pay = Math.max(-openBalance, 0);
  room.settlements.filter(function (s) { return s.status === 'settling'; }).forEach(function (s) {
    s.items.forEach(function (i) {
      const rest = i.amount - i.paidAmount;
      if (rest <= 0) return;
      if (i.fromMemberId === me) pay += rest;
      if (i.toMemberId === me) receive += rest;
    });
  });
  return { receive: receive, pay: pay };
}

function renderSettle(room) {
  const openPayments = room.payments.filter(function (p) { return p.status === 'open'; });
  const openTransfers = room.transfers.filter(function (t) { return t.status === 'open'; });
  const openCount = openPayments.length + openTransfers.length;
  const plan = planTransfers(computeBalances(openPayments, openTransfers), memberOrder(room));
  const pending = room.settlements.filter(function (s) { return s.status === 'settling'; }).sort(byCreatedDesc);
  const past = room.settlements.filter(function (s) { return s.status !== 'settling'; }).sort(byCreatedDesc);
  const mine = myNumbers(room);

  let html = '<div class="pane-head"><h2 class="pane-title">精算</h2></div>' +
    '<dl class="kv mine"><div><dt>あなたが受け取る予定</dt><dd>' + yen(mine.receive) + '</dd></div>' +
    '<div><dt>あなたが払う予定</dt><dd>' + yen(mine.pay) + '</dd></div></dl>';

  html += '<section class="section"><h3 class="section-title">今すべて精算したら</h3>';
  if (!openCount) {
    html += '<p class="empty">未精算の記録はありません。</p>';
  } else {
    html += (plan.length
      ? '<ul class="transfer-list">' + plan.map(function (t) { return planRow(room, t); }).join('') + '</ul>'
      : '<p class="empty">送金は必要ありません。</p>') +
      '<div class="actions-row">' +
      '<button type="button" class="btn primary" data-action="settle-all">これまでの分を精算(' + openCount + '件)</button>' +
      '<button type="button" class="btn" data-action="settle-select">選んで精算</button></div>';
  }
  html += '</section>';

  html += '<section class="section"><h3 class="section-title">送金待ち</h3>' +
    (pending.length
      ? pending.map(function (s) { return settlementCard(room, s, true); }).join('')
      : '<p class="empty">送金待ちの精算はありません。</p>') +
    '</section>';

  if (past.length) {
    html += '<details class="section fold"><summary>精算の履歴(' + past.length + ')</summary>' +
      past.map(function (s) { return settlementCard(room, s, false); }).join('') + '</details>';
  }
  return html;
}

function planRow(room, t) {
  return '<li class="transfer"><div class="transfer-line"><span class="who">' + esc(memberName(room, t.from)) +
    '<span class="arrow">→</span>' + esc(memberName(room, t.to)) + '</span>' +
    '<span class="row-amount">' + yen(t.amount) + '</span></div></li>';
}

function settlementTargets(room, settlementId) {
  return {
    payments: room.payments.filter(function (p) { return p.settlementId === settlementId; }),
    transfers: room.transfers.filter(function (t) { return t.settlementId === settlementId; }),
  };
}

function settlementCard(room, s, isPending) {
  const targets = settlementTargets(room, s.settlementId);
  const targetCount = targets.payments.length + targets.transfers.length;
  const head = '<div class="card-head"><span class="card-title">' + esc(dateTimeLabel(s.createdAt)) + 'の精算</span>' +
    settlementChip(s.status) + '</div>' +
    '<p class="muted small">' + (s.mode === 'selected' ? '選んだ分' : 'これまでの分') +
    (s.status === 'canceled' ? '・' + esc(dateTimeLabel(s.canceledAt)) + 'に取り消し' : '・対象 ' + targetCount + '件') + '</p>';
  const items = s.items.length
    ? '<ul class="transfer-list">' + s.items.map(function (i) { return itemRow(room, i, isPending, s.status); }).join('') + '</ul>'
    : '<p class="muted small">送金はありませんでした。</p>';
  let actions = '';
  if (s.status !== 'canceled') {
    actions = '<div class="card-actions">' +
      (s.items.length
        ? '<button type="button" class="btn small" data-action="share-settlement" data-id="' + esc(s.settlementId) + '">' + ICONS.line + 'LINEで送る</button>' +
          '<button type="button" class="btn small" data-action="copy-settlement" data-id="' + esc(s.settlementId) + '">' + ICONS.copy + 'コピー</button>'
        : '') +
      '<button type="button" class="btn small ghost danger-text" data-action="cancel-settlement" data-id="' + esc(s.settlementId) + '">取り消す</button>' +
      '</div>';
  }
  return '<article class="card settlement">' + head + items + actions + '</article>';
}

function itemRow(room, i, isPending, settlementStatus) {
  const rest = i.amount - i.paidAmount;
  let stateLine = '';
  if (settlementStatus === 'canceled') {
    if (i.paidAmount > 0) stateLine = '<span class="muted small">支払い済みの ' + yen(i.paidAmount) + ' は受け渡しとして記録</span>';
  } else if (i.status === 'done') stateLine = '<span class="chip status settled">完了</span>';
  else if (i.paidAmount > 0) stateLine = '<span class="chip status settling">残り ' + yen(rest) + '</span><span class="muted small">支払い済み ' + yen(i.paidAmount) + '</span>';
  let buttons = '';
  if (isPending) {
    buttons = '<div class="item-actions">' +
      (i.status !== 'done'
        ? '<button type="button" class="btn small primary" data-action="item-done" data-id="' + esc(i.itemId) + '">完了にする</button>' +
          '<button type="button" class="btn small" data-action="item-partial" data-id="' + esc(i.itemId) + '">一部を記録</button>'
        : '') +
      (i.paidAmount > 0 ? '<button type="button" class="btn small ghost" data-action="item-reset" data-id="' + esc(i.itemId) + '">未払いに戻す</button>' : '') +
      '</div>';
  }
  return '<li class="transfer"><div class="transfer-line"><span class="who">' + esc(memberName(room, i.fromMemberId)) +
    '<span class="arrow">→</span>' + esc(memberName(room, i.toMemberId)) + '</span>' +
    '<span class="row-amount">' + yen(i.amount) + '</span></div>' +
    (stateLine ? '<div class="transfer-state">' + stateLine + '</div>' : '') + buttons + '</li>';
}

function settlementText(room, s) {
  const lines = ['【' + room.room.name + '】精算のお知らせ'];
  s.items.forEach(function (i) {
    const rest = i.amount - i.paidAmount;
    let note = '';
    if (rest === 0) note = '(済)';
    else if (i.paidAmount > 0) note = '(残り' + yen(rest) + ')';
    lines.push('・' + memberName(room, i.fromMemberId) + ' → ' + memberName(room, i.toMemberId) + ' ' + yen(i.amount) + note);
  });
  const targets = settlementTargets(room, s.settlementId).payments.sort(byDateDesc);
  if (targets.length) {
    lines.push('対象:' + targets.slice(0, 3).map(function (p) { return dateLabel(p.date) + ' ' + p.title; }).join('、') +
      (targets.length > 3 ? ' ほか' + (targets.length - 3) + '件' : ''));
  }
  return lines.join('\n');
}

// --- 集計 ---

function renderSummary(room) {
  const month = state.month;
  const inMonth = room.payments.filter(function (p) { return String(p.date).slice(0, 7) === month; });
  const total = sum(inMonth.map(function (p) { return p.amount; }));
  const byStatus = { settled: 0, settling: 0, open: 0 };
  const per = {};
  const ensure = function (id) { return (per[id] = per[id] || { burden: 0, paid: 0 }); };
  room.members.forEach(function (m) { ensure(m.memberId); });
  inMonth.forEach(function (p) {
    byStatus[p.status] = (byStatus[p.status] || 0) + p.amount;
    ensure(p.payerMemberId).paid += p.amount;
    p.shares.forEach(function (s) { ensure(s.memberId).burden += s.amount; });
  });
  const rows = room.members.filter(function (m) { return !m.left || per[m.memberId].burden || per[m.memberId].paid; });
  const allTotal = sum(room.payments.map(function (p) { return p.amount; }));
  const myAll = sum(room.payments.map(function (p) {
    return sum(p.shares.filter(function (s) { return s.memberId === room.myMemberId; }).map(function (s) { return s.amount; }));
  }));
  const bar = total
    ? ['settled', 'settling', 'open'].map(function (k) {
        return byStatus[k] ? '<span class="bar ' + k + '" style="width:' + (byStatus[k] / total * 100).toFixed(2) + '%"></span>' : '';
      }).join('')
    : '';
  return '<div class="pane-head"><h2 class="pane-title">集計</h2>' + monthSwitcher() + '</div>' +
    '<section class="summary-panel compact">' +
    '<p class="summary-label">' + esc(monthLabel(month)) + 'の使用額(' + inMonth.length + '件)</p>' +
    '<p class="summary-amount">' + yen(total) + '</p>' +
    '<div class="status-bar" aria-hidden="true">' + bar + '</div>' +
    '<dl class="summary-split three">' + ['settled', 'settling', 'open'].map(function (k) {
      return '<div><dt><span class="dot ' + k + '"></span>' + STATUS_LABELS[k] + '</dt><dd>' + yen(byStatus[k]) + '</dd></div>';
    }).join('') + '</dl></section>' +
    '<section class="section"><h3 class="section-title">1人ずつ</h3><div class="table-wrap"><table class="table">' +
    '<thead><tr><th scope="col">メンバー</th><th scope="col">負担額</th><th scope="col">立替額</th></tr></thead><tbody>' +
    rows.map(function (m) {
      const isMe = m.memberId === room.myMemberId;
      return '<tr' + (isMe ? ' class="me"' : '') + '><th scope="row">' + esc(m.displayName) +
        (isMe ? '<span class="tag you">あなた</span>' : '') + '</th><td>' + yen(per[m.memberId].burden) + '</td><td>' + yen(per[m.memberId].paid) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    '<p class="muted small">負担額は割り勘で最終的に負担する額、立替額は実際に立て替えて払った額です。</p></section>' +
    sharedPersonalHtml(room, inMonth) +
    '<section class="section"><h3 class="section-title">これまでの累計</h3><dl class="kv">' +
    '<div><dt>ルーム全体の使用額</dt><dd>' + yen(allTotal) + '</dd></div>' +
    '<div><dt>あなたの負担額</dt><dd>' + yen(myAll) + '</dd></div></dl></section>';
}

function sharedPersonalHtml(room, inMonth) {
  const sharedTotal = sum(inMonth.filter(function (p) { return p.shares.length >= 2; }).map(function (p) { return p.amount; }));
  const personal = room.members.map(function (m) {
    return {
      member: m,
      total: sum(inMonth.filter(function (p) { return p.shares.length === 1 && p.shares[0].memberId === m.memberId; })
        .map(function (p) { return p.amount; })),
    };
  }).filter(function (x) { return x.total || !x.member.left; });
  return '<section class="section"><h3 class="section-title">共同と個人</h3><dl class="kv">' +
    '<div><dt>共同(2人以上で割り勘)</dt><dd>' + yen(sharedTotal) + '</dd></div>' +
    personal.map(function (x) {
      return '<div><dt>' + esc(x.member.displayName) + 'の個人</dt><dd>' + yen(x.total) + '</dd></div>';
    }).join('') + '</dl></section>';
}

// --- 設定 ---

function renderSettings(room) {
  const r = room.room;
  const active = room.members.filter(function (m) { return !m.left; });
  const left = room.members.filter(function (m) { return m.left; });
  return '<div class="pane-head"><h2 class="pane-title">設定</h2></div>' +
    '<section class="section"><h3 class="section-title">ルーム名</h3><ul class="list"><li><div class="row static">' +
    '<span class="row-main"><span class="row-title">' + esc(r.name) + '</span></span>' +
    '<span class="row-buttons"><button type="button" class="btn small ghost" data-action="rename-room">変更</button></span></div></li></ul></section>' +
    '<section class="section"><h3 class="section-title">メンバーを招待</h3>' +
    '<p class="muted small">招待リンクを開いてGoogleでログインすると、このルームに参加できます。</p>' +
    '<div class="actions-row"><button type="button" class="btn primary" data-action="share-invite">' + ICONS.line + 'LINEで送る</button>' +
    '<button type="button" class="btn" data-action="copy-invite">' + ICONS.copy + 'リンクをコピー</button></div></section>' +
    '<section class="section"><div class="section-head"><h3 class="section-title">メンバー</h3>' +
    '<button type="button" class="btn small" data-action="add-member">' + ICONS.plus + '名前だけで追加</button></div>' +
    '<ul class="list">' + active.map(function (m) { return memberRow(room, m); }).join('') + '</ul>' +
    (left.length
      ? '<details class="fold sub"><summary>外れたメンバー(' + left.length + ')</summary><ul class="list">' +
        left.map(function (m) { return '<li><div class="row static"><span class="row-title muted">' + esc(m.displayName) + '</span></div></li>'; }).join('') +
        '</ul></details>'
      : '') + '</section>' +
    '<section class="section"><div class="section-head"><h3 class="section-title">カテゴリ</h3>' +
    '<button type="button" class="btn small" data-action="add-category">' + ICONS.plus + '追加</button></div>' +
    '<ul class="list">' + room.categories.map(categoryRow).join('') + '</ul></section>' +
    '<section class="section"><div class="section-head"><h3 class="section-title">固定費の自動登録</h3>' +
    '<button type="button" class="btn small" data-action="add-fixed">' + ICONS.plus + '追加</button></div>' +
    (room.fixedCosts.length
      ? '<ul class="list">' + room.fixedCosts.map(function (f) { return fixedCostRow(room, f); }).join('') + '</ul>'
      : '<p class="empty">家賃や光熱費などを登録しておくと、毎月決まった日に支払いとして自動で登録されます。</p>') +
    '</section>' +
    (room.isAppOwner ? kakeiboSection(room) : '') +
    '<section class="section"><h3 class="section-title">そのほか</h3><ul class="list">' +
    '<li><button type="button" class="row link" data-action="show-history"><span class="row-main"><span class="row-title">変更履歴を見る</span>' +
    '<span class="row-sub">誰がいつ何を追加・変更・削除したか</span></span><span class="chev">' + ICONS.chevron + '</span></button></li>' +
    '<li><button type="button" class="row link" data-action="toggle-archive"><span class="row-main"><span class="row-title">' +
    (r.archived ? 'アーカイブから戻す' : 'アーカイブする') + '</span><span class="row-sub">' +
    (r.archived ? 'ホームのルーム一覧に戻します' : 'ホームの一覧から隠します。記録は残ります') + '</span></span></button></li>' +
    (r.isCreator
      ? '<li><button type="button" class="row link danger-text" data-action="delete-room"><span class="row-main"><span class="row-title">ルームを削除する</span>' +
        '<span class="row-sub">ルームを作った人だけができます</span></span></button></li>'
      : '') +
    '</ul></section>';
}

function memberRow(room, m) {
  const tags = (m.memberId === room.myMemberId ? '<span class="tag you">あなた</span>' : '') +
    (m.isCreator ? '<span class="tag">作成者</span>' : '') +
    (!m.isLinked ? '<span class="tag">名前だけ</span>' : '');
  const canRemove = room.room.isCreator && m.memberId !== room.myMemberId;
  return '<li><div class="row static"><span class="row-main"><span class="row-title">' + esc(m.displayName) + '</span>' +
    (tags ? '<span class="tags">' + tags + '</span>' : '') + '</span>' +
    '<span class="row-buttons"><button type="button" class="btn small ghost" data-action="rename-member" data-id="' + esc(m.memberId) + '">名前を変更</button>' +
    (canRemove ? '<button type="button" class="btn small ghost danger-text" data-action="remove-member" data-id="' + esc(m.memberId) + '">外す</button>' : '') +
    '</span></div></li>';
}

function categoryRow(c) {
  const where = c.kakeiboKey ? '家計簿:' + KAKEIBO_KEY_LABELS[c.kakeiboKey] : '家計簿の欄に対応していません';
  return '<li><div class="row static"><span class="row-main"><span class="row-title' + (c.isActive ? '' : ' muted') + '">' + esc(c.name) +
    (c.isActive ? '' : '(非表示)') + '</span><span class="row-sub">' + esc(where) + '</span></span>' +
    '<span class="row-buttons"><button type="button" class="btn small ghost" data-action="rename-category" data-id="' + esc(c.categoryId) + '">変更</button>' +
    '<button type="button" class="btn small ghost" data-action="toggle-category" data-id="' + esc(c.categoryId) + '">' + (c.isActive ? '隠す' : '表示する') + '</button>' +
    '</span></div></li>';
}

function fixedCostRow(room, f) {
  const cat = categoryOf(room, f.categoryId);
  return '<li><button type="button" class="row link" data-action="edit-fixed" data-id="' + esc(f.fixedCostId) + '">' +
    '<span class="row-main"><span class="row-title' + (f.active ? '' : ' muted') + '">' + esc(f.title) + (f.active ? '' : '(停止中)') + '</span>' +
    '<span class="row-sub">毎月' + (f.dayOfMonth >= 31 ? '末日' : f.dayOfMonth + '日') + '・' + esc(memberName(room, f.payerMemberId)) + 'が支払い・' +
    esc(cat ? cat.name : 'カテゴリなし') + '</span></span>' +
    '<span class="row-end"><span class="row-amount">' + yen(f.amount) + '</span></span></button></li>';
}

function kakeiboSection(room) {
  const k = room.kakeibo || {};
  let body;
  if (k.configured) {
    const sheets = [k.sharedSheet + '(共同)'].concat(Object.keys(k.memberSheets).map(function (id) {
      return k.memberSheets[id] + '(' + memberName(room, id) + ')';
    }));
    body = '<p class="kakeibo-status ' + (k.enabled ? 'on' : 'off') + '">' + (k.enabled ? '自動反映:オン' : '自動反映:オフ(準備済み)') + '</p>' +
      '<p class="muted small">反映先:' + esc(sheets.join('、')) + '</p>' +
      '<div class="actions-row">' +
      '<button type="button" class="btn' + (k.enabled ? '' : ' primary') + '" data-action="kakeibo-toggle">' + (k.enabled ? '自動反映を止める' : '自動反映を始める') + '</button>' +
      (k.enabled ? '<button type="button" class="btn" data-action="kakeibo-sync">今すぐ家計簿に反映</button>' : '') +
      '<a class="btn" href="' + esc(k.spreadsheetUrl) + '" target="_blank" rel="noopener">家計簿を開く</a></div>' +
      '<div class="actions-row"><button type="button" class="btn small ghost" data-action="kakeibo-setup">連携の設定をやり直す</button>' +
      '<button type="button" class="btn small ghost danger-text" data-action="kakeibo-remove">連携を解除</button></div>';
  } else if (k.linkedElsewhere) {
    body = '<p class="muted small">家計簿は、いまほかのルームと連携しています。</p>' +
      '<div class="actions-row"><button type="button" class="btn" data-action="kakeibo-setup">このルームに切り替える</button></div>';
  } else {
    body = '<p class="muted small">このルームの記録を、家計簿のスプレッドシートへ自動で書き込みます。この設定は、アプリの管理者にだけ表示されています。</p>' +
      '<div class="actions-row"><button type="button" class="btn primary" data-action="kakeibo-setup">このルームを家計簿と連携する</button></div>';
  }
  return '<section class="section"><h3 class="section-title">家計簿との連携</h3>' + body + '</section>';
}

// ===== シート(画面の下から出る入力欄) =====

let sheetCloseHandler = null;

function openSheet(title, body, onMount) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  root.innerHTML = '<div class="sheet-backdrop" data-sheet-close></div>' +
    '<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
    '<header class="sheet-head"><h2 id="sheet-title">' + esc(title) + '</h2>' +
    '<button type="button" class="icon-btn" data-sheet-close aria-label="閉じる">' + ICONS.close + '</button></header>' +
    '<div class="sheet-body">' + body + '</div></section>';
  root.classList.add('open');
  document.body.classList.add('sheet-open');
  const sheet = root.querySelector('.sheet');
  if (onMount) onMount(sheet);
  return sheet;
}

function closeSheet() {
  const root = document.getElementById('sheet-root');
  if (!root || !root.classList.contains('open')) return;
  root.innerHTML = '';
  root.classList.remove('open');
  document.body.classList.remove('sheet-open');
  const handler = sheetCloseHandler;
  sheetCloseHandler = null;
  if (handler) handler();
}

function confirmSheet(title, messageHtml, okLabel, danger) {
  return new Promise(function (resolve) {
    let decided = false;
    openSheet(title, '<div class="sheet-message">' + messageHtml + '</div>' +
      '<div class="form-actions"><button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-confirm-ok>' + esc(okLabel) + '</button>' +
      '<button type="button" class="btn" data-sheet-close>やめる</button></div>', function (sheet) {
      sheet.querySelector('[data-confirm-ok]').addEventListener('click', function () {
        decided = true;
        closeSheet();
        resolve(true);
      });
    });
    sheetCloseHandler = function () { if (!decided) resolve(false); };
  });
}

function promptSheet(title, label, initial, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    let decided = false;
    openSheet(title, '<form class="form" data-prompt-form novalidate>' +
      (opts.hint ? '<p class="sheet-message">' + opts.hint + '</p>' : '') +
      '<label class="field"><span>' + esc(label) + '</span><input type="text" name="value" value="' + esc(initial || '') + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.inputmode ? ' inputmode="' + esc(opts.inputmode) + '"' : '') +
      ' maxlength="' + (opts.maxlength || 50) + '" autocomplete="off"></label>' +
      '<p class="form-error" role="alert"></p>' +
      '<div class="form-actions"><button type="submit" class="btn primary">' + esc(opts.okLabel || '決定') + '</button>' +
      '<button type="button" class="btn" data-sheet-close>やめる</button></div></form>', function (sheet) {
      const form = sheet.querySelector('[data-prompt-form]');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const value = form.elements.value.value.trim();
        if (opts.required !== false && !value) {
          form.querySelector('.form-error').textContent = label + 'を入力してください';
          return;
        }
        decided = true;
        closeSheet();
        resolve(value);
      });
      setTimeout(function () { if (form.elements.value) form.elements.value.focus(); }, 60);
    });
    sheetCloseHandler = function () { if (!decided) resolve(null); };
  });
}

// --- 支払いの入力 ---

function defaultDate() {
  return state.month === currentMonth() ? todayStr() : state.month + '-01';
}

function openPaymentForm(roomId, existing, draft) {
  const room = state.rooms[roomId];
  if (!room) return;
  const active = room.members.filter(function (m) { return !m.left; });
  const values = draft || (existing
    ? {
        date: existing.date, title: existing.title, amount: existing.amount, payerMemberId: existing.payerMemberId,
        participantMemberIds: existing.shares.map(function (s) { return s.memberId; }),
        categoryId: existing.categoryId, parts: (existing.parts || []).map(function (x) { return { categoryId: x.categoryId, amount: x.amount }; }),
        memo: existing.memo,
      }
    : {
        date: defaultDate(), title: '', amount: '', payerMemberId: room.myMemberId,
        participantMemberIds: active.map(function (m) { return m.memberId; }), categoryId: '', parts: [], memo: '',
      });
  const locked = !!existing && existing.status !== 'open';
  const kakeiboRoom = !!(room.kakeibo && room.kakeibo.configured);
  const shown = room.members.filter(function (m) {
    return !m.left || values.participantMemberIds.indexOf(m.memberId) >= 0 || m.memberId === values.payerMemberId;
  });
  const usedIds = [values.categoryId].concat(values.parts.map(function (x) { return x.categoryId; }));
  const categories = room.categories.filter(function (c) { return c.isActive || usedIds.indexOf(c.categoryId) >= 0; });
  const categoryOptions = function (selected, withEmpty) {
    return (withEmpty ? '<option value="">' + (kakeiboRoom ? '選んでください' : 'なし') + '</option>' : '') +
      categories.map(function (c) {
        return '<option value="' + esc(c.categoryId) + '"' + (c.categoryId === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');
  };
  const partRow = function (part) {
    return '<div class="part-row" data-part><select name="partCategory" aria-label="分けるカテゴリ">' + categoryOptions(part.categoryId, false) + '</select>' +
      '<span class="amount-input"><input type="text" name="partAmount" inputmode="numeric" autocomplete="off" value="' + esc(part.amount) + '" placeholder="0" aria-label="分ける金額"><span>円</span></span>' +
      '<button type="button" class="icon-btn" data-form-action="remove-part" aria-label="この分け方を消す">' + ICONS.close + '</button></div>';
  };

  const body = '<form class="form" id="payment-form" novalidate>' +
    (locked ? '<p class="notice">' + esc(STATUS_LABELS[existing.status]) + 'のため直せません。直すときは、精算タブでこの精算を取り消してください。</p>' : '') +
    '<fieldset class="plain"' + (locked ? ' disabled' : '') + '>' +
    '<div class="field-row"><label class="field"><span>日付</span><input type="date" name="date" value="' + esc(values.date) + '" required></label>' +
    '<label class="field"><span>金額</span><span class="amount-input"><input type="text" name="amount" inputmode="numeric" autocomplete="off" value="' + esc(values.amount) + '" placeholder="0"><span>円</span></span></label></div>' +
    '<label class="field"><span>お店・内容</span><input type="text" name="title" maxlength="50" autocomplete="off" value="' + esc(values.title) + '" placeholder="例:まいばすけっと"></label>' +
    '<div class="field"><span>カテゴリ' + (kakeiboRoom ? '(必須)' : '') + '</span><select name="category" aria-label="カテゴリ">' + categoryOptions(values.categoryId, true) + '</select>' +
    '<p class="hint" data-category-hint></p>' +
    '<div class="parts" data-parts>' + values.parts.map(partRow).join('') + '</div>' +
    '<p class="hint" data-remainder></p>' +
    '<div><button type="button" class="btn small ghost" data-form-action="add-part">' + ICONS.plus + '別のカテゴリに分ける</button></div></div>' +
    '<label class="field"><span>立て替えた人</span><select name="payer">' + shown.map(function (m) {
      return '<option value="' + esc(m.memberId) + '"' + (m.memberId === values.payerMemberId ? ' selected' : '') + '>' + esc(m.displayName) + '</option>';
    }).join('') + '</select></label>' +
    '<div class="field"><span>対象メンバー</span><div class="chips">' + shown.map(function (m) {
      const on = values.participantMemberIds.indexOf(m.memberId) >= 0;
      return '<label class="chip-toggle"><input type="checkbox" name="participant" value="' + esc(m.memberId) + '"' + (on ? ' checked' : '') + '><span>' + esc(m.displayName) + '</span></label>';
    }).join('') + '</div><p class="hint" data-per-person></p></div>' +
    '<label class="field"><span>メモ</span><textarea name="memo" rows="2" maxlength="500">' + esc(values.memo) + '</textarea></label>' +
    '</fieldset>' +
    '<p class="form-error" role="alert"></p>' +
    '<div class="form-actions">' +
    (locked
      ? '<button type="button" class="btn primary" data-form-action="go-settle">精算タブを開く</button>'
      : '<button type="submit" class="btn primary">' + (existing ? '保存する' : '登録する') + '</button>') +
    (existing && !locked
      ? '<button type="button" class="btn" data-form-action="settle-this">この支払いを精算</button>' +
        '<button type="button" class="btn ghost danger-text" data-form-action="delete">削除</button>'
      : '') +
    '</div></form>';

  openSheet(existing ? '支払い' : '支払いを登録', body, function (sheet) {
    const form = sheet.querySelector('#payment-form');
    const hint = form.querySelector('[data-per-person]');
    const categoryHint = form.querySelector('[data-category-hint]');
    const remainder = form.querySelector('[data-remainder]');
    let categoryTouched = !!existing || !!draft;
    const read = function () {
      return {
        date: form.elements.date.value,
        title: form.elements.title.value.trim(),
        amount: parseAmount(form.elements.amount.value),
        payerMemberId: form.elements.payer.value,
        participantMemberIds: Array.prototype.filter.call(form.querySelectorAll('input[name="participant"]'), function (el) { return el.checked; })
          .map(function (el) { return el.value; }),
        categoryId: form.elements.category.value,
        parts: Array.prototype.map.call(form.querySelectorAll('[data-part]'), function (row) {
          return { categoryId: row.querySelector('[name="partCategory"]').value, amount: parseAmount(row.querySelector('[name="partAmount"]').value) };
        }),
        memo: form.elements.memo.value.trim(),
      };
    };
    const updateHints = function () {
      const v = read();
      if (!(v.amount > 0) || !v.participantMemberIds.length) {
        hint.textContent = '';
      } else {
        const shares = splitEqually(v.amount, v.payerMemberId, v.participantMemberIds);
        const base = Math.floor(v.amount / v.participantMemberIds.length);
        const extra = shares.find(function (s) { return s.amount !== base; });
        hint.textContent = '1人あたり ' + yen(base) + (extra ? '(端数の' + yen(extra.amount - base) + 'は' + memberName(room, extra.memberId) + 'が負担)' : '');
      }
      if (!v.parts.length) {
        remainder.textContent = '';
      } else if (!(v.amount > 0)) {
        remainder.textContent = '金額を入れると、元のカテゴリに残る額を表示します';
      } else {
        const used = sum(v.parts.map(function (x) { return x.amount > 0 ? x.amount : 0; }));
        const main = categoryOf(room, v.categoryId);
        remainder.textContent = (main ? '「' + main.name + '」' : '元のカテゴリ') + 'には、残りの ' + yen(v.amount - used) + ' が入ります';
      }
    };
    const applySuggestion = function () {
      if (categoryTouched || locked) return;
      const s = suggestCategory(room, form.elements.title.value, existing ? existing.paymentId : '');
      if (s) {
        form.elements.category.value = s.categoryId;
        categoryHint.textContent = s.reason === 'history' ? '前に同じお店で選んだカテゴリにしました(変えられます)' : 'お店の種類からカテゴリを選びました(変えられます)';
      } else {
        categoryHint.textContent = '';
      }
      updateHints();
    };
    let timer = null;
    form.elements.title.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(applySuggestion, 250);
    });
    form.elements.title.addEventListener('change', applySuggestion);
    form.elements.category.addEventListener('change', function () {
      categoryTouched = true;
      categoryHint.textContent = '';
    });
    form.addEventListener('input', updateHints);
    form.addEventListener('change', updateHints);
    updateHints();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (locked) return;
      const v = read();
      const partIds = v.parts.map(function (x) { return x.categoryId; });
      const partsTotal = sum(v.parts.map(function (x) { return x.amount > 0 ? x.amount : 0; }));
      const error = !v.date ? '日付を入力してください'
        : !(v.amount > 0) ? '金額を数字で入力してください'
        : v.amount > 10000000 ? '金額は1,000万円までです'
        : !v.title ? 'お店・内容を入力してください'
        : kakeiboRoom && !v.categoryId ? 'カテゴリを選んでください'
        : v.parts.some(function (x) { return !(x.amount > 0); }) ? '分ける金額を数字で入力してください'
        : v.parts.length && !v.categoryId ? '分けるときは、元のカテゴリも選んでください'
        : partIds.some(function (id, i) { return id === v.categoryId || partIds.indexOf(id) !== i; }) ? '同じカテゴリには2回分けられません'
        : v.parts.length && partsTotal >= v.amount ? '分ける金額の合計は、支払いの金額より小さくしてください'
        : !v.participantMemberIds.length ? '対象メンバーを1人以上選んでください'
        : '';
      if (error) { form.querySelector('.form-error').textContent = error; return; }
      closeSheet();
      saveAction('savePayment', Object.assign({ roomId: roomId, paymentId: existing ? existing.paymentId : '' }, v), {
        roomId: roomId,
        success: existing ? '支払いを直しました' : '支払いを登録しました',
        reopen: function () { openPaymentForm(roomId, existing, v); },
      });
    });

    form.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-form-action]');
      if (!btn) return;
      const act = btn.dataset.formAction;
      if (act === 'add-part') {
        const v = read();
        const taken = [v.categoryId].concat(v.parts.map(function (x) { return x.categoryId; }));
        const free = categories.find(function (c) { return c.isActive && taken.indexOf(c.categoryId) < 0; });
        form.querySelector('[data-parts]').insertAdjacentHTML('beforeend', partRow({ categoryId: free ? free.categoryId : '', amount: '' }));
        const inputs = form.querySelectorAll('[name="partAmount"]');
        if (inputs.length) inputs[inputs.length - 1].focus();
        updateHints();
      } else if (act === 'remove-part') {
        btn.closest('[data-part]').remove();
        updateHints();
      } else if (act === 'go-settle') {
        closeSheet();
        go('#/room/' + encodeURIComponent(roomId) + '/settle');
      } else if (act === 'delete') {
        const ok = await confirmSheet('支払いを削除', '「' + esc(existing.title) + ' ' + yen(existing.amount) + '」を削除します。', '削除する', true);
        if (ok) saveAction('deletePayment', { paymentId: existing.paymentId }, { roomId: roomId, success: '支払いを削除しました' });
      } else if (act === 'settle-this') {
        const preview = planTransfers(computeBalances([existing], []), memberOrder(room));
        const ok = await confirmSheet('この支払いを精算', previewHtml(room, preview) +
          '<p class="muted small">保存済みの内容で精算します。直した内容は、先に保存してください。</p>', '精算を始める', false);
        if (ok) settle(roomId, { mode: 'selected', paymentIds: [existing.paymentId], transferIds: [] });
      }
    });
  });
}

// --- カテゴリの追加・変更 ---

function openCategoryForm(roomId, existing) {
  const room = state.rooms[roomId];
  if (!room) return;
  const key = existing ? existing.kakeiboKey : 'other';
  const body = '<form class="form" id="category-form" novalidate>' +
    '<label class="field"><span>カテゴリ名</span><input type="text" name="name" maxlength="20" autocomplete="off" value="' + esc(existing ? existing.name : '') + '" placeholder="例:医療"></label>' +
    '<label class="field"><span>家計簿で入る欄</span><select name="key">' +
    Object.keys(KAKEIBO_KEY_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + esc(KAKEIBO_KEY_LABELS[k]) + '</option>';
    }).join('') +
    '<option value=""' + (key === '' ? ' selected' : '') + '>対応させない(家具・家電 インテリア・日用品の欄に入ります)</option></select></label>' +
    '<p class="form-error" role="alert"></p><div class="form-actions"><button type="submit" class="btn primary">' + (existing ? '変更する' : '追加する') + '</button></div></form>';
  openSheet(existing ? 'カテゴリを変更' : 'カテゴリを追加', body, function (sheet) {
    const form = sheet.querySelector('#category-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) { form.querySelector('.form-error').textContent = 'カテゴリ名を入力してください'; return; }
      closeSheet();
      saveAction('saveCategory', { roomId: roomId, categoryId: existing ? existing.categoryId : '', name: name, kakeiboKey: form.elements.key.value }, {
        roomId: roomId, success: existing ? 'カテゴリを変更しました' : 'カテゴリを追加しました',
      });
    });
  });
}

// --- 固定費の登録・変更 ---

function openFixedCostForm(roomId, existing) {
  const room = state.rooms[roomId];
  if (!room) return;
  const active = room.members.filter(function (m) { return !m.left; });
  const v = existing
    ? { title: existing.title, amount: existing.amount, categoryId: existing.categoryId, payerMemberId: existing.payerMemberId,
        participantMemberIds: existing.participantMemberIds, dayOfMonth: existing.dayOfMonth, active: existing.active }
    : { title: '', amount: '', categoryId: '', payerMemberId: room.myMemberId,
        participantMemberIds: active.map(function (m) { return m.memberId; }), dayOfMonth: 1, active: true };
  const shown = room.members.filter(function (m) {
    return !m.left || v.participantMemberIds.indexOf(m.memberId) >= 0 || m.memberId === v.payerMemberId;
  });
  const categories = room.categories.filter(function (c) { return c.isActive || c.categoryId === v.categoryId; });
  const days = [];
  for (let d = 1; d <= 31; d++) {
    days.push('<option value="' + d + '"' + (d === v.dayOfMonth ? ' selected' : '') + '>' + (d === 31 ? '月末(31日)' : d + '日') + '</option>');
  }
  const body = '<form class="form" id="fixed-form" novalidate>' +
    '<p class="muted small">毎月の登録日に、支払いとして自動で登録します。光熱費のように毎月金額が変わるものは、登録されたあとに金額を直してください。</p>' +
    '<label class="field"><span>カテゴリ</span><select name="category"><option value="">選んでください</option>' + categories.map(function (c) {
      return '<option value="' + esc(c.categoryId) + '"' + (c.categoryId === v.categoryId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('') + '</select></label>' +
    '<div class="field-row"><label class="field"><span>内容</span><input type="text" name="title" maxlength="50" autocomplete="off" value="' + esc(v.title) + '" placeholder="例:家賃"></label>' +
    '<label class="field"><span>金額</span><span class="amount-input"><input type="text" name="amount" inputmode="numeric" autocomplete="off" value="' + esc(v.amount) + '" placeholder="0"><span>円</span></span></label></div>' +
    '<div class="field-row"><label class="field"><span>支払う人</span><select name="payer">' + shown.map(function (m) {
      return '<option value="' + esc(m.memberId) + '"' + (m.memberId === v.payerMemberId ? ' selected' : '') + '>' + esc(m.displayName) + '</option>';
    }).join('') + '</select></label>' +
    '<label class="field"><span>毎月の登録日</span><select name="day">' + days.join('') + '</select></label></div>' +
    '<div class="field"><span>対象メンバー</span><div class="chips">' + shown.map(function (m) {
      const on = v.participantMemberIds.indexOf(m.memberId) >= 0;
      return '<label class="chip-toggle"><input type="checkbox" name="participant" value="' + esc(m.memberId) + '"' + (on ? ' checked' : '') + '><span>' + esc(m.displayName) + '</span></label>';
    }).join('') + '</div></div>' +
    (existing
      ? '<label class="check-line"><input type="checkbox" name="active"' + (v.active ? ' checked' : '') + '><span>自動登録を続ける(外すと止まります)</span></label>'
      : '<fieldset class="field"><legend>いつから登録しますか</legend><div class="radio-list">' +
        '<label class="radio"><input type="radio" name="start" value="this" checked><span>今月から(登録日を過ぎていれば、すぐに今月分を登録)</span></label>' +
        '<label class="radio"><input type="radio" name="start" value="next"><span>来月から(今月分は自分で入力済み)</span></label></div></fieldset>') +
    '<p class="form-error" role="alert"></p><div class="form-actions"><button type="submit" class="btn primary">' + (existing ? '保存する' : '登録する') + '</button>' +
    (existing ? '<button type="button" class="btn ghost danger-text" data-form-action="delete">削除</button>' : '') + '</div></form>';

  openSheet(existing ? '固定費' : '固定費を登録', body, function (sheet) {
    const form = sheet.querySelector('#fixed-form');
    form.elements.category.addEventListener('change', function () {
      const c = categoryOf(room, form.elements.category.value);
      if (c && !form.elements.title.value.trim()) form.elements.title.value = c.name;
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const params = {
        roomId: roomId,
        fixedCostId: existing ? existing.fixedCostId : '',
        categoryId: form.elements.category.value,
        title: form.elements.title.value.trim(),
        amount: parseAmount(form.elements.amount.value),
        payerMemberId: form.elements.payer.value,
        dayOfMonth: Number(form.elements.day.value),
        participantMemberIds: Array.prototype.filter.call(form.querySelectorAll('input[name="participant"]'), function (el) { return el.checked; })
          .map(function (el) { return el.value; }),
      };
      if (existing) params.active = form.elements.active.checked;
      else params.startThisMonth = form.querySelector('input[name="start"]:checked').value === 'this';
      const error = !params.categoryId ? 'カテゴリを選んでください'
        : !params.title ? '内容を入力してください'
        : !(params.amount > 0) ? '金額を数字で入力してください'
        : !params.participantMemberIds.length ? '対象メンバーを1人以上選んでください'
        : '';
      if (error) { form.querySelector('.form-error').textContent = error; return; }
      closeSheet();
      saveAction('saveFixedCost', params, {
        roomId: roomId,
        success: existing ? '固定費を変更しました' : '固定費を登録しました',
        after: function (data) { if (data && data.created) showToast('今月分の「' + params.title + '」を支払いとして登録しました', 'ok'); },
      });
    });
    form.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-form-action="delete"]');
      if (!btn) return;
      const ok = await confirmSheet('固定費を削除', '「' + esc(existing.title) + '」の自動登録をやめます。これまでに登録された支払いは残ります。', '削除する', true);
      if (ok) saveAction('deleteFixedCost', { fixedCostId: existing.fixedCostId }, { roomId: roomId, success: '固定費を削除しました' });
    });
  });
}

// --- 家計簿との連携(管理者だけ) ---

async function openKakeiboSetup(roomId) {
  const room = state.rooms[roomId];
  if (!room) return;
  openSheet('家計簿との連携', '<p class="loading">家計簿を確認しています…</p>');
  let info;
  try {
    info = await api('getKakeibo', { roomId: roomId });
  } catch (e) {
    const failed = document.querySelector('#sheet-root .sheet-body');
    if (failed && e.code !== 'AUTH_REQUIRED') failed.innerHTML = '<p class="notice error">' + esc(e.message) + '</p>';
    return;
  }
  const body = document.querySelector('#sheet-root .sheet-body');
  if (!body) return;
  const cfg = info.config && info.config.roomId === roomId ? info.config : null;
  const options = function (selected) {
    return '<option value="">なし</option>' + info.sheetNames.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  };
  const sharedGuess = cfg ? cfg.sharedSheet : (info.sheetNames.find(function (n) { return /共同/.test(n); }) || '');
  const memberGuess = function (m) {
    if (cfg && cfg.memberSheets && cfg.memberSheets[m.memberId]) return cfg.memberSheets[m.memberId];
    const name = normalizeStore(m.displayName);
    return info.sheetNames.find(function (n) { return /個人/.test(n) && name && normalizeStore(n).indexOf(name) === 0; }) || '';
  };
  const active = room.members.filter(function (m) { return !m.left; });
  body.innerHTML = '<form class="form" id="kakeibo-form" novalidate>' +
    '<p class="sheet-message">家計簿「' + esc(info.spreadsheetName) + '」と連携します。各シートの一番上に「表示する月」の行を追加します。</p>' +
    '<label class="field"><span>2人で割り勘した支払いを入れるシート</span><select name="shared">' + options(sharedGuess) + '</select></label>' +
    active.map(function (m) {
      return '<label class="field"><span>' + esc(m.displayName) + 'の個人の支払いを入れるシート</span>' +
        '<select name="member" data-member="' + esc(m.memberId) + '">' + options(memberGuess(m)) + '</select></label>';
    }).join('') +
    '<p class="muted small">準備をしても、自動反映がオフのあいだは家計簿を書き換えません。今月分の記録をアプリに入れ終えてから「自動反映を始める」を押してください。</p>' +
    '<p class="form-error" role="alert"></p><div class="form-actions"><button type="submit" class="btn primary">連携の準備をする</button></div></form>';
  const form = body.querySelector('#kakeibo-form');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const sharedSheet = form.elements.shared.value;
    const memberSheets = {};
    form.querySelectorAll('select[name="member"]').forEach(function (el) { if (el.value) memberSheets[el.dataset.member] = el.value; });
    const chosen = [sharedSheet].concat(Object.keys(memberSheets).map(function (k) { return memberSheets[k]; }));
    const error = !sharedSheet ? '2人で割り勘した支払いを入れるシートを選んでください'
      : chosen.some(function (n, i) { return chosen.indexOf(n) !== i; }) ? '同じシートを2回選ぶことはできません'
      : '';
    if (error) { form.querySelector('.form-error').textContent = error; return; }
    closeSheet();
    saveAction('setupKakeibo', { roomId: roomId, spreadsheetId: info.spreadsheetId, sharedSheet: sharedSheet, memberSheets: memberSheets }, {
      roomId: roomId, success: '家計簿との連携の準備ができました',
    });
  });
}

function openTransferForm(roomId, existing, draft) {
  const room = state.rooms[roomId];
  if (!room) return;
  const active = room.members.filter(function (m) { return !m.left; });
  const others = active.filter(function (m) { return m.memberId !== room.myMemberId; });
  const values = draft || (existing
    ? { date: existing.date, fromMemberId: existing.fromMemberId, toMemberId: existing.toMemberId, amount: existing.amount, memo: existing.memo }
    : { date: defaultDate(), fromMemberId: room.myMemberId, toMemberId: others.length ? others[0].memberId : '', amount: '', memo: '' });
  const locked = !!existing && existing.status !== 'open';
  const shown = room.members.filter(function (m) {
    return !m.left || m.memberId === values.fromMemberId || m.memberId === values.toMemberId;
  });
  const options = function (selected) {
    return shown.map(function (m) {
      return '<option value="' + esc(m.memberId) + '"' + (m.memberId === selected ? ' selected' : '') + '>' + esc(m.displayName) + '</option>';
    }).join('');
  };
  const body = '<form class="form" id="transfer-form" novalidate>' +
    '<p class="muted small">メンバーに直接渡したお金を記録します。使用額には含まれず、次の精算で差し引かれます。</p>' +
    (locked ? '<p class="notice">' + esc(STATUS_LABELS[existing.status]) + 'のため直せません。直すときは、精算タブでこの精算を取り消してください。</p>' : '') +
    '<fieldset class="plain"' + (locked ? ' disabled' : '') + '>' +
    '<div class="field-row"><label class="field"><span>日付</span><input type="date" name="date" value="' + esc(values.date) + '"></label>' +
    '<label class="field"><span>金額</span><span class="amount-input"><input type="text" name="amount" inputmode="numeric" autocomplete="off" value="' + esc(values.amount) + '" placeholder="0"><span>円</span></span></label></div>' +
    '<div class="field-row"><label class="field"><span>渡した人</span><select name="from">' + options(values.fromMemberId) + '</select></label>' +
    '<label class="field"><span>受け取った人</span><select name="to">' + options(values.toMemberId) + '</select></label></div>' +
    '<label class="field"><span>メモ</span><textarea name="memo" rows="2" maxlength="500">' + esc(values.memo) + '</textarea></label>' +
    '</fieldset><p class="form-error" role="alert"></p><div class="form-actions">' +
    (locked
      ? '<button type="button" class="btn primary" data-form-action="go-settle">精算タブを開く</button>'
      : '<button type="submit" class="btn primary">' + (existing ? '保存する' : '記録する') + '</button>') +
    (existing && !locked ? '<button type="button" class="btn ghost danger-text" data-form-action="delete">削除</button>' : '') +
    '</div></form>';

  openSheet(existing ? 'お金の受け渡し' : 'お金の受け渡しを記録', body, function (sheet) {
    const form = sheet.querySelector('#transfer-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (locked) return;
      const v = {
        date: form.elements.date.value,
        fromMemberId: form.elements.from.value,
        toMemberId: form.elements.to.value,
        amount: parseAmount(form.elements.amount.value),
        memo: form.elements.memo.value.trim(),
      };
      const error = !v.date ? '日付を入力してください'
        : !(v.amount > 0) ? '金額を数字で入力してください'
        : v.fromMemberId === v.toMemberId ? '渡した人と受け取った人は、別の人にしてください'
        : '';
      if (error) { form.querySelector('.form-error').textContent = error; return; }
      closeSheet();
      saveAction('saveTransfer', Object.assign({ roomId: roomId, transferId: existing ? existing.transferId : '' }, v), {
        roomId: roomId,
        success: existing ? '受け渡しを直しました' : '受け渡しを記録しました',
        reopen: function () { openTransferForm(roomId, existing, v); },
      });
    });
    form.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-form-action]');
      if (!btn) return;
      if (btn.dataset.formAction === 'go-settle') {
        closeSheet();
        go('#/room/' + encodeURIComponent(roomId) + '/settle');
      } else if (btn.dataset.formAction === 'delete') {
        const ok = await confirmSheet('受け渡しを削除', 'この受け渡しの記録を削除します。', '削除する', true);
        if (ok) saveAction('deleteTransfer', { transferId: existing.transferId }, { roomId: roomId, success: '受け渡しを削除しました' });
      }
    });
  });
}

// --- 精算 ---

function previewHtml(room, plan) {
  if (!plan.length) return '<p class="sheet-message">送金は必要ありません。そのまま精算済みになります。</p>';
  return '<p class="sheet-message">次の送金で精算します。</p><ul class="transfer-list">' +
    plan.map(function (t) { return planRow(room, t); }).join('') + '</ul>';
}

function settle(roomId, params) {
  saveAction('createSettlement', Object.assign({ roomId: roomId }, params), {
    roomId: roomId,
    success: '精算を始めました。送金が済んだら「完了にする」を押してください',
    after: function (data) {
      if (data.status === 'settled') showToast('送金がいらないため、精算済みにしました', 'ok');
      go('#/room/' + encodeURIComponent(roomId) + '/settle');
    },
  });
}

function openSelectSettlement(roomId) {
  const room = state.rooms[roomId];
  const payments = room.payments.filter(function (p) { return p.status === 'open'; }).sort(byDateDesc);
  const transfers = room.transfers.filter(function (t) { return t.status === 'open'; }).sort(byDateDesc);
  const body = '<form class="form" id="select-form" novalidate><p class="sheet-message">精算する記録を選んでください。</p>' +
    '<ul class="check-list">' +
    payments.map(function (p) {
      return '<li><label class="check"><input type="checkbox" name="payment" value="' + esc(p.paymentId) + '">' +
        '<span class="check-main"><span class="row-title">' + esc(dateLabel(p.date)) + ' ' + esc(p.title) + '</span>' +
        '<span class="row-sub">' + esc(memberName(room, p.payerMemberId)) + '立替・' + p.shares.length + '人</span></span>' +
        '<span class="row-amount">' + yen(p.amount) + '</span></label></li>';
    }).join('') +
    transfers.map(function (t) {
      return '<li><label class="check"><input type="checkbox" name="transfer" value="' + esc(t.transferId) + '">' +
        '<span class="check-main"><span class="row-title">' + esc(dateLabel(t.date)) + ' お金の受け渡し</span>' +
        '<span class="row-sub">' + esc(memberName(room, t.fromMemberId)) + ' → ' + esc(memberName(room, t.toMemberId)) + '</span></span>' +
        '<span class="row-amount">' + yen(t.amount) + '</span></label></li>';
    }).join('') +
    '</ul><div data-preview></div><p class="form-error" role="alert"></p>' +
    '<div class="form-actions"><button type="submit" class="btn primary">選んだ分を精算する</button></div></form>';

  openSheet('選んで精算', body, function (sheet) {
    const form = sheet.querySelector('#select-form');
    const preview = form.querySelector('[data-preview]');
    const selected = function () {
      const pick = function (name) {
        return Array.prototype.filter.call(form.querySelectorAll('input[name="' + name + '"]'), function (el) { return el.checked; })
          .map(function (el) { return el.value; });
      };
      return { paymentIds: pick('payment'), transferIds: pick('transfer') };
    };
    const update = function () {
      const s = selected();
      if (!s.paymentIds.length && !s.transferIds.length) { preview.innerHTML = ''; return; }
      const plan = planTransfers(computeBalances(
        room.payments.filter(function (p) { return s.paymentIds.indexOf(p.paymentId) >= 0; }),
        room.transfers.filter(function (t) { return s.transferIds.indexOf(t.transferId) >= 0; })
      ), memberOrder(room));
      preview.innerHTML = previewHtml(room, plan);
    };
    form.addEventListener('change', update);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const s = selected();
      if (!s.paymentIds.length && !s.transferIds.length) {
        form.querySelector('.form-error').textContent = '精算する記録を1つ以上選んでください';
        return;
      }
      closeSheet();
      settle(roomId, { mode: 'selected', paymentIds: s.paymentIds, transferIds: s.transferIds });
    });
  });
}

function findItem(itemId) {
  const room = currentRoom();
  if (!room) return null;
  for (let i = 0; i < room.settlements.length; i++) {
    const item = room.settlements[i].items.find(function (x) { return x.itemId === itemId; });
    if (item) return { room: room, settlement: room.settlements[i], item: item };
  }
  return null;
}

// ===== コピーとLINEでの共有 =====

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (err) { /* コピーできない環境 */ }
    document.body.removeChild(area);
  }
  showToast('コピーしました', 'ok');
}

function shareToLine(text) {
  window.open('https://line.me/R/share?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

function inviteMessage(room) {
  return '割り勘アプリの「' + room.room.name + '」に招待します。下のリンクを開いて、Googleでログインすると参加できます。\n' + inviteLink(room);
}

// ===== 変更履歴 =====

function describeHistory(room, h) {
  const a = h.after || {};
  const b = h.before || {};
  const name = function (id) { return memberName(room, id); };
  const pay = function (x) { return '「' + (x.title || '') + ' ' + yen(x.amount) + '」'; };
  const tr = function (x) { return '「' + name(x.fromMemberId) + ' → ' + name(x.toMemberId) + ' ' + yen(x.amount) + '」'; };
  const key = h.targetType + ':' + h.action;
  switch (key) {
    case 'room:create': return 'ルーム「' + (a.name || '') + '」を作りました';
    case 'room:update':
      if (b.name !== a.name) return 'ルーム名を「' + (a.name || '') + '」に変えました';
      return a.archived ? 'ルームをアーカイブしました' : 'ルームをアーカイブから戻しました';
    case 'room:delete': return 'ルームを削除しました';
    case 'member:create': return '名前だけのメンバー「' + (a.displayName || '') + '」を追加しました';
    case 'member:join': return 'ルームに参加しました';
    case 'member:claim': return '「' + (a.displayName || '') + '」として参加しました';
    case 'member:update': return '「' + (b.displayName || '') + '」の名前を「' + (a.displayName || '') + '」に変えました';
    case 'member:remove': return '「' + (b.displayName || '') + '」をルームから外しました';
    case 'category:create': return 'カテゴリ「' + (a.name || '') + '」を追加しました';
    case 'category:update': return 'カテゴリ「' + (a.name || '') + '」を変更しました';
    case 'payment:create': return '支払い' + pay(a) + 'を登録しました';
    case 'payment:update': return '支払い' + pay(a) + 'を直しました';
    case 'payment:delete': return '支払い' + pay(b) + 'を削除しました';
    case 'transfer:create': return '受け渡し' + tr(a) + 'を記録しました';
    case 'transfer:update': return '受け渡し' + tr(a) + 'を直しました';
    case 'transfer:delete': return '受け渡し' + tr(b) + 'を削除しました';
    case 'settlement:create': return '精算を始めました(送金' + ((a.transfers || []).length) + '件)';
    case 'settlement:cancel': return '精算を取り消しました';
    case 'fixed_cost:create': return '固定費「' + (a.title || '') + ' ' + yen(a.amount) + '」を登録しました';
    case 'fixed_cost:update': return '固定費「' + (a.title || '') + '」を変更しました';
    case 'fixed_cost:delete': return '固定費「' + (b.title || '') + '」を削除しました';
    case 'kakeibo:setup': return '家計簿との連携を設定しました';
    case 'kakeibo:enable': return '家計簿への自動反映を始めました';
    case 'kakeibo:disable': return '家計簿への自動反映を止めました';
    case 'kakeibo:remove': return '家計簿との連携を解除しました';
    case 'settlement_item:pay':
      if (a.status === 'done') return '送金を完了にしました';
      if (a.status === 'waiting') return '送金を未払いに戻しました';
      return '送金の一部(支払い済み ' + yen(a.paidAmount) + ')を記録しました';
    default: return '記録を更新しました';
  }
}

async function showHistory(roomId) {
  const room = state.rooms[roomId];
  openSheet('変更履歴', '<p class="loading">読み込んでいます…</p>');
  try {
    const list = await api('listHistory', { roomId: roomId, limit: 200 });
    const body = document.querySelector('#sheet-root .sheet-body');
    if (!body) return;
    body.innerHTML = list.length
      ? '<ul class="history">' + list.map(function (h) {
          return '<li><span class="history-at">' + esc(dateTimeLabel(h.at)) + '</span>' +
            '<span class="history-text"><strong>' + esc(h.actorName) + '</strong>が' + esc(describeHistory(room, h)) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="empty">まだ履歴はありません。</p>';
  } catch (e) {
    if (e.code !== 'AUTH_REQUIRED') {
      const body = document.querySelector('#sheet-root .sheet-body');
      if (body) body.innerHTML = '<p class="notice error">' + esc(e.message) + '</p>';
    }
  }
}

// ===== トースト(画面上部のお知らせ) =====

let toastTimer = null;

function showToast(message, kind) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast show ' + (kind || '');
  clearTimeout(toastTimer);
  if (kind !== 'busy') toastTimer = setTimeout(hideToast, kind === 'error' ? 6000 : 2600);
}

function hideToast() {
  const el = document.getElementById('toast');
  if (el) el.className = 'toast';
}

// ===== ボタンを押したときの動き =====

const ACTIONS = {
  logout: async function () {
    const ok = await confirmSheet('ログアウト', 'このブラウザからログアウトします。', 'ログアウトする', false);
    if (!ok) return;
    try { await api('logout', {}); } catch (e) { /* ログアウトはこの画面だけでも進める */ }
    clearSession();
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    showLogin('');
  },

  month: function (ds) {
    state.month = shiftMonth(state.month, Number(ds.diff));
    if (state.view.name === 'home') {
      state.home = null;
      render();
      loadHome();
    } else {
      render();
    }
  },

  'create-room': async function () {
    const name = await promptSheet('ルームを作る', 'ルーム名', '', { placeholder: '例:2人の生活費', okLabel: '作る' });
    if (name === null) return;
    saveAction('createRoom', { name: name }, {
      success: 'ルームを作りました。招待リンクを送ってメンバーを招待しましょう',
      after: function (data) { go('#/room/' + encodeURIComponent(data.roomId) + '/settings'); },
    });
  },

  'quick-add': function () {
    const rooms = (state.home ? state.home.rooms : []).filter(function (r) { return !r.archived; });
    const choose = async function (roomId) {
      closeSheet();
      const room = await ensureRoom(roomId);
      if (room) openPaymentForm(roomId);
    };
    if (rooms.length === 1) { choose(rooms[0].roomId); return; }
    openSheet('どのルームに登録しますか', '<div class="choice-list">' + rooms.map(function (r) {
      return '<button type="button" class="choice" data-room="' + esc(r.roomId) + '"><span class="row-title">' + esc(r.name) + '</span></button>';
    }).join('') + '</div>', function (sheet) {
      sheet.addEventListener('click', function (e) {
        const b = e.target.closest('[data-room]');
        if (b) choose(b.dataset.room);
      });
    });
  },

  'add-record': function () {
    const roomId = state.view.roomId;
    openSheet('記録する', '<div class="choice-list">' +
      '<button type="button" class="choice" data-choice="payment"><span class="row-title">支払いを登録</span>' +
      '<span class="row-sub">誰かが立て替えた買い物や食事</span></button>' +
      '<button type="button" class="choice" data-choice="transfer"><span class="row-title">お金の受け渡しを記録</span>' +
      '<span class="row-sub">メンバーに直接渡したお金</span></button></div>', function (sheet) {
      sheet.addEventListener('click', function (e) {
        const b = e.target.closest('[data-choice]');
        if (!b) return;
        if (b.dataset.choice === 'payment') openPaymentForm(roomId);
        else openTransferForm(roomId);
      });
    });
  },

  'open-payment': function (ds) {
    const room = currentRoom();
    const p = room && room.payments.find(function (x) { return x.paymentId === ds.id; });
    if (p) openPaymentForm(room.room.roomId, p);
  },

  'open-transfer': function (ds) {
    const room = currentRoom();
    const t = room && room.transfers.find(function (x) { return x.transferId === ds.id; });
    if (t) openTransferForm(room.room.roomId, t);
  },

  'settle-all': async function () {
    const room = currentRoom();
    if (!room) return;
    const openPayments = room.payments.filter(function (p) { return p.status === 'open'; });
    const openTransfers = room.transfers.filter(function (t) { return t.status === 'open'; });
    const plan = planTransfers(computeBalances(openPayments, openTransfers), memberOrder(room));
    const ok = await confirmSheet('これまでの分を精算', previewHtml(room, plan) +
      '<p class="muted small">未精算の記録 ' + (openPayments.length + openTransfers.length) + '件が対象です。精算を始めると、対象の記録は直せなくなります。</p>',
      '精算を始める', false);
    if (ok) settle(room.room.roomId, { mode: 'all' });
  },

  'settle-select': function () {
    const room = currentRoom();
    if (room) openSelectSettlement(room.room.roomId);
  },

  'item-done': function (ds) {
    const ctx = findItem(ds.id);
    if (!ctx) return;
    saveAction('setItemPaid', { itemId: ds.id, paidAmount: ctx.item.amount }, { roomId: ctx.room.room.roomId, success: '送金を完了にしました' });
  },

  'item-partial': async function (ds) {
    const ctx = findItem(ds.id);
    if (!ctx) return;
    const rest = ctx.item.amount - ctx.item.paidAmount;
    const value = await promptSheet('一部を記録', '今回支払った額(円)', '', {
      inputmode: 'numeric', placeholder: '例:3000', okLabel: '記録する',
      hint: esc(memberName(ctx.room, ctx.item.fromMemberId)) + ' → ' + esc(memberName(ctx.room, ctx.item.toMemberId)) + '(残り ' + yen(rest) + ')',
    });
    if (value === null) return;
    const amount = parseAmount(value);
    if (!(amount > 0)) { showToast('金額を数字で入力してください', 'error'); return; }
    if (amount > rest) { showToast('残りの' + yen(rest) + 'より多くは記録できません', 'error'); return; }
    saveAction('setItemPaid', { itemId: ds.id, paidAmount: ctx.item.paidAmount + amount }, {
      roomId: ctx.room.room.roomId,
      success: amount === rest ? '送金を完了にしました' : yen(amount) + 'を記録しました(残り ' + yen(rest - amount) + ')',
    });
  },

  'item-reset': async function (ds) {
    const ctx = findItem(ds.id);
    if (!ctx) return;
    const ok = await confirmSheet('未払いに戻す', 'この送金の支払い済みの記録を消して、未払いに戻します。', '未払いに戻す', false);
    if (ok) saveAction('setItemPaid', { itemId: ds.id, paidAmount: 0 }, { roomId: ctx.room.room.roomId, success: '未払いに戻しました' });
  },

  'share-settlement': function (ds) {
    const room = currentRoom();
    const s = room && room.settlements.find(function (x) { return x.settlementId === ds.id; });
    if (s) shareToLine(settlementText(room, s));
  },

  'copy-settlement': function (ds) {
    const room = currentRoom();
    const s = room && room.settlements.find(function (x) { return x.settlementId === ds.id; });
    if (s) copyText(settlementText(room, s));
  },

  'cancel-settlement': async function (ds) {
    const room = currentRoom();
    if (!room) return;
    const ok = await confirmSheet('精算を取り消す',
      '<p>取り消すと、この精算の対象だった記録は「未精算」に戻ります。</p>' +
      '<p>すでに送ったお金は「お金の受け渡し」として残るので、直してから精算し直せば差額だけが出ます。</p>',
      '取り消す', true);
    if (ok) saveAction('cancelSettlement', { settlementId: ds.id }, { roomId: room.room.roomId, success: '精算を取り消しました' });
  },

  'rename-room': async function () {
    const room = currentRoom();
    if (!room) return;
    const name = await promptSheet('ルーム名を変更', 'ルーム名', room.room.name, { okLabel: '変更する' });
    if (name === null || name === room.room.name) return;
    saveAction('updateRoom', { roomId: room.room.roomId, name: name }, { roomId: room.room.roomId, success: 'ルーム名を変えました' });
  },

  'share-invite': function () {
    const room = currentRoom();
    if (room) shareToLine(inviteMessage(room));
  },

  'copy-invite': function () {
    const room = currentRoom();
    if (room) copyText(inviteMessage(room));
  },

  'add-member': async function () {
    const room = currentRoom();
    if (!room) return;
    const name = await promptSheet('名前だけのメンバーを追加', '名前', '', {
      placeholder: '例:Cさん', okLabel: '追加する', maxlength: 30,
      hint: 'ログインしない人を追加します。その人の分は、ほかのメンバーが入力します。',
    });
    if (name === null) return;
    saveAction('addMember', { roomId: room.room.roomId, displayName: name }, { roomId: room.room.roomId, success: name + 'を追加しました' });
  },

  'rename-member': async function (ds) {
    const room = currentRoom();
    if (!room) return;
    const m = room.members.find(function (x) { return x.memberId === ds.id; });
    if (!m) return;
    const name = await promptSheet('名前を変更', '名前', m.displayName, { okLabel: '変更する', maxlength: 30 });
    if (name === null || name === m.displayName) return;
    saveAction('updateMember', { memberId: m.memberId, displayName: name }, { roomId: room.room.roomId, success: '名前を変えました' });
  },

  'remove-member': async function (ds) {
    const room = currentRoom();
    if (!room) return;
    const m = room.members.find(function (x) { return x.memberId === ds.id; });
    if (!m) return;
    const balance = computeBalances(
      room.payments.filter(function (p) { return p.status === 'open'; }),
      room.transfers.filter(function (t) { return t.status === 'open'; })
    )[m.memberId] || 0;
    const ok = await confirmSheet('メンバーを外す',
      '<p>「' + esc(m.displayName) + '」をルームから外します。過去の記録は残り、精算の計算にも含まれたままです。</p>' +
      (balance ? '<p class="notice warn">この人には未精算の残高(' + (balance > 0 ? '受け取る ' : '払う ') + yen(Math.abs(balance)) + ')があります。</p>' : ''),
      '外す', true);
    if (ok) saveAction('removeMember', { memberId: m.memberId }, { roomId: room.room.roomId, success: m.displayName + 'を外しました' });
  },

  'add-category': function () {
    const room = currentRoom();
    if (room) openCategoryForm(room.room.roomId);
  },

  'rename-category': function (ds) {
    const room = currentRoom();
    if (!room) return;
    const c = room.categories.find(function (x) { return x.categoryId === ds.id; });
    if (c) openCategoryForm(room.room.roomId, c);
  },

  'add-fixed': function () {
    const room = currentRoom();
    if (room) openFixedCostForm(room.room.roomId);
  },

  'edit-fixed': function (ds) {
    const room = currentRoom();
    if (!room) return;
    const f = room.fixedCosts.find(function (x) { return x.fixedCostId === ds.id; });
    if (f) openFixedCostForm(room.room.roomId, f);
  },

  'kakeibo-setup': function () {
    const room = currentRoom();
    if (room) openKakeiboSetup(room.room.roomId);
  },

  'kakeibo-toggle': async function () {
    const room = currentRoom();
    if (!room) return;
    const turnOn = !room.kakeibo.enabled;
    if (turnOn) {
      const ok = await confirmSheet('自動反映を始める',
        '<p>家計簿の各シートを、「表示する月」のアプリの記録で書き直します。</p>' +
        '<p>家計簿にしかない記録は消えるので、先にアプリへ入れておいてください。</p>', '始める', false);
      if (!ok) return;
    }
    saveAction('setKakeiboEnabled', { enabled: turnOn }, {
      roomId: room.room.roomId,
      success: turnOn ? '自動反映を始めました。家計簿を開いて確かめてください' : '自動反映を止めました',
    });
  },

  'kakeibo-sync': function () {
    saveAction('syncKakeibo', {}, { success: '家計簿に反映しました' });
  },

  'kakeibo-remove': async function () {
    const room = currentRoom();
    if (!room) return;
    const ok = await confirmSheet('連携を解除',
      '<p>家計簿への自動反映をやめます。家計簿の内容とアプリの記録は、どちらも消えません。</p>', '解除する', true);
    if (ok) saveAction('removeKakeibo', {}, { roomId: room.room.roomId, success: '家計簿との連携を解除しました' });
  },

  'toggle-category': function (ds) {
    const room = currentRoom();
    if (!room) return;
    const c = room.categories.find(function (x) { return x.categoryId === ds.id; });
    if (!c) return;
    saveAction('saveCategory', { roomId: room.room.roomId, categoryId: c.categoryId, isActive: !c.isActive }, {
      roomId: room.room.roomId, success: c.isActive ? '「' + c.name + '」を隠しました' : '「' + c.name + '」を表示しました',
    });
  },

  'show-history': function () {
    const room = currentRoom();
    if (room) showHistory(room.room.roomId);
  },

  'toggle-archive': function () {
    const room = currentRoom();
    if (!room) return;
    const next = !room.room.archived;
    saveAction('updateRoom', { roomId: room.room.roomId, archived: next }, {
      roomId: room.room.roomId, success: next ? 'アーカイブしました' : 'アーカイブから戻しました',
    });
  },

  'delete-room': async function () {
    const room = currentRoom();
    if (!room) return;
    const ok = await confirmSheet('ルームを削除',
      '<p>「' + esc(room.room.name) + '」を削除します。メンバー全員がこのルームを見られなくなります。</p>', '削除する', true);
    if (!ok) return;
    const roomId = room.room.roomId;
    saveAction('deleteRoom', { roomId: roomId }, {
      success: 'ルームを削除しました',
      after: function () { delete state.rooms[roomId]; go('#/'); },
    });
  },

  'cancel-join': function () {
    storageSet(STORAGE_KEYS.invite, null);
    state.invite = null;
    go('#/');
  },
};

async function submitJoin(form) {
  const inv = state.invite;
  if (!inv || !inv.info) return;
  const claim = form.elements.claim ? form.elements.claim.value : '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '参加しています…';
  try {
    const data = await api('joinRoom', { inviteToken: inv.token, claimMemberId: claim || '' });
    storageSet(STORAGE_KEYS.invite, null);
    state.invite = null;
    showToast('ルームに参加しました', 'ok');
    go('#/room/' + encodeURIComponent(data.roomId) + '/records');
  } catch (e) {
    if (e.code === 'AUTH_REQUIRED') return;
    showToast(e.message, 'error');
    button.disabled = false;
    button.textContent = '参加する';
  }
}

// ===== はじめに動かす =====

document.addEventListener('click', function (e) {
  if (e.target.closest('[data-sheet-close]')) {
    e.preventDefault();
    closeSheet();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const handler = ACTIONS[el.dataset.action];
  if (!handler) return;
  e.preventDefault();
  handler(el.dataset, el);
});

document.addEventListener('submit', function (e) {
  if (e.target && e.target.id === 'join-form') {
    e.preventDefault();
    submitJoin(e.target);
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeSheet();
});

window.addEventListener('hashchange', route);

if (WIDE_QUERY.addEventListener) {
  WIDE_QUERY.addEventListener('change', function () { if (state.view.name === 'room') render(); });
}

onGoogleLibraryLoad();
route();
