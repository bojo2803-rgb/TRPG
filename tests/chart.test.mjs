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
