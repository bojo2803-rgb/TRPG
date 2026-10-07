// カードを選ぶ：名前で探して選ぶ。ない名前なら、その名前で新しく作れる（作ったら知らせる）
import { h, byTitle, collator } from '../util.js';
import { openDialog, closeDialog } from './dialog.js';
import { newNote, KINDS, kindOf } from '../model.js';

// onPick(id) を呼ぶ。exclude：選べないカードの id。kinds：選べる種類（なければ全部）。newKind：新しく作るときの種類。filter：さらに絞る
export function pickNote(ctx, { title = '選ぶ', exclude = [], allowNew = true, kinds = null, newKind = 'note', filter = () => true, onPick }) {
  const w = ctx.world, ex = new Set(exclude);
  const input = h('input', { type: 'search', placeholder: '名前やタグで探す', 'aria-label': '探す', autocomplete: 'off' });
  const list = h('div', { class: 'pick-list', role: 'listbox' });
  const choose = id => { closeDialog(); onPick(id); };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const hits = Object.values(w.notes).filter(n => !ex.has(n.id) && (!kinds || kinds.includes(kindOf(n))) && filter(n) && (!q || n.title.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)))).sort(byTitle).slice(0, 60);
    const exact = q && Object.values(w.notes).some(n => n.title.toLowerCase() === q);
    // 見つかったものが先、「新しく作る」は最後（Enter は一番上を選ぶので、ある名前を打ったら作り直さない）
    list.replaceChildren(
      ...hits.map(n => h('button', { type: 'button', role: 'option', onclick: () => choose(n.id) },
        h('span', { class: `sw p-${n.color ?? 0}` }), h('span', { class: 'pick-t' }, n.title || '（名前なし）'),
        h('span', { class: 'pick-tags' }, [kindOf(n) === 'note' ? '' : KINDS[kindOf(n)].label, ...n.tags].filter(Boolean).join('・')))),
      ...(allowNew && q && !exact ? [h('button', { type: 'button', class: 'pick-new', onclick: () => {
        const n = newNote({ kind: newKind, title: input.value.trim() });
        ctx.commit(w => { w.notes[n.id] = n; }, `${KINDS[newKind].label}を追加`);
        choose(n.id);
        ctx.created([n.id]);
      } }, `＋「${input.value.trim()}」を新しく作る（${KINDS[newKind].label}）`)] : []),
      ...(hits.length ? [] : [h('p', { class: 'note-text' }, q ? '見つかりません' : 'まだありません')]),
    );
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); } });
  render();
  openDialog({ title, body: h('div', { class: 'fields' }, input, list) });
}
export const sortedTags = tags => [...tags].sort(collator.compare);
