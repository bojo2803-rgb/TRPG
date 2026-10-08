// 使いやすさの作り直し：画面のアドレス・最近・どこからでも探す・一覧の表とまとまり・シナリオに出るもの・まとめての操作
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, newNote, newLink } from '../app/js/model.js';
import { parseRoute, formatRoute, pushRecent } from '../app/js/route.js';
import { searchAll, linkQuery } from '../app/js/search.js';
import { COLUMNS, sortRows, groupCards, inScenario, scenarioGroups, picOf } from '../app/js/listing.js';
import { addToScenario, removeFromScenario, setPlace, addMember, addTag, deleteMany } from '../app/js/bulk.js';

// 小さな世界：日本 › 東京都 › 新宿 › 喫茶。シナリオ1つ、人物3人、集団2つ、アイテム1つ
function world() {
  const w = newWorld('t');
  const add = (id, kind, title, x = {}) => { w.notes[id] = newNote({ id, kind, title, ...x }); return id; };
  add('jp', 'place', '日本'); add('tk', 'place', '東京都', { parents: ['jp'] }); add('sj', 'place', '新宿', { parents: ['tk'] }); add('cafe', 'place', '喫茶', { parents: ['sj'] });
  add('sc', 'scenario', '黄昏の喫茶店', { fields: { 状態: '準備中' }, at: 'cafe' });
  add('kuj', 'person', '探偵 九条', { parents: ['sc'], at: 'cafe', fields: { 職業: '探偵', 年齢: '30', よみ: 'くじょう' } });
  add('kat', 'person', '店主 葛城', { parents: ['sc'], fields: { 職業: '店主' } });
  add('mur', 'person', '記者 三浦', { at: 'sj', body: '葛城の古い友人' });
  add('cult', 'group', '星の智慧派', { fields: { 種類: '教団' } });
  add('pol', 'group', '警察', { fields: { 種類: '公的機関' } });
  add('key', 'item', '銀の鍵', { fields: { 区分: 'アーティファクト' } });
  add('idea', 'note', '噂：夜に灯りがつく', { tags: ['噂'] });
  for (const [id, a, b, x] of [['m1', 'kuj', 'pol', { label: '元刑事', to: { t: { d: 1, s: 0 } } }], ['m2', 'kat', 'cult', { label: '信者' }], ['m3', 'mur', 'pol', {}], ['h1', 'kat', 'key', {}]]) {
    w.links[id] = newLink(a, b, { id, kind: id[0] === 'm' ? 'member' : 'holds', ...x });
  }
  w.notes.sc.chart = { nodes: { p1: { id: 'p1', title: '導入', type: 'event', refs: [], cast: ['mur'], items: ['key'] } }, edges: {} };
  return w;
}

test('routes round-trip and ignore other hashes', () => {
  for (const [view, arg] of [['people', null], ['people', { open: 'kuj' }], ['people', { open: 'kuj', mode: 'board' }], ['people', { sub: 'family' }], ['board', { board: 'b1' }]]) {
    const r = parseRoute(formatRoute(view, arg));
    assert.equal(r.view, view);
    for (const [k, v] of Object.entries(arg || {})) assert.equal(r[k], v, `${view} ${k}`);
  }
  assert.equal(formatRoute('people', { open: 'kuj', mode: 'board' }), '#/people/kuj/board');
  assert.equal(parseRoute('#import&f=1&k=2'), null);
  assert.equal(parseRoute('#drive=x.apps.googleusercontent.com'), null);
  assert.equal(parseRoute(''), null);
});

test('recent list: newest first, no duplicates, capped', () => {
  let r = [];
  for (const id of ['a', 'b', 'c', 'a']) r = pushRecent(r, id, 3);
  assert.deepEqual(r, ['a', 'c', 'b']);
  r = pushRecent(r, 'd', 3);
  assert.deepEqual(r, ['d', 'a', 'c']);
});

test('search finds every kind, ranks name starts first, and tells cards apart', () => {
  const w = world();
  const ids = q => searchAll(w, q).map(x => x.id);
  assert.deepEqual(ids('探偵'), ['kuj']);
  assert.ok(ids('葛城').indexOf('kat') < ids('葛城').indexOf('mur'), 'title match before body match');
  assert.ok(ids('喫茶').indexOf('cafe') < ids('喫茶').indexOf('sc'), 'name that starts with the text comes first');
  assert.deepEqual(ids('くじょう'), ['kuj'], 'reading (よみ) field is searched');
  assert.deepEqual(ids('噂'), ['idea'], 'notes are searched too');
  const k = searchAll(w, '探偵')[0];
  assert.equal(k.kind, 'person');
  assert.match(k.hint, /探偵/); assert.match(k.hint, /喫茶/);
  assert.match(searchAll(w, '喫茶')[0].hint, /日本 › 東京都 › 新宿/);
});

test('search: recent breaks ties, and the open scenario comes first', () => {
  const w = world();
  assert.deepEqual(searchAll(w, '', { recent: ['mur', 'kuj'] }).map(x => x.id), ['mur', 'kuj'], 'empty query lists recent');
  const plain = searchAll(w, '店').map(x => x.id), pref = searchAll(w, '店', { recent: ['kat'] }).map(x => x.id);
  assert.ok(pref.indexOf('kat') <= plain.indexOf('kat'));
  const scoped = searchAll(w, '記者', { scope: inScenario(w, 'sc') });
  assert.equal(scoped[0].id, 'mur'); assert.equal(scoped[0].inScope, true, 'chart cast counts as in the scenario');
  const all = searchAll(w, '', { scope: inScenario(w, 'sc') }).filter(x => x.inScope).map(x => x.id).sort();
  assert.deepEqual(all, [], 'empty query does not list the whole scenario');
});

test('linkQuery finds the half-typed [[name before the caret', () => {
  assert.deepEqual(linkQuery('会う [[葛', 6), { start: 3, q: '葛' });
  assert.deepEqual(linkQuery('[[', 2), { start: 0, q: '' });
  assert.equal(linkQuery('[[葛城]] は', 7), null, 'after a closed link');
  assert.equal(linkQuery('[[葛\n城', 5), null, 'not across a new line');
  assert.equal(linkQuery('ただの文', 3), null);
});

test('table columns: current membership only, last two place steps, holder', () => {
  const w = world(), col = (kind, key, id) => COLUMNS[kind].find(c => c.key === key).value(w, w.notes[id]);
  assert.equal(col('person', '所属', 'kuj'), '', 'past membership is not shown');
  assert.equal(col('person', '所属', 'kat'), '星の智慧派');
  assert.equal(col('person', 'いる所', 'kuj'), '新宿 › 喫茶');
  assert.equal(col('person', 'シナリオ', 'kuj'), '黄昏の喫茶店');
  assert.equal(col('person', '職業', 'kuj'), '探偵');
  assert.equal(col('item', '持ち主', 'key'), '店主 葛城');
  assert.equal(col('group', '人数', 'pol'), '1');
  assert.equal(col('scenario', '舞台', 'sc'), '新宿 › 喫茶');
});

test('sorting keeps blanks last in both directions', () => {
  const w = world(), people = ['kuj', 'kat', 'mur'].map(id => w.notes[id]);
  const C = new Intl.Collator('ja').compare, jobs = ['探偵', '店主'].sort(C);
  assert.deepEqual(sortRows(w, people, 'person', '職業', 1).map(n => n.fields.職業 || ''), [...jobs, '']);
  assert.deepEqual(sortRows(w, people, 'person', '職業', -1).map(n => n.fields.職業 || ''), [...jobs.reverse(), '']);
  // 名前は、よみのある人はよみ（九条＝くじょう）で並ぶ
  assert.deepEqual(sortRows(w, people, 'person', '名前', 1).map(n => n.title), [['店主 葛城', '店主 葛城'], ['くじょう', '探偵 九条'], ['記者 三浦', '記者 三浦']].sort((a, b) => C(a[0], b[0])).map(x => x[1]));
});

test('grouping puts a card in every group it belongs to, and none last', () => {
  const w = world();
  w.links.m4 = newLink('kat', 'pol', { id: 'm4', kind: 'member' });
  const g = groupCards(w, ['kuj', 'kat', 'mur'].map(id => w.notes[id]), '所属');
  const by = Object.fromEntries(g.map(x => [x.label, x.items.map(n => n.id)]));
  assert.deepEqual(by, { 星の智慧派: ['kat'], 警察: ['kat', 'mur'], なし: ['kuj'] });
  assert.equal(g.at(-1).label, 'なし', 'none comes last');
  const s = groupCards(w, ['kuj', 'kat', 'mur'].map(id => w.notes[id]), 'シナリオ');
  assert.deepEqual(s.map(x => x.label), ['黄昏の喫茶店', 'なし']);
});

test('what appears in a scenario: contents, chart cards, and groups of the cast', () => {
  const w = world();
  assert.deepEqual([...inScenario(w, 'sc')].sort(), ['kat', 'key', 'kuj', 'mur'].sort());
  assert.deepEqual([...scenarioGroups(w, 'sc')].sort(), ['cult', 'pol'], 'kuj left the police, but mur (chart cast) is in it');
});

test('picture: own picture, else the first image in the memo', () => {
  const w = world();
  assert.equal(picOf(w, w.notes.kuj), null);
  w.notes.kuj.body = 'x ![顔](img:i1) ![b](img:i2)';
  assert.equal(picOf(w, w.notes.kuj), 'i1');
  w.notes.kuj.pic = 'i9';
  assert.equal(picOf(w, w.notes.kuj), 'i9');
});

test('bulk actions change many cards at once and skip what is already done', () => {
  const w = world();
  assert.equal(addToScenario(w, ['kuj', 'mur', 'key'], 'sc'), 2);
  assert.ok(w.notes.mur.parents.includes('sc'));
  assert.equal(removeFromScenario(w, ['kuj', 'mur'], 'sc'), 2);
  assert.ok(!w.notes.kuj.parents.includes('sc'));
  assert.equal(setPlace(w, ['kuj', 'kat'], 'tk'), 2);
  assert.equal(w.notes.kat.at, 'tk');
  assert.equal(setPlace(w, ['kat'], null), 1);
  assert.equal(w.notes.kat.at, undefined);
  assert.equal(addMember(w, ['kat', 'mur'], 'cult', '下っ端'), 1, 'kat is already a member');
  assert.ok(Object.values(w.links).some(l => l.kind === 'member' && l.a === 'mur' && l.b === 'cult' && l.label === '下っ端'));
  assert.equal(addTag(w, ['kuj', 'idea'], '噂'), 1);
  assert.deepEqual(w.notes.kuj.tags, ['噂']);
  assert.equal(deleteMany(w, ['kat', 'mur']), 2);
  assert.ok(!w.notes.kat && !Object.values(w.links).some(l => l.a === 'kat' || l.a === 'mur'));
  assert.deepEqual(w.notes.sc.chart.nodes.p1.cast, [], 'deleted cast leaves the chart');
});

test('names sort by their reading (よみ) when one is written', async () => {
  const { byTitle } = await import('../app/js/util.js');
  const P = (id, title, よみ) => ({ id, kind: 'person', title, parents: [], tags: [], fields: よみ ? { よみ } : {} });
  const people = [P('a', '店主 葛城', 'かつらぎ'), P('b', '記者 三浦', 'みうら'), P('c', '刑事 鬼塚', 'おにづか')];
  const w = { notes: Object.fromEntries(people.map(p => [p.id, p])), links: {} };
  assert.deepEqual(sortRows(w, people, 'person', '名前', 1).map(n => n.id), ['c', 'a', 'b']);
  assert.deepEqual([...people].sort(byTitle).map(n => n.id), ['c', 'a', 'b']);
});
