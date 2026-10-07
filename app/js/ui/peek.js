// 右の小窓：カードを真ん中の画面の上に重ねて開く。上に道すじ（シナリオ › 店主 › 星の智慧派）。
// 「‹」で1つ戻る、道すじを押すとそこへ、「×」で全部閉じる。8つまで重ねる（9つ目で一番下を外す）
import { h } from '../util.js';
import { KINDS, kindOf, isElement } from '../model.js';
import { createEditor } from './noteEditor.js';

const MAX = 8, WIDE = 'trpg-wide-panel';

export function createPeek(ctx) {
  const panel = document.getElementById('panel');
  const head = h('div', { class: 'peek-head' }), body = h('div', { class: 'peek-body' });
  panel.replaceChildren(head, body);
  const ed = createEditor(ctx, body, { layout: 'peek' });
  let stack = [];
  let wide = (() => { try { return localStorage.getItem(WIDE) === '1'; } catch { return false; } })();
  const top = () => stack.at(-1) || null;
  const applyWide = () => document.getElementById('app')?.classList.toggle('wide-panel', wide && !panel.hidden);

  function renderHead() {
    const w = ctx.world, t = top(), n = w.notes[t.id];
    // 道すじ：長いときは最初と最後の3つ（間は「…」）
    const idx = stack.length > 4 ? [0, -1, stack.length - 3, stack.length - 2, stack.length - 1] : stack.map((_, i) => i);
    const crumbs = idx.flatMap((i, j) => {
      const sep = j ? [h('span', { class: 'sep', 'aria-hidden': 'true' }, '›')] : [];
      if (i === -1) return [...sep, h('span', { class: 'note-text' }, '…')];
      const x = w.notes[stack[i].id];
      return [...sep, i === stack.length - 1 ? h('b', { class: 'crumb-cur' }, x?.title || '（名前なし）') : h('button', { type: 'button', class: 'linkish', onclick: () => to(i) }, x?.title || '（名前なし）')];
    });
    head.replaceChildren(...[
      stack.length > 1 ? h('button', { type: 'button', class: 'btn icon', title: '1つ戻る', 'aria-label': '1つ戻る', onclick: back }, '‹') : null,
      h('nav', { class: 'crumbs peek-crumbs', 'aria-label': '重ねて開いたもの' }, ...crumbs),
      h('span', { class: 'sp' }),
      isElement(n) ? h('button', { type: 'button', class: 'btn small', title: `${KINDS[kindOf(n)].label}のページで開く`, onclick: () => { const id = t.id; close(); ctx.openElement(id); } }, 'ページで開く') : null,
      h('button', { type: 'button', class: 'btn small wide-only', title: wide ? '元の大きさに戻す' : '小窓を大きくする（真ん中の画面を隠す）', 'aria-pressed': String(wide), onclick: () => { wide = !wide; try { localStorage.setItem(WIDE, wide ? '1' : '0'); } catch { /* なし */ } applyWide(); renderHead(); } }, wide ? '戻す' : '大きく'),
      h('button', { type: 'button', class: 'btn icon', title: '閉じる', 'aria-label': '閉じる', onclick: close }, '×')].filter(Boolean));
  }
  function show(opts) {
    if (!stack.length) { close(); return; }
    panel.hidden = false;
    renderHead();
    ed.open(top().id, opts);
    applyWide();
  }
  // push：いま開いているものの上に重ねる（なければ新しく開く）
  function open(id, opts = {}) {
    if (!ctx.world.notes[id]) return;
    if (opts.push && stack.length) { if (top().id !== id) stack.push({ id }); if (stack.length > MAX) stack.shift(); }
    else stack = [{ id }];
    ctx.noteRecent(id);
    show(opts);
  }
  function back() { stack.pop(); show(); }
  function to(i) { stack = stack.slice(0, i + 1); show(); }
  function close() { stack = []; ed.close(); panel.hidden = true; head.replaceChildren(); applyWide(); }
  function update(e) {
    if (!stack.length) return;
    const before = top().id;
    stack = stack.filter(x => ctx.world.notes[x.id]);
    if (!stack.length) { close(); return; }
    if (top().id !== before) { show(); return; }
    renderHead(); ed.update(e);
  }
  return { open, close, update, back, current: () => top()?.id || null, depth: () => stack.length };
}
