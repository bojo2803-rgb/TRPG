// 要素：組織図の並べ方・いまの持ち主・期間の表記
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, newNote, newLink } from '../app/js/model.js';
import { layoutOrg } from '../app/js/ui/orgChart.js';
import { currentHolder, periodText } from '../app/js/ui/elements.js';
import { T } from '../app/js/cal/time.js';
import { jdnG } from '../app/js/cal/western.js';

test('org chart puts sub-groups below their parent without overlap, even with a cycle', () => {
  const g = (id, parents = []) => newNote({ id, kind: 'group', title: id, parents });
  const groups = [g('教団'), g('東支部', ['教団']), g('西支部', ['教団']), g('秘密結社', ['輪B']), g('輪B', ['秘密結社'])];
  const { pos } = layoutOrg(groups, () => []);
  assert.ok(pos['東支部'].y > pos['教団'].y && pos['西支部'].y === pos['東支部'].y);
  assert.ok(Math.abs(pos['東支部'].x - pos['西支部'].x) >= 190);
  assert.ok(pos['秘密結社'] && pos['輪B']);
});

test('the current holder is the latest holding that has not ended', () => {
  const w = newWorld();
  for (const id of ['剣', 'A', 'B']) w.notes[id] = newNote({ id, title: id });
  const at = y => ({ tr: 'main', t: T(jdnG(y, 1, 1)), prec: 'year', tz: 'Asia/Tokyo' });
  const l1 = newLink('A', '剣', { kind: 'holds', from: at(1650), to: at(1700) }), l2 = newLink('B', '剣', { kind: 'holds', from: at(1700), to: null });
  w.links[l1.id] = l1; w.links[l2.id] = l2;
  assert.equal(currentHolder(w, '剣'), 'B');
  assert.equal(periodText(w, l1), '1650年〜1700年'); // グレゴリオ暦の日付（1582年より前はユリウス暦で表す）
  assert.equal(periodText(w, { from: null, to: null, done: true }), '？〜？');
  l2.done = true;
  assert.equal(currentHolder(w, '剣'), null);
});
