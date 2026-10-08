// 引っぱって動かす・ホイールやピンチで拡大縮小（家系図・グラフ・地図・ストーリーチャートで共通）。
// data-click の付いた要素は、動かさずに離すとクリック（onClick(要素, イベント)）
export function panZoom(stage, layer, { onClick, onChange, min = 0.1, max = 4, onDragItem } = {}) {
  const v = { x: 0, y: 0, z: 1 };
  const pointers = new Map();
  let drag = null, pinch = null;
  const apply = () => { layer.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`; onChange?.(v); };
  const zoomAt = (f, cx, cy) => {
    const r = stage.getBoundingClientRect(), z = Math.max(min, Math.min(max, v.z * f)), sx = cx - r.left, sy = cy - r.top;
    v.x = sx - (sx - v.x) * (z / v.z); v.y = sy - (sy - v.y) * (z / v.z); v.z = z; apply();
  };
  stage.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('button, a, input, select')) return; // 中のボタンは、ふつうに押せるように（つかむとクリックが届かない）
    e.preventDefault(); // 引っぱっている間に文字が選ばれないように（Safari など）
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
    const item = onDragItem && e.target.closest('[data-drag]');
    drag = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: 0, target: e.target, item };
  });
  stage.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; return; }
    if (!drag) return;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy));
    if (drag.item) { if (drag.moved > 3) onDragItem(drag.item, (e.clientX - drag.sx) / v.z, (e.clientY - drag.sy) / v.z, false); return; }
    v.x = drag.vx + e.clientX - drag.sx; v.y = drag.vy + e.clientY - drag.sy; apply();
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    const d = drag; drag = null;
    if (!d || e.type === 'pointercancel') return;
    if (d.item && d.moved > 3) { onDragItem(d.item, (e.clientX - d.sx) / v.z, (e.clientY - d.sy) / v.z, true); return; }
    if (d.moved <= 4) { const el = d.target.closest?.('[data-click]'); if (el) onClick?.(el, e); }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); else { v.x -= e.deltaX; apply(); } }, { passive: false });
  return {
    view: v, apply, zoomAt,
    // 範囲 [x0,y0,x1,y1]（中身の座標）を画面に収める
    fit(x0, y0, x1, y1, maxZ = 1.2) {
      const r = stage.getBoundingClientRect();
      const z = Math.max(min, Math.min(maxZ, Math.min(r.width / Math.max(1, x1 - x0), r.height / Math.max(1, y1 - y0))));
      v.z = z; v.x = (r.width - (x1 - x0) * z) / 2 - x0 * z; v.y = (r.height - (y1 - y0) * z) / 2 - y0 * z; apply();
    },
    center(x, y) { const r = stage.getBoundingClientRect(); v.x = r.width / 2 - x * v.z; v.y = r.height / 2 - y * v.z; apply(); },
  };
}
