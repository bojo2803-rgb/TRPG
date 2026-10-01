// 付箋を選ぶ：名前で探して選ぶ。ない名前なら、その名前で新しい付箋を作れる
import { h, byTitle, collator } from '../util.js';
import { openDialog, closeDialog } from './dialog.js';
import { newNote } from '../model.js';

// onPick(id) を呼ぶ。exclude：選べない付箋の id
export function pickNote(ctx, { title = '付箋を選ぶ', exclude = [], allowNew = true, onPick }) {
  const w = ctx.world, ex = new Set(exclude);
  const input = h('input', { type: 'search', placeholder: '名前やタグで探す', 'aria-label': '探す', autocomplete: 'off' });
  const list = h('div', { class: 'pick-list', role: 'listbox' });
  const choose = id => { closeDialog(); onPick(id); };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const hits = Object.values(w.notes).filter(n => !ex.has(n.id) && (!q || n.title.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)))).sort(byTitle).slice(0, 60);
    const exact = q && Object.values(w.notes).some(n => n.title.toLowerCase() === q);
    list.replaceChildren(
      ...(allowNew && q && !exact ? [h('button', { type: 'button', class: 'pick-new', onclick: () => {
        const n = newNote({ title: input.value.trim() });
        ctx.commit(w => { w.notes[n.id] = n; }, '付箋を追加');
        choose(n.id);
      } }, `＋「${input.value.trim()}」を新しく作る`)] : []),
      ...hits.map(n => h('button', { type: 'button', role: 'option', onclick: () => choose(n.id) },
        h('span', { class: `sw p-${n.color ?? 0}` }), h('span', { class: 'pick-t' }, n.title || '（名前なし）'),
        n.tags.length ? h('span', { class: 'pick-tags' }, n.tags.join('・')) : null)),
      ...(hits.length ? [] : [h('p', { class: 'note-text' }, q ? '見つかりません' : '付箋がまだありません')]),
    );
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); } });
  render();
  openDialog({ title, body: h('div', { class: 'fields' }, input, list) });
}
export const sortedTags = tags => [...tags].sort(collator.compare);
