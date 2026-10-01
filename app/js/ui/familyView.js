// 家系図：付箋の「家族」（親子・夫婦）のつながりから、自動で家系図の形に並べる。位置を手で直す必要はない
import { h, esc, byTitle } from '../util.js';
import { newLink } from '../model.js';
import { layoutFamily, NODE_W, NODE_H, ROW } from './familyLayout.js';
import { panZoom } from './panzoom.js';
import { pickNote } from './picker.js';

let focusId = '';

export function mount(el, ctx, arg) {
  if (arg?.focus) focusId = arg.focus;
  const bar = h('div', { class: 'bar' }), stage = h('div', { class: 'fam-stage', 'aria-label': '家系図' }), layer = h('div', { class: 'fam-layer' });
  stage.append(layer);
  el.append(bar, stage);
  const pz = panZoom(stage, layer, { onClick: el => ctx.openNote(el.dataset.click) });
  let first = true;

  function people() {
    const w = ctx.world, L = Object.values(w.links).filter(l => l.kind === 'parent' || l.kind === 'spouse');
    const ids = new Set(L.flatMap(l => [l.a, l.b]).filter(id => w.notes[id]));
    return { ids, L };
  }
  function render() {
    const w = ctx.world, { ids, L } = people();
    if (focusId && !ids.has(focusId)) focusId = '';
    const all = [...ids].map(id => w.notes[id]).sort(byTitle);
    bar.replaceChildren(...[
      h('h2', {}, '家系図'),
      h('select', { 'aria-label': '見る人物', onchange: e => { focusId = e.target.value; first = true; render(); } },
        h('option', { value: '' }, `全員（${all.length}人）`), ...all.map(n => h('option', { value: n.id, selected: n.id === focusId }, `${n.title || '名前なし'}の家族`))),
      h('span', { class: 'sp' }),
      h('span', { class: 'note-text' }, '付箋の「家族」で親子・夫婦をつなぐと、ここに並びます'),
      h('button', { type: 'button', class: 'btn', onclick: () => addRelation() }, '＋ 家族をつなぐ'),
      h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { first = true; render(); } }, '⤢'),
    ]);
    // 見る範囲：選んだ人物とつながっている人（親子・夫婦をたどる）
    let show = [...ids];
    if (focusId) {
      const seen = new Set([focusId]), st = [focusId];
      while (st.length) { const x = st.pop(); for (const l of L) { const o = l.a === x ? l.b : l.b === x ? l.a : null; if (o && ids.has(o) && !seen.has(o)) { seen.add(o); st.push(o); } } }
      show = [...seen];
    }
    show.sort((a, b) => byTitle(w.notes[a], w.notes[b]));
    const parents = L.filter(l => l.kind === 'parent'), spouses = L.filter(l => l.kind === 'spouse');
    const { pos } = layoutFamily(show, parents, spouses);
    if (!show.length) {
      layer.replaceChildren(h('div', { class: 'fam-empty' }, 'まだ家族のつながりがありません。人物の付箋を開いて「家族」の＋で親・子・配偶者をつなぐか、「＋ 家族をつなぐ」を押してください。'));
      pz.fit(0, 0, 400, 100); return;
    }
    // 線：夫婦は横の二重線。子へは、親（夫婦なら2人の真ん中）から下ろして横に渡す
    let svg = '';
    const c = id => ({ x: pos[id].x + NODE_W / 2, y: pos[id].y + NODE_H / 2 });
    for (const l of spouses) if (pos[l.a] && pos[l.b]) { const a = c(l.a), b = c(l.b); svg += `<line x1="${a.x}" y1="${a.y - 3}" x2="${b.x}" y2="${b.y - 3}" class="fam-sp"/><line x1="${a.x}" y1="${a.y + 3}" x2="${b.x}" y2="${b.y + 3}" class="fam-sp"/>`; }
    const groups = new Map();
    for (const kid of show) {
      const ps = parents.filter(l => l.b === kid && pos[l.a]).map(l => l.a).sort();
      if (!ps.length) continue;
      const key = ps.join('+');
      if (!groups.has(key)) groups.set(key, { ps, kids: [] });
      groups.get(key).kids.push(kid);
    }
    for (const { ps, kids } of groups.values()) {
      const top = ps.reduce((s, p) => s + c(p).x, 0) / ps.length, py = Math.max(...ps.map(p => pos[p].y)) + (ps.length > 1 ? NODE_H / 2 : NODE_H);
      const ky = Math.min(...kids.map(k => pos[k].y)), bus = ky - (ROW - NODE_H) / 2;
      const xs = kids.map(k => c(k).x);
      svg += `<path class="fam-pc" d="M${top},${py} V${bus} M${Math.min(top, ...xs)},${bus} H${Math.max(top, ...xs)} ${kids.map(k => `M${c(k).x},${bus} V${pos[k].y}`).join(' ')}"/>`;
    }
    const maxX = Math.max(...show.map(id => pos[id].x)) + NODE_W, maxY = Math.max(...show.map(id => pos[id].y)) + NODE_H;
    layer.replaceChildren(
      h('div', { class: 'fam-lines', html: `<svg width="${maxX + 20}" height="${maxY + 20}">${svg}</svg>` }),
      ...show.map(id => { const n = w.notes[id]; return h('div', { class: `fam-node p-${n.color ?? 0}${id === focusId ? ' focus' : ''}`, 'data-click': id, style: { left: pos[id].x + 'px', top: pos[id].y + 'px', width: NODE_W + 'px', height: NODE_H + 'px' }, role: 'button', tabindex: '0' },
        h('b', {}, n.title || '名前なし'), h('span', {}, [n.fields?.['生年月日'], n.fields?.['職業']].filter(Boolean).join('・'))); }));
    if (first) { pz.fit(-30, -30, maxX + 30, maxY + 30); first = false; }
  }
  function addRelation() {
    pickNote(ctx, { title: '1人目', onPick: a => {
      ctx.openDialog({
        title: 'どんなつながり？', ok: '次へ',
        body: `<p>${esc(ctx.world.notes[a].title)} は…</p><label class="cb"><input type="radio" name="rel" value="parent" checked> 親（次に選ぶ人の親）</label><label class="cb"><input type="radio" name="rel" value="child"> 子（次に選ぶ人の子）</label><label class="cb"><input type="radio" name="rel" value="spouse"> 配偶者</label>`,
        onSave: () => {
          const rel = document.querySelector('input[name="rel"]:checked').value;
          setTimeout(() => pickNote(ctx, { title: '2人目', exclude: [a], onPick: b => {
            const l = rel === 'spouse' ? newLink(a, b, { kind: 'spouse' }) : rel === 'parent' ? newLink(a, b, { kind: 'parent' }) : newLink(b, a, { kind: 'parent' });
            ctx.commit(w => { w.links[l.id] = l; }, '家族をつなぐ');
          } }), 0);
        },
      });
    } });
  }
  render();
  return { update: e => { if (e?.type !== 'search') render(); } };
}
