// メモで [[ と打つと、名前の候補を出す（すべての種類から。いま開いているシナリオに出るものが先）。
// ない名前なら「人物として作る」など。↑↓で選び、Enter か Tab で入れる。Esc で閉じる
import { h } from '../util.js';
import { searchAll, linkQuery } from '../search.js';
import { KINDS, newNote } from '../model.js';

const CREATE = ['person', 'place', 'item', 'group', 'note'];

export function linkSuggest(ctx, ta, { exclude = null, onChange } = {}) {
  const box = h('div', { class: 'lsug', role: 'listbox', 'aria-label': 'リンクの候補', hidden: true });
  const wrap = h('div', { class: 'lsug-wrap' }, ta, box);
  let items = [], sel = 0, q = null;
  const close = () => { box.hidden = true; items = []; q = null; };
  const insert = title => { const end = ta.selectionStart; ta.setRangeText(`[[${title}]]`, q.start, end, 'end'); close(); ta.focus(); onChange?.(); };
  const draw = () => box.replaceChildren(...items.map((it, i) => h('button', { type: 'button', role: 'option', 'aria-selected': String(i === sel), class: it.create ? 'pick-new' : '', onmousedown: e => { e.preventDefault(); it.run(); } },
    it.kind ? h('span', { class: `kind-badge k-${it.kind}` }, KINDS[it.kind].label) : null, h('span', { class: 'pick-t' }, it.label),
    it.inScope ? h('span', { class: 'scope-mark' }, 'このシナリオ') : null, it.hint ? h('span', { class: 'pick-tags' }, it.hint) : null)));
  const refresh = () => {
    q = linkQuery(ta.value, ta.selectionStart);
    if (!q) { close(); return; }
    const w = ctx.world, t = q.q.trim();
    const hits = searchAll(w, t, { recent: ctx.recent(), scope: ctx.scope(), limit: 8 }).filter(x => x.id !== exclude);
    const exact = t && Object.values(w.notes).some(n => n.title === t);
    items = [
      ...hits.map(x => ({ label: x.title || '（名前なし）', kind: x.kind, hint: x.hint, inScope: x.inScope, run: () => insert(x.title) })),
      ...(t && !exact ? CREATE.map(k => ({ label: `「${t}」を${KINDS[k].label}として作る`, create: true, run: () => {
        const n = newNote({ kind: k, title: t });
        ctx.commit(w => { w.notes[n.id] = n; }, `${KINDS[k].label}を追加`);
        insert(t); ctx.created([n.id]);
      } })) : []),
    ];
    if (!items.length) { close(); return; }
    sel = Math.min(sel, items.length - 1);
    draw(); box.hidden = false;
  };
  ta.addEventListener('input', () => { sel = 0; refresh(); });
  ta.addEventListener('click', refresh);
  ta.addEventListener('keydown', e => {
    if (box.hidden || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); items[sel]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
  return wrap;
}
