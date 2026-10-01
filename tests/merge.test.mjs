// 2台の端末の変更の取り込み
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorlds } from '../app/js/merge.js';
import { newWorld, newNote, newLink } from '../app/js/model.js';

const base = () => {
  const w = newWorld('テスト');
  for (const id of ['a', 'b', 'c']) w.notes[id] = newNote({ id, title: id });
  w.links.l1 = newLink('a', 'b', { id: 'l1' });
  const bd = Object.values(w.boards)[0]; bd.items = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  return w;
};
const copy = w => JSON.parse(JSON.stringify(w));

test('different notes edited on each device: both edits kept', () => {
  const b = base(), l = copy(b), r = copy(b);
  l.notes.a.title = 'A（この端末）'; r.notes.b.body = 'もう一方の本文';
  l.notes.d = newNote({ id: 'd', title: '新しい' });
  const { world, conflicts } = mergeWorlds(b, l, r);
  assert.equal(world.notes.a.title, 'A（この端末）');
  assert.equal(world.notes.b.body, 'もう一方の本文');
  assert.ok(world.notes.d);
  assert.equal(conflicts.length, 0);
});

test('same note edited on both: the note appears twice', () => {
  const b = base(), l = copy(b), r = copy(b);
  l.notes.a.body = 'こちら'; r.notes.a.body = 'あちら';
  const { world, conflicts } = mergeWorlds(b, l, r);
  assert.equal(world.notes.a.body, 'あちら');
  const dup = Object.values(world.notes).find(n => n.body === 'こちら');
  assert.ok(dup && dup.id !== 'a' && dup.title.includes('この端末の版'));
  assert.equal(conflicts.length, 1);
});

test('deleted on one device, edited on the other: the edit survives; dangling references are cleaned', () => {
  const b = base(), l = copy(b), r = copy(b);
  delete r.notes.a; delete r.links.l1; delete Object.values(r.boards)[0].items.a;
  l.notes.a.body = 'まだ使う';
  const m1 = mergeWorlds(b, l, r).world;
  assert.equal(m1.notes.a.body, 'まだ使う');
  // 消した側だけが変えた：消える。消えた付箋へのつながりも消える
  const l2 = copy(b), r2 = copy(b);
  delete r2.notes.b;
  const m2 = mergeWorlds(b, l2, r2).world;
  assert.equal(m2.notes.b, undefined);
  assert.equal(Object.keys(m2.links).length, 0);
  assert.equal(Object.values(m2.boards)[0].items.b, undefined);
});

test('board positions merge per card; tracks deleted on one side survive if used on the other', () => {
  const b = base(), l = copy(b), r = copy(b);
  Object.values(l.boards)[0].items.a = { x: 500, y: 500 };
  Object.values(r.boards)[0].items.b = { x: 900, y: 0 };
  b.tracks.push({ id: 'beta', name: 'β', lane: 1, color: 1, cal: 'west', from: { d: 1, s: 0 }, to: { d: 9, s: 0 } });
  l.tracks = copy(b.tracks); r.tracks = [copy(b.tracks)[0]];
  l.notes.c.when = { tr: 'beta', t: { d: 5, s: 0 }, prec: 'day' };
  const { world } = mergeWorlds(b, l, r);
  const bd = Object.values(world.boards)[0];
  assert.deepEqual([bd.items.a, bd.items.b], [{ x: 500, y: 500 }, { x: 900, y: 0 }]);
  assert.ok(world.tracks.some(t => t.id === 'beta'));
  assert.equal(world.notes.c.when.tr, 'beta');
});
