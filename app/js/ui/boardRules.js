// ボードの決まり（画面とは別にして、自動確認できるようにする）
import { childrenOf } from '../model.js';

// たたんだまとめの子孫は隠す。ただし、別の開いているまとめ（ボードに出ていて、たたんでいない）にも直接属していれば表示する。
// 親子が循環していても止まる
export function hiddenOnBoard(world, board) {
  const on = new Set(Object.keys(board.items).filter(id => world.notes[id]));
  const collapsed = new Set(board.collapsed.filter(id => on.has(id)));
  const hidden = new Set();
  for (const c of collapsed) {
    const seen = new Set([c]), stack = [c];
    while (stack.length) {
      const x = stack.pop();
      for (const k of childrenOf(world, x)) if (!seen.has(k.id)) { seen.add(k.id); stack.push(k.id); if (on.has(k.id) && k.id !== c) hidden.add(k.id); }
    }
  }
  // 開いているまとめにも属していれば出す（出したことで、さらに出せるものがあるかもしれないので、変わらなくなるまで）
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...hidden]) {
      if (world.notes[id].parents.some(p => on.has(p) && !collapsed.has(p) && !hidden.has(p))) { hidden.delete(id); changed = true; }
    }
  }
  return hidden;
}
// たたんだまとめの中に隠れている付箋の数
export function hiddenCount(world, board, hidden, id) {
  const seen = new Set([id]), stack = [id];
  let n = 0;
  while (stack.length) { const x = stack.pop(); for (const k of childrenOf(world, x)) if (!seen.has(k.id)) { seen.add(k.id); stack.push(k.id); if (hidden.has(k.id)) n++; } }
  return n;
}
// 線を付箋の四角の縁で止める：中心 a から中心 b への線が、a の四角（半幅 w、半高さ h）を出る点
export function edgePoint(a, b, w, h) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return { x: a.x, y: a.y };
  const s = Math.min(Math.abs(w / (dx || 1e-9)), Math.abs(h / (dy || 1e-9)));
  return { x: a.x + dx * Math.min(1, s), y: a.y + dy * Math.min(1, s) };
}
