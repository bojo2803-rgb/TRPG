// 付箋（アイデア）の一覧：上の入力欄で書き留める・絞る・タグで絞る・どこにも貼っていないものだけ・並べ替え。クリックで小窓に開く。
// チェックで選んで、まとめて操作（シナリオに入れる・場所・タグ・消す）
import { h, byTitle, collator } from '../util.js';
import { kindOf } from '../model.js';
import { quickInput } from './quickNote.js';
import { bulkBar, selBox } from './bulkBar.js';

const SORTS = { recent: '作った順', title: '名前順', tag: 'タグごと' };
let state = { tags: new Set(), sort: 'recent', loose: false, q: '', sel: new Set(), last: null };

// その付箋が貼ってあるボードの名前（要素のボードなら要素の名前）
export function placesOf(w, id) {
  return Object.values(w.boards).filter(b => b.items[id] && b.owner !== id).map(b => b.owner ? w.notes[b.owner]?.title || '名前なし' : b.name);
}

export function mount(el, ctx) {
  const quick = quickInput(ctx);
  state.sel = new Set();
  const qIn = h('input', { type: 'search', class: 'list-q', value: state.q, placeholder: 'この一覧を絞る', 'aria-label': 'この一覧を絞る', autocomplete: 'off' });
  qIn.addEventListener('input', () => { state.q = qIn.value; render(); });
  const bar = h('div', { class: 'bar' }), list = h('div', { class: 'scroll' }), foot = h('div');
  el.append(h('div', { class: 'quick-row' }, quick), bar, list, foot);
  const render = () => {
    const w = ctx.world, q = state.q.trim().toLowerCase();
    const all = Object.values(w.notes).filter(n => kindOf(n) === 'note');
    const tags = [...new Set(all.flatMap(n => n.tags))].sort(collator.compare);
    for (const t of [...state.tags]) if (!tags.includes(t)) state.tags.delete(t);
    bar.replaceChildren(...[
      h('h2', {}, '付箋'),
      h('span', { class: 'note-text' }, `${all.length}枚`),
      qIn,
      h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: state.loose, onchange: e => { state.loose = e.target.checked; render(); } }), 'どこにも貼っていない'),
      h('span', { class: 'sp' }),
      h('select', { 'aria-label': '並べ方', onchange: e => { state.sort = e.target.value; render(); } }, ...Object.entries(SORTS).map(([k, v]) => h('option', { value: k, selected: k === state.sort }, v))),
      tags.length ? h('div', { class: 'row tagbar', role: 'group', 'aria-label': 'タグで絞る' },
        ...tags.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.tags.has(t)), onclick: () => { state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t); render(); } }, t))) : null,
    ].filter(Boolean));
    for (const id of [...state.sel]) if (!w.notes[id]) state.sel.delete(id);
    foot.replaceChildren(...(state.sel.size ? [bulkBar(ctx, [...state.sel], () => { state.sel.clear(); render(); })] : []));
    const keep = list.scrollTop;
    let notes = all.filter(n =>
      (!state.tags.size || [...state.tags].every(t => n.tags.includes(t))) &&
      (!state.loose || !placesOf(w, n.id).length) &&
      (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)) || Object.values(n.fields).some(v => String(v).toLowerCase().includes(q))));
    if (state.sort === 'recent') notes.reverse(); else notes.sort(byTitle);
    const order = notes.map(n => n.id);
    const card = n => {
      const places = placesOf(w, n.id);
      return h('div', { class: `cwrap${state.sel.has(n.id) ? ' on' : ''}${state.sel.size ? ' selecting' : ''}` }, selBox(state, n.id, order, render),
        h('button', { type: 'button', class: `ncard p-${n.color ?? 0}`, 'data-id': n.id, 'aria-current': String(ctx.openedNote() === n.id), onclick: () => ctx.openNote(n.id) },
          h('span', { class: 'ncard-t' }, n.title || '（名前なし）'),
          n.tags.length ? h('span', { class: 'ncard-tags' }, n.tags.join('・')) : null,
          n.body ? h('span', { class: 'ncard-b' }, n.body.replace(/!\[[^\]]*\]\([^)]*\)/g, '［画像］').replace(/[#*>\-[\]]/g, '').slice(0, 90)) : null,
          places.length ? h('span', { class: 'ncard-where' }, '📌 ' + places.join('・')) : null));
    };
    if (!notes.length) { list.replaceChildren(h('p', { class: 'note-text' }, q || state.tags.size || state.loose ? '当てはまる付箋がありません' : 'まだ付箋がありません。上の欄に思いついたことを書いて Enter で1枚できます')); return; }
    if (state.sort === 'tag') {
      const groups = new Map();
      for (const n of notes) for (const t of (n.tags.length ? n.tags : ['（タグなし）'])) { if (!groups.has(t)) groups.set(t, []); groups.get(t).push(n); }
      list.replaceChildren(...[...groups.keys()].sort(collator.compare).map(t => h('section', { class: 'ngroup' }, h('h3', {}, t, h('span', { class: 'note-text' }, ` ${groups.get(t).length}`)), h('div', { class: 'ngrid' }, ...groups.get(t).map(card)))));
      list.scrollTop = keep;
      return;
    }
    list.replaceChildren(h('div', { class: 'ngrid' }, ...notes.map(card)));
    list.scrollTop = keep;
  };
  render();
  return { update: render };
}
