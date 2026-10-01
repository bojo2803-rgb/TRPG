// 要素のタブ（人物・シナリオ・アイテム・集団）：一覧と、開いた要素のボード。
// 人物は「一覧／家系図」、集団は「一覧／組織図／相関図」を切り替える
import { h, byTitle, collator } from '../util.js';
import { KINDS, kindOf, newNote } from '../model.js';
import { ensureOwnBoard, summaryOf, linksOfKind } from './elements.js';

const SUBS = {
  person: [['list', '一覧'], ['family', '家系図']],
  group: [['list', '一覧'], ['org', '組織図'], ['rel', '相関図']],
};
// 一覧の絞り込み：テンプレートの選ぶ欄（シナリオの状態・アイテムの区分）、人物は所属
const FILTER = { scenario: '状態', item: '区分' };
const state = {};
const st = kind => (state[kind] ||= { sub: 'list', tags: new Set(), filter: '', sort: 'title' });

export const tabs = Object.fromEntries(Object.keys(KINDS).filter(k => k !== 'note').map(k => [k, { mount: (el, ctx, arg) => mount(k, el, ctx, arg) }]));

function mount(kind, el, ctx, arg) {
  const s = st(kind);
  if (arg?.sub) s.sub = arg.sub;
  const open = arg?.open && kindOf(ctx.world.notes[arg.open]) === kind ? arg.open : null;
  return open ? openMode(kind, el, ctx, open) : listMode(kind, el, ctx, s);
}

// ===== 開いた要素：大きくボード、横に詳しい画面 =====
function openMode(kind, el, ctx, id) {
  const boardId = ensureOwnBoard(ctx, id);
  const head = h('div', { class: 'bar el-head' }), body = h('div', { class: 'el-board' });
  el.append(head, body);
  const renderHead = () => {
    const n = ctx.world.notes[id];
    head.replaceChildren(
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.canBack() ? ctx.back() : ctx.go(KINDS[kind].tab) }, ctx.canBack() ? '← 戻る' : `← ${KINDS[kind].label}の一覧`),
      h('span', { class: `kind-badge k-${kind}` }, KINDS[kind].label),
      h('h2', {}, n.title || '（名前なし）'),
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn', onclick: () => ctx.openNote(id) }, '詳しく'));
  };
  renderHead();
  let board = null, gone = false;
  import('./board.js').then(m => { if (!gone) board = m.mount(body, ctx, { board: boardId, embedded: true }); });
  if (innerWidth > 760) ctx.openNote(id);
  return {
    state: () => ({ open: id }),
    update: e => {
      if (!ctx.world.notes[id]) { gone = true; ctx.go(KINDS[kind].tab); return; }
      renderHead(); board?.update?.(e);
    },
    destroy: () => { gone = true; board?.destroy?.(); },
    get placeNew() { return board?.placeNew; },
  };
}

// ===== 一覧 =====
function listMode(kind, el, ctx, s) {
  const label = KINDS[kind].label;
  // 作る欄：名前を入れて Enter（描き直しても消えないよう、作り直さない）
  const add = h('input', { class: 'add-name', placeholder: `＋ ${label}の名前を入れて Enter`, 'aria-label': `新しい${label}の名前`, autocomplete: 'off' });
  add.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !add.value.trim()) return;
    e.preventDefault();
    const n = newNote({ kind, title: add.value.trim() });
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
        const load = mode === 'family' ? import('./familyView.js').then(m => m.mount(main, ctx)) : mode === 'org' ? import('./orgChart.js').then(m => m.mount(main, ctx)) : import('./graph.js').then(m => m.mount(main, ctx, { only: 'group' }));
        sub = null; load.then(v => { if (subId === mode) sub = v; });
      } else sub?.update?.(e);
      return;
    }
    if (subId !== 'list') { sub?.destroy?.(); sub = null; subId = 'list'; main.replaceChildren(); }
    renderList(kind, main, ctx, s, render);
  };
  render();
  return { update: render, destroy: () => sub?.destroy?.() };
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
