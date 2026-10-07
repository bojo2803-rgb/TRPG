// 上の検索欄：どの画面からでも、世界のすべてのカードを探す。打つと下に候補（種類・名前・見分ける手がかり）。
// ↑↓で選び Enter で開く（人物などはページ、付箋・出来事は小窓）。Esc で閉じる。何も打っていなければ最近開いたもの
import { h } from '../util.js';
import { KINDS } from '../model.js';
import { searchAll } from '../search.js';

export function initSearch(ctx) {
  const input = document.getElementById('search');
  input.placeholder = '探す（人物・場所・シナリオ…）';
  input.title = 'どこからでも探す（Ctrl+K）';
  input.setAttribute('aria-label', '探す');
  input.setAttribute('aria-controls', 'searchList');
  const box = h('div', { class: 'sr', id: 'searchList', role: 'listbox', 'aria-label': '探した結果', hidden: true });
  document.body.append(box);
  let items = [], sel = 0;
  const close = () => { box.hidden = true; };
  const run = it => { if (!it) return; close(); input.value = ''; input.blur(); if (it.kind === 'note') ctx.openNote(it.id); else ctx.openElement(it.id); };
  const draw = () => {
    const q = input.value.trim();
    box.replaceChildren(...[
      q ? null : h('div', { class: 'sr-h' }, '最近開いたもの'),
      ...items.map((it, i) => h('button', { type: 'button', role: 'option', 'aria-selected': String(i === sel), onmousedown: e => { e.preventDefault(); run(it); } },
        h('span', { class: `kind-badge k-${it.kind}` }, KINDS[it.kind].label),
        h('span', { class: 'sr-t' }, it.title || '（名前なし）'),
        it.inScope ? h('span', { class: 'scope-mark' }, 'このシナリオ') : null,
        it.hint ? h('span', { class: 'sr-hint' }, it.hint) : null)),
      items.length ? null : h('p', { class: 'note-text' }, q ? '見つかりません' : 'まだ何も開いていません。名前を打つと探せます')].filter(Boolean));
    const r = input.getBoundingClientRect();
    Object.assign(box.style, { left: Math.max(8, Math.min(r.left, innerWidth - 448)) + 'px', top: r.bottom + 4 + 'px' });
    box.hidden = false;
  };
  const refresh = () => { items = searchAll(ctx.world, input.value, { recent: ctx.recent(), scope: ctx.scope(), limit: 30 }); sel = Math.min(sel, Math.max(0, items.length - 1)); draw(); };
  input.addEventListener('focus', refresh);
  input.addEventListener('input', () => { sel = 0; refresh(); });
  input.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return; // 日本語の変換中の Enter は確定
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); } }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); input.blur(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  addEventListener('resize', close);
}
