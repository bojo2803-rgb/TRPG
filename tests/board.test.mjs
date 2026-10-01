// ボードのまとめのたたみ方と、線の止め方
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, newNote, newBoard } from '../app/js/model.js';
import { hiddenOnBoard, edgePoint } from '../app/js/ui/boardRules.js';

test('collapsing a group hides descendants unless also in an open group; cycles stop', () => {
  const w = newWorld();
  const add = (id, parents = []) => { w.notes[id] = newNote({ id, title: id, parents }); };
  add('シナリオ'); add('章1', ['シナリオ']); add('場面1', ['章1']); add('場面2', ['章1', '別のまとめ']); add('別のまとめ');
  add('甲', ['乙']); add('乙', ['甲']); // 循環
  const b = newBoard({ items: Object.fromEntries(Object.keys(w.notes).map(id => [id, { x: 0, y: 0 }])), collapsed: ['シナリオ', '甲'] });
  const hid = hiddenOnBoard(w, b);
  assert.deepEqual([...hid].sort(), ['乙', '場面1', '章1'].sort());
  // 別のまとめもたたむと、場面2も隠れる
  b.collapsed.push('別のまとめ');
  assert.ok(hiddenOnBoard(w, b).has('場面2'));
  // ボードに出ていないまとめは「開いているまとめ」に数えない
  delete b.items['別のまとめ']; b.collapsed = ['シナリオ'];
  assert.ok(hiddenOnBoard(w, b).has('場面2'));
});

test('edgePoint stops lines at the card border', () => {
  assert.deepEqual(edgePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 20), { x: 50, y: 0 });
  assert.deepEqual(edgePoint({ x: 0, y: 0 }, { x: 0, y: 100 }, 50, 20), { x: 0, y: 20 });
});

test('a new note on a board goes to the nearest free spot, never on top of a card', async () => {
  const { spotNear } = await import('../app/js/ui/board.js');
  const items = [{ x: 0, y: 0 }];
  const a = spotNear(items, { x: 95, y: 30 });
  assert.ok(Math.abs(a.x) >= 202 || Math.abs(a.y) >= 84, JSON.stringify(a));
  items.push(a);
  const b = spotNear(items, { x: 95, y: 30 });
  assert.ok(items.every(p => Math.abs(p.x - b.x) >= 202 || Math.abs(p.y - b.y) >= 84), JSON.stringify(b));
});
