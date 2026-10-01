// 家系図の自動配置
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFamily, NODE_W, ROW } from '../app/js/ui/familyLayout.js';

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
