// 世界のデータの形と、それを扱う決まり。
// 世界 = 付箋（notes）・つながり（links）・ボード（boards）・テンプレート（templates）・世界線（tracks）・地図（maps）・架空の暦（calendars）・画像（images）
import { uid, clone } from './util.js';
import { T, isT, fromDays, wallToUtc } from './cal/time.js';

export const FORMAT = 'trpg-world', VERSION = 1;

export const DEFAULT_SETTINGS = () => ({
  tz: 'Asia/Tokyo',
  cal: {
    western: { switch: '1582', era: 'historical', yearStart: 'jan1' },
    wareki: { nanboku: 'both', kaigen: 'both', legend: 'note' },
    kyureki: { y2033: 'undecided' },
    hijri: { method: 'uaq', leap: '16', epoch: 'civil', dayStart: 'midnight' },
  },
});

// 付箋 { id, title, body, tags, color, fields, parents（まとめの親）, board（専用ボード）, collapsed（まとめをたたむ）,
//        when（時系列マップ上の位置）, legs（主体の区間）, origin（分身の元） }
export const newNote = (p = {}) => ({ id: uid('n'), title: '', body: '', tags: [], color: null, fields: {}, parents: [], ...p });
// つながり { id, a, b, label, color, style: solid|dashed|dotted, arrow: none|end|both, kind: link|parent（家族の親→子）|spouse（夫婦）|order（前後） }
export const newLink = (a, b, p = {}) => ({ id: uid('l'), a, b, label: '', color: null, style: 'solid', arrow: 'none', kind: 'link', ...p });
// ボード { id, name, kind: cork|family, owner（専用ボードなら持ち主の付箋）, items: { 付箋id: {x, y} }, collapsed: [付箋id] }
export const newBoard = (p = {}) => ({ id: uid('b'), name: '新しいボード', kind: 'cork', owner: null, items: {}, collapsed: [], ...p });

export function newWorld(name = '新しい世界') {
  const w = {
    format: FORMAT, version: VERSION, id: uid('w'), name,
    settings: DEFAULT_SETTINGS(),
    notes: {}, links: {}, boards: {}, templates: {}, maps: {}, calendars: {}, images: {},
    tracks: [{ id: 'main', name: '本線', lane: 0, color: 0, cal: 'west', from: T(-5040344048455), to: T(2488070) }],
  };
  const b = newBoard({ name: 'コルクボード' });
  w.boards[b.id] = b;
  for (const t of builtinTemplates()) w.templates[t.id] = t;
  return w;
}

// テンプレート { id, name, tags（このタグの付箋に入力欄が出る）, fields: [{ key, label, type: text|long|number|date|select|section, options }] }
// CoC 6版：項目名と入力の枠だけ（ルールブックの本文は入れない）
export function builtinTemplates() {
  const f = (label, type = 'text', p = {}) => ({ key: label, label, type, ...p });
  const sec = label => ({ key: '§' + label, label, type: 'section' });
  const nums = names => names.map(n => f(n, 'number'));
  return [{
    id: 'tpl-coc6', name: 'クトゥルフ神話TRPG 6版 キャラクター', tags: ['探索者', 'NPC'],
    fields: [
      sec('基本'), f('職業'), f('年齢', 'number'), f('性別'), f('出身'), f('所属'), f('生年月日', 'date'),
      sec('能力値'), ...nums(['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU']),
      sec('副次的な数値'), ...nums(['SAN', '幸運', 'アイデア', '知識', '耐久力', 'マジック・ポイント']), f('ダメージ・ボーナス'),
      sec('戦闘技能'), ...nums(['回避', 'キック', '組み付き', 'こぶし（パンチ）', '頭突き', '投擲', 'マーシャルアーツ', '拳銃', 'サブマシンガン', 'ショットガン', 'マシンガン', 'ライフル']),
      sec('探索技能'), ...nums(['応急手当', '鍵開け', '隠す', '隠れる', '聞き耳', '忍び歩き', '写真術', '精神分析', '追跡', '登攀', '図書館', '目星']),
      sec('行動技能'), ...nums(['運転', '機械修理', '重機械操作', '乗馬', '水泳', '製作', '操縦', '跳躍', '電気修理', 'ナビゲート', '変装']),
      sec('交渉技能'), ...nums(['言いくるめ', '信用', '説得', '値切り', '母国語']), f('ほかの言語'),
      sec('知識技能'), ...nums(['医学', 'オカルト', '化学', 'クトゥルフ神話', '芸術', '経理', '考古学', 'コンピューター', '心理学', '人類学', '生物学', '地質学', '電子工学', '天文学', '博物学', '物理学', '法律', '薬学', '歴史']),
      sec('そのほか'), f('武器', 'long'), f('所持品', 'long'), f('経歴', 'long'),
    ],
  }];
}

export const notesWithTag = (w, tag) => Object.values(w.notes).filter(n => n.tags.includes(tag));
export const templatesFor = (w, note) => Object.values(w.templates).filter(t => t.tags.some(tag => note.tags.includes(tag)));
export const allTags = w => [...new Set(Object.values(w.notes).flatMap(n => n.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
export const childrenOf = (w, id) => Object.values(w.notes).filter(n => n.parents.includes(id));
export const linksOf = (w, id) => Object.values(w.links).filter(l => l.a === id || l.b === id);
export const findByTitle = (w, title) => Object.values(w.notes).find(n => n.title === title);

// 付箋を消す：その付箋を指しているものをすべて片付ける（つながり・ボード・地図のピン・まとめの親・分身の元・専用ボード）
export function deleteNote(w, id) {
  const n = w.notes[id];
  if (!n) return;
  delete w.notes[id];
  for (const l of Object.values(w.links)) if (l.a === id || l.b === id) delete w.links[l.id];
  for (const b of Object.values(w.boards)) {
    delete b.items[id];
    b.collapsed = b.collapsed.filter(x => x !== id);
    if (b.owner === id) delete w.boards[b.id];
  }
  for (const m of Object.values(w.maps)) m.pins = m.pins.filter(p => p.note !== id);
  for (const o of Object.values(w.notes)) {
    o.parents = o.parents.filter(p => p !== id);
    if (o.origin === id) delete o.origin;
  }
}

// 主体（時系列マップ上の道筋を持つ付箋）と、時系列マップ上の出来事
export const subjectsOf = w => Object.values(w.notes).filter(n => n.legs);
export const timedNotes = w => Object.values(w.notes).filter(n => n.when);

// 読み込んだデータを今の形に直す。試作品（時系列マップ 第5〜7版）の書き出しも、世界として開ける
export function migrateWorld(d) {
  if (!d || typeof d !== 'object') throw new Error('世界のデータではありません');
  if (d.format === FORMAT) return fill(d);
  if (Array.isArray(d.tracks) && Array.isArray(d.subjects) && Array.isArray(d.events)) return fromPrototype(d);
  throw new Error('世界のデータではありません');
}
function fill(d) {
  const w = { ...newWorld(d.name), ...d };
  w.settings = { ...DEFAULT_SETTINGS(), ...d.settings, cal: { ...DEFAULT_SETTINGS().cal, ...d.settings?.cal } };
  for (const k of ['notes', 'links', 'boards', 'templates', 'maps', 'calendars', 'images']) w[k] ||= {};
  for (const n of Object.values(w.notes)) { n.tags ||= []; n.parents ||= []; n.fields ||= {}; n.body ??= ''; n.title ??= ''; }
  for (const b of Object.values(w.boards)) { b.items ||= {}; b.collapsed ||= []; }
  for (const m of Object.values(w.maps)) m.pins ||= [];
  if (!w.tracks?.some(t => t.id === 'main')) throw new Error('本線がありません');
  return w;
}

// 試作品のデータ：日時は「日の小数」（その土地の時計）。本体では世界時の {d,s} にする（架空の暦はそのまま）
function fromPrototype(p) {
  const w = newWorld('試作品から読み込んだ世界');
  const tz = w.settings.tz, west = new Set(p.tracks.filter(t => t.cal !== 'fict').map(t => t.id));
  const conv = (tr, x) => west.has(tr) ? wallToUtc(tz, fromDays(x)) : fromDays(x);
  const pt = q => q && [q[0], conv(q[0], q[1]), ...(q[2] ? [q[2]] : [])];
  const cals = {};
  w.tracks = p.tracks.map(t => {
    const o = { id: t.id, name: t.name, lane: t.lane, color: t.color, cal: t.cal === 'fict' ? 'fict' : 'west', from: conv(t.id, t.from), to: conv(t.id, t.to) };
    if (t.fork) o.fork = pt(t.fork);
    if (t.merge) o.merge = pt(t.merge);
    if (t.loop) o.loop = t.loop;
    if (t.cal === 'fict') {
      const key = JSON.stringify([t.calName, t.months || null]);
      if (!cals[key]) {
        const c = { id: uid('c'), name: t.calName || '架空の暦', months: (t.months || Array.from({ length: 12 }, (_, i) => `${i + 1}月`)).map(name => ({ name, days: 30 })), weekdays: [], epoch: '' };
        cals[key] = c; w.calendars[c.id] = c;
      }
      o.calId = cals[key].id;
    }
    return o;
  });
  const gid = {};
  for (const [g, v] of Object.entries(p.groups || {})) {
    const n = newNote({ title: v.title, tags: ['シナリオ'], collapsed: !v.open });
    w.notes[n.id] = gid[g] = n;
  }
  for (const e of p.events) {
    const prec = west.has(e.tr) && (e.t % 1 === 0) ? 'day' : 'minute';
    const n = newNote({ title: e.title, tags: [...(e.tags || [])], when: { tr: e.tr, t: conv(e.tr, e.t), prec, tz: west.has(e.tr) ? tz : null } });
    if (e.branch) n.when.branch = true;
    if (e.k) n.when.k = e.k;
    if (e.per) n.when.per = clone(e.per);
    if (e.group && gid[e.group]) n.parents = [gid[e.group].id];
    w.notes[n.id] = n;
  }
  const sid = {};
  for (const s of p.subjects) { const n = newNote({ title: s.name }); sid[s.id] = n; w.notes[n.id] = n; }
  for (const s of p.subjects) {
    const n = sid[s.id];
    n.legs = s.legs.map(g => {
      const o = { tr: g.tr, a: conv(g.tr, g.a), b: conv(g.tr, g.b) };
      if (g.ka) o.ka = g.ka;
      if (g.kb) o.kb = g.kb;
      if (g.jump) o.jump = clone(g.jump);
      return o;
    });
    if (s.origin && sid[s.origin]) n.origin = sid[s.origin].id;
  }
  return w;
}

export const isTime = isT;
