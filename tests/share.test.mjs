// シナリオの包み：何が入るか（中身・登場・場所とその上・チャートで結んだカード・つながり）、取り込み（新しい id・本線・上書きしない）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, newNote, newLink } from '../app/js/model.js';
import { scenarioPackage, importPackage, PKG } from '../app/js/share.js';

function world() {
  const w = newWorld('元の世界');
  const add = (id, p) => { w.notes[id] = newNote({ id, title: id, ...p }); };
  add('日本', { kind: 'place' }); add('東京', { kind: 'place', parents: ['日本'] });
  add('sc', { kind: 'scenario', title: 'ダンウィッチの怪', at: '東京', sessions: [{ id: 's1', date: '2026-10-01', who: 'A', memo: '秘密' }], share: { fileId: 'x' },
    chart: { nodes: { n1: { id: 'n1', title: '導入', type: 'event', refs: ['屋敷'], body: '', place: '酒場', cast: ['店主'], items: ['鍵'] } }, edges: {} } });
  add('酒場', { kind: 'place', parents: ['日本'] }); add('店主', { kind: 'person' }); add('鍵', { kind: 'item' });
  add('アーミテッジ', { kind: 'person', parents: ['sc'], at: '東京' });
  add('日記', { when: { tr: 'main', t: { d: 2425000, s: 0 }, prec: 'day' }, parents: ['sc'], body: '![絵](img:i1)' });
  add('屋敷', { kind: 'place' });
  add('無関係', {});
  const l = newLink('アーミテッジ', '日記'); w.links[l.id] = l;
  const l2 = newLink('アーミテッジ', '無関係'); w.links[l2.id] = l2;
  return w;
}

test('a scenario package carries what the scenario uses, and nothing else', () => {
  const pkg = scenarioPackage(world(), 'sc');
  assert.equal(pkg.format, PKG);
  assert.deepEqual(Object.keys(pkg.notes).sort(), ['sc', 'アーミテッジ', '屋敷', '日本', '日記', '東京', '酒場', '店主', '鍵'].sort());
  assert.equal(Object.keys(pkg.links).length, 1, 'only links between included cards');
  assert.equal(pkg.notes.sc.sessions, undefined, 'play records left out by default');
  assert.equal(pkg.notes.sc.share, undefined);
  assert.equal(scenarioPackage(world(), 'sc', { sessions: true }).notes.sc.sessions.length, 1);
  assert.deepEqual(pkg.imageIds, ['i1']);
});

test('importing gives every card a new id and never overwrites the receiving world', () => {
  const pkg = JSON.parse(JSON.stringify(scenarioPackage(world(), 'sc')));
  const target = newWorld('相手の世界');
  target.notes.sc = newNote({ id: 'sc', title: '相手の付箋' });
  const { scenarioId } = importPackage(target, pkg);
  assert.notEqual(scenarioId, 'sc');
  assert.equal(target.notes.sc.title, '相手の付箋', 'existing card untouched');
  const sc = target.notes[scenarioId];
  assert.equal(sc.title, 'ダンウィッチの怪');
  const byTitle = t => Object.values(target.notes).find(n => n.title === t && n.id !== 'sc');
  assert.deepEqual(byTitle('アーミテッジ').parents, [scenarioId]);
  assert.equal(byTitle('アーミテッジ').at, byTitle('東京').id);
  assert.deepEqual(byTitle('東京').parents, [byTitle('日本').id]);
  assert.deepEqual(sc.chart.nodes.n1.refs, [byTitle('屋敷').id]);
  assert.deepEqual([sc.chart.nodes.n1.place, ...sc.chart.nodes.n1.cast, ...sc.chart.nodes.n1.items], [byTitle('酒場').id, byTitle('店主').id, byTitle('鍵').id]);
  assert.equal(byTitle('日記').when.tr, 'main');
  const l = Object.values(target.links)[0];
  assert.deepEqual([l.a, l.b], [byTitle('アーミテッジ').id, byTitle('日記').id]);
  assert.throws(() => importPackage(newWorld(), { format: 'other' }), /シナリオ/);
});
