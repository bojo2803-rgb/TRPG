// ストーリーチャート：自動の並び（段・分岐・合流・輪・手で置いた点）と、手がかりの一覧
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutChart, clueList, CHART_W, CHART_ROW } from '../app/js/chart.js';

const chart = (nodes, edges) => ({
  nodes: Object.fromEntries(nodes.map(([id, type = 'event', pos]) => [id, { id, title: id, body: '', type, refs: [], ...(pos && { pos }) }])),
  edges: Object.fromEntries(edges.map(([from, to, label = ''], i) => ['e' + i, { id: 'e' + i, from, to, label }])),
});

test('branches spread sideways and merge below both', () => {
  const c = chart([['導入'], ['図書館'], ['屋敷'], ['対決']], [['導入', '図書館'], ['導入', '屋敷'], ['図書館', '対決'], ['屋敷', '対決']]);
  const p = layoutChart(c);
  assert.equal(p.導入.y, 0);
  assert.equal(p.図書館.y, CHART_ROW); assert.equal(p.屋敷.y, CHART_ROW);
  assert.ok(Math.abs(p.図書館.x - p.屋敷.x) >= CHART_W, 'siblings do not overlap');
  assert.equal(p.対決.y, 2 * CHART_ROW);
  const mid = (p.図書館.x + p.屋敷.x) / 2;
  assert.ok(Math.abs(p.対決.x - mid) < 1, 'merge is centred under its parents');
});

test('a loop back to an earlier scene does not push it down, and placed nodes keep their spot', () => {
  const c = chart([['A'], ['B'], ['C', 'event', { x: 900, y: 50 }]], [['A', 'B'], ['B', 'A', 'もう一度'], ['B', 'C']]);
  const p = layoutChart(c);
  assert.equal(p.A.y, 0); assert.equal(p.B.y, CHART_ROW);
  assert.deepEqual(p.C, { x: 900, y: 50 });
});

test('clue list shows where each piece of information comes from, and orphans', () => {
  const c = chart([['導入'], ['図書館', 'place'], ['日記', 'info'], ['噂', 'info']], [['導入', '図書館', '調べに行く'], ['図書館', '日記', '〈図書館〉成功']]);
  const list = clueList(c);
  assert.deepEqual(list.map(x => [x.node.id, x.from.map(f => `${f.node.id}:${f.label}`), x.orphan]), [['日記', ['図書館:〈図書館〉成功'], false], ['噂', [], true]]);
});

test('scenes are grouped by place path; points without a place come last', async () => {
  const { scenesByPlace } = await import('../app/js/chart.js');
  const w = { notes: { 日本: { id: '日本', kind: 'place', title: '日本', parents: [] }, 図書館: { id: '図書館', kind: 'place', title: '図書館', parents: ['日本'] }, 屋敷: { id: '屋敷', kind: 'place', title: '屋敷', parents: ['日本'] } } };
  const c = chart([['a'], ['b'], ['c'], ['d']], []);
  c.nodes.a.place = '図書館'; c.nodes.b.place = '屋敷'; c.nodes.c.place = '図書館';
  const g = scenesByPlace(c, w);
  assert.deepEqual(g.map(x => [x.label, x.nodes.map(n => n.id)]), [['日本 › 図書館', ['a', 'c']], ['日本 › 屋敷', ['b']], ['場所なし', ['d']]].sort((p, q) => p[0] === '場所なし' ? 1 : q[0] === '場所なし' ? -1 : p[0].localeCompare(q[0], 'ja')));
});

test('scrubbing drops references to cards that no longer exist', async () => {
  const { scrubChart, nodeCards } = await import('../app/js/chart.js');
  const c = chart([['a']], []);
  Object.assign(c.nodes.a, { place: 'gone', cast: ['p1', 'gone'], items: ['gone'], refs: ['r1'] });
  scrubChart(c, id => id !== 'gone');
  assert.deepEqual(nodeCards(c.nodes.a), ['p1', 'r1']);
  assert.equal(c.nodes.a.place, undefined);
});

test('a tall point pushes the next row down so they do not overlap', () => {
  const c = chart([['A'], ['B'], ['C']], [['A', 'B'], ['B', 'C']]);
  const p = layoutChart(c, id => (id === 'A' ? 300 : 80));
  assert.ok(p.B.y >= 300 + 40, 'row below the tall point clears it');
  assert.equal(p.C.y - p.B.y, CHART_ROW, 'normal rows keep the usual spacing');
});
