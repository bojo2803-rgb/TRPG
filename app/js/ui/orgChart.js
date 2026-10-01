// 組織図：集団を上部組織から下部組織へ木の形に並べ、各集団の下にいまのメンバー（役職）を出す。
// 上部組織が2つ以上ある集団は、最初の上部組織の下に置き、ほかの上部組織からは点線
import { h, esc, byTitle } from '../util.js';
import { kindOf } from '../model.js';
import { linksOfKind } from './elements.js';
import { panZoom } from './panzoom.js';

const W = 190, GAP = 24, VGAP = 56, LINE = 18, MAXM = 8;

export function layoutOrg(groups, members) {
  const ids = new Set(groups.map(g => g.id));
  const ups = g => g.parents.filter(p => ids.has(p));
  const kids = new Map(groups.map(g => [g.id, []]));
  for (const g of groups) { const p = ups(g)[0]; if (p) kids.get(p).push(g.id); }
  const height = id => 30 + LINE * Math.min(members(id).length, MAXM) + (members(id).length > MAXM ? LINE : 0);
  const depth = {}, width = {}, seen = new Set(), order = [];
  const walk = (id, d) => {
    seen.add(id); depth[id] = d; order.push(id);
    const ks = kids.get(id).filter(k => !seen.has(k));
    for (const k of ks) walk(k, d + 1);
    width[id] = Math.max(W, ks.reduce((s, k) => s + width[k], 0) + GAP * Math.max(0, ks.length - 1));
    kids.set(id, ks);
  };
  const roots = groups.filter(g => !ups(g).length).map(g => g.id);
  for (const r of roots) if (!seen.has(r)) walk(r, 0);
  for (const g of groups) if (!seen.has(g.id)) walk(g.id, 0); // 上下が輪になっている集団
  const rowH = [];
  for (const id of order) rowH[depth[id]] = Math.max(rowH[depth[id]] || 0, height(id));
  const top = d => rowH.slice(0, d).reduce((s, x) => s + x + VGAP, 0);
  const pos = {};
  const place = (id, x) => {
    pos[id] = { x: x + (width[id] - W) / 2, y: top(depth[id]), h: height(id) };
    let cx = x + (width[id] - (kids.get(id).reduce((s, k) => s + width[k], 0) + GAP * Math.max(0, kids.get(id).length - 1))) / 2;
    for (const k of kids.get(id)) { place(k, cx); cx += width[k] + GAP; }
  };
  let x = 0;
  for (const id of order) if (depth[id] === 0) { place(id, x); x += width[id] + GAP * 2; }
  return { pos, kids, extra: groups.flatMap(g => ups(g).slice(1).map(p => [p, g.id])) };
}

export function mount(el, ctx) {
  const bar = h('div', { class: 'bar' }, h('h2', {}, '組織図'), h('span', { class: 'note-text' }, '集団の画面の「上部組織・下部組織」と「メンバー」から並べます'), h('span', { class: 'sp' }));
  const stage = h('div', { class: 'fam-stage', 'aria-label': '組織図' }), layer = h('div', { class: 'fam-layer' });
  stage.append(layer);
  el.append(bar, stage);
  const pz = panZoom(stage, layer, { onClick: el => ctx.openNote(el.dataset.click) });
  let first = true;
  bar.append(h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { first = true; render(); } }, '⤢'));
  function render() {
    const w = ctx.world, groups = Object.values(w.notes).filter(n => kindOf(n) === 'group').sort(byTitle);
    if (!groups.length) { layer.replaceChildren(h('div', { class: 'fam-empty' }, 'まだ集団がありません。「一覧」で名前を入れて作れます。')); pz.fit(0, 0, 400, 100); return; }
    const members = id => linksOfKind(w, 'member', 'b', id).filter(l => !l.to && !l.done).sort((a, b) => (a.label ? 0 : 1) - (b.label ? 0 : 1));
    const { pos, kids, extra } = layoutOrg(groups, members);
    let svg = '';
    const bottom = id => [pos[id].x + W / 2, pos[id].y + pos[id].h], topC = id => [pos[id].x + W / 2, pos[id].y];
    for (const [p, ks] of kids) for (const k of ks) { const [x1, y1] = bottom(p), [x2, y2] = topC(k), my = y1 + VGAP / 2; svg += `<path class="org-l" d="M${x1},${y1} V${my} H${x2} V${y2}"/>`; }
    for (const [p, k] of extra) { const [x1, y1] = bottom(p), [x2, y2] = topC(k); svg += `<path class="org-l extra" d="M${x1},${y1} L${x2},${y2}"/>`; }
    const maxX = Math.max(...Object.values(pos).map(p => p.x + W)), maxY = Math.max(...Object.values(pos).map(p => p.y + p.h));
    layer.replaceChildren(
      h('div', { class: 'fam-lines', html: `<svg width="${maxX + 20}" height="${maxY + 20}">${svg}</svg>` }),
      ...groups.map(g => {
        const ms = members(g.id);
        return h('div', { class: `org-node p-${g.color ?? 0}`, 'data-click': g.id, role: 'button', tabindex: '0', style: { left: pos[g.id].x + 'px', top: pos[g.id].y + 'px', width: W + 'px', height: pos[g.id].h + 'px' } },
          h('b', {}, g.title || '名前なし'),
          ...ms.slice(0, MAXM).map(l => h('span', {}, `${l.label ? l.label + '：' : ''}${w.notes[l.a].title}`)),
          ms.length > MAXM ? h('span', { class: 'note-text' }, `ほか${ms.length - MAXM}人`) : null);
      }));
    if (first) { pz.fit(-30, -30, maxX + 30, maxY + 30); first = false; }
  }
  render();
  return { update: e => { if (e?.type !== 'search') render(); } };
}
export { esc };
