// アプリの起動：世界を開き、画面を切り替え、付箋の編集画面を出し、自動で保存する
import { h, esc, uid } from './util.js';
import { createStore } from './store.js';
import { newWorld, migrateWorld, newNote, deleteNote, KINDS, kindOf } from './model.js';
import { createPersistence, backendOf } from './persist/index.js';
import { localAvailable } from './persist/local.js';
import { initDialog, openDialog, showMenu, menuAt, toast } from './ui/dialog.js';
import { parseRoute, formatRoute, pushRecent } from './route.js';
import { inScenario } from './listing.js';

const $ = id => document.getElementById(id);
const PREF = 'trpg-app-last';
const pref = { get() { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } }, set(p) { try { localStorage.setItem(PREF, JSON.stringify({ ...pref.get(), ...p })); } catch { /* 保存できない環境 */ } } };

// 画面の一覧（左の切り替え）。load は初めて開くときに読み込む。other：「ほかの見方」にまとめるもの
const kindTab = k => () => import('./ui/kindView.js').then(m => m.tabs[k]);
const VIEWS = [
  { id: 'people', label: '人物', load: kindTab('person') },
  { id: 'scenarios', label: 'シナリオ', load: kindTab('scenario') },
  { id: 'places', label: 'ロケーション', load: kindTab('place') },
  { id: 'groups', label: '集団', load: kindTab('group') },
  { id: 'items', label: 'アイテム', load: kindTab('item') },
  { id: 'notes', label: '付箋', load: () => import('./ui/notesView.js') },
  { id: 'board', label: 'ボード', other: true, load: () => import('./ui/board.js') },
  { id: 'timemap', label: '時系列', other: true, load: () => import('./timemap/view.js') },
  { id: 'graph', label: 'グラフ', other: true, load: () => import('./ui/graph.js') },
  { id: 'templates', label: 'テンプレート', other: true, load: () => import('./ui/templates.js') },
];
const KIND_VIEWS = new Set(Object.values(KINDS).map(k => k.tab));
// 前の版の画面の名前（家系図は人物の中へ、地図はロケーションの中へ移った）
const OLD_VIEWS = { family: ['people', { sub: 'family' }], map: ['places', { sub: 'maps' }] };

const store = createStore(newWorld());
const persist = createPersistence(store);
let view = null, viewId = null, viewArg = null, peek = null;
// ブラウザの履歴：このアプリで積んだ番号（0 から）。0 より大きければ「戻る」で前の画面へ戻れる
let routeIdx = history.state?.i ?? 0;
const bootHash = location.hash; // 共有の取り込み（#import&…）は、世界を開いてから使う
// 最近開いたもの（この端末だけ、世界ごと）
const RECENT = 'trpg-recent';
const recentAll = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || {}; } catch { return {}; } };
const ROUTE_KEYS = ['open', 'mode', 'sub', 'board', 'map', 'focus'];
const routeArg = r => { const a = {}; for (const k of ROUTE_KEYS) if (r?.[k]) a[k] = r[k]; return Object.keys(a).length ? a : null; };

export const ctx = {
  store, persist,
  get world() { return store.get(); },
  commit: (fn, label) => store.commit(fn, label),
  // カードを右の小窓で開く（いま開いているものと入れ替える）
  async openNote(id, opts) {
    if (!peek) peek = (await import('./ui/peek.js')).createPeek(ctx);
    peek.open(id, opts);
  },
  // 小窓・ページの中の名前を押したとき：小窓に重ねて開く
  openRelated(id, opts = {}) { if (id === ctx.currentPage() && !peek?.depth()) return; return ctx.openNote(id, { ...opts, push: true }); },
  closeNote() { peek?.close(); },
  openedNote: () => peek?.current() || null,
  // 新しい付箋を作って開く
  newNote(preset = {}, { open = true } = {}) {
    const n = newNote(preset);
    store.commit(w => { w.notes[n.id] = n; }, `${KINDS[kindOf(n)].label}を追加`);
    if (open) ctx.openNote(n.id, { focusTitle: true });
    return n.id;
  },
  deleteNote(id) { const k = kindOf(store.get().notes[id]); store.commit(w => deleteNote(w, id), `${KINDS[k].label}を削除`); },
  // 思いついたことを書き留める小さな窓。いまの画面がボードなら、そのボードに貼る
  async quickNote() { (await import('./ui/quickNote.js')).quickDialog(ctx, view?.placeNew); },
  setKind(id, kind) { store.commit(w => { w.notes[id].kind = kind; }, `${KINDS[kind].label}にする`); },
  go: (id, arg) => showView(id, arg),
  // 人物などのページを開く（付箋・出来事はページがないので小窓）。mode：board・chart・map（なければ覚えている見せ方）
  // focus：チャートで最初にえらぶ点
  openElement(id, { mode, focus } = {}) {
    const n = store.get().notes[id];
    if (!n) return;
    if (kindOf(n) === 'note') { ctx.openNote(id); return; }
    peek?.close();
    showView(KINDS[kindOf(n)].tab, { open: id, ...(mode && { mode }), ...(focus && { focus }) });
  },
  // いま真ん中に開いているページのカード
  currentPage: () => KIND_VIEWS.has(viewId) ? viewArg?.open || null : null,
  // いま開いているシナリオに出るもの（検索・リンクの候補で先に出す）
  scope() { const id = ctx.currentPage(), w = store.get(); return id && kindOf(w.notes[id]) === 'scenario' ? inScenario(w, id) : null; },
  canBack: () => routeIdx > 0,
  back() { history.back(); },
  // 画面の中で見せ方を変えたとき（家系図・ボードなど）：アドレスに書いて履歴に積む
  setRoute(arg) { viewArg = arg; pushRoute(); },
  viewArg: () => viewArg,
  recent: () => recentAll()[store.get().id] || [],
  noteRecent(id) {
    const all = recentAll(), w = store.get();
    all[w.id] = pushRecent(all[w.id] || [], id);
    try { localStorage.setItem(RECENT, JSON.stringify(all)); } catch { /* 保存できない環境 */ }
    renderRecent();
  },
  // その場で作ったカードを知らせる。［書く］で小窓に開く
  created(ids) {
    const ns = ids.map(id => store.get().notes[id]).filter(Boolean);
    if (!ns.length) return;
    const n = ns[0];
    toast(ns.length === 1 ? `「${n.title}」を${KINDS[kindOf(n)].label}として作りました` : `${ns.map(x => `「${x.title}」`).join('')}を作りました`, 8000, { label: '書く', onClick: () => ctx.openRelated(n.id) });
  },
  // 変更の中で新しく作られたカードを知らせる
  commitNew(fn, label) {
    const before = new Set(Object.keys(store.get().notes));
    store.commit(fn, label);
    ctx.created(Object.keys(store.get().notes).filter(id => !before.has(id)));
  },
  // まだない名前のリンクを押したとき：どの種類で作るかを選んで作り、小窓で開く
  createAs(title, anchor) {
    menuAt(anchor, `「${esc(title)}」をどの種類で作るか`, ['person', 'place', 'item', 'group', 'scenario', 'note'].map(k => [KINDS[k].label, () => {
      const n = newNote({ kind: k, title });
      store.commit(w => { w.notes[n.id] = n; }, `${KINDS[k].label}を追加`);
      ctx.openRelated(n.id);
    }]));
  },
  toast, openDialog, showMenu, menuAt,
  imageUrl: id => persist.imageUrl(id),
};
window.__app = ctx; // 自動確認用

// 画面を移る。push：ブラウザの履歴に積む（戻る・進むで来たときは積まない）
async function showView(id, arg = null, { push = true } = {}) {
  if (OLD_VIEWS[id]) [id, arg] = [OLD_VIEWS[id][0], { ...OLD_VIEWS[id][1], ...arg }];
  const def = VIEWS.find(v => v.id === id) || VIEWS[0];
  view?.destroy?.(); view = null;
  viewId = def.id; viewArg = arg;
  pushRoute(!push);
  if (arg?.open && store.get().notes[arg.open]) ctx.noteRecent(arg.open);
  for (const b of $('views').querySelectorAll('[data-id]')) b.setAttribute('aria-current', b.dataset.id === viewId ? 'page' : 'false');
  const el = $('view');
  el.replaceChildren(h('p', { class: 'scroll note-text' }, '読み込んでいます…'));
  try {
    const mod = await def.load();
    if (viewId !== def.id) return; // 読み込み中に別の画面へ移った
    el.replaceChildren();
    view = mod.mount(el, ctx, arg);
  } catch (e) {
    console.error(e);
    el.replaceChildren(h('p', { class: 'scroll err' }, `この画面を開けませんでした：${e.message}`));
  }
  pref.set({ view: viewId });
}

// いまの画面をアドレスに書く（replace：履歴に積まずに書き換える）
function pushRoute(replace = false) {
  const hash = formatRoute(viewId, viewArg);
  if (location.hash === hash) return;
  if (replace) history.replaceState({ i: routeIdx }, '', hash);
  else history.pushState({ i: ++routeIdx }, '', hash);
}
// 左の切り替え：主な6つ・ほかの見方・最近（スマホは主な6つと「…」）
function renderNav() {
  const btn = v => h('button', { type: 'button', class: v.other ? 'other' : '', 'data-id': v.id, 'aria-current': v.id === viewId ? 'page' : 'false', onclick: () => { peek?.close(); showView(v.id); } }, v.label);
  $('views').replaceChildren(
    ...VIEWS.filter(v => !v.other).map(btn),
    h('div', { class: 'nav-h' }, 'ほかの見方'),
    ...VIEWS.filter(v => v.other).map(btn),
    h('button', { type: 'button', class: 'nav-more', 'aria-label': 'ほかの見方', onclick: e => menuAt(e.currentTarget, 'ほかの見方', VIEWS.filter(v => v.other).map(v => [v.label, () => { peek?.close(); showView(v.id); }])) }, '…'),
    h('div', { class: 'nav-h nav-recent-h' }, '最近'),
    h('div', { class: 'nav-recent', id: 'navRecent' }));
  renderRecent();
}
function renderRecent() {
  const el = $('navRecent');
  if (!el) return;
  const w = store.get(), ids = ctx.recent().filter(id => w.notes[id]);
  el.replaceChildren(...(ids.length ? ids.map(id => { const n = w.notes[id], k = kindOf(n); return h('button', { type: 'button', class: 'recent', title: `${KINDS[k].label}：${n.title || '名前なし'}`, onclick: () => ctx.openElement(id) }, h('span', { class: `dot k-${k}`, 'aria-hidden': 'true' }), h('span', { class: 'rt' }, n.title || '（名前なし）')); })
    : [h('p', { class: 'note-text' }, '開いたものがここに出ます')]));
}

function refreshChrome() {
  const w = store.get();
  $('worldName').textContent = w.name;
  document.title = `${w.name} — TRPG 世界設定`;
  $('undo').disabled = !store.canUndo();
  $('redo').disabled = !store.canRedo();
  $('undo').title = store.canUndo() ? `元に戻す：${store.undoLabel()}（Ctrl+Z）` : '元に戻す（Ctrl+Z）';
  renderRecent();
}

store.subscribe(e => {
  refreshChrome();
  view?.update?.(e);
  peek?.update(e);
});
persist.onStatus(s => {
  if (s.state === 'conflict') {
    toast(`もう一方の端末と同じカードを同時に直していたので、両方を残しました（${s.conflicts.length}件）。いらない方を消してください`, 12000);
    return;
  }
  $('saveStatus').textContent = s.text;
  $('saveStatus').classList.toggle('err', s.state === 'error');
  // ドライブの鍵の期限が切れて保存できなかったとき：押してつなぎ直す（ログインの画面はボタンからしか開けない）
  if (s.state === 'error' && persist.current()?.backend === 'drive') {
    $('saveStatus').append(' ', h('button', { type: 'button', class: 'btn small', onclick: async () => {
      try { await (await import('./persist/drive.js')).connect(); persist.save(); } catch (e) { toast(e.message); }
    } }, 'つなぎ直して保存'));
    // 鍵が切れて保存できなかった：次に画面のどこかを押したら、つなぎ直して保存する
    import('./persist/drive.js').then(d => { if (!d.isConnected()) d.reconnectOnClick(() => persist.save()); });
  }
});

// ===== 世界の一覧・作成・入れ替え =====
// route：アドレスに書いてあった画面（読み込み直したとき）。なければ前に開いていた画面
async function openWorld(backend, id, route = null) {
  persist.flush();
  const w = migrateWorld(await persist.open(backend, id));
  store.replace(w);
  pref.set({ backend, world: id });
  ctx.closeNote();
  refreshChrome();
  if (route) showView(route.view, routeArg(route), { push: false });
  else showView(pref.get().view || 'people', null, { push: false });
}
async function createWorld(backend, name, data = null) {
  persist.flush();
  const w = data ? migrateWorld(data) : newWorld(name);
  if (data) { w.id = uid('w'); if (name) w.name = name; }
  await persist.create(backend, w);
  store.replace(w);
  pref.set({ backend, world: w.id });
  ctx.closeNote();
  refreshChrome();
  showView(data ? 'timemap' : 'people');
  return w;
}
ctx.openWorld = openWorld;
ctx.createWorld = createWorld;

async function worldMenu() {
  const list = await persist.listAll(), cur = persist.current();
  const items = list.map(x => [`${x.id === cur?.id ? '● ' : ''}${x.name}（${x.backendLabel}）`, () => openWorld(x.backend, x.id)]);
  menuAt($('worldBtn'), '世界', [
    ...items, '-',
    ['＋ 新しい世界', () => newWorldDialog()],
    ['見本の世界を開く', () => exampleMenu()],
    ['名前を変える', () => renameDialog()],
    ['書き出す（ファイルにして持ち出す）', () => exportDialog()],
    ['読み込む（書き出したファイルを開く）', () => importDialog()],
    '-',
    ['この世界を削除', () => deleteWorldDialog(), { danger: true }],
  ]);
}
const backendChoice = () => {
  const names = ['browser', ...(backendOf('drive')?.ready?.() ? ['drive'] : [])];
  return names.length < 2 ? '' : `<label>保存先<select id="w_backend">${names.map(n => `<option value="${n}"${n === (persist.current()?.backend || 'browser') ? ' selected' : ''}>${esc(backendOf(n).label)}</option>`).join('')}</select></label>`;
};
const chosenBackend = () => $('w_backend')?.value || persist.current()?.backend || 'browser';
function newWorldDialog() {
  openDialog({
    title: '新しい世界', ok: '作る',
    body: `<label>世界の名前<input id="w_name" value="新しい世界" autocomplete="off"></label>${backendChoice()}`,
    onSave: async () => { const n = $('w_name').value.trim(); if (!n) throw '名前を入れてください'; await createWorld(chosenBackend(), n); },
  });
}
function renameDialog() {
  openDialog({
    title: '世界の名前を変える',
    body: `<label>世界の名前<input id="w_name" value="${esc(store.get().name)}" autocomplete="off"></label>`,
    onSave: () => { const n = $('w_name').value.trim(); if (!n) throw '名前を入れてください'; store.commit(w => { w.name = n; }, '世界の名前を変更'); },
  });
}
function deleteWorldDialog() {
  const w = store.get(), cur = persist.current();
  openDialog({
    title: '世界を削除', ok: null,
    body: `<p>「${esc(w.name)}」を削除します。カード・ボード・画像もすべて消え、元に戻せません。${cur?.backend === 'drive' ? 'Googleドライブのフォルダはゴミ箱に移ります（30日以内ならドライブから戻せます）。' : ''}</p><p class="note-text">消す前に「書き出す」でファイルにしておくと安心です。</p>`,
    onDelete: async () => {
      await persist.remove(cur.backend, cur.id);
      const rest = await persist.listAll();
      if (rest.length) await openWorld(rest[0].backend, rest[0].id); else await createWorld('browser', '新しい世界');
    },
  });
}
// 書き出す：ページからのダウンロードが使えない環境（Artifact など）もあるので、文字にしてコピーもできるようにする
function exportDialog() {
  const json = JSON.stringify(store.get(), null, 1);
  openDialog({
    title: '書き出す',
    body: h('div', { class: 'fields' },
      h('p', { class: 'note-text' }, 'いまの世界を1つのファイル（.json）にします。画像はファイルに入りません（保存先に残ります）。「ファイルに保存」が使えないときは、コピーしてメモ帳などに貼り付け、名前の最後を「.json」にして保存してください。'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: () => {
          try {
            const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: `${store.get().name}.json` });
            a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          } catch { toast('この環境ではファイルに保存できません。コピーしてください'); }
        } }, 'ファイルに保存'),
        h('button', { type: 'button', class: 'btn', onclick: e => {
          const t = $('ex_text');
          navigator.clipboard?.writeText(json).then(() => { e.target.textContent = 'コピーしました'; }, () => { t.focus(); t.select(); e.target.textContent = '選んだ文字をコピーしてください'; });
        } }, 'コピー')),
      h('textarea', { id: 'ex_text', readOnly: true, rows: 8, class: 'data', 'aria-label': 'いまの世界' }, json)),
  });
}
function importDialog() {
  openDialog({
    title: '読み込む', ok: '新しい世界として開く',
    body: h('div', { class: 'fields' },
      h('p', { class: 'note-text' }, '書き出したファイル（.json。時系列マップの試作品で書き出したものも）を選ぶか、書き出した文字を貼り付けてください。新しい世界として開きます（いまの世界はそのまま残ります）。シナリオ1つのファイルなら、いま開いている世界に取り込みます。'),
      h('input', { type: 'file', id: 'im_file', accept: '.json,application/json,text/plain', onchange: async e => { const f = e.target.files[0]; if (f) $('im_text').value = await f.text(); } }),
      h('textarea', { id: 'im_text', rows: 6, class: 'data', placeholder: 'ここに貼り付け', 'aria-label': '書き出した文字' }),
      h('div', { html: backendChoice() })),
    onSave: async () => {
      let d;
      try { d = JSON.parse($('im_text').value); } catch { throw '読めませんでした。書き出したファイルを選ぶか、書き出した文字をそのまま貼り付けてください'; }
      // シナリオ1つのファイル：いま開いている世界に取り込む
      const sh = await import('./ui/shareUI.js');
      if (sh.isScenarioPackage(d)) { setTimeout(() => sh.confirmImport(ctx, d), 0); return; }
      try { migrateWorld(d); } catch (e) { throw `${e.message}。書き出したファイルを選んでください`; }
      await createWorld(chosenBackend(), d.name || null, d);
    },
  });
}
async function exampleMenu() {
  let list = [];
  try { list = await (await fetch('examples/index.json', { cache: 'no-cache' })).json(); } catch { toast('見本のファイルを読み込めませんでした'); return; }
  menuAt($('worldBtn'), '見本の世界（新しい世界として開きます）', list.map(x => [x.name, async () => {
    try { const d = await (await fetch('examples/' + x.file, { cache: 'no-cache' })).json(); await createWorld(persist.current()?.backend || 'browser', x.name, d); }
    catch (e) { toast(`開けませんでした：${e.message}`); }
  }]));
}
ctx.exampleMenu = exampleMenu;

// ===== 起動 =====
async function start() {
  (await import('./ui/settings.js')).applyTheme();
  initDialog();
  renderNav();
  (await import('./ui/searchBox.js')).initSearch(ctx);
  // ブラウザの「戻る」「進む」：その画面を開き直す（小窓は閉じる）
  addEventListener('popstate', e => {
    const r = parseRoute(location.hash);
    if (!r) return;
    routeIdx = e.state?.i ?? 0;
    peek?.close();
    showView(r.view, routeArg(r), { push: false });
  });
  $('worldBtn').onclick = worldMenu;
  $('undo').onclick = () => store.undo();
  $('redo').onclick = () => store.redo();
  $('newNote').onclick = () => ctx.quickNote();
  $('settingsBtn').onclick = async () => (await import('./ui/settings.js')).open(ctx);
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('dlg').open) { e.preventDefault(); $('search').focus(); return; }
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ($('dlg').open || typing) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
    else if (k === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); ctx.quickNote(); }
    else if (k === '/' ) { e.preventDefault(); $('search').focus(); }
  });
  addEventListener('beforeunload', () => persist.flush());
  addEventListener('pagehide', () => persist.flush());
  try { await (await import('./persist/drive.js')).init(ctx); } catch (e) { console.warn('drive', e); }

  if (!(await localAvailable())) toast('このブラウザでは保存できない設定になっています（プライベートウィンドウなど）。書き出して持ち出してください', 12000);
  const p = pref.get();
  const list = await persist.listAll();
  // 前回はGoogleドライブの世界。鍵がまだ使えれば（読み込み直しただけなど）そのまま開く。
  // 切れていたら、画面のどこかを押したときにつなぎ直して開く（ブラウザは、押した時にしかGoogleの窓を開かせない）
  const drive = await import('./persist/drive.js').catch(() => null);
  if (p.backend === 'drive' && drive?.wasConnected() && !list.some(x => x.backend === 'drive')) {
    const openDrive = () => openWorld('drive', p.world).catch(async () => { const l = await persist.listAll(); const d = l.find(x => x.backend === 'drive'); if (d) await openWorld('drive', d.id); });
    store.replace(newWorld('（Googleドライブにつないでいます）')); refreshChrome(); showView('people', null, { push: false });
    toast('画面のどこかを押すと、Googleドライブにつないで前の世界を開きます', 600000);
    drive.reconnectOnClick(() => { $('toast').hidden = true; openDrive(); }, () => {
      // 窓を開けなかったとき（ブラウザが止めた・閉じられた）：ボタンでつなぐ
      openDialog({
        title: 'Googleドライブにつなぐ', ok: 'つなぐ',
        body: '<p>前回は、Googleドライブの世界を開いていました。つないで開きますか？</p><p class="note-text">「やめる」を押すと、このブラウザの世界を使えます（左上の世界の名前から選べます）。</p>',
        onSave: async () => { await drive.connect(); await openDrive(); },
      });
    });
    return;
  }
  const last = list.find(x => x.id === p.world && x.backend === p.backend) || list[0];
  if (last) {
    try { await openWorld(last.backend, last.id, parseRoute(bootHash)); return; } catch (e) { console.error(e); toast(`前に開いていた世界を開けませんでした：${e.message}`); }
  }
  // はじめて：見本の世界があればそれを、なければ白紙の世界を作る
  try {
    const idx = await (await fetch('examples/index.json')).json();
    const d = await (await fetch('examples/' + idx[0].file)).json();
    await createWorld('browser', idx[0].name, d);
  } catch { await createWorld('browser', '新しい世界'); }
}
// 共有ページの「自分のアプリに取り込む」で来たとき（…#import&f=…&k=…）：世界が開いてから取り込む
async function checkImport() {
  if (!/^#import/.test(bootHash)) return;
  const hash = bootHash;
  for (let i = 0; i < 240 && !persist.current(); i++) await new Promise(r => setTimeout(r, 500)); // ドライブにつなぐのを待つ
  (await import('./ui/shareUI.js')).importFromLink(ctx, hash);
}
start().then(checkImport);
