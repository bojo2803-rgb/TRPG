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

test('tag descriptions: set and clear; they follow a rename, merge into one text, and go with the tag', async () => {
  const { setTagMemo, tagMemo } = await import('../app/js/tags.js');
  const w = world();
  setTagMemo(w, '呪物', '持つと正気度が減る品');
  setTagMemo(w, 'じゅぶつ', '表記ゆれ');
  assert.equal(tagMemo(w, '呪物'), '持つと正気度が減る品');
  renameTag(w, '呪物', '呪いの品');
  assert.equal(tagMemo(w, '呪いの品'), '持つと正気度が減る品'); assert.equal(tagMemo(w, '呪物'), '');
  renameTag(w, 'じゅぶつ', '呪いの品');
  assert.equal(tagMemo(w, '呪いの品'), '持つと正気度が減る品\n\n表記ゆれ', 'both descriptions kept when merging');
  setTagMemo(w, '噂', '  '); assert.ok(!('噂' in w.tagInfo), 'empty description is not stored');
  removeTag(w, '呪いの品'); assert.equal(tagMemo(w, '呪いの品'), '');
  assert.deepEqual(tagList(w).find(t => t.tag === '鍵').memo, '');
});

test('remove one tag from many cards at once', async () => {
  const { untag } = await import('../app/js/bulk.js');
  const w = world();
  assert.equal(untag(w, ['a', 'b', 'd'], '呪物'), 2);
  assert.deepEqual(w.notes.a.tags, ['鍵']); assert.deepEqual(w.notes.d.tags, ['噂']);
});

test('search finds tags: "#呪" or "呪" lists matching tags, name starts first', async () => {
  const { searchTags } = await import('../app/js/tags.js');
  const w = world(); w.notes.x = newNote({ id: 'x', title: 'x', tags: ['古い呪い'] });
  assert.deepEqual(searchTags(w, '#呪').map(t => [t.tag, t.count]), [['呪物', 3], ['古い呪い', 1]]);
  assert.deepEqual(searchTags(w, '呪物').map(t => t.tag), ['呪物']);
  assert.deepEqual(searchTags(w, '#').map(t => t.tag), tagList(w).map(t => t.tag), 'just # lists every tag');
  assert.deepEqual(searchTags(w, ''), [], 'nothing typed, no tags');
});

test('two devices editing tag descriptions are merged like other collections', async () => {
  const { mergeWorlds } = await import('../app/js/merge.js');
  const base = world(), a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
  a.tagInfo = { 呪物: { memo: 'PCで書いた' } }; b.tagInfo = { 噂: { memo: 'スマホで書いた' } };
  const { world: m } = mergeWorlds(base, a, b);
  assert.deepEqual(m.tagInfo, { 噂: { memo: 'スマホで書いた' }, 呪物: { memo: 'PCで書いた' } });
});
