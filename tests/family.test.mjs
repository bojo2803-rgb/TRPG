// 家系図の自動配置
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFamily, coParents, NODE_W, ROW } from '../app/js/ui/familyLayout.js';

const overlap = pos => { const v = Object.values(pos); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i].y === v[j].y && Math.abs(v[i].x - v[j].x) < NODE_W) return true; return false; };

test('three generations: children below parents, spouses side by side, no overlap', () => {
  const people = ['祖父', '祖母', '父', '母', '私', '妹', '叔父'];
  const P = [['祖父', '父'], ['祖母', '父'], ['祖父', '叔父'], ['祖母', '叔父'], ['父', '私'], ['母', '私'], ['父', '妹'], ['母', '妹']].map(([a, b]) => ({ a, b }));
  const S = [{ a: '祖父', b: '祖母' }, { a: '父', b: '母' }];
  const { pos, gen } = layoutFamily(people, P, S);
  assert.deepEqual([gen['祖父'], gen['父'], gen['母'], gen['私']], [0, 1, 1, 2]);
  assert.equal(pos['父'].y, ROW); assert.equal(pos['私'].y, 2 * ROW);
  assert.ok(Math.abs(pos['父'].x - pos['母'].x) < NODE_W * 1.5, 'spouses adjacent');
  assert.ok(!overlap(pos));
  // 親の組の真ん中が、子の組の範囲の上にある
  const mid = (pos['父'].x + pos['母'].x) / 2, kids = [pos['私'].x, pos['妹'].x];
  assert.ok(mid >= Math.min(...kids) - NODE_W && mid <= Math.max(...kids) + NODE_W);
});

test('cycles and separate families do not hang or overlap', () => {
  const { pos } = layoutFamily(['甲', '乙', '丙', '丁'], [{ a: '甲', b: '乙' }, { a: '乙', b: '甲' }], [{ a: '丙', b: '丁' }]);
  assert.equal(Object.keys(pos).length, 4);
  assert.ok(!overlap(pos));
});

test('unmarried parents of the same child become a pair placed side by side', () => {
  const P = [{ a: '父', b: '子' }, { a: '母', b: '子' }, { a: '夫', b: '娘' }, { a: '妻', b: '娘' }];
  const S = [{ a: '夫', b: '妻' }];
  const pairs = coParents(P, S);
  assert.deepEqual(pairs.map(p => [p.a, p.b].sort().join()), ['母,父']); // 結婚している2人は数えない
  const { pos } = layoutFamily(['父', '母', '子', '夫', '妻', '娘'], P, [...S, ...pairs]);
  assert.ok(Math.abs(pos['父'].x - pos['母'].x) < NODE_W * 1.5, 'co-parents adjacent');
  assert.equal(pos['父'].y, pos['母'].y);
});

test('a distant ancestor sits that many rows above; unknown counts as two', () => {
  const { gen } = layoutFamily(['始祖', '私', '謎の祖', '妹', '父'], [{ a: '始祖', b: '私', gen: 5 }, { a: '謎の祖', b: '妹', gen: null }, { a: '父', b: '私' }], []);
  assert.equal(gen['私'] - gen['始祖'], 5);
  assert.equal(gen['私'] - gen['父'], 1, 'the parent stays right above the child');
  assert.equal(gen['妹'] - gen['謎の祖'], 2);
});
