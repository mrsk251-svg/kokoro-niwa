/* こころの庭 — 過食しなかった日を記録して、花や動物を育てるアプリ
 * データはこの端末の localStorage にだけ保存し、外部には送信しません。
 * AIやAPIは一切使いません。 */
(function () {
'use strict';

/* ================= 設定値 ================= */
var KEY = 'kokoro-niwa-v1';           // 保存場所の名前（変えると今までの記録が読めなくなるので変えない）
var BACKUP_EVERY_DAYS = 7;            // バックアップをすすめる間隔
var MESSAGES = [
  '記録をつけたこと自体が、ちゃんと前に進んでいる証拠です。',
  '今日のあなたも、よくここまで来ました。',
  'うまくいかない日があっても、記録は消えません。',
  '一日ずつで大丈夫。また今日から始められます。',
  '体も心も、少しずつ変わっていきます。',
  '自分を責める代わりに、深呼吸をひとつ。',
  '完璧じゃなくていい。続けていることが大切です。',
  'あなたの庭は、ちゃんと育っています。',
  '疲れた日は、早めに休んでも大丈夫。',
  '今日できたことを、ひとつ思い出してみましょう。',
  '過去の日は変えられなくても、今日は選べます。',
  'ここに来たこと、それだけでえらいです。'
];
var FLOWERS = [
  { name: 'さくら草',   petal: '#F4C9CF', center: '#F2D98A', shape: 'round' },
  { name: 'ラベンダー', petal: '#C9B9E6', center: '#F2D98A', shape: 'long' },
  { name: 'ひまわり',   petal: '#F5D77E', center: '#B98A5A', shape: 'long' },
  { name: 'ネモフィラ', petal: '#B9D3EE', center: '#F4F0E4', shape: 'round' },
  { name: 'コスモス',   petal: '#F2B6C6', center: '#F2D98A', shape: 'long' },
  { name: 'すずらん',   petal: '#F7F5EE', center: '#DDE8C9', shape: 'round' }
];
// 過食なしの日の合計で進む成長段階（1輪21日）
var STAGES = [
  { n: '種', at: 0 }, { n: '芽', at: 2 }, { n: '双葉', at: 5 }, { n: '葉', at: 9 },
  { n: '大きな葉', at: 13 }, { n: 'つぼみ', at: 17 }, { n: '開花', at: 21 }
];
var PER_FLOWER = 21;
var ANIMALS = [
  { id: 'cat',     kind: 'ねこ',       unlock: 0,  def: 'もち' },
  { id: 'dog',     kind: 'いぬ',       unlock: 15, def: 'こむぎ' },
  { id: 'rabbit',  kind: 'うさぎ',     unlock: 40, def: 'しらたま' },
  { id: 'hamster', kind: 'ハムスター', unlock: 70, def: 'きなこ' }
];
var BADGES = [3, 7, 14, 30, 60, 100];
var DEFAULT_SOS = ['温かいお茶を飲む', '外を5分歩く', 'シャワーを浴びる', '誰かに連絡する'];

/* ================= 保存 ================= */
var storageOK = true;

function blank() {
  return {
    v: 1, records: {},
    settings: { showStreak: true, sos: DEFAULT_SOS.slice() },
    names: {}, seen: [], sosCount: 0, lastBackup: null, hideInstall: false,
    expenses: []   // 食費の記録 { id, d:'YYYY-MM-DD', c:'food'|'out', a:金額 }
  };
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
// 読み込んだデータ（保存データ・バックアップ）を安全な形にそろえる
function normalize(d) {
  var b = blank();
  if (!d || typeof d !== 'object') return b;
  if (d.records && typeof d.records === 'object') {
    Object.keys(d.records).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      var r = d.records[k] || {}, o = {};
      if (r.s === 'ok' || r.s === 'bin') o.s = r.s;
      if (r.ex) o.ex = true;
      if (o.s || o.ex) b.records[k] = o;
    });
  }
  var s = d.settings || {};
  if (Array.isArray(d.expenses)) {
    b.expenses = d.expenses.filter(function (e) {
      return e && typeof e.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && (e.c === 'food' || e.c === 'out') &&
        typeof e.a === 'number' && isFinite(e.a) && e.a > 0;
    }).slice(0, 20000).map(function (e) {
      return { id: String(e.id || uid()).slice(0, 40), d: e.d, c: e.c, a: Math.round(e.a) };
    });
  }
  if (typeof s.showStreak === 'boolean') b.settings.showStreak = s.showStreak;
  if (Array.isArray(s.sos)) {
    b.settings.sos = s.sos.filter(function (x) { return typeof x === 'string' && x.trim(); })
      .slice(0, 12).map(function (x) { return x.slice(0, 30); });
  }
  if (d.names && typeof d.names === 'object') {
    Object.keys(d.names).forEach(function (k) { if (typeof d.names[k] === 'string') b.names[k] = d.names[k].slice(0, 16); });
  }
  if (Array.isArray(d.seen)) b.seen = d.seen.filter(function (x) { return typeof x === 'number'; });
  if (typeof d.sosCount === 'number' && d.sosCount >= 0) b.sosCount = Math.floor(d.sosCount);
  if (typeof d.lastBackup === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.lastBackup)) b.lastBackup = d.lastBackup;
  if (d.hideInstall === true) b.hideInstall = true;
  return b;
}
var loadError = false;
function load() {
  try {
    var t = '__kokoro_test';
    localStorage.setItem(t, '1'); localStorage.removeItem(t);
  } catch (e) { storageOK = false; return blank(); }
  try {
    var raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : blank();
  } catch (e) {
    // 保存データが壊れていた場合：消さずに別名で残してから空で始める
    loadError = true;
    try { localStorage.setItem(KEY + '-broken-' + Date.now(), localStorage.getItem(KEY) || ''); } catch (e2) {}
    return blank();
  }
}
var S = load();
function save() {
  if (!storageOK) return false;
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch (e) { toast('保存できませんでした。設定画面からバックアップを保存してください'); return false; }
}
// ブラウザに「このデータは消さないで」とお願いする（対応している場合のみ）
if (navigator.storage && navigator.storage.persist) {
  try { navigator.storage.persist().catch(function () {}); } catch (e) {}
}

/* ================= 日付（端末の時刻で計算。UTC変換はしない） ================= */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
var WD = ['日', '月', '火', '水', '木', '金', '土'];
function jp(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; }

/* ================= 集計 ================= */
function totalOk() { var n = 0; for (var k in S.records) if (S.records[k].s === 'ok') n++; return n; }
function recordCount() { return Object.keys(S.records).length; }
function monthStats(y, m) {
  var ok = 0, rec = 0, pre = y + '-' + pad(m + 1) + '-';
  for (var k in S.records) {
    if (k.indexOf(pre) === 0 && S.records[k].s) { rec++; if (S.records[k].s === 'ok') ok++; }
  }
  return { ok: ok, rec: rec };
}
// 連続日数：今日が未記録なら昨日から数える（記録前と記録後で矛盾しない）
function streak() {
  var d = today(), r = S.records[key(d)];
  if (!r || !r.s) d = addDays(d, -1);
  var n = 0;
  while (true) {
    var x = S.records[key(d)];
    if (x && x.s === 'ok') { n++; d = addDays(d, -1); } else break;
  }
  return n;
}
function plantInfo(total) {
  var bloomed = Math.floor(total / PER_FLOWER), last = STAGES.length - 1;
  if (total > 0 && total % PER_FLOWER === 0) {
    return { bloomed: bloomed, prog: PER_FLOWER, flower: FLOWERS[(bloomed - 1) % FLOWERS.length], stage: last, next: 0, full: true };
  }
  var prog = total % PER_FLOWER, flower = FLOWERS[bloomed % FLOWERS.length], si = 0;
  for (var i = 0; i < STAGES.length; i++) if (prog >= STAGES[i].at) si = i;
  return { bloomed: bloomed, prog: prog, flower: flower, stage: si, next: STAGES[si + 1].at - prog, full: false };
}
function animalLevel(a, total) { return total < a.unlock ? 0 : 1 + Math.floor((total - a.unlock) / 5); }
function animalAge(lv) { return lv <= 2 ? 'あかちゃん' : lv <= 5 ? 'こども' : 'おとな'; }
function nameOf(a) { return S.names[a.id] || a.def; }
function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function needsBackup() {
  if (!recordCount()) return false;
  if (!S.lastBackup) return true;
  return daysBetween(parseKey(S.lastBackup), today()) >= BACKUP_EVERY_DAYS;
}

/* ================= イラスト（SVG） ================= */
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function bloomSVG(f, cx, cy, r) {
  var s = '';
  for (var i = 0; i < 5; i++) {
    var a = (i * 72 - 90) * Math.PI / 180, x = (cx + Math.cos(a) * r * 0.9).toFixed(1), y = (cy + Math.sin(a) * r * 0.9).toFixed(1);
    s += f.shape === 'long'
      ? '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (r * 0.45).toFixed(1) + '" ry="' + (r * 0.9).toFixed(1) + '" transform="rotate(' + (i * 72) + ' ' + x + ' ' + y + ')" fill="' + f.petal + '" stroke="rgba(0,0,0,.06)"/>'
      : '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.75).toFixed(1) + '" fill="' + f.petal + '" stroke="rgba(0,0,0,.06)"/>';
  }
  return s + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.5).toFixed(1) + '" fill="' + f.center + '"/>';
}
function plantSVG(stage, f, size) {
  var L = '#9DBEA2';
  var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 84 84" aria-hidden="true">';
  s += '<path d="M24 68 H60 L56 82 H28Z" fill="#E3C9B3"/><rect x="22" y="64" width="40" height="6" rx="3" fill="#D6B49A"/>';
  if (stage === 0) s += '<ellipse cx="42" cy="62" rx="4" ry="3" fill="#A07D5E"/>';
  if (stage >= 1) {
    var top = [0, 58, 54, 46, 40, 36, 36][stage];
    s += '<path d="M42 64 V' + top + '" stroke="#7FA285" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
  }
  if (stage === 1) s += '<path d="M42 59 C40 57 39 55 40 53 C42 54 42 56 42 59Z" fill="' + L + '"/>';
  if (stage === 2) s += '<path d="M42 56 C37 55 35 51 36 48 C40 49 42 52 42 56Z M42 56 C47 55 49 51 48 48 C44 49 42 52 42 56Z" fill="' + L + '"/>';
  if (stage >= 3) s += '<path d="M42 58 C32 56 28 49 30 44 C37 46 42 52 42 58Z" fill="' + L + '"/><path d="M42 51 C52 48 55 41 53 36 C46 38 42 44 42 51Z" fill="' + L + '"/>';
  if (stage >= 4) s += '<path d="M42 62 C50 61 55 56 55 51 C49 52 44 56 42 62Z" fill="#8DB293"/><path d="M42 46 C35 45 31 40 32 35 C37 37 41 41 42 46Z" fill="#8DB293"/>';
  if (stage === 5) s += '<path d="M42 37 C37 33 37 25 42 21 C47 25 47 33 42 37Z" fill="' + f.petal + '" stroke="rgba(0,0,0,.08)"/>';
  if (stage === 6) s += bloomSVG(f, 42, 24, 9);
  return s + '</svg>';
}
function flowerIcon(f, size) {
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 36 36" aria-hidden="true">' + bloomSVG(f, 18, 18, 8) + '</svg>';
}
function animalSVG(id, size, locked) {
  var st = locked ? ' stroke="#B9B2A4" stroke-width="2" stroke-dasharray="4 4"' : '';
  function c(col) { return locked ? 'none' : col; }
  var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 84 84" aria-hidden="true">';
  if (id === 'cat') s += '<path d="M24 32 L28 12 L38 26Z" fill="' + c('#E9DCCB') + '"' + st + '/><path d="M60 32 L56 12 L46 26Z" fill="' + c('#E9DCCB') + '"' + st + '/><circle cx="42" cy="44" r="22" fill="' + c('#F2E6D6') + '"' + st + '/>';
  if (id === 'dog') s += '<ellipse cx="22" cy="40" rx="8" ry="15" fill="' + c('#C9A17E') + '"' + st + '/><ellipse cx="62" cy="40" rx="8" ry="15" fill="' + c('#C9A17E') + '"' + st + '/><circle cx="42" cy="44" r="21" fill="' + c('#EBD3B8') + '"' + st + '/>' + (locked ? '' : '<ellipse cx="42" cy="52" rx="9" ry="7" fill="#F6E9DA"/><ellipse cx="42" cy="49" rx="3.2" ry="2.4" fill="#3B3A36"/>');
  if (id === 'rabbit') s += '<ellipse cx="33" cy="18" rx="6" ry="15" fill="' + c('#F5F1EA') + '"' + st + '/><ellipse cx="51" cy="18" rx="6" ry="15" fill="' + c('#F5F1EA') + '"' + st + '/>' + (locked ? '' : '<ellipse cx="33" cy="19" rx="2.5" ry="10" fill="#F6D0D4"/><ellipse cx="51" cy="19" rx="2.5" ry="10" fill="#F6D0D4"/>') + '<circle cx="42" cy="48" r="20" fill="' + c('#F5F1EA') + '"' + st + '/>';
  if (id === 'hamster') s += '<circle cx="25" cy="28" r="7" fill="' + c('#E8B98C') + '"' + st + '/><circle cx="59" cy="28" r="7" fill="' + c('#E8B98C') + '"' + st + '/><ellipse cx="42" cy="46" rx="24" ry="21" fill="' + c('#F0CDA6') + '"' + st + '/>' + (locked ? '' : '<ellipse cx="42" cy="54" rx="13" ry="10" fill="#FBF0E2"/>');
  if (!locked) {
    var ey = id === 'dog' ? 41 : id === 'rabbit' ? 45 : 42;
    s += '<circle cx="35" cy="' + ey + '" r="2.4" fill="#3B3A36"/><circle cx="49" cy="' + ey + '" r="2.4" fill="#3B3A36"/>';
    s += '<circle cx="30" cy="' + (ey + 6) + '" r="3" fill="#F6D0D4"/><circle cx="54" cy="' + (ey + 6) + '" r="3" fill="#F6D0D4"/>';
    if (id !== 'dog') s += '<path d="M39 ' + (ey + 6) + ' Q42 ' + (ey + 9) + ' 45 ' + (ey + 6) + '" stroke="#3B3A36" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  }
  return s + '</svg>';
}
var SHARE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="共有" role="img" style="vertical-align:-2px"><path d="M12 3 V15 M7 8 L12 3 L17 8 M5 13 V20 H19 V13"/></svg>';

/* ================= 共通の部品 ================= */
var main = document.getElementById('main'), layer = document.getElementById('layer');
var tab = 'home', calY, calM, backupSnoozed = false;
var msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
(function () { var t = today(); calY = t.getFullYear(); calM = t.getMonth(); foodY = calY; foodM = calM; })();

var toastTimer;
function toast(t) {
  var old = document.querySelector('.toast'); if (old) old.remove();
  var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
  document.body.appendChild(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.remove(); }, 2800);
}
function yen(n) { return '¥' + n.toLocaleString('ja-JP'); }

function setRecord(k, patch) {
  var before = totalOk();
  var r = Object.assign({}, S.records[k] || {}, patch);
  if (r.s === null) delete r.s;
  if (!r.ex) delete r.ex;
  if (r.s || r.ex) S.records[k] = r; else delete S.records[k];
  save();
  var after = totalOk();
  if (after > before) checkCelebrate(before, after);
}
function checkCelebrate(before, after) {
  var hit = null;
  BADGES.forEach(function (b) { if (before < b && after >= b && S.seen.indexOf(b) < 0) hit = b; });
  var pb = Math.floor(before / PER_FLOWER), pa = Math.floor(after / PER_FLOWER);
  if (hit) { S.seen.push(hit); save(); celebrate('合計' + hit + '日', '過食しなかった日が、これまでに' + hit + '日になりました。'); }
  else if (pa > pb) celebrate(FLOWERS[(pa - 1) % FLOWERS.length].name + 'が咲きました', '咲いた花は「庭・カレンダー」でいつでも見られます。');
}
function celebrate(title, body) {
  var wrap = document.createElement('div'); wrap.className = 'celebrate';
  var cols = ['#F4C9CF', '#C9B9E6', '#DCE8DC', '#F5D77E', '#F6E3E1'];
  for (var i = 0; i < 28; i++) {
    var p = document.createElement('span'); p.className = 'petal';
    p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
    p.style.animationDuration = (3 + Math.random() * 3) + 's'; p.style.animationDelay = (Math.random() * 1.2) + 's';
    wrap.appendChild(p);
  }
  var c = document.createElement('div'); c.className = 'card'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', title);
  c.innerHTML = '<h2 style="font-size:20px">' + esc(title) + '</h2><p class="sub" style="line-height:1.8">' + esc(body) + '</p><button class="btn sage" style="width:100%">うれしい</button>';
  wrap.appendChild(c); document.body.appendChild(wrap);
  function close() { wrap.remove(); }
  c.querySelector('button').onclick = close;
  wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
  c.querySelector('button').focus();
}

/* ================= 画面 ================= */
function render() {
  document.querySelectorAll('nav button').forEach(function (b) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  ({ home: renderHome, garden: renderGarden, food: renderFood, set: renderSet })[tab]();
}

function noticesHTML() {
  var h = '';
  if (!storageOK) {
    h += '<div class="notice pink" role="alert"><b>記録を保存できない状態です</b><span>プライベートブラウズを使っているか、設定でWebサイトのデータ保存が止められている可能性があります。この状態で閉じると記録が消えます。</span></div>';
  }
  if (loadError) {
    h += '<div class="notice pink" role="alert"><b>保存データを読み込めませんでした</b><span>壊れたデータは消さずに残してあります。バックアップがあれば、設定画面から戻してください。</span></div>';
  }
  if (storageOK && !isStandalone() && !S.hideInstall) {
    h += '<div class="notice lav"><b>ホーム画面に追加して使ってください</b>' +
      '<span>iPhoneでは、Safariで開いたときとホーム画面のアプリから開いたときで、記録の保存場所が別になります。記録はホーム画面のアプリからつけてください。</span>' +
      '<span>追加のしかた：Safari下の ' + SHARE_ICON + '（共有）→「ホーム画面に追加」</span>' +
      '<button class="btn ghost" id="hideInstall">この案内を閉じる</button></div>';
  }
  if (storageOK && needsBackup() && !backupSnoozed && (isStandalone() || S.hideInstall)) {
    h += '<div class="notice lav"><b>バックアップを保存しませんか？</b><span>' +
      (S.lastBackup ? '前回の保存から' + daysBetween(parseKey(S.lastBackup), today()) + '日たちました。' : 'まだ一度も保存していません。') +
      'iCloud Driveに保存しておくと、iPhoneを変えたときも安心です。</span>' +
      '<div class="btns"><button class="btn ghost" id="snooze">あとで</button><button class="btn lav" id="backupNow">今すぐ保存</button></div></div>';
  }
  return h;
}
function bindNotices() {
  var hi = document.getElementById('hideInstall');
  if (hi) hi.onclick = function () { S.hideInstall = true; save(); render(); };
  var sn = document.getElementById('snooze');
  if (sn) sn.onclick = function () { backupSnoozed = true; render(); };
  var bn = document.getElementById('backupNow');
  if (bn) bn.onclick = function () { exportBackup(function () { render(); }); };
}

function renderHome() {
  var t = today(), k = key(t), r = S.records[k] || {}, total = totalOk(), ms = monthStats(t.getFullYear(), t.getMonth());
  var p = plantInfo(total), cat = ANIMALS[0], lv = animalLevel(cat, total), sk = streak();
  var stLine = p.full ? '満開です。次は新しい種から' : (STAGES[p.stage + 1].n + 'まで あと' + p.next + '日');
  var rec = '';
  if (r.s === 'ok') rec = '<p class="done-note">今日は「過食なし」で記録しました。変えたいときは押し直せます。</p>';
  if (r.s === 'bin') rec = '<p class="done-note">記録できました。しんどい日も、記録したことが前進です。</p>';
  main.innerHTML = '<div class="screen">' + noticesHTML() +
    '<div class="head"><div><div class="sub">' + jp(t) + '</div><h1>おかえりなさい</h1></div>' +
      (S.settings.showStreak && sk > 0 ? '<span class="chip num">連続 ' + sk + '日</span>' : '') + '</div>' +
    '<section class="card stats" aria-label="日数"><div><div class="tiny">今月の過食なし</div><div class="big c-sage num">' + ms.ok + '<small>日</small></div></div><div class="divider"></div>' +
      '<div><div class="tiny">これまでの合計</div><div class="big c-lav num">' + total + '<small>日</small></div></div></section>' +
    '<section class="card"><h2>今日はどんな日でしたか？</h2><div class="choice">' +
      '<button class="b-ok' + (r.s === 'bin' ? ' dim' : '') + '" data-set="ok" aria-pressed="' + (r.s === 'ok') + '">過食なし</button>' +
      '<button class="b-bin' + (r.s === 'ok' ? ' dim' : '') + '" data-set="bin" aria-pressed="' + (r.s === 'bin') + '">過食あり</button></div>' + rec +
      '<label class="check" for="exToday"><input type="checkbox" id="exToday"' + (r.ex ? ' checked' : '') + '>体を動かした（できた日だけでOK）</label></section>' +
    '<button class="pet scene" data-go="garden" aria-label="庭・カレンダーを開く">' + gardenSVG(total, p) +
      '<b>' + esc(p.flower.name) + '・' + STAGES[p.stage].n + '</b><span class="tiny">' + stLine + '・なかま ' + ANIMALS.filter(function (a) { return animalLevel(a, total) > 0; }).length + '匹</span></button>' +
    expenseCardHTML(t.getFullYear(), t.getMonth()) +
    '<p class="msg">' + esc(msg) + '</p></div>';
  bindNotices();
  main.querySelectorAll('[data-set]').forEach(function (b) {
    b.onclick = function () {
      var v = b.dataset.set, cur = (S.records[k] || {}).s;
      if (cur === v) { toast('すでに記録済みです'); return; }
      setRecord(k, { s: v });
      toast(v === 'bin' && !cur ? '記録しました。記録は消えずに残ります' : '記録しました');
      render();
    };
  });
  document.getElementById('exToday').onchange = function (e) {
    setRecord(k, { ex: e.target.checked });
    if (e.target.checked) toast('体を動かせた日、ひとつ追加');
  };
  main.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
  document.getElementById('addExpHome').onclick = function () { openExpense(k); };
}

/* ---------- 食費 ---------- */
var EXP_LABEL = { food: '食費', out: '外食' };
function expenseTotals(y, m) {
  var pre = y + '-' + pad(m + 1) + '-', t = { food: 0, out: 0, all: 0 };
  S.expenses.forEach(function (e) { if (e.d.indexOf(pre) === 0) { t[e.c] += e.a; t.all += e.a; } });
  return t;
}
function shareBar(t) {
  if (!t.all) return '<div class="share" aria-hidden="true"></div>';
  var f = Math.round(t.food / t.all * 100);
  return '<div class="share" aria-hidden="true"><i style="width:' + f + '%;background:var(--sage-strong)"></i><i style="width:' + (100 - f) + '%;background:var(--lav-mid)"></i></div>';
}
function expenseCardHTML(y, m) {
  var t = expenseTotals(y, m);
  return '<section class="card" aria-label="今月の食費"><div class="exp-head"><h2>今月の食費</h2><button class="link" data-go="food">くわしく見る</button></div>' +
    '<div class="exp-total num">' + yen(t.all) + '</div>' +
    '<div class="exp-split"><span><i class="dot food"></i>食費<b class="num">' + yen(t.food) + '</b></span><span><i class="dot out"></i>外食<b class="num">' + yen(t.out) + '</b></span></div>' +
    shareBar(t) +
    '<button class="btn sage" id="addExpHome" style="width:100%;margin-top:14px">食費をつける</button></section>';
}
function toHalf(s) { return String(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }
function openExpense(dateKey) {
  var cat = 'food', tk = key(today());
  layer.innerHTML = '<div class="scrim" id="scrim"><form class="sheet" id="ef" role="dialog" aria-modal="true" aria-labelledby="eT" novalidate>' +
    '<h2 id="eT" style="font-size:18px">食費をつける</h2>' +
    '<div class="seg" role="group" aria-label="種類"><button type="button" data-c="food" aria-pressed="true">食費</button><button type="button" data-c="out" aria-pressed="false">外食</button></div>' +
    '<p class="note">食費：スーパーやコンビニで買ったもの　外食：お店で食べたもの</p>' +
    '<label class="f" for="ea">金額（円）<input type="text" id="ea" inputmode="numeric" autocomplete="off" placeholder="例：1200"></label>' +
    '<label class="f" for="ed">日付<input type="date" id="ed" value="' + dateKey + '" max="' + tk + '"></label>' +
    '<p class="err" id="eerr" role="alert"></p>' +
    '<div class="btns"><button type="button" class="btn ghost" id="ec">やめる</button><button type="submit" class="btn sage">記録する</button></div></form></div>';
  var segs = layer.querySelectorAll('.seg button');
  segs.forEach(function (b) {
    b.onclick = function () { cat = b.dataset.c; segs.forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); };
  });
  function close() { layer.innerHTML = ''; }
  document.getElementById('ec').onclick = close;
  document.getElementById('scrim').onclick = function (e) { if (e.target.id === 'scrim') close(); };
  document.getElementById('ef').onsubmit = function (e) {
    e.preventDefault();
    var err = document.getElementById('eerr');
    var a = parseInt(toHalf(document.getElementById('ea').value).replace(/[^\d]/g, ''), 10);
    var d = document.getElementById('ed').value;
    if (!(a > 0 && a <= 1000000)) { err.textContent = '金額を数字で入れてください（例：1200）'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { err.textContent = '日付を選んでください'; return; }
    if (d > tk) { err.textContent = '未来の日付には記録できません'; return; }
    S.expenses.push({ id: uid(), d: d, c: cat, a: a });
    save(); close(); render();
    toast(EXP_LABEL[cat] + ' ' + yen(a) + ' を記録しました');
  };
  document.getElementById('ea').focus();
}

var foodY, foodM, expDel = null;
function renderFood() {
  var t = today(), isCur = foodY === t.getFullYear() && foodM === t.getMonth();
  var tot = expenseTotals(foodY, foodM), pre = foodY + '-' + pad(foodM + 1) + '-';
  var list = S.expenses.filter(function (e) { return e.d.indexOf(pre) === 0; })
    .sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  var groups = '', cur = null, rows = '';
  function flush() { if (cur) groups += '<div class="exp-day"><h3>' + jp(parseKey(cur)) + '</h3>' + rows + '</div>'; }
  list.forEach(function (e) {
    if (e.d !== cur) { flush(); cur = e.d; rows = ''; }
    rows += '<div class="exp-row"><i class="dot ' + e.c + '"></i><span>' + EXP_LABEL[e.c] + '</span><span class="amt num">' + yen(e.a) + '</span>' +
      (expDel === e.id
        ? '<button class="btn pink small" data-delx="' + e.id + '">消す</button><button class="btn ghost small" data-keep="1">やめる</button>'
        : '<button class="x" data-dele="' + e.id + '" aria-label="' + EXP_LABEL[e.c] + ' ' + yen(e.a) + ' を削除">×</button>') + '</div>';
  });
  flush();
  main.innerHTML = '<div class="screen">' +
    '<div class="cal-head"><button class="round" id="fprev" aria-label="前の月"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>' +
    '<h1 class="num">' + foodY + '年 ' + (foodM + 1) + '月の食費</h1>' +
    '<button class="round" id="fnext" aria-label="次の月"' + (isCur ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg></button></div>' +
    '<section class="card"><div class="tiny">合計</div><div class="exp-total num">' + yen(tot.all) + '</div>' + shareBar(tot) +
      '<div class="row" style="margin-top:14px"><div class="tile" style="background:var(--sage-soft)"><div class="tiny" style="color:var(--sage-ink)"><i class="dot food"></i>食費</div><div class="v num" style="color:var(--sage-ink);font-size:22px">' + yen(tot.food) + '</div></div>' +
      '<div class="tile" style="background:var(--lav-soft)"><div class="tiny" style="color:var(--lav-ink)"><i class="dot out"></i>外食</div><div class="v num" style="color:var(--lav-ink);font-size:22px">' + yen(tot.out) + '</div></div></div></section>' +
    '<button class="btn sage" id="addExp">食費をつける</button>' +
    '<section class="card" style="display:flex;flex-direction:column;gap:14px"><h2>この月の記録</h2>' +
      (groups || '<p class="note">まだ記録がありません。「食費をつける」から入れてみてください。</p>') + '</section>' +
    '</div>';
  document.getElementById('fprev').onclick = function () { foodM--; if (foodM < 0) { foodM = 11; foodY--; } expDel = null; render(); };
  document.getElementById('fnext').onclick = function () { if (isCur) return; foodM++; if (foodM > 11) { foodM = 0; foodY++; } expDel = null; render(); };
  document.getElementById('addExp').onclick = function () { openExpense(isCur ? key(t) : key(new Date(foodY, foodM + 1, 0))); };
  main.querySelectorAll('[data-dele]').forEach(function (b) { b.onclick = function () { expDel = b.dataset.dele; render(); }; });
  main.querySelectorAll('[data-keep]').forEach(function (b) { b.onclick = function () { expDel = null; render(); }; });
  main.querySelectorAll('[data-delx]').forEach(function (b) {
    b.onclick = function () {
      var id = b.dataset.delx;
      S.expenses = S.expenses.filter(function (e) { return e.id !== id; });
      expDel = null; save(); render(); toast('削除しました');
    };
  });
}

/* ---------- 庭とカレンダー ---------- */
var SPOTS = {
  cat:     { x: 18,  y: 126, s: 66 },
  dog:     { x: 252, y: 124, s: 68 },
  rabbit:  { x: 66,  y: 146, s: 54 },
  hamster: { x: 222, y: 158, s: 46 }
};
var BACK_X = [34, 66, 98, 246, 278, 310, 140, 204, 172];
function nest(svg, x, y) { return svg.replace('<svg ', '<svg x="' + x + '" y="' + y + '" '); }
function gardenSVG(total, p) {
  var friends = ANIMALS.filter(function (a) { return animalLevel(a, total) > 0; });
  var label = '庭のようす：' + p.flower.name + '（' + STAGES[p.stage].n + '）' +
    (p.bloomed ? '、咲かせた花' + p.bloomed + '輪' : '') + '、' + friends.map(function (a) { return a.kind + 'の' + nameOf(a); }).join('、');
  var s = '<svg class="garden" viewBox="0 0 340 210" role="img" aria-label="' + esc(label) + '">';
  s += '<rect width="340" height="210" rx="22" fill="var(--sky)"/>';
  s += '<circle cx="292" cy="40" r="17" fill="#F6E3A6" opacity=".85"/>';
  s += '<g fill="var(--cloud)"><ellipse cx="70" cy="40" rx="24" ry="9"/><ellipse cx="88" cy="34" rx="14" ry="9"/><ellipse cx="196" cy="58" rx="18" ry="6"/></g>';
  s += '<path d="M0 118 Q90 92 180 112 T340 102 V210 H0Z" fill="var(--hill2)"/>';
  var n = Math.min(p.full ? p.bloomed - 1 : p.bloomed, BACK_X.length);
  for (var i = 0; i < n; i++) {
    var f = FLOWERS[i % FLOWERS.length], x = BACK_X[i], y = 108 + (i % 3) * 4;
    s += '<path d="M' + x + ' ' + y + ' V' + (y + 22) + '" stroke="#7FA285" stroke-width="2" stroke-linecap="round"/>' + bloomSVG(f, x, y, 6);
  }
  s += '<path d="M0 152 Q170 128 340 152 V210 H0Z" fill="var(--hill)"/>';
  s += nest(plantSVG(p.stage, p.flower, 116), 112, 88);
  friends.forEach(function (a, i) {
    var sp = SPOTS[a.id];
    s += '<g class="bob" style="animation-delay:' + (i * 0.7) + 's">' + nest(animalSVG(a.id, sp.s), sp.x, sp.y) + '</g>';
  });
  return s + '</svg>';
}
function calendarHTML() {
  var t = today(), first = new Date(calY, calM, 1), days = new Date(calY, calM + 1, 0).getDate();
  var isCur = calY === t.getFullYear() && calM === t.getMonth();
  var cells = '';
  for (var i = 0; i < first.getDay(); i++) cells += '<div class="day blank" aria-hidden="true"></div>';
  for (var d = 1; d <= days; d++) {
    var dt = new Date(calY, calM, d), k = key(dt), r = S.records[k] || {}, fut = dt > t;
    var cls = 'day' + (r.s ? ' ' + r.s : '') + (+dt === +t ? ' today' : '') + (fut ? ' future' : '');
    var lab = (calM + 1) + '月' + d + '日 ' + (r.s === 'ok' ? '過食なし' : r.s === 'bin' ? '過食あり' : '未記録') + (r.ex ? ' 体を動かした' : '');
    cells += '<button class="' + cls + '" data-k="' + k + '" aria-label="' + lab + '"' + (fut ? ' disabled' : '') + '><span class="num">' + d + '</span>' + (r.ex ? '<span class="ex"></span>' : '') + '</button>';
  }
  var ms = monthStats(calY, calM);
  return '<section class="card" style="padding:16px 12px">' +
    '<div class="cal-head" style="margin-bottom:12px"><button class="round" id="prev" aria-label="前の月"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>' +
    '<h2 class="num" style="font-size:18px">' + calY + '年 ' + (calM + 1) + '月</h2>' +
    '<button class="round" id="next" aria-label="次の月"' + (isCur ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg></button></div>' +
    '<div class="wk">' + WD.map(function (w) { return '<div>' + w + '</div>'; }).join('') + '</div><div class="grid">' + cells + '</div>' +
    '<div class="legend"><span><i class="sw" style="background:var(--sage-mid)"></i>過食なし</span><span><i class="sw" style="background:var(--pink-soft)"></i>過食あり</span>' +
    '<span><i class="sw" style="border:1px dashed var(--line)"></i>未記録</span><span><i class="sw" style="width:6px;height:6px;border-radius:50%;background:var(--lav-strong)"></i>体を動かした</span></div>' +
    '<div class="row" style="margin-top:14px"><div class="tile" style="background:var(--sage-soft)"><div class="tiny" style="color:var(--sage-ink)">過食なし</div><div class="v num" style="color:var(--sage-ink)">' + ms.ok + '<small>日</small></div></div>' +
    '<div class="tile" style="background:var(--lav-soft)"><div class="tiny" style="color:var(--lav-ink)">記録した日</div><div class="v num" style="color:var(--lav-ink)">' + ms.rec + '<small>日</small></div></div></div>' +
    '<p class="note" style="text-align:center;margin-top:10px">日付を押すと、その日の記録をつけたり直したりできます。</p></section>';
}
function renderGarden() {
  var t = today(), total = totalOk(), p = plantInfo(total);
  var isCur = calY === t.getFullYear() && calM === t.getMonth();
  var bar = '';
  STAGES.forEach(function (s, i) {
    if (i) bar += '<i class="' + (i <= p.stage ? 'on' : '') + '"></i>';
    bar += '<span class="' + (i === p.stage ? 'now' : '') + '">' + s.n + '</span>';
  });
  var col = '';
  for (var i = 0; i < p.bloomed; i++) { var f = FLOWERS[i % FLOWERS.length]; col += '<div>' + flowerIcon(f, 36) + '<span>' + esc(f.name) + '</span></div>'; }
  for (var j = 0; j < 2; j++) {
    col += '<div class="lock"><svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/></svg><span class="num">合計' + ((p.bloomed + j + 1) * PER_FLOWER) + '日</span></div>';
  }
  var fr = '';
  ANIMALS.forEach(function (a) {
    var lv = animalLevel(a, total);
    if (lv) fr += '<button class="friend" data-a="' + a.id + '">' + animalSVG(a.id, 48) + '<span><b>' + esc(nameOf(a)) + '</b><span class="tiny">' + a.kind + '・' + animalAge(lv) + '・Lv.' + lv + '<br>名前を変える</span></span></button>';
    else fr += '<div class="friend lock">' + animalSVG(a.id, 48, true) + '<span><b style="color:var(--muted)">' + a.kind + '</b><span class="tiny num">合計' + a.unlock + '日で庭に来ます</span></span></div>';
  });
  var bd = BADGES.map(function (b) {
    var got = total >= b || S.seen.indexOf(b) >= 0;
    return '<span class="badge num' + (got ? '' : ' lock') + '">' + (got ? '' : 'あと' + (b - total) + '日・') + '合計' + b + '日</span>';
  }).join('');
  main.innerHTML = '<div class="screen"><h1>こころの庭</h1>' +
    '<section class="card" style="background:var(--sage-soft);box-shadow:none;padding:12px 12px 18px;display:flex;flex-direction:column;align-items:center">' + gardenSVG(total, p) +
      '<div style="font-size:16px;font-weight:700;margin-top:10px">' + esc(p.flower.name) + '・' + STAGES[p.stage].n + '</div>' +
      '<div class="tiny num" style="color:var(--sage-ink);margin-top:4px;text-align:center">' + (p.full ? '満開です。次の過食なしの日から新しい種を育てます' : 'これまで ' + p.prog + ' / ' + PER_FLOWER + '日・' + STAGES[p.stage + 1].n + 'まで あと' + p.next + '日') + '</div>' +
      '<div class="stage-bar">' + bar + '</div><p class="tiny" style="margin:10px 0 0;text-align:center">過食なしの日に少しずつ育ちます。1輪咲くまで約3週間です</p></section>' +
    calendarHTML() +
    '<section><h2 style="margin-bottom:8px">庭のなかま</h2><div class="friends">' + fr + '</div></section>' +
    '<section><h2 style="margin-bottom:8px">咲かせた花</h2><div class="collect">' + col + '</div></section>' +
    '<section><h2 style="margin-bottom:8px">バッジ</h2><div class="badges">' + bd + '</div><p class="note" style="margin-top:8px">バッジは一度もらうと消えません。</p></section>' +
    (S.sosCount ? '<p class="note num" style="text-align:center">SOSで衝動をやり過ごせた回数：' + S.sosCount + '回</p>' : '') +
    '</div>';
  document.getElementById('prev').onclick = function () { calM--; if (calM < 0) { calM = 11; calY--; } render(); };
  document.getElementById('next').onclick = function () { if (isCur) return; calM++; if (calM > 11) { calM = 0; calY++; } render(); };
  main.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { openDay(b.dataset.k); }; });
  main.querySelectorAll('[data-a]').forEach(function (b) { b.onclick = function () { rename(b.dataset.a); }; });
}

function openDay(k) {
  var dt = parseKey(k);
  function draw() {
    var r = S.records[k] || {};
    layer.innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dayT">' +
      '<h2 id="dayT" style="font-size:18px">' + jp(dt) + '</h2>' +
      '<div class="choice" style="margin-top:0"><button class="b-ok' + (r.s === 'bin' ? ' dim' : '') + '" data-s="ok" aria-pressed="' + (r.s === 'ok') + '">過食なし</button>' +
      '<button class="b-bin' + (r.s === 'ok' ? ' dim' : '') + '" data-s="bin" aria-pressed="' + (r.s === 'bin') + '">過食あり</button></div>' +
      (r.s ? '<button class="btn ghost" data-s="none">未記録に戻す</button>' : '') +
      '<label class="check" for="exDay" style="margin-top:0"><input type="checkbox" id="exDay"' + (r.ex ? ' checked' : '') + '>体を動かした</label>' +
      '<button class="btn sage" id="closeDay">とじる</button></div></div>';
    layer.querySelectorAll('[data-s]').forEach(function (b) {
      b.onclick = function () { var v = b.dataset.s; setRecord(k, { s: v === 'none' ? null : v }); draw(); };
    });
    document.getElementById('exDay').onchange = function (e) { setRecord(k, { ex: e.target.checked }); };
    document.getElementById('closeDay').onclick = close;
    document.getElementById('scrim').onclick = function (e) { if (e.target.id === 'scrim') close(); };
  }
  function close() { layer.innerHTML = ''; render(); var b = main.querySelector('[data-k="' + k + '"]'); if (b) b.focus(); }
  draw();
  var f = layer.querySelector('[data-s]'); if (f) f.focus();
}

function rename(id) {
  var a = ANIMALS.filter(function (x) { return x.id === id; })[0];
  layer.innerHTML = '<div class="scrim" id="scrim"><form class="sheet" id="rf" role="dialog" aria-modal="true" aria-labelledby="rT"><h2 id="rT" style="font-size:18px">' + a.kind + 'の名前</h2>' +
    '<label class="f" for="rn">新しい名前（16文字まで）<input type="text" id="rn" maxlength="16" value="' + esc(nameOf(a)) + '"></label>' +
    '<div class="btns"><button type="button" class="btn ghost" id="rc">やめる</button><button type="submit" class="btn sage">決める</button></div></form></div>';
  var inp = document.getElementById('rn'); inp.focus();
  document.getElementById('rc').onclick = function () { layer.innerHTML = ''; };
  document.getElementById('scrim').onclick = function (e) { if (e.target.id === 'scrim') layer.innerHTML = ''; };
  document.getElementById('rf').onsubmit = function (e) {
    e.preventDefault();
    var v = inp.value.trim();
    if (v) S.names[id] = v.slice(0, 16); else delete S.names[id];
    save(); layer.innerHTML = ''; render(); toast('名前を変えました');
  };
}

/* ================= 設定・バックアップ ================= */
var pendingRestore = null, confirmDelete = false;
function renderSet() {
  var sos = S.settings.sos.map(function (x, i) {
    return '<div><input type="text" id="sos' + i + '" maxlength="30" value="' + esc(x) + '" aria-label="代わりにやること ' + (i + 1) + '"><button class="x" data-del="' + i + '" aria-label="削除">×</button></div>';
  }).join('');
  var last = S.lastBackup ? jp(parseKey(S.lastBackup)) : 'まだありません';
  main.innerHTML = '<div class="screen"><h1>設定</h1>' +
    '<section class="card" style="display:flex;flex-direction:column;gap:12px"><h2>バックアップ</h2>' +
      '<div class="warn">記録はこのiPhoneの中だけに保存されています。アプリを削除したり、Safariの「履歴とWebサイトデータを消去」をしたり、iPhoneを買い替えたりすると消えます。ときどきバックアップをiCloud Driveに保存してください。</div>' +
      '<p class="note">最後のバックアップ：' + last + '</p>' +
      '<div class="btns"><button class="btn sage" id="exp">バックアップを保存</button><button class="btn lav" id="cpy">文字でコピー</button></div>' +
      '<p class="note">「バックアップを保存」→「\"ファイル\"に保存」→「iCloud Drive」を選ぶと、iPhoneを変えても戻せます。</p>' +
      '<div id="expOut"></div>' +
      '<label class="f" for="imp">バックアップから戻す（ファイルを選ぶ）<input type="file" id="imp"></label>' +
      '<label class="f" for="pasteBox">または、コピーした文字を貼り付け<textarea id="pasteBox" placeholder="{&quot;app&quot;:&quot;kokoro-niwa&quot;, ...}"></textarea></label>' +
      '<button class="btn ghost" id="pasteGo">貼り付けた内容を読み込む</button>' +
      '<div id="restoreBox"></div></section>' +
    '<section class="card" style="display:flex;flex-direction:column;gap:10px"><h2>SOSの「代わりにやってみること」</h2><div class="list-edit" id="sosList">' + sos + '</div>' +
      (S.settings.sos.length < 12 ? '<button class="btn lav" id="addSos">項目を追加</button>' : '') + '</section>' +
    '<section class="card"><div class="toggle"><label for="stk">ホームに連続日数を表示する</label><input type="checkbox" id="stk"' + (S.settings.showStreak ? ' checked' : '') + '></div>' +
      (S.hideInstall ? '<div class="toggle"><label for="ins">「ホーム画面に追加」の案内を表示する</label><input type="checkbox" id="ins"></div>' : '') + '</section>' +
    '<section class="card" style="display:flex;flex-direction:column;gap:10px"><h2>データの全削除</h2><p class="note">記録・名前・設定がすべて消えます。先にバックアップを保存してください。</p><div id="delBox"></div></section>' +
    '<p class="note" style="text-align:center">こころの庭は、記録を外部に送信しません。AIも使っていません。</p>' +
    '</div>';

  document.getElementById('stk').onchange = function (e) { S.settings.showStreak = e.target.checked; save(); };
  var ins = document.getElementById('ins');
  if (ins) ins.onchange = function (e) { if (e.target.checked) { S.hideInstall = false; save(); toast('ホームに案内を表示します'); renderSet(); } };
  main.querySelectorAll('#sosList input').forEach(function (inp, i) {
    inp.onchange = function () { var v = inp.value.trim(); if (v) { S.settings.sos[i] = v; save(); toast('保存しました'); } else inp.value = S.settings.sos[i]; };
  });
  main.querySelectorAll('[data-del]').forEach(function (b) {
    b.onclick = function () { S.settings.sos.splice(+b.dataset.del, 1); save(); renderSet(); };
  });
  var add = document.getElementById('addSos');
  if (add) add.onclick = function () {
    S.settings.sos.push('深呼吸を3回する'); save(); renderSet();
    var l = main.querySelectorAll('#sosList input'); l[l.length - 1].focus(); l[l.length - 1].select();
  };
  document.getElementById('exp').onclick = function () { exportBackup(function () { renderSet(); }); };
  document.getElementById('cpy').onclick = function () { copyText(function () { renderSet(); }); };
  document.getElementById('imp').onchange = function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { prepareRestore(String(rd.result)); };
    rd.onerror = function () { showRestoreError('ファイルを読み込めませんでした。別のファイルを選んでください'); };
    rd.readAsText(f);
    e.target.value = '';
  };
  document.getElementById('pasteGo').onclick = function () { prepareRestore(document.getElementById('pasteBox').value); };
  drawRestore(); drawDelete();
}

function backupText() {
  return JSON.stringify(Object.assign({ app: 'kokoro-niwa', savedAt: new Date().toISOString() }, S), null, 1);
}
function markBackedUp(done) { S.lastBackup = key(today()); backupSnoozed = false; save(); if (done) done(); }
// 共有シート（「ファイルに保存」でiCloud Driveへ）→ 使えなければダウンロード
function exportBackup(done) {
  var name = 'kokoro-niwa-backup-' + key(today()) + '.json';
  var text = backupText(), file = null;
  try { file = new File([text], name, { type: 'application/json' }); } catch (e) {}
  if (file && navigator.canShare && navigator.share) {
    var can = false;
    try { can = navigator.canShare({ files: [file] }); } catch (e) {}
    if (can) {
      navigator.share({ files: [file], title: 'こころの庭 バックアップ' }).then(function () {
        toast('バックアップを保存しました'); markBackedUp(done);
      }, function (err) {
        if (err && err.name === 'AbortError') toast('保存をやめました');
        else downloadFile(name, text, done);
      });
      return;
    }
  }
  downloadFile(name, text, done);
}
function downloadFile(name, text, done) {
  try {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('ダウンロードしました。ファイルアプリに保存されます');
    markBackedUp(done);
  } catch (e) { copyText(done); }
}
function copyText(done) {
  var txt = backupText(), out = document.getElementById('expOut');
  function showBox() {
    if (!out) { toast('コピーできませんでした。設定画面からもう一度お試しください'); return; }
    out.innerHTML = '<label class="f" for="expTxt">この文字を全部選んでコピーし、メモアプリなどに保存してください<textarea id="expTxt" readonly></textarea></label>';
    var ta = document.getElementById('expTxt'); ta.value = txt; ta.focus(); ta.select();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () {
      toast('コピーしました。メモアプリなどに貼り付けて保存してください'); markBackedUp(done);
    }, showBox);
  } else showBox();
}
function prepareRestore(text) {
  var d;
  try { d = JSON.parse(text); } catch (e) { showRestoreError('バックアップの形式ではないようです。ファイルや貼り付けた内容を確認してください'); return; }
  if (!d || typeof d !== 'object' || !d.records || typeof d.records !== 'object') {
    showRestoreError('記録が見つかりませんでした。こころの庭のバックアップか確認してください'); return;
  }
  pendingRestore = normalize(d); drawRestore();
  var b = document.getElementById('restoreBox'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'center' });
}
function showRestoreError(t) {
  pendingRestore = null;
  var b = document.getElementById('restoreBox'); if (b) b.innerHTML = '<div class="warn" role="alert">' + esc(t) + '</div>';
}
function drawRestore() {
  var b = document.getElementById('restoreBox'); if (!b) return;
  if (!pendingRestore) { b.innerHTML = ''; return; }
  var n = Object.keys(pendingRestore.records).length, ok = 0;
  for (var k in pendingRestore.records) if (pendingRestore.records[k].s === 'ok') ok++;
  b.innerHTML = '<div class="notice lav" role="alert"><b>このバックアップで上書きしますか？</b>' +
    '<span class="num">記録 ' + n + '日分（過食なし ' + ok + '日）。今の記録はこの内容に置き換わります。</span>' +
    '<div class="btns"><button class="btn ghost" id="rNo">やめる</button><button class="btn lav" id="rYes">上書きして戻す</button></div></div>';
  document.getElementById('rNo').onclick = function () { pendingRestore = null; drawRestore(); };
  document.getElementById('rYes').onclick = function () {
    var keepInstall = S.hideInstall;
    S = pendingRestore; S.hideInstall = keepInstall; pendingRestore = null; loadError = false;
    if (save()) toast('バックアップから戻しました');
    renderSet();
  };
}
function drawDelete() {
  var b = document.getElementById('delBox'); if (!b) return;
  if (!confirmDelete) {
    b.innerHTML = '<button class="btn pink" id="d1">すべて削除する</button>';
    document.getElementById('d1').onclick = function () { confirmDelete = true; drawDelete(); };
    return;
  }
  b.innerHTML = '<div class="warn" role="alert">本当に削除しますか？ 元に戻せません。</div><div class="btns"><button class="btn ghost" id="dNo">やめる</button><button class="btn pink" id="dYes">削除する</button></div>';
  document.getElementById('dNo').onclick = function () { confirmDelete = false; drawDelete(); };
  document.getElementById('dYes').onclick = function () {
    var keepInstall = S.hideInstall;
    S = blank(); S.hideInstall = keepInstall; save(); confirmDelete = false; toast('すべて削除しました'); renderSet();
  };
}

/* ================= SOS ================= */
var sosTimer = null;
function openSOS() {
  var total = 15 * 60, left = total, phase = 0;
  var PH = [{ t: 'ゆっくり吸って…', s: 4 }, { t: 'すこし止めて…', s: 2 }, { t: 'ゆっくり吐いて…', s: 6 }];
  var phaseLeft = PH[0].s, C = 2 * Math.PI * 86, endAt = Date.now() + total * 1000;
  layer.innerHTML = '<div class="sos-screen" role="dialog" aria-modal="true" aria-labelledby="sosT">' +
    '<div style="display:flex;justify-content:flex-end"><button class="round" id="sosX" aria-label="閉じる"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"/></svg></button></div>' +
    '<div style="text-align:center"><h1 id="sosT" style="color:var(--lav-ink);font-size:20px">ちょっとだけ、待ってみよう</h1>' +
    '<p class="sub" style="line-height:1.8;margin:6px 0 0;color:var(--lav-ink)">衝動は波のように、高まってから<br>だんだん引いていきます。</p></div>' +
    '<div class="ring"><svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="86" fill="var(--card)"/><circle cx="100" cy="100" r="86" fill="none" stroke="var(--lav-soft)" stroke-width="10"/>' +
    '<circle id="arc" cx="100" cy="100" r="86" fill="none" stroke="var(--lav-mid)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="0" transform="rotate(-90 100 100)"/></svg>' +
    '<div class="in"><div class="t num" id="sosTime">15:00</div><div class="tiny" id="breath" style="color:var(--lav-ink)">' + PH[0].t + '</div></div></div>' +
    '<section class="card"><h2 style="margin-bottom:10px">代わりにやってみること</h2><div class="alt">' +
      S.settings.sos.map(function (x, i) { return '<button data-i="' + i + '" aria-pressed="false">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<p class="tiny" style="margin:10px 0 0">リストは設定画面で変えられます</p></section>' +
    '<div style="flex:1"></div><button class="calm" id="calm">少し落ち着いた</button></div>';
  var arc = document.getElementById('arc'), tm = document.getElementById('sosTime'), br = document.getElementById('breath');
  function tick() {
    // 画面を閉じていた時間も正しく数えるため、終了時刻から計算する
    left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    phaseLeft--;
    if (phaseLeft <= 0) { phase = (phase + 1) % 3; phaseLeft = PH[phase].s; br.textContent = PH[phase].t; }
    if (left <= 0) { clearInterval(sosTimer); sosTimer = null; br.textContent = '15分たちました。波は少し引きましたか？'; }
    tm.textContent = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
    arc.setAttribute('stroke-dashoffset', (C * (1 - left / total)).toFixed(1));
  }
  sosTimer = setInterval(tick, 1000);
  layer.querySelectorAll('.alt button').forEach(function (b) {
    b.onclick = function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); };
  });
  function close() { if (sosTimer) { clearInterval(sosTimer); sosTimer = null; } layer.innerHTML = ''; document.getElementById('sosBtn').focus(); }
  document.getElementById('sosX').onclick = close;
  document.getElementById('calm').onclick = function () {
    S.sosCount = (S.sosCount || 0) + 1; save(); close(); toast('よく乗り越えました'); render();
  };
  document.getElementById('calm').focus();
}

/* ================= 画面切り替え ================= */
function go(t) {
  tab = t;
  if (t === 'home') msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  var d = today();
  if (t === 'garden') { calY = d.getFullYear(); calM = d.getMonth(); }
  if (t === 'food') { foodY = d.getFullYear(); foodM = d.getMonth(); expDel = null; }
  pendingRestore = null; confirmDelete = false;
  render(); main.scrollTop = 0;
}
document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { go(b.dataset.tab); }; });
document.getElementById('sosBtn').onclick = openSOS;
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && layer.innerHTML) { if (sosTimer) { clearInterval(sosTimer); sosTimer = null; } layer.innerHTML = ''; render(); }
});
// 日付が変わったあとにアプリへ戻ったとき、表示を今日に合わせる
document.addEventListener('visibilitychange', function () { if (!document.hidden && !layer.innerHTML) render(); });
render();

/* ================= オフライン対応 ================= */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').catch(function () {});
  });
}
})();
