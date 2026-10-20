// タグ：一覧（数と種類）、名前を変える（同じ名前があればまとめる）、全部から外す。テンプレートとタグのボードも一緒に
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, newNote, newBoard } from '../app/js/model.js';
import { tagList, renameTag, removeTag, tagBoardOf, tagBoardSpots } from '../app/js/tags.js';

function world() {
  const w = newWorld('t');
  const add = (id, kind, title, tags) => { w.notes[id] = newNote({ id, kind, title, tags }); };
  add('a', 'item', '古い鍵', ['呪物', '鍵']); add('b', 'item', '銀の短剣', ['呪物']); add('c', 'person', '巫女', ['呪物', 'NPC']);
  add('d', 'note', '噂', ['噂']); add('e', 'item', '手帳', ['じゅぶつ']);
  w.templates.t1 = { id: 't1', name: '呪物の欄', tags: ['呪物'], kinds: [], fields: [] };
  return w;
}

test('tag list: every tag with how many cards of each kind, in name order', () => {
  const list = tagList(world());
  assert.deepEqual(list.map(t => t.tag), ['NPC', 'じゅぶつ', '噂', '鍵', '呪物'].sort(new Intl.Collator('ja', { numeric: true }).compare));
  const j = list.find(t => t.tag === '呪物');
  assert.equal(j.count, 3); assert.deepEqual(j.kinds, { item: 2, person: 1 });
});

test('rename: every card, template and the tag board follow; renaming onto an existing tag merges', () => {
  const w = world(), b = newBoard({ tag: '呪物', items: { a: { x: 1, y: 1 } } }); w.boards[b.id] = b;
  renameTag(w, '呪物', '呪いの品');
  assert.deepEqual(w.notes.a.tags, ['呪いの品', '鍵']);
  assert.deepEqual(w.templates.t1.tags, ['呪いの品']);
  assert.equal(tagBoardOf(w, '呪いの品')?.id, b.id);
  // じゅぶつ を 呪いの品 にまとめる：両方付いていたカードは1つに。ボードは今あるほうに寄せる
  const b2 = newBoard({ tag: 'じゅぶつ', items: { e: { x: 9, y: 9 }, a: { x: 5, y: 5 } } }); w.boards[b2.id] = b2;
  w.notes.a.tags.push('じゅぶつ');
  renameTag(w, 'じゅぶつ', '呪いの品');
  assert.deepEqual(w.notes.a.tags, ['呪いの品', '鍵'], 'no duplicate');
  assert.deepEqual(w.notes.e.tags, ['呪いの品']);
  assert.ok(!w.boards[b2.id], 'merged board removed');
  assert.deepEqual(w.boards[b.id].items, { a: { x: 1, y: 1 }, e: { x: 9, y: 9 } }, 'kept positions, added the missing card');
  assert.throws(() => renameTag(w, '呪いの品', '  '), /名前/);
});

test('remove: the tag leaves every card and template, and its board goes', () => {
  const w = world(), b = newBoard({ tag: '呪物' }); w.boards[b.id] = b;
  removeTag(w, '呪物');
  assert.ok(Object.values(w.notes).every(n => !n.tags.includes('呪物')));
  assert.deepEqual(w.templates.t1.tags, []);
  assert.ok(!w.boards[b.id]);
});

test('tag board: cards with the tag that are not on it yet, in rows by kind under what is there', () => {
  const w = world();
  const spots = tagBoardSpots(w, '呪物', { a: { x: 40, y: 40 } });
  assert.deepEqual(Object.keys(spots).sort(), ['b', 'c']);
  assert.ok(spots.c.y < spots.b.y, 'people row before items row');
  assert.ok(Object.values(spots).every(p => p.y > 40 + 100));
});
