// 付箋の一覧：探す・タグで絞る・並べ替える。クリックで開く
import { h, byTitle, collator } from '../util.js';
import { allTags } from '../model.js';

const SORTS = { title: '名前順', tag: 'タグごと', recent: '作った順' };
let state = { tags: new Set(), sort: 'title' };

export function mount(el, ctx) {
  const bar = h('div', { class: 'bar' }), list = h('div', { class: 'scroll' });
  el.append(bar, list);
  const render = () => {
    const w = ctx.world, q = ctx.query().toLowerCase();
    const tags = allTags(w);
    for (const t of [...state.tags]) if (!tags.includes(t)) state.tags.delete(t);
    bar.replaceChildren(
      h('h2', {}, '付箋'),
      h('span', { class: 'note-text' }, `${Object.keys(w.notes).length}枚`),
      h('span', { class: 'sp' }),
      h('select', { 'aria-label': '並べ方', onchange: e => { state.sort = e.target.value; render(); } }, ...Object.entries(SORTS).map(([k, v]) => h('option', { value: k, selected: k === state.sort }, v))),
      h('button', { type: 'button', class: 'btn', onclick: () => ctx.newNote() }, '＋ 付箋'),
      h('div', { class: 'row tagbar', role: 'group', 'aria-label': 'タグで絞る' },
        ...tags.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.tags.has(t)), onclick: () => { state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t); render(); } }, t))),
    );
    let notes = Object.values(w.notes).filter(n =>
      (!state.tags.size || [...state.tags].every(t => n.tags.includes(t))) &&
      (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)) || Object.values(n.fields).some(v => String(v).toLowerCase().includes(q))));
    const card = n => h('button', { type: 'button', class: `ncard p-${n.color ?? 0}`, 'data-id': n.id, 'aria-current': String(ctx.openedNote() === n.id), onclick: () => ctx.openNote(n.id) },
      h('span', { class: 'ncard-t' }, n.title || '（名前なし）'),
      n.tags.length ? h('span', { class: 'ncard-tags' }, n.tags.join('・')) : null,
      n.body ? h('span', { class: 'ncard-b' }, n.body.replace(/!\[[^\]]*\]\([^)]*\)/g, '［画像］').replace(/[#*>\-[\]]/g, '').slice(0, 90)) : null);
    if (!notes.length) { list.replaceChildren(h('p', { class: 'note-text' }, q || state.tags.size ? '当てはまる付箋がありません' : 'まだ付箋がありません。「＋ 付箋」（キーボードの N）で作れます')); return; }
    if (state.sort === 'tag') {
      const groups = new Map();
      for (const n of notes.sort(byTitle)) for (const t of (n.tags.length ? n.tags : ['（タグなし）'])) { if (!groups.has(t)) groups.set(t, []); groups.get(t).push(n); }
      list.replaceChildren(...[...groups.keys()].sort(collator.compare).map(t => h('section', { class: 'ngroup' }, h('h3', {}, t, h('span', { class: 'note-text' }, ` ${groups.get(t).length}`)), h('div', { class: 'ngrid' }, ...groups.get(t).map(card)))));
      return;
    }
    notes = state.sort === 'recent' ? notes.reverse() : notes.sort(byTitle);
    list.replaceChildren(h('div', { class: 'ngrid' }, ...notes.map(card)));
  };
  render();
  return { update: render };
}
