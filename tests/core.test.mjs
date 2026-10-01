// 本体の土台：データの形・元に戻す・付箋の削除・試作品のデータの読み込み・本文の書き方
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../app/js/store.js';
import { newWorld, newNote, newLink, newBoard, deleteNote, migrateWorld, subjectsOf, timedNotes } from '../app/js/model.js';
import { renderMarkdown, linkTitles } from '../app/js/ui/markdown.js';

test('undo and redo restore the exact world', () => {
  const s = createStore(newWorld('テスト'));
  const before = JSON.stringify(s.get());
  s.commit(w => { w.notes.a = newNote({ id: 'a', title: '一' }); }, '追加');
  const mid = JSON.stringify(s.get());
  s.commit(w => { w.notes.a.title = '二'; }, '変更');
  s.undo(); assert.equal(JSON.stringify(s.get()), mid);
  s.undo(); assert.equal(JSON.stringify(s.get()), before);
  assert.equal(s.canUndo(), false);
  s.redo(); s.redo(); assert.equal(s.get().notes.a.title, '二');
  // 何も変えない commit は履歴に残さない
  s.commit(() => {}); s.undo(); assert.equal(s.get().notes.a.title, '一');
});

test('deleting a note removes every reference to it', () => {
  const w = newWorld();
  const a = newNote({ id: 'a' }), b = newNote({ id: 'b', parents: ['a'], origin: 'a' });
  w.notes.a = a; w.notes.b = b;
  const l = newLink('a', 'b'); w.links[l.id] = l;
  const own = newBoard({ owner: 'a', items: { b: { x: 0, y: 0 } } }); w.boards[own.id] = own;
  const other = newBoard({ items: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, collapsed: ['a'] }); w.boards[other.id] = other;
  w.maps.m = { id: 'm', name: '地図', image: null, pins: [{ note: 'a', x: 1, y: 1 }, { note: 'b', x: 2, y: 2 }] };
  deleteNote(w, 'a');
  assert.equal(w.notes.a, undefined);
  assert.equal(Object.keys(w.links).length, 0);
  assert.equal(w.boards[own.id], undefined);
  assert.deepEqual(Object.keys(w.boards[other.id].items), ['b']);
  assert.deepEqual(w.boards[other.id].collapsed, []);
  assert.deepEqual(w.maps.m.pins.map(p => p.note), ['b']);
  assert.deepEqual(w.notes.b.parents, []);
  assert.equal(w.notes.b.origin, undefined);
});

test('prototype v7 export opens as a world', () => {
  const p = JSON.parse(readFileSync(new URL('../prototype/examples/sample.json', import.meta.url)));
  const w = migrateWorld(p);
  assert.equal(w.tracks.length, p.tracks.length);
  assert.equal(subjectsOf(w).length, p.subjects.length);
  assert.equal(timedNotes(w).length, p.events.length);
  const girl = subjectsOf(w).find(n => n.title === 'ループする少女');
  assert.equal(girl.legs.length, 5);
  assert.ok(Number.isInteger(girl.legs[0].a.d) && Number.isInteger(girl.legs[0].a.s));
  const double = subjectsOf(w).find(n => n.title === '織田信長（世界線γ）');
  assert.equal(w.notes[double.origin].title, '織田信長');
  const fest = timedNotes(w).find(n => n.title === '夏祭り' && n.when.tr === 'loop1');
  assert.equal(fest.when.per['2'].title, '夏祭り（知らない観測者が紛れ込む）');
  assert.equal(w.notes[fest.parents[0]].title, 'シナリオ：夏の終わりのループ');
  assert.ok(w.tracks.find(t => t.id === 'dream').calId);
  // 本線の分岐点と分かれた世界線の始まりは、同じ日時のまま
  const g = w.tracks.find(t => t.id === 'gamma');
  assert.deepEqual(g.fork[1], g.from);
  assert.throws(() => migrateWorld({ hello: 1 }), /世界のデータではありません/);
});

test('markdown renders the supported syntax and escapes the rest', () => {
  const html = renderMarkdown('# 見出し\n**太字** と *斜体*\n- 一\n  - 二\n- 三\n\n[[ある付箋]] [[ない付箋|表示]] <script>alert(1)</script>\n![図](img:abc)\n[外](https://example.com/?a=1&b=2)', {
    resolveLink: t => t === 'ある付箋' ? { id: 'n1' } : null, imageUrl: id => `blob:${id}`,
  });
  assert.match(html, /<h3>見出し<\/h3>/);
  assert.match(html, /<strong>太字<\/strong> と <em>斜体<\/em>/);
  assert.match(html, /<ul><li>一<ul><li>二<\/li><\/ul><\/li><li>三<\/li><\/ul>/);
  assert.match(html, /data-note="n1">ある付箋</);
  assert.match(html, /class="nlink missing" data-new="ない付箋"[^>]*>表示</);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<img class="md-img" data-img="abc" alt="図" src="blob:abc">/);
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2" target="_blank"/);
  assert.deepEqual(linkTitles('[[甲]] と [[乙|おつ]]'), ['甲', '乙']);
});
