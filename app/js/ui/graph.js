// グラフ：すべての付箋とつながりを網の目で見渡す（つながり・家族・まとめの親子・本文のリンク）。
// arg.only（例：'group'）なら、その種類だけの相関図（つながりのラベルつき。集団タブの「相関図」）
import { h, esc } from '../util.js';
import { findByTitle, kindOf } from '../model.js';
import { linkTitles } from './markdown.js';
import { forceLayout } from './graphLayout.js';
import { panZoom } from './panzoom.js';

const show = { links: true, family: true, parents: true, body: true, lonely: false };
let focusId = null;

export function mount(el, ctx, arg) {
  if (arg?.focus) focusId = arg.focus;
  const only = arg?.only || null;
  const bar = h('div', { class: 'bar' }), stage = h('div', { class: 'graph-stage', 'aria-label': 'グラフ' }), layer = h('div', { class: 'graph-layer' });
  stage.append(layer);
  el.append(bar, stage);
  const pz = panZoom(stage, layer, { onClick: el => { focusId = el.dataset.click; ctx.openNote(focusId); draw(); } });
  let pos = {}, key = '', first = true, data = null;

  function edgesOf(w) {
    const out = [];
    if (only) {
      const ok = id => kindOf(w.notes[id]) === only;
      for (const l of Object.values(w.links)) if (ok(l.a) && ok(l.b)) out.push({ a: l.a, b: l.b, kind: l.kind === 'order' ? 'link' : l.kind, label: l.label });
      for (const n of Object.values(w.notes)) if (ok(n.id)) for (const p of n.parents) if (ok(p)) out.push({ a: p, b: n.id, kind: 'group', label: '上部組織' });
      return out;
    }
    for (const l of Object.values(w.links)) {
      if ((l.kind === 'link' || l.kind === 'order') && !show.links) continue;
      if ((l.kind === 'parent' || l.kind === 'spouse') && !show.family) continue;
      out.push({ a: l.a, b: l.b, kind: l.kind, label: l.label });
    }
    if (show.parents) for (const n of Object.values(w.notes)) for (const p of n.parents) if (w.notes[p]) out.push({ a: p, b: n.id, kind: 'group' });
    if (show.body) for (const n of Object.values(w.notes)) for (const t of linkTitles(n.body)) { const o = findByTitle(w, t); if (o && o.id !== n.id) out.push({ a: n.id, b: o.id, kind: 'body' }); }
    return out;
  }
  function compute() {
    const w = ctx.world, q = ctx.query().toLowerCase();
    const edges = edgesOf(w);
    const deg = {};
    for (const e of edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
    let ids = Object.keys(w.notes).filter(id => only ? kindOf(w.notes[id]) === only : show.lonely || deg[id]);
    if (q) ids = ids.filter(id => { const n = w.notes[id]; return n.title.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q)); });
    ids.sort();
    const set = new Set(ids), es = edges.filter(e => set.has(e.a) && set.has(e.b));
    const k = JSON.stringify([ids, es.map(e => e.a + e.b)]);
    if (k !== key) { pos = forceLayout(ids, es, { iterations: ids.length > 600 ? 120 : 300 }); key = k; first = true; }
    data = { ids, es, deg };
  }
  function draw() {
    const w = ctx.world, { ids, es, deg } = data;
    const near = new Set(focusId ? [focusId, ...es.filter(e => e.a === focusId || e.b === focusId).flatMap(e => [e.a, e.b])] : []);
    const dim = id => focusId && !near.has(id);
    if (!ids.length) { layer.replaceChildren(h('div', { class: 'fam-empty' }, only ? 'まだ集団がありません' : 'つながりのある付箋がまだありません（「つながりのない付箋も出す」で全部出せます）')); pz.fit(0, 0, 400, 100); return; }
    const xs = ids.map(id => pos[id].x), ys = ids.map(id => pos[id].y), x0 = Math.min(...xs) - 60, y0 = Math.min(...ys) - 40;
    const X = id => pos[id].x - x0, Y = id => pos[id].y - y0;
    const CLS = { link: 'g-link', order: 'g-link', parent: 'g-fam', spouse: 'g-fam', group: 'g-group', body: 'g-body' };
    let svg = '';
    for (const e of es) svg += `<line x1="${X(e.a)}" y1="${Y(e.a)}" x2="${X(e.b)}" y2="${Y(e.b)}" class="${CLS[e.kind] || 'g-link'}${dim(e.a) || dim(e.b) ? ' dim' : ''}"/>`;
    if (only) for (const e of es) if (e.label) svg += `<text class="g-elabel" x="${(X(e.a) + X(e.b)) / 2}" y="${(Y(e.a) + Y(e.b)) / 2 - 4}" text-anchor="middle">${esc(e.label)}</text>`;
    for (const id of ids) {
      const n = w.notes[id], r = 5 + Math.min(14, Math.sqrt(deg[id] || 0) * 3);
      svg += `<g class="g-node${dim(id) ? ' dim' : ''}${id === focusId ? ' focus' : ''}" data-click="${id}"><circle cx="${X(id)}" cy="${Y(id)}" r="${r}" class="g-c c${n.color ?? 0}"/><text x="${X(id)}" y="${Y(id) + r + 13}" text-anchor="middle">${esc(n.title || '名前なし')}</text></g>`;
    }
    const W = Math.max(...xs) - x0 + 60, H = Math.max(...ys) - y0 + 60;
    layer.innerHTML = `<svg width="${W}" height="${H}">${svg}</svg>`;
    if (first) { pz.fit(0, 0, W, H, 1.5); first = false; if (focusId && pos[focusId]) pz.center(X(focusId), Y(focusId)); }
  }
  function renderBar() {
    if (only) { bar.replaceChildren(h('h2', {}, '相関図'), h('span', { class: 'note-text' }, '集団どうしのつながり（同盟・敵対などは、つながりのラベル）'), h('span', { class: 'sp' }), h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { first = true; draw(); } }, '⤢')); return; }
    const opt = (k, label) => h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: show[k], onchange: e => { show[k] = e.target.checked; render(); } }), label);
    bar.replaceChildren(...[h('h2', {}, 'グラフ'), opt('links', 'つながり'), opt('family', '家族'), opt('parents', 'まとめ'), opt('body', '本文のリンク'), opt('lonely', 'つながりのない付箋も出す'),
      h('span', { class: 'sp' }), focusId ? h('button', { type: 'button', class: 'btn small', onclick: () => { focusId = null; draw(); renderBar(); } }, '強調を消す') : null,
      h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { first = true; draw(); } }, '⤢')].filter(Boolean));
  }
  const render = () => { renderBar(); compute(); draw(); };
  render();
  return { update: () => render() };
}
