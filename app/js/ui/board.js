// コルクボード：付箋を自由に並べ、線でつなぐ。1枚の付箋をいくつものボードに貼れる（中身は1つ）。
// 付箋を引っぱって動かす／右の● を引っぱってほかの付箋で離すとつながる（何もない所で離すと新しい付箋を作ってつなぐ）／
// 背景を引っぱって動かす・ホイールやピンチで拡大縮小／まとめの ▾ でたたむ
import { h, esc, debounce } from '../util.js';
import { newBoard, newLink, newNote, childrenOf } from '../model.js';
import { hiddenOnBoard, hiddenCount, edgePoint } from './boardRules.js';
import { pickNote } from './picker.js';
import { editLink, ownBoard, freeSpot } from './noteEditor.js';
import { renderMarkdown } from './markdown.js';
import { quickInput } from './quickNote.js';

const views = new Map(); // ボードごとの表示位置 { x, y, z }
const CARD_W = 190;
const KIND_STYLE = { parent: { dash: '', label: '親子' }, spouse: { dash: '', label: '夫婦' }, order: { dash: '6 4', label: '' } };

export function mount(el, ctx, arg) {
  let boardId = arg?.board || ctx.viewArg()?.board || lastBoard(ctx);
  const bar = h('div', { class: 'bar' });
  const stage = h('div', { class: 'board-stage', tabindex: '0', 'aria-label': 'ボード' });
  const worldEl = h('div', { class: 'board-world' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('board-links');
  worldEl.append(svg);
  stage.append(worldEl);
  // 書き留める欄：書いて Enter で、見ている所に貼る（続けて書くと少しずつずらす）
  let qn = 0;
  const placeNew = (w, id) => { const p = center(), o = (qn++ % 6) * 26; w.boards[boardId].items[id] = { x: Math.round(p.x - CARD_W / 2 + o), y: Math.round(p.y - 30 + o) }; };
  const quick = quickInput(ctx, { placeholder: 'このボードに書き留める（Enter で貼る。Shift+Enter で改行）', place: placeNew });
  el.append(bar, h('div', { class: 'quick-row' }, quick), stage);
  let view = null, sizes = new Map(), drag = null, pinch = null;
  const pointers = new Map();

  const board = () => ctx.world.boards[boardId];
  function lastBoard(ctx) { try { const id = localStorage.getItem('trpg-last-board'); if (ctx.world.boards[id]) return id; } catch { /* なし */ } return Object.values(ctx.world.boards).find(b => !b.owner)?.id || Object.keys(ctx.world.boards)[0]; }
  const applyView = () => { worldEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`; stage.style.backgroundPosition = `${view.x}px ${view.y}px`; stage.style.backgroundSize = `${24 * view.z}px ${24 * view.z}px`; };
  const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };

  function renderBar() {
    const w = ctx.world, b = board();
    const boards = Object.values(w.boards);
    const label = x => x.owner ? `${w.notes[x.owner]?.title || '名前なし'}の専用ボード` : x.name;
    bar.replaceChildren(...[
      h('h2', {}, 'ボード'),
      h('select', { 'aria-label': 'ボードを選ぶ', onchange: e => { boardId = e.target.value; remember(); render(true); } },
        ...boards.filter(x => !x.owner).map(x => h('option', { value: x.id, selected: x.id === boardId }, label(x))),
        boards.some(x => x.owner) ? h('optgroup', { label: '付箋の専用ボード' }, ...boards.filter(x => x.owner).map(x => h('option', { value: x.id, selected: x.id === boardId }, label(x)))) : null),
      b?.owner ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.openNote(b.owner) }, '持ち主の付箋を開く') : null,
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn', onclick: () => pickNote(ctx, { title: 'ボードに貼る付箋', exclude: Object.keys(b.items), onPick: id => { const p = center(); ctx.commit(w => { w.boards[boardId].items[id] = { x: p.x - CARD_W / 2, y: p.y - 30 }; }, 'ボードに貼る'); } }) }, '＋ 貼る'),
      h('button', { type: 'button', class: 'btn icon', title: '全体を見る', 'aria-label': '全体を見る', onclick: () => { fit(true); applyView(); } }, '⤢'),
      h('button', { type: 'button', class: 'btn icon', title: 'ボードのメニュー', 'aria-label': 'ボードのメニュー', onclick: e => ctx.menuAt(e.currentTarget, null, [
        ['＋ 新しいボード', () => { const nb = newBoard({ name: `ボード${Object.values(ctx.world.boards).filter(x => !x.owner).length + 1}` }); ctx.commit(w => { w.boards[nb.id] = nb; }, 'ボードを追加'); boardId = nb.id; remember(); render(true); }],
        ['名前を変える', () => ctx.openDialog({ title: 'ボードの名前', body: `<label>名前<input id="bd_name" value="${esc(board().name)}" autocomplete="off"></label>`, onSave: () => { const v = document.getElementById('bd_name').value.trim(); if (!v) throw '名前を入れてください'; ctx.commit(w => { w.boards[boardId].name = v; }, 'ボードの名前を変更'); } })],
        ['このボードを削除', () => ctx.openDialog({ title: 'ボードを削除', ok: null, body: `<p>「${esc(label(board()))}」を削除します。貼ってある付箋そのものは消えません。</p>`, onDelete: () => {
          if (Object.keys(ctx.world.boards).length <= 1) throw '最後のボードは削除できません';
          ctx.commit(w => { delete w.boards[boardId]; }, 'ボードを削除'); boardId = lastBoard(ctx); render(true);
        } }), { danger: true }],
      ]) }, '…')].filter(Boolean));
  }
  const remember = () => { try { localStorage.setItem('trpg-last-board', boardId); } catch { /* なし */ } };
  const center = () => { const r = stage.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  // all：全体を収める。初めて開くときは、小さくなりすぎるなら（スマホ）字が読める大きさで左上から見せる
  function fit(all) {
    const items = Object.entries(board().items);
    const r = stage.getBoundingClientRect();
    if (!items.length) { view = { x: 40, y: 40, z: 1 }; return; }
    const xs = items.map(([, p]) => p.x), ys = items.map(([, p]) => p.y);
    const x0 = Math.min(...xs) - 40, y0 = Math.min(...ys) - 40, x1 = Math.max(...xs) + CARD_W + 40, y1 = Math.max(...ys) + 160;
    const z = Math.max(0.2, Math.min(1.2, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    if (!all && z < 0.6) { view = { x: -x0 * 0.6, y: -y0 * 0.6, z: 0.6 }; return; }
    view = { x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z, z };
  }

  function card(n, pos, hidden, b) {
    const kids = childrenOf(ctx.world, n.id).filter(k => b.items[k.id]);
    const collapsed = b.collapsed.includes(n.id), nh = collapsed ? hiddenCount(ctx.world, b, hidden, n.id) : 0;
    const body = n.body ? n.body.split('\n').filter(l => l.trim()).slice(0, 3).join('\n') : '';
    return h('div', { class: `bcard p-${n.color ?? 0}${ctx.openedNote() === n.id ? ' sel' : ''}`, 'data-id': n.id, style: { left: pos.x + 'px', top: pos.y + 'px', width: CARD_W + 'px' }, tabindex: '0', role: 'button', 'aria-label': n.title || '名前なし' },
      h('div', { class: 'bcard-t' }, n.title || '（名前なし）'),
      n.tags.length ? h('div', { class: 'bcard-tags' }, n.tags.map(t => '#' + t).join(' ')) : null,
      body ? h('div', { class: 'bcard-b md', html: renderMarkdown(body, { resolveLink: () => null }) }) : null,
      kids.length ? h('button', { type: 'button', class: 'bcard-fold', title: collapsed ? 'まとめをひらく' : 'まとめをたたむ', 'aria-label': collapsed ? 'まとめをひらく' : 'まとめをたたむ', 'data-fold': n.id }, collapsed ? `▸ ${nh}枚` : '▾') : null,
      h('span', { class: 'bcard-handle', title: '引っぱってほかの付箋につなぐ', 'data-handle': n.id }));
  }

  function render(refit = false) {
    if (!board()) boardId = lastBoard(ctx);
    const b = board(), w = ctx.world;
    renderBar();
    if (!b) return;
    if (refit) views.delete(boardId);
    view = views.get(boardId) || null;
    const hidden = hiddenOnBoard(w, b);
    const ids = Object.keys(b.items).filter(id => w.notes[id] && !hidden.has(id));
    worldEl.querySelectorAll('.bcard').forEach(x => x.remove());
    for (const id of ids) worldEl.append(card(w.notes[id], b.items[id], hidden, b));
    if (!ids.length) worldEl.append(h('div', { class: 'bcard empty-hint', style: { left: '40px', top: '40px', width: '320px' } }, 'このボードには、まだ付箋がありません。上の欄に書いて Enter で貼れます（今ある付箋は「＋ 貼る」）。付箋の右の● を引っぱると、ほかの付箋とつながります。'));
    if (!view) { fit(); views.set(boardId, view); }
    applyView();
    requestAnimationFrame(() => { sizes = new Map([...worldEl.querySelectorAll('.bcard[data-id]')].map(c => [c.dataset.id, { w: c.offsetWidth, h: c.offsetHeight }])); drawLinks(); });
  }
  function drawLinks(temp = null) {
    const w = ctx.world, b = board();
    const shown = new Set([...worldEl.querySelectorAll('.bcard[data-id]')].map(c => c.dataset.id));
    const mid = id => { const p = b.items[id], s = sizes.get(id) || { w: CARD_W, h: 60 }; return { x: p.x + s.w / 2, y: p.y + s.h / 2, hw: s.w / 2 + 4, hh: s.h / 2 + 4 }; };
    let out = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
    for (const l of Object.values(w.links)) {
      if (!shown.has(l.a) || !shown.has(l.b)) continue;
      const A = mid(l.a), B = mid(l.b), p = edgePoint(A, B, A.hw, A.hh), q = edgePoint(B, A, B.hw, B.hh);
      const ks = KIND_STYLE[l.kind] || {}, dash = l.style === 'dashed' ? '8 5' : l.style === 'dotted' ? '2 4' : ks.dash || '';
      const arrow = l.kind === 'order' ? 'end' : l.arrow;
      const col = l.color != null ? `var(--c-c${l.color})` : 'var(--muted)';
      const label = l.label || ks.label || '';
      out += `<g class="blink" data-link="${l.id}"><line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="hit"/>` +
        `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${col}" stroke-width="${l.kind === 'spouse' ? 3 : 1.8}" ${dash ? `stroke-dasharray="${dash}"` : ''} ${arrow === 'end' || arrow === 'both' ? 'marker-end="url(#arr)"' : ''} ${arrow === 'both' ? 'marker-start="url(#arr)"' : ''}/>` +
        (label ? `<text x="${(p.x + q.x) / 2}" y="${(p.y + q.y) / 2 - 6}" text-anchor="middle">${esc(label)}</text>` : '') + '</g>';
    }
    if (temp) out += `<line class="btemp" x1="${temp.a.x}" y1="${temp.a.y}" x2="${temp.b.x}" y2="${temp.b.y}"/>`;
    svg.innerHTML = out;
  }

  // ===== 操作 =====
  stage.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, c] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - c.x, a.y - c.y) }; drag = null; return; }
    const handle = e.target.closest('[data-handle]'), fold = e.target.closest('[data-fold]'), cardEl = e.target.closest('.bcard[data-id]'), linkEl = e.target.closest('[data-link]');
    if (fold) { drag = { kind: 'fold', id: fold.dataset.fold }; return; }
    if (handle) { const id = handle.dataset.handle, b = board(), s = sizes.get(id) || { w: CARD_W, h: 60 }; drag = { kind: 'link', id, a: { x: b.items[id].x + s.w / 2, y: b.items[id].y + s.h / 2 } }; return; }
    if (cardEl) { const id = cardEl.dataset.id, p = board().items[id]; drag = { kind: 'card', id, el: cardEl, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: 0 }; return; }
    if (linkEl) { drag = { kind: 'linkclick', id: linkEl.dataset.link }; return; }
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: 0 };
  });
  stage.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, c] = [...pointers.values()], d = Math.hypot(a.x - c.x, a.y - c.y);
      zoomAt(d / pinch.d, (a.x + c.x) / 2, (a.y + c.y) / 2); pinch.d = d; return;
    }
    if (!drag) return;
    if (drag.kind === 'pan') { drag.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y); view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); }
    else if (drag.kind === 'card') {
      const dx = (e.clientX - drag.sx) / view.z, dy = (e.clientY - drag.sy) / view.z;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 3) { drag.el.style.left = drag.x + dx + 'px'; drag.el.style.top = drag.y + dy + 'px'; board().items[drag.id] = { x: drag.x + dx, y: drag.y + dy }; drawLinks(); }
    } else if (drag.kind === 'link') drawLinks({ a: drag.a, b: toWorld(e.clientX, e.clientY) });
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    const d = drag; drag = null;
    if (!d || e.type === 'pointercancel') { if (d?.kind === 'card') render(); return; }
    if (d.kind === 'fold') ctx.commit(w => { const b = w.boards[boardId]; b.collapsed = b.collapsed.includes(d.id) ? b.collapsed.filter(x => x !== d.id) : [...b.collapsed, d.id]; }, 'まとめをたたむ・ひらく');
    else if (d.kind === 'card') {
      if (d.moved > 3) { const p = board().items[d.id]; board().items[d.id] = { x: d.x, y: d.y }; ctx.commit(w => { w.boards[boardId].items[d.id] = { x: Math.round(p.x), y: Math.round(p.y) }; }, '付箋を動かす'); }
      else ctx.openNote(d.id);
    } else if (d.kind === 'link') {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bcard[data-id]');
      if (target && target.dataset.id !== d.id) { const l = newLink(d.id, target.dataset.id); ctx.commit(w => { w.links[l.id] = l; }, 'つなぐ'); }
      else if (!target) {
        // 何もない所で離した：そこに新しい付箋を作ってつなぐ
        const p = toWorld(e.clientX, e.clientY), n = newNote(), l = newLink(d.id, n.id);
        ctx.commit(w => { w.notes[n.id] = n; w.boards[boardId].items[n.id] = { x: Math.round(p.x - CARD_W / 2), y: Math.round(p.y - 20) }; w.links[l.id] = l; }, '新しい付箋をつなぐ');
        ctx.openNote(n.id, { focusTitle: true });
      } else drawLinks();
    } else if (d.kind === 'linkclick') editLink(ctx, d.id);
    views.set(boardId, view);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  function zoomAt(f, cx, cy) {
    const r = stage.getBoundingClientRect(), z = Math.max(0.15, Math.min(3, view.z * f)), sx = cx - r.left, sy = cy - r.top;
    view.x = sx - (sx - view.x) * (z / view.z); view.y = sy - (sy - view.y) * (z / view.z); view.z = z;
    applyView(); views.set(boardId, view);
  }
  stage.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); else { view.x -= e.deltaX; applyView(); } }, { passive: false });
  // 右クリック（スマホは長押し）：付箋のメニュー
  stage.addEventListener('contextmenu', e => {
    const c = e.target.closest('.bcard[data-id]');
    if (!c) return;
    e.preventDefault();
    const id = c.dataset.id;
    ctx.showMenu(esc(ctx.world.notes[id].title || '名前なし'), [
      ['開く', () => ctx.openNote(id)],
      ['専用のボードを開く', () => ownBoard(ctx, id)],
      ['このボードから外す（付箋は残る）', () => ctx.commit(w => { delete w.boards[boardId].items[id]; }, 'ボードから外す')],
      ['付箋を削除', () => ctx.deleteNote(id), { danger: true }],
    ], e.clientX, e.clientY);
  });
  stage.addEventListener('keydown', e => {
    const c = document.activeElement?.closest?.('.bcard[data-id]');
    if (c && e.key === 'Enter') ctx.openNote(c.dataset.id);
  });
  const onResize = debounce(() => applyView(), 100);
  addEventListener('resize', onResize);
  remember();
  render();
  // 付箋の一覧から「ボードで見る」で来たとき：その付箋を真ん中に
  const focus = arg?.focus;
  if (focus && board()?.items[focus]) { const r = stage.getBoundingClientRect(), p = board().items[focus]; view.x = r.width / 2 - (p.x + CARD_W / 2) * view.z; view.y = r.height / 2 - (p.y + 30) * view.z; applyView(); }
  return {
    update: e => { if (e?.type !== 'search') render(); },
    destroy: () => removeEventListener('resize', onResize),
    placeNew,
  };
}
export { freeSpot };
