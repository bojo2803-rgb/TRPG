// 要素のタブ（人物・シナリオ・アイテム・集団・ロケーション）：一覧と、開いた要素のボード。
// 人物は「一覧／家系図」、集団は「一覧／組織図／相関図」、ロケーションは「木／地図」を切り替える
import { h, byTitle, collator } from '../util.js';
import { KINDS, kindOf, newNote, placePath, placeParent, hereCounts, mapOf, movePlace } from '../model.js';
import { ensureOwnBoard, summaryOf, linksOfKind, newPlaceDialog, putHere } from './elements.js';
import { closeDialog } from './dialog.js';

const SUBS = {
  person: [['list', '一覧'], ['family', '家系図']],
  group: [['list', '一覧'], ['org', '組織図'], ['rel', '相関図']],
  place: [['list', '木'], ['maps', '地図']],
};
const placeView = {}; // ロケーションごとに、地図とボードのどちらを見ていたか
const closed = new Set(); // 木でたたんだロケーション
// 一覧の絞り込み：テンプレートの選ぶ欄（シナリオの状態・アイテムの区分）、人物は所属
const FILTER = { scenario: '状態', item: '区分' };
const state = {};
const st = kind => (state[kind] ||= { sub: 'list', tags: new Set(), filter: '', sort: 'title' });

export const tabs = Object.fromEntries(Object.keys(KINDS).filter(k => k !== 'note').map(k => [k, { mount: (el, ctx, arg) => mount(k, el, ctx, arg) }]));

function mount(kind, el, ctx, arg) {
  const s = st(kind);
  if (arg?.sub) s.sub = arg.sub;
  const open = arg?.open && kindOf(ctx.world.notes[arg.open]) === kind ? arg.open : null;
  return open ? openMode(kind, el, ctx, open) : listMode(kind, el, ctx, s, arg);
}

// ===== 開いた要素：大きくボード、横に詳しい画面 =====
// ロケーションは「地図／ボード」を切り替える（地図があれば地図から）。上には道しるべ（日本 › 東京都 › …）
function openMode(kind, el, ctx, id) {
  const boardId = ensureOwnBoard(ctx, id);
  const head = h('div', { class: 'bar el-head' }), body = h('div', { class: 'el-board' });
  el.append(head, body);
  const isPlace = kind === 'place';
  let mode = isPlace ? placeView[id] || (mapOf(ctx.world, id) ? 'map' : 'board') : 'board';
  const renderHead = () => {
    const w = ctx.world, n = w.notes[id], path = isPlace ? placePath(w, id).slice(0, -1) : [];
    head.replaceChildren(...[
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.canBack() ? ctx.back() : ctx.go(KINDS[kind].tab) }, ctx.canBack() ? '← 戻る' : `← ${KINDS[kind].label}の一覧`),
      h('span', { class: `kind-badge k-${kind}` }, KINDS[kind].label),
      path.length ? h('nav', { class: 'crumbs', 'aria-label': '上のロケーション' }, ...path.flatMap(p => [h('button', { type: 'button', class: 'linkish', onclick: () => ctx.openElement(p) }, w.notes[p].title || '名前なし'), h('span', { 'aria-hidden': 'true' }, '›')])) : null,
      h('h2', {}, n.title || '（名前なし）'),
      h('span', { class: 'sp' }),
      isPlace ? h('div', { class: 'seg', role: 'group', 'aria-label': '見せ方' }, ...[['map', '地図'], ['board', 'ボード']].map(([k, v]) => h('button', { type: 'button', 'aria-pressed': String(mode === k), onclick: () => { if (mode !== k) { mode = placeView[id] = k; show(); renderHead(); } } }, v))) : null,
      h('button', { type: 'button', class: 'btn', onclick: () => ctx.openNote(id) }, '詳しく'),
    ].filter(Boolean));
  };
  let inner = null, gone = false, seq = 0;
  const show = () => {
    inner?.destroy?.(); inner = null; body.replaceChildren();
    const my = ++seq;
    const load = mode === 'map' ? import('./mapView.js').then(m => m.mount(body, ctx, { owner: id, embedded: true })) : import('./board.js').then(m => m.mount(body, ctx, { board: boardId, embedded: true }));
    load.then(v => { if (gone || my !== seq) v?.destroy?.(); else inner = v; });
  };
  renderHead(); show();
  if (innerWidth > 760) ctx.openNote(id);
  return {
    state: () => ({ open: id }),
    update: e => {
      if (!ctx.world.notes[id]) { gone = true; ctx.go(KINDS[kind].tab); return; }
      renderHead(); inner?.update?.(e);
    },
    destroy: () => { gone = true; inner?.destroy?.(); },
    get placeNew() { return inner?.placeNew; },
  };
}

// ===== 一覧 =====
function listMode(kind, el, ctx, s, arg) {
  const label = KINDS[kind].label;
  // 作る欄：名前を入れて Enter（描き直しても消えないよう、作り直さない）
  const add = h('input', { class: 'add-name', placeholder: `＋ ${label}の名前を入れて Enter`, 'aria-label': `新しい${label}の名前`, autocomplete: 'off' });
  add.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !add.value.trim()) return;
    e.preventDefault();
    const n = newNote({ kind, title: add.value.trim() }); // ロケーションなら一番上のロケーション
    ctx.commit(w => { w.notes[n.id] = n; }, `${label}を追加`);
    add.value = '';
    ctx.openNote(n.id);
  });
  const bar = h('div', { class: 'bar' }), main = h('div', { class: 'el-main' });
  el.append(bar, main);
  let sub = null, subId = null;
  const render = e => {
    const w = ctx.world, subs = SUBS[kind];
    bar.replaceChildren(...[
      h('h2', {}, label),
      subs ? h('div', { class: 'seg', role: 'group', 'aria-label': '見せ方' }, ...subs.map(([k, v]) => h('button', { type: 'button', 'aria-pressed': String(s.sub === k), onclick: () => { s.sub = k; render(); } }, v))) : null,
      h('span', { class: 'sp' }),
      kind === 'person' ? h('button', { type: 'button', class: 'btn', title: '名前・能力値・メモまで、でたらめなキャラクターを作る（発想のきっかけ）', onclick: async () => (await import('./random.js')).open(ctx) }, '🎲 ランダム') : null,
      add,
    ].filter(Boolean));
    const mode = subs ? s.sub : 'list';
    if (mode !== 'list') {
      if (subId !== mode) {
        sub?.destroy?.(); main.replaceChildren(); subId = mode;
        const load = mode === 'family' ? import('./familyView.js').then(m => m.mount(main, ctx))
          : mode === 'org' ? import('./orgChart.js').then(m => m.mount(main, ctx))
          : mode === 'maps' ? import('./mapView.js').then(m => m.mount(main, ctx, arg))
          : import('./graph.js').then(m => m.mount(main, ctx, { only: 'group' }));
        sub = null; load.then(v => { if (subId === mode) sub = v; });
      } else sub?.update?.(e);
      return;
    }
    if (subId !== 'list') { sub?.destroy?.(); sub = null; subId = 'list'; main.replaceChildren(); }
    if (kind === 'place') renderTree(main, ctx, render); else renderList(kind, main, ctx, s, render);
  };
  render();
  return { update: render, destroy: () => sub?.destroy?.(), get placeNew() { return sub?.placeNew; } };
}

// ロケーションの木：ファイルの画面のように、左に木、右に選んだロケーションの中身（中のロケーションと、そこを場所にしているカード）。
// 引っぱって別のロケーションの上で離すと移る（ロケーションは中にあるものごと。カードは場所が変わる）。スマホは「移す」ボタン
let sel = null; // 選んでいるロケーション（null は一番上）
const DRAG = 'application/x-trpg-card';
const LOOSE = ['person', 'item', 'group', 'scenario']; // 一番上に「場所が決まっていないもの」として出す種類

function renderTree(main, ctx, rerender) {
  const w = ctx.world, q = ctx.query().toLowerCase();
  // 選ぶ：中身を出し、一番右の詳しい画面もそのロケーションにする（スマホは画面を覆うので開かない）
  const pick = id => { sel = id; rerender(); if (id && innerWidth > 760) ctx.openNote(id); };
  if (sel && kindOf(w.notes[sel]) !== 'place') sel = null;
  const places = Object.values(w.notes).filter(n => kindOf(n) === 'place').sort(byTitle);
  const kids = new Map(places.map(n => [n.id, []])), roots = [];
  for (const n of places) { const p = placeParent(w, n.id); if (p && kids.has(p)) kids.get(p).push(n); else roots.push(n); }
  // 上下が輪になっていて、どの一番上からもたどれないものは、一番上に出す
  const reach = new Set(), mark = n => { if (reach.has(n.id)) return; reach.add(n.id); kids.get(n.id).forEach(mark); };
  roots.forEach(mark);
  for (const n of places) if (!reach.has(n.id)) { roots.push(n); mark(n); }
  const shown = q ? new Set(places.filter(n => n.title.toLowerCase().includes(q) || Object.values(n.fields).some(v => String(v).toLowerCase().includes(q))).flatMap(n => placePath(w, n.id))) : null;
  const count = hereCounts(w);

  // 引っぱる・離す
  const drag = (el, id) => { el.draggable = true; el.addEventListener('dragstart', e => { e.dataTransfer.setData(DRAG, id); e.dataTransfer.setData('text/plain', w.notes[id]?.title || ''); e.dataTransfer.effectAllowed = 'move'; }); return el; };
  const drop = (el, to) => {
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drop'); const id = e.dataTransfer.getData(DRAG); if (id) moveTo(ctx, id, to); });
    return el;
  };
  const moveBtn = id => h('button', { type: 'button', class: 'btn small', title: '別のロケーションへ移す', onclick: e => { e.stopPropagation(); moveDialog(ctx, id); } }, '移す');

  // 左：木
  const seen = new Set(), rows = [drop(h('div', { class: 'tree-row root', 'aria-current': String(sel === null) }, h('span', { class: 'tree-fold' }),
    h('button', { type: 'button', class: 'tree-name', onclick: () => pick(null) }, '一番上')), null)];
  const walk = (n, depth) => {
    if (seen.has(n.id) || (shown && !shown.has(n.id))) return;
    seen.add(n.id);
    const ks = kids.get(n.id).filter(k => !seen.has(k.id)), fold = closed.has(n.id) && !shown;
    rows.push(drop(drag(h('div', { class: 'tree-row', style: { paddingLeft: 8 + (depth + 1) * 18 + 'px' }, 'data-id': n.id, 'aria-current': String(sel === n.id) },
      ks.length ? h('button', { type: 'button', class: 'tree-fold', 'aria-label': fold ? 'ひらく' : 'たたむ', 'aria-expanded': String(!fold), onclick: () => { fold ? closed.delete(n.id) : closed.add(n.id); rerender(); } }, fold ? '▸' : '▾') : h('span', { class: 'tree-fold' }),
      h('button', { type: 'button', class: 'tree-name', title: '押すと中身を出す。ダブルクリックで開く', onclick: () => pick(n.id), ondblclick: () => ctx.openElement(n.id) }, n.title || '（名前なし）'),
      mapOf(w, n.id) ? h('span', { class: 'note-text', title: '地図あり' }, '🗺') : null,
      count[n.id] ? h('span', { class: 'note-text', title: 'ここ（中も含む）を場所にしているカード' }, `${count[n.id]}`) : null,
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn small', title: 'この中にロケーションを作る', 'aria-label': `「${n.title}」の中に作る`, onclick: () => newPlaceDialog(ctx, n.id) }, '＋')), n.id), n.id));
    if (!fold) for (const k of ks) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);

  // 右：選んだロケーションの中身
  const here = sel ? w.notes[sel] : null;
  const subs = sel ? kids.get(sel) || [] : roots;
  const things = Object.values(w.notes).filter(o => o.id !== sel && (sel ? o.at === sel : !o.at && LOOSE.includes(kindOf(o)))).sort(byTitle);
  const crumbs = [null, ...(sel ? placePath(w, sel) : [])];
  const right = h('div', { class: 'explorer-main scroll' },
    h('nav', { class: 'crumbs', 'aria-label': 'いまの場所' }, ...crumbs.flatMap((p, i) => [i ? h('span', { 'aria-hidden': 'true' }, '›') : null,
      drop(h('button', { type: 'button', class: 'linkish', 'aria-current': String(p === sel), onclick: () => pick(p) }, p ? w.notes[p].title || '名前なし' : '一番上'), p)]).filter(Boolean)),
    h('div', { class: 'row explorer-head' },
      h('h3', {}, here ? here.title || '（名前なし）' : 'ロケーション'),
      here?.fields?.['種類'] ? h('span', { class: 'note-text' }, here.fields['種類']) : null,
      h('span', { class: 'sp' }),
      here ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.openElement(sel) }, mapOf(w, sel) ? '開く（地図）' : '開く') : null,
      here ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.openNote(sel) }, '詳しく') : null,
      here ? moveBtn(sel) : null,
      here ? h('button', { type: 'button', class: 'btn small', title: '人物・アイテム・集団・シナリオの場所を、ここにする', onclick: () => putHere(ctx, sel) }, '＋ ここに置く') : null,
      h('button', { type: 'button', class: 'btn small', onclick: () => newPlaceDialog(ctx, sel) }, '＋ ロケーション')),
    h('h4', {}, `中のロケーション（${subs.length}）`),
    subs.length ? h('div', { class: 'tiles' }, ...subs.map(k => drop(drag(h('div', { class: 'tile place', 'data-id': k.id },
      h('button', { type: 'button', class: 'tile-name', title: '押すと中へ。ダブルクリックで開く', onclick: () => { closed.delete(placeParent(w, k.id)); pick(k.id); }, ondblclick: () => ctx.openElement(k.id) }, `📁 ${k.title || '（名前なし）'}`),
      h('span', { class: 'note-text' }, [k.fields?.['種類'], (kids.get(k.id) || []).length ? `中に${kids.get(k.id).length}` : '', count[k.id] ? `${count[k.id]}件` : ''].filter(Boolean).join('・')),
      moveBtn(k.id)), k.id), k.id)))
      : h('p', { class: 'note-text' }, sel ? 'まだありません。「＋ ロケーション」でこの中に作れます。' : 'まだロケーションがありません。上の欄に名前（例：日本）を入れて Enter で作れます。'),
    h('h4', {}, sel ? `ここにあるもの（${things.length}）` : `場所が決まっていないもの（${things.length}）`),
    things.length ? h('div', { class: 'tiles' }, ...things.map(o => drag(h('div', { class: 'tile', 'data-id': o.id },
      h('button', { type: 'button', class: 'tile-name', onclick: () => ctx.openNote(o.id) }, o.title || '（名前なし）'),
      h('span', { class: `kind-badge k-${kindOf(o)}` }, KINDS[kindOf(o)].label),
      moveBtn(o.id)), o.id)))
      : h('p', { class: 'note-text' }, sel ? '人物・アイテム・集団・シナリオ・出来事の「場所」をここにすると出ます。ここへ引っぱってきても移せます。' : 'ありません'));
  // 描き直しても、左右の欄のスクロールの位置はそのまま
  const keepT = main.querySelector('.explorer-tree')?.scrollTop || 0, keepM = main.querySelector('.explorer-main')?.scrollTop || 0;
  const left = h('div', { class: 'explorer-tree scroll' }, h('div', { class: 'tree' }, ...rows));
  main.replaceChildren(h('div', { class: 'explorer' }, left, right));
  left.scrollTop = keepT; right.scrollTop = keepM;
}

// 移す：ロケーションなら上のロケーションを変える（中にあるものごと）。カードなら場所を変える。to が null なら一番上・場所なし
function moveTo(ctx, id, to) {
  const n = ctx.world.notes[id];
  if (!n || id === to) return;
  if (kindOf(n) === 'place') {
    let err = null;
    ctx.commit(w => { err = movePlace(w, id, to); }, 'ロケーションを移す');
    if (err) ctx.toast(`「${n.title}」を移せません：${err}`);
    else ctx.toast(`「${n.title}」を${to ? `「${ctx.world.notes[to].title}」の中` : '一番上'}へ移しました（中にあるものも一緒に）`);
  } else {
    ctx.commit(w => { if (to) w.notes[id].at = to; else delete w.notes[id].at; }, '場所を変える');
    ctx.toast(`「${n.title}」の場所を${to ? `「${ctx.world.notes[to].title}」` : 'なし'}にしました`);
  }
}
// 移す先を選ぶ（スマホ用。木の形で並べ、自分とその中は選べない）
function moveDialog(ctx, id) {
  const w = ctx.world, n = w.notes[id], isPlace = kindOf(n) === 'place';
  const opts = [];
  const add = (p, d) => {
    if (isPlace && placePath(w, p.id).includes(id)) return;
    opts.push(h('button', { type: 'button', class: 'move-opt', style: { paddingLeft: 10 + d * 18 + 'px' }, 'aria-current': String((isPlace ? placeParent(w, id) : n.at) === p.id), onclick: () => { closeDialog(); moveTo(ctx, id, p.id); } }, p.title || '（名前なし）'));
    for (const k of Object.values(w.notes).filter(x => kindOf(x) === 'place' && placeParent(w, x.id) === p.id).sort(byTitle)) add(k, d + 1);
  };
  for (const r of Object.values(w.notes).filter(x => kindOf(x) === 'place' && !placeParent(w, x.id)).sort(byTitle)) add(r, 0);
  ctx.openDialog({
    title: `「${n.title || '名前なし'}」をどこへ移すか`,
    body: h('div', { class: 'pick-list move-list' },
      h('button', { type: 'button', class: 'move-opt', onclick: () => { closeDialog(); moveTo(ctx, id, null); } }, isPlace ? '一番上' : '場所なし（どこにも置かない）'), ...opts,
      isPlace ? h('p', { class: 'note-text' }, '中のロケーションや、そこにいる人・ある物も一緒に移ります。') : null),
  });
}

function renderList(kind, main, ctx, s, rerender) {
  const w = ctx.world, q = ctx.query().toLowerCase();
  const all = Object.values(w.notes).filter(n => kindOf(n) === kind);
  const tags = [...new Set(all.flatMap(n => n.tags))].sort(collator.compare);
  // 絞り込みの選択肢
  let options = [];
  if (FILTER[kind]) options = Object.values(w.templates).flatMap(t => t.fields).find(f => f.key === FILTER[kind] && f.type === 'select')?.options || [];
  if (kind === 'person') options = Object.values(w.notes).filter(n => kindOf(n) === 'group').sort(byTitle).map(g => [g.id, g.title || '名前なし']);
  const pass = n => {
    if (s.filter) {
      if (kind === 'person') { if (!linksOfKind(w, 'member', 'a', n.id).some(l => l.b === s.filter)) return false; }
      else if (n.fields?.[FILTER[kind]] !== s.filter) return false;
    }
    if (s.tags.size && ![...s.tags].every(t => n.tags.includes(t))) return false;
    return !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)) || Object.values(n.fields).some(v => String(v).toLowerCase().includes(q));
  };
  const list = all.filter(pass);
  if (s.sort === 'title') list.sort(byTitle); else list.reverse();
  const boardCount = id => { const b = Object.values(w.boards).find(b => b.owner === id); return b ? Object.keys(b.items).filter(x => x !== id && w.notes[x]).length : 0; };
  const card = n => {
    const sum = summaryOf(w, n), c = boardCount(n.id);
    return h('button', { type: 'button', class: `ncard el p-${n.color ?? 0}`, 'data-id': n.id, onclick: () => ctx.openElement(n.id) },
      h('span', { class: 'ncard-t' }, n.title || '（名前なし）'),
      sum ? h('span', { class: 'ncard-b' }, sum) : null,
      n.tags.length ? h('span', { class: 'ncard-tags' }, n.tags.join('・')) : null,
      h('span', { class: 'ncard-where' }, c ? `ボードに${c}枚` : 'ボードはまだ空'));
  };
  const optVal = o => Array.isArray(o) ? o[0] : o, optText = o => Array.isArray(o) ? o[1] : o;
  if (s.filter && !options.some(o => optVal(o) === s.filter)) s.filter = '';
  main.replaceChildren(
    h('div', { class: 'row el-tools' },
      h('span', { class: 'note-text' }, `${list.length}${list.length === all.length ? '' : ` / ${all.length}`}`),
      options.length ? h('select', { 'aria-label': kind === 'person' ? '所属で絞る' : `${FILTER[kind]}で絞る`, onchange: e => { s.filter = e.target.value; rerender(); } },
        h('option', { value: '' }, kind === 'person' ? '所属：すべて' : `${FILTER[kind]}：すべて`), ...options.map(o => h('option', { value: optVal(o), selected: optVal(o) === s.filter }, optText(o)))) : null,
      h('select', { 'aria-label': '並べ方', onchange: e => { s.sort = e.target.value; rerender(); } }, h('option', { value: 'title', selected: s.sort === 'title' }, '名前順'), h('option', { value: 'recent', selected: s.sort === 'recent' }, '作った順')),
      ...tags.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.tags.has(t)), onclick: () => { s.tags.has(t) ? s.tags.delete(t) : s.tags.add(t); rerender(); } }, t))),
    h('div', { class: 'scroll' }, list.length ? h('div', { class: 'ngrid' }, ...list.map(card))
      : h('p', { class: 'note-text' }, all.length ? '当てはまるものがありません' : `まだ${KINDS[kind].label}が${kind === 'person' ? 'いません' : 'ありません'}。上の欄に名前を入れて Enter で作れます。開くと、その${KINDS[kind].label}のボードに付箋を貼れます。`)));
}
