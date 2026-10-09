// 一覧の表・まとまり・見分ける手がかり・絵・シナリオに出るもの（画面を持たない決まり）
import { kindOf, placePath, childrenOf, bornOf } from './model.js';
import { formatTime } from './cal/index.js';
import { collator, nameKey, byTitle } from './util.js';
import { nodeCards } from './chart.js';
import { imageIds } from './ui/markdown.js';

const f = (n, k) => { const v = n.fields?.[k]; return v == null ? '' : String(v); };
const live = l => !l.to && !l.done;
const t0 = l => l.from ? l.from.t.d * 86400 + l.from.t.s : -Infinity;
const links = (w, kind, side, id) => Object.values(w.links).filter(l => l.kind === kind && l[side] === id && w.notes[l.a] && w.notes[l.b]);
const titles = (w, ids, sep = '・') => ids.map(id => w.notes[id]?.title || '名前なし').join(sep);
// 道すじの最後の k 段（新宿 › 喫茶「黄昏」）
export const pathTail = (w, id, k = 2) => id && w.notes[id] ? placePath(w, id).slice(-k).map(x => w.notes[x].title || '名前なし').join(' › ') : '';
// いま入っている集団・いまのメンバー・いまの持ち主
export const groupsOf = (w, id) => links(w, 'member', 'a', id).filter(live).map(l => l.b);
export const membersOf = (w, id) => links(w, 'member', 'b', id).filter(live).map(l => l.a);
export const holderOf = (w, id) => links(w, 'holds', 'b', id).filter(live).sort((a, b) => t0(a) - t0(b)).pop()?.a || null;
const scenariosOf = (w, n) => n.parents.filter(p => kindOf(w.notes[p]) === 'scenario');

// 表の列（値はいつも文字。空なら ''）
export const COLUMNS = {
  person: [
    { key: '名前', value: (w, n) => n.title || '' },
    { key: '職業', value: (w, n) => f(n, '職業') },
    // 年齢はシナリオで変わるので、生年月日（並べ替えは日時の順）
    { key: '生年月日', value: (w, n) => { const b = bornOf(w, n); return b ? formatTime(b.t, { track: w.tracks.find(t => t.id === b.tr), tz: b.tz, prec: b.prec, approx: b.approx, until: b.until }, w) : ''; }, sort: (w, n) => { const b = bornOf(w, n); return b ? b.t.d * 86400 + b.t.s : null; } },
    { key: '所属', value: (w, n) => titles(w, groupsOf(w, n.id), '\n') }, // いくつかあれば1つずつ行を分ける
    { key: 'いる所', value: (w, n) => pathTail(w, n.at) },
    { key: 'シナリオ', value: (w, n) => titles(w, scenariosOf(w, n), '\n') },
  ],
  scenario: [
    { key: '名前', value: (w, n) => n.title || '' },
    { key: '状態', value: (w, n) => f(n, '状態') },
    { key: '人数', value: (w, n) => f(n, '人数') },
    { key: '舞台', value: (w, n) => pathTail(w, n.at) },
    { key: '登場', value: (w, n) => { const c = childrenOf(w, n.id).filter(k => ['person', 'item', 'group'].includes(kindOf(k))).length; return c ? String(c) : ''; } },
  ],
  item: [
    { key: '名前', value: (w, n) => n.title || '' },
    { key: '区分', value: (w, n) => f(n, '区分') },
    { key: '持ち主', value: (w, n) => { const h = holderOf(w, n.id); return h ? w.notes[h].title || '名前なし' : ''; } },
    { key: 'ある所', value: (w, n) => pathTail(w, n.at) },
  ],
  group: [
    { key: '名前', value: (w, n) => n.title || '' },
    { key: '種類', value: (w, n) => f(n, '種類') },
    { key: '人数', value: (w, n) => { const c = membersOf(w, n.id).length; return c ? String(c) : ''; } },
    { key: '拠点', value: (w, n) => pathTail(w, n.at) },
  ],
};
for (const k of Object.keys(COLUMNS)) for (const c of COLUMNS[k]) c.label = c.key;

const numeric = new Intl.Collator('ja', { numeric: true });
// 並べ替え：空の値はいつも最後。同じ値なら名前順
export function sortRows(w, list, kind, key, dir = 1) {
  const col = COLUMNS[kind]?.find(c => c.key === key) || COLUMNS[kind]?.[0];
  if (!col) return [...list];
  if (col.sort) return list.map(n => [n, col.sort(w, n)]).sort(([a, x], [b, y]) => (x == null) - (y == null) || dir * ((x ?? 0) - (y ?? 0)) || collator.compare(nameKey(a), nameKey(b))).map(p => p[0]);
  const val = col.key === '名前' ? n => nameKey(n) : n => col.value(w, n);
  return list.map(n => [n, val(n)]).sort(([a, x], [b, y]) => (!x) - (!y) || dir * numeric.compare(x, y) || collator.compare(nameKey(a), nameKey(b))).map(p => p[0]);
}

// まとまり：何でまとめるか（種類ごと）
export const GROUPS = { person: ['所属', 'シナリオ', 'いる所'], scenario: ['状態'], item: ['持ち主', '区分'], group: ['種類'] };
const keysOf = (w, n, by) => {
  switch (by) {
    case '所属': return groupsOf(w, n.id).map(id => [id, w.notes[id].title || '名前なし']);
    case 'シナリオ': return scenariosOf(w, n).map(id => [id, w.notes[id].title || '名前なし']);
    case 'いる所': return n.at && w.notes[n.at] ? [[n.at, pathTail(w, n.at)]] : [];
    case '持ち主': { const h = holderOf(w, n.id); return h ? [[h, w.notes[h].title || '名前なし']] : []; }
    default: { const v = f(n, by); return v ? [[v, v]] : []; }
  }
};
// まとまりごとのカード。いくつにも入るものは、それぞれに出る。どこにも入らないものは最後の「なし」
export function groupCards(w, list, by) {
  const map = new Map(), none = [];
  for (const n of list) {
    const ks = keysOf(w, n, by);
    if (!ks.length) none.push(n);
    for (const [k, label] of ks) { if (!map.has(k)) map.set(k, { key: k, label, items: [] }); map.get(k).items.push(n); }
  }
  const out = [...map.values()].sort((a, b) => collator.compare(a.label, b.label));
  if (none.length) out.push({ key: '', label: 'なし', items: none });
  return out;
}

// シナリオに出るもの：中身（登場・出来事・付箋）と、チャートの点に付けたカード
export function inScenario(w, sid) {
  const s = new Set(childrenOf(w, sid).map(n => n.id));
  for (const nd of Object.values(w.notes[sid]?.chart?.nodes || {})) for (const id of nodeCards(nd)) if (w.notes[id]) s.add(id);
  return s;
}
// シナリオのボードに「出るもの」をまとめて貼る位置：まだ貼っていないものを、種類ごとの行（人物・集団・アイテム・ロケーション・出来事や付箋）で、
// いま貼ってあるものの下へ並べる（1行6枚まで）。舞台のロケーションも入れる。戻り値：id → { x, y }
const BOARD_ROWS = ['person', 'group', 'item', 'place', 'note', 'scenario'];
export function scenarioBoardSpots(w, sid, items) {
  const sc = w.notes[sid], all = new Set(inScenario(w, sid));
  if (sc?.at && w.notes[sc.at]) all.add(sc.at);
  const ids = [...all].filter(id => id !== sid && !items[id]), ps = Object.values(items), out = {};
  const x0 = ps.length ? Math.min(...ps.map(p => p.x)) : 40;
  let y = ps.length ? Math.max(...ps.map(p => p.y)) + 170 : 40;
  for (const k of BOARD_ROWS) {
    const row = ids.filter(id => kindOf(w.notes[id]) === k).sort((a, b) => byTitle(w.notes[a], w.notes[b]));
    row.forEach((id, i) => { out[id] = { x: x0 + (i % 6) * 220, y: y + Math.floor(i / 6) * 130 }; });
    if (row.length) y += Math.ceil(row.length / 6) * 130 + 30;
  }
  return out;
}
// シナリオに出る集団：出るもののうちの集団と、出る人物がいま入っている集団
export function scenarioGroups(w, sid) {
  const out = new Set();
  for (const id of inScenario(w, sid)) {
    const k = kindOf(w.notes[id]);
    if (k === 'group') out.add(id);
    if (k === 'person') for (const g of groupsOf(w, id)) out.add(g);
  }
  return out;
}

// 絵：付けた絵、なければメモの最初の画像
export const picOf = (w, n) => n?.pic || imageIds(n?.body || '')[0] || null;

// 見分ける手がかり（検索の候補・カードの2行目）
export function hintOf(w, n) {
  switch (kindOf(n)) {
    case 'person': return [f(n, '職業'), titles(w, groupsOf(w, n.id)), pathTail(w, n.at)].filter(Boolean).join('・');
    case 'place': return [placePath(w, n.id).slice(0, -1).map(x => w.notes[x].title || '名前なし').join(' › '), f(n, '種類')].filter(Boolean).join('・');
    case 'scenario': return [f(n, '状態'), pathTail(w, n.at)].filter(Boolean).join('・');
    case 'item': { const h = holderOf(w, n.id); return [f(n, '区分'), h ? `持ち主：${w.notes[h].title || '名前なし'}` : '', pathTail(w, n.at)].filter(Boolean).join('・'); }
    case 'group': { const c = membersOf(w, n.id).length; return [f(n, '種類'), c ? `${c}人` : ''].filter(Boolean).join('・'); }
    default: return [n.when ? '出来事' : '', n.tags.join('・')].filter(Boolean).join('・');
  }
}
