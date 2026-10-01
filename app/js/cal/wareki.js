// 和暦（元号＋旧暦）。445年〜明治5年は「日本暦日原典」準拠の対照表（ya-wareki）、明治6年からはグレゴリオ暦。
// 流派（設計メモ §5.5 (b)。よく使われる順）：
//   南北朝（1331〜1392年ごろ）：両方を書く（南朝が先。★）／北朝だけ／南朝だけ
//   改元した年：改元の日で切り替え、年表の慣例（その年の1月1日にさかのぼる）も併記（★）／改元の日で切り替え／その年の1月1日にさかのぼる
//   伝承期間（神武天皇〜444年）：注記して表示（★）／表示しない。旧暦の日付の表がないので、皇紀と干支だけを出す
import { WarekiDate, ERA_TUPLES, ERA_NORTH_TUPLES, findDateParts } from '../../vendor/ya-wareki.js';
import { fromJdnG } from './western.js';

export const WAREKI_FIRST_JDN = 1883618; // 旧暦445年1月1日
export const WAREKI_SCHOOLS = {
  nanboku: [['both', '北朝と南朝を併記（南朝を先に）'], ['north', '北朝だけ'], ['south', '南朝だけ']],
  kaigen: [['both', '改元の日で切り替え、年表の慣例（年の初めにさかのぼる）も併記'], ['actual', '改元の日で切り替え（実際の運用）'], ['retro', 'その年の1月1日にさかのぼって新元号（年表の慣例）']],
  legend: [['note', '伝承期間は「伝承上の暦日」と注記して表示'], ['hide', '伝承期間は表示しない']],
};
const SOUTH = new Set(['元弘', '延元', '興国', '正平', '建徳', '文中', '天授', '弘和', '元中']);
const NORTH_ONLY = new Set(['正慶', '暦応', '康永', '貞和', '観応', '文和', '延文', '康安', '貞治', '応安', '永和', '康暦', '永徳', '至徳', '嘉慶', '康応']);
// 元号の表：[名前, 元年の年, 始まり, 終わり]（両朝の表をまとめ、同じ名前は期間の長い方）
const ERAS = (() => {
  const m = new Map();
  for (const t of [...ERA_TUPLES, ...ERA_NORTH_TUPLES]) {
    const key = t[0] + '|' + t[2], prev = [...m.values()].find(x => x[0] === t[0] && x[2] === t[2]);
    if (!prev) m.set(key, t); else if (t[3] > prev[3]) m.set(key, t);
  }
  return [...m.values()].sort((a, b) => a[2] - b[2]);
})();
export const ERA_NAMES = [...new Set(ERAS.map(e => e[0]))];
const courtOf = name => SOUTH.has(name) ? 'south' : NORTH_ONLY.has(name) ? 'north' : null;

const STEMS = '甲乙丙丁戊己庚辛壬癸', BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const mod = (a, b) => a - b * Math.floor(a / b);
export const kanshiYear = y => { const i = mod(y - 4, 60); return STEMS[i % 10] + BRANCHES[i % 12]; };
export const kanshiDay = jdn => { const i = mod(jdn + 49, 60); return STEMS[i % 10] + BRANCHES[i % 12]; };
export const kouki = y => y + 660; // 皇紀（神武天皇即位紀元）

// ユリウス通日 → 和暦。{ lunar: { year, month, leap, day }, eras: [{ name, year, court }], retro, kouki, kanshi, legend }
export function fromJdn(jdn, o = {}) {
  if (jdn < WAREKI_FIRST_JDN) {
    const y = fromJdnG(jdn).y;
    return { legend: true, kouki: kouki(y), kanshi: kanshiYear(y), westYear: y };
  }
  let wd;
  // 元号のない期間（大化より前、白雉と朱鳥のあいだなど）も旧暦の日付は出せる
  try { wd = WarekiDate.fromJd(jdn); } catch { try { const p = findDateParts(jdn); wd = { year: p.year, month: p.month, isLeapMonth: p.isLeapMonth, day: p.day }; } catch { return null; } }
  const lunar = { year: wd.year, month: wd.month, leap: wd.isLeapMonth, day: wd.day };
  let eras = ERAS.filter(e => e[2] <= jdn && jdn < e[3]).map(e => ({ name: e[0], year: wd.year - e[1] + 1, court: courtOf(e[0]), first: e[1] }));
  // 同じ名前が両朝の表にあるとき（建武など）は1つに
  eras = eras.filter((e, i) => eras.findIndex(x => x.name === e.name) === i);
  if (eras.length > 1) {
    const nb = o.nanboku || 'both';
    eras.sort((a, b) => (a.court === 'south' ? 0 : 1) - (b.court === 'south' ? 0 : 1));
    if (nb === 'north') eras = eras.filter(e => e.court !== 'south');
    else if (nb === 'south') eras = eras.filter(e => e.court !== 'north');
  }
  // 年表の慣例：同じ年のあとで改元していれば、その年の初めにさかのぼってその元号の元年とする
  const court = eras[0]?.court, later = ERAS.filter(e => e[1] === wd.year && e[2] > jdn && (!court || !courtOf(e[0]) || courtOf(e[0]) === court));
  const retro = later.length ? { name: later.at(-1)[0], year: 1 } : null;
  return { lunar, eras, retro, kouki: kouki(wd.year), kanshi: kanshiYear(wd.year), kanshiDay: kanshiDay(jdn), gregorianEra: jdn >= 2405160 };
}

const yearStr = y => y === 1 ? '元' : String(y);
// 和暦の文字（prec：year | month | day）
export function formatWareki(jdn, prec = 'day', o = {}) {
  const r = fromJdn(jdn, o);
  if (!r) return '';
  if (r.legend) return o.legend === 'hide' ? '' : `皇紀${r.kouki}年（${r.kanshi}）・伝承期間（旧暦の日付は445年より前は出せません）`;
  const md = prec === 'year' ? '' : prec === 'month' ? `${r.lunar.leap ? '閏' : ''}${r.lunar.month}月` : `${r.lunar.leap ? '閏' : ''}${r.lunar.month}月${r.lunar.day}日`;
  const kaigen = o.kaigen || 'both';
  let names = r.eras.map(e => `${e.name}${yearStr(e.year)}年`);
  if (!names.length) names = [`（元号なし）旧暦${r.lunar.year}年`];
  if (r.retro && kaigen === 'retro') names = [`${r.retro.name}元年`];
  const main = names.join('・') + md;
  const note = r.retro && kaigen === 'both' ? `（年表では${r.retro.name}元年）` : '';
  return main + note;
}
// 和暦 → ユリウス通日。存在しない日付は null
export function toJdn({ era, year, month, leap = false, day }) {
  try {
    const wd = new WarekiDate(era || null, year, month, day, leap);
    return wd.jd;
  } catch { return null; }
}
