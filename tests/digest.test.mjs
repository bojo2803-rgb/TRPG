// AIに読ませる文章：世界全体を1つの文章に。頼み文・名前の区別・年齢はシナリオごと・チャートは番号つきの点と矢印・時系列は時間順
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, newNote, newLink } from '../app/js/model.js';
import { worldDigest } from '../app/js/aiDigest.js';

const day = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
const when = (y, m, d, x = {}) => ({ tr: 'main', t: { d: day(y, m, d), s: 0 }, prec: 'day', tz: 'UTC', ...x });

function world() {
  const w = newWorld('黄昏の世界');
  const add = (id, kind, title, x = {}) => { w.notes[id] = newNote({ id, kind, title, ...x }); return id; };
  add('jp', 'place', '日本'); add('cafe', 'place', '喫茶「黄昏」', { parents: ['jp'], body: '古書街の裏の喫茶店。' });
  add('sc', 'scenario', '黄昏の喫茶店', { at: 'cafe', period: when(1928, 6, 1), fields: { 状態: '準備中', 真相: '常連は儀式に呼ばれていた。' } });
  add('sc2', 'scenario', '雪山の山荘', { period: when(1935, 1, 1) });
  add('kat', 'person', '店主 葛城', { parents: ['sc', 'sc2'], at: 'cafe', born: when(1890, 4, 1), fields: { 職業: '店主', 年齢: '30' }, body: '無口だが常連思い。' });
  add('m1', 'person', '三浦', { parents: ['sc'] }); add('m2', 'person', '三浦'); // 同じ名前が2人
  add('cult', 'group', '銀の黄昏教団');
  add('key', 'item', '社務所の鍵', { parents: ['sc'] });
  add('ev1', 'note', '常連が消える', { parents: ['sc'], when: when(1928, 6, 3), at: 'cafe' });
  add('ev0', 'note', '店が開く', { when: when(1920, 1, 1) });
  add('idea', 'note', '噂：夜に灯りがつく', { tags: ['噂'] });
  for (const l of [newLink('kat', 'cult', { kind: 'member', label: '協力者' }), newLink('kat', 'key', { kind: 'holds' }), newLink('kat', 'm1', { label: '昔なじみ' })]) w.links[l.id] = l;
  w.notes.sc.chart = { nodes: {
    a: { id: 'a', title: '常連の失踪', type: 'event', refs: [], place: 'cafe', cast: ['kat'], time: '1日目・夕方', body: '店主から相談される。' },
    b: { id: 'b', title: '手帳を読む', type: 'info', refs: [], items: ['key'] },
    c: { id: 'c', title: '夜明け', type: 'ending', refs: [] },
  }, edges: { e1: { id: 'e1', from: 'a', to: 'b', label: '手帳を見る' }, e2: { id: 'e2', from: 'b', to: 'c', label: '' } } };
  return w;
}

test('the request to the AI comes first, and can be left out', () => {
  const md = worldDigest(world());
  assert.match(md, /^# 世界「黄昏の世界」/);
  assert.ok(md.indexOf('## AIへのお願い') < md.indexOf('## 人物'), 'request before the content');
  assert.match(md, /矛盾/); assert.match(md, /時系列/); assert.match(md, /抜け/);
  assert.ok(!worldDigest(world(), { request: false }).includes('## AIへのお願い'));
});

test('every card is there, across all scenarios of the world', () => {
  const w = world(), md = worldDigest(w);
  for (const n of Object.values(w.notes)) assert.ok(md.includes(n.title), n.title);
  assert.match(md, /### 店主 葛城[\s\S]*登場するシナリオ：黄昏の喫茶店（38歳）、雪山の山荘（44歳）/, 'age counted per scenario');
  assert.ok(!/年齢：30/.test(md), 'the old fixed age field is not written');
});

test('same names are told apart', () => {
  const md = worldDigest(world());
  assert.match(md, /三浦〔人物・1〕/); assert.match(md, /三浦〔人物・2〕/);
});

test('story chart: numbered points with where the arrows go', () => {
  const md = worldDigest(world());
  assert.match(md, /P1 常連の失踪〔出来事〕/);
  assert.match(md, /このあと：「手帳を見る」→ P2 手帳を読む/);
  assert.match(md, /P3 夜明け〔エンディング〕[\s\S]*このあと：なし/);
  assert.match(md, /場所：日本 › 喫茶「黄昏」/);
});

test('timeline lists events in time order with their place and scenario', () => {
  const md = worldDigest(world()), tl = md.slice(md.indexOf('## 時系列'));
  assert.ok(tl.indexOf('店が開く') < tl.indexOf('常連が消える'));
  assert.match(tl, /常連が消える[^\n]*喫茶「黄昏」[^\n]*黄昏の喫茶店/);
  assert.match(md, /## 付箋[\s\S]*噂：夜に灯りがつく/);
});

test('memberships, holdings and free links are written both ways readable', () => {
  const md = worldDigest(world());
  assert.match(md, /所属：銀の黄昏教団（協力者）/);
  assert.match(md, /持ち物：社務所の鍵/);
  assert.match(md, /店主 葛城 — 三浦〔人物・1〕「昔なじみ」/);
});
