// 西暦：ユリウス暦とグレゴリオ暦。どんなに遠い過去・未来でも整数の計算だけで正確に出す（床関数の割り算で、負の日付も同じ式）。
// 流派（設計メモ §5.5 (a)）：
//   切り替え：1582年10月15日（★）／全期間グレゴリオ暦（ISO 8601）／国・地域ごと／全期間ユリウス暦
//   紀元前の数え方：歴史式（★。0年なし）／天文式（0年あり）
//   年の始まり：1月1日（★）／3月25日（イングランドの旧習。1月1日〜3月24日は「1714/15年」と二重に書く）
const fdiv = (a, b) => Math.floor(a / b), mod = (a, b) => a - b * Math.floor(a / b);
const RD_TO_JDN = 1721425; // 固定日（グレゴリオ暦1年1月1日 = 1）→ ユリウス通日

// y は天文式（紀元前1年 = 0）
export const isLeapG = y => mod(y, 4) === 0 && (mod(y, 100) !== 0 || mod(y, 400) === 0);
export const isLeapJ = y => mod(y, 4) === 0;
function rdG(y, m, d) {
  return 365 * (y - 1) + fdiv(y - 1, 4) - fdiv(y - 1, 100) + fdiv(y - 1, 400) + fdiv(367 * m - 362, 12) + (m <= 2 ? 0 : isLeapG(y) ? -1 : -2) + d;
}
function rdJ(y, m, d) {
  return -2 + 365 * (y - 1) + fdiv(y - 1, 4) + fdiv(367 * m - 362, 12) + (m <= 2 ? 0 : isLeapJ(y) ? -1 : -2) + d;
}
function gFromRd(rd) {
  const d0 = rd - 1, n400 = fdiv(d0, 146097), d1 = mod(d0, 146097), n100 = fdiv(d1, 36524), d2 = mod(d1, 36524), n4 = fdiv(d2, 1461), d3 = mod(d2, 1461), n1 = fdiv(d3, 365);
  let y = 400 * n400 + 100 * n100 + 4 * n4 + n1;
  if (!(n100 === 4 || n1 === 4)) y += 1;
  const prior = rd - rdG(y, 1, 1), corr = rd < rdG(y, 3, 1) ? 0 : isLeapG(y) ? 1 : 2, m = fdiv(12 * (prior + corr) + 373, 367);
  return { y, m, d: rd - rdG(y, m, 1) + 1 };
}
function jFromRd(rd) {
  const y = fdiv(4 * (rd + 1) + 1464, 1461); // ユリウス暦1年1月1日の固定日は -1
  const prior = rd - rdJ(y, 1, 1), corr = rd < rdJ(y, 3, 1) ? 0 : isLeapJ(y) ? 1 : 2, m = fdiv(12 * (prior + corr) + 373, 367);
  return { y, m, d: rd - rdJ(y, m, 1) + 1 };
}
export const jdnG = (y, m, d) => rdG(y, m, d) + RD_TO_JDN;
export const jdnJ = (y, m, d) => rdJ(y, m, d) + RD_TO_JDN;
export const fromJdnG = jdn => gFromRd(jdn - RD_TO_JDN);
export const fromJdnJ = jdn => jFromRd(jdn - RD_TO_JDN);

// 国・地域ごとの切り替え（グレゴリオ暦の最初の日）。よく使われる順
export const COUNTRY_SWITCH = [
  { id: 'it', name: 'イタリア・スペイン・ポルトガルなど（1582年10月15日）', first: [1582, 10, 15] },
  { id: 'fr', name: 'フランス（1582年12月20日）', first: [1582, 12, 20] },
  { id: 'gb', name: 'イギリスと植民地（1752年9月14日）', first: [1752, 9, 14] },
  { id: 'jp', name: '日本（1873年1月1日。それより前は和暦を併記）', first: [1873, 1, 1] },
  { id: 'ru', name: 'ロシア（1918年2月14日）', first: [1918, 2, 14] },
  { id: 'gr', name: 'ギリシャ（1923年3月1日）', first: [1923, 3, 1] },
  { id: 'de', name: 'ドイツのプロテスタント地域（1700年3月1日）', first: [1700, 3, 1] },
  { id: 'se', name: 'スウェーデン（1753年3月1日）', first: [1753, 3, 1] },
  { id: 'cn', name: '中国（1912年1月1日）', first: [1912, 1, 1] },
  { id: 'tr', name: 'トルコ（1927年1月1日）', first: [1927, 1, 1] },
];
// 流派の一覧（よく使われる順。最初が初期設定）
export const WESTERN_SCHOOLS = {
  switch: [['1582', '1582年10月15日で切り替え（歴史学の慣例）'], ['gregorian', '全期間グレゴリオ暦（先発グレゴリオ暦。ISO 8601 と同じ）'], ...COUNTRY_SWITCH.map(c => ['country:' + c.id, `国・地域ごと：${c.name}`]), ['julian', '全期間ユリウス暦']],
  era: [['historical', '歴史式（紀元前1年の次が紀元1年。0年はない）'], ['astronomical', '天文式（0年がある。紀元前1年＝0年）']],
  yearStart: [['jan1', '1月1日'], ['mar25', '3月25日（イングランドの旧習。1752年まで。1月1日〜3月24日は「1714/15年」と書く）']],
};

// グレゴリオ暦の最初の日（ユリウス通日）。それより前はユリウス暦
export function switchJdn(opts = {}) {
  const s = opts.switch || '1582';
  if (s === 'gregorian') return -Infinity;
  if (s === 'julian') return Infinity;
  if (s.startsWith('country:')) { const c = COUNTRY_SWITCH.find(c => 'country:' + c.id === s); if (c) return jdnG(...c.first); }
  return 2299161;
}
// 年月日（天文式の年）→ ユリウス通日。切り替えで飛ばされた日（1582年10月5〜14日など）は null
export function toJdn(y, m, d, opts = {}) {
  const sw = switchJdn(opts);
  if (m < 1 || m > 12 || d < 1) return null;
  const g = jdnG(y, m, d), j = jdnJ(y, m, d);
  const jdn = g >= sw ? g : j;
  // 存在しない日（2月30日、飛ばされた日）を弾く：戻して同じ年月日になるか
  const back = fromJdn(jdn, opts);
  return back.y === y && back.m === m && back.d === d ? jdn : null;
}
export function fromJdn(jdn, opts = {}) {
  const greg = jdn >= switchJdn(opts);
  return { ...(greg ? fromJdnG(jdn) : fromJdnJ(jdn)), cal: greg ? 'G' : 'J' };
}
// 年の表記：歴史式なら紀元前、天文式なら負の年
export function yearText(y, opts = {}) {
  if (opts.era === 'astronomical') return `${y}年`;
  return y <= 0 ? `紀元前${1 - y}年` : `${y}年`;
}
// 歴史式の入力（紀元前 n 年）→ 天文式の年
export const astroYear = (y, bc, opts = {}) => opts.era === 'astronomical' ? y : bc ? 1 - y : y;

// 遠い過去は「約○○年前」で書く（2000年1月1日を基準に、平均の1年 365.2425日で数える）
export const J2000 = 2451545, YEAR = 365.2425;
const sig = (v, n = 3) => +v.toPrecision(n);
export function agoText(jdn) {
  const y = (J2000 - jdn) / YEAR;
  if (y >= 1e8) return `約${sig(y / 1e8)}億年前`;
  if (y >= 1e4) return `約${sig(y / 1e4)}万年前`;
  return `約${Math.round(y)}年前`;
}
export const isDeepPast = jdn => (J2000 - jdn) / YEAR > 12000;

// 年月日の文字（prec：year | month | day）。ユリウス暦の日付には（ユリウス暦）と付ける
export function formatWestern(jdn, prec = 'day', opts = {}) {
  if (isDeepPast(jdn)) return agoText(jdn);
  const { y, m, d, cal } = fromJdn(jdn, opts);
  let ys = yearText(y, opts);
  // 3月25日始まり：1月1日〜3月24日は前の年と二重に書く（切り替え前のユリウス暦の日付だけ）
  if (opts.yearStart === 'mar25' && cal === 'J' && (m < 3 || (m === 3 && d < 25)) && y > 0) ys = `${y - 1}/${String(y).slice(-2)}年`;
  if (prec === 'year') return ys;
  if (prec === 'month') return `${ys}${m}月`;
  const mark = cal === 'J' && opts.switch !== 'julian' ? '（ユリウス暦）' : '';
  return `${ys}${m}月${d}日${mark}`;
}
// 曜日（ユリウス通日から。0 = 月曜）
export const weekday = jdn => mod(jdn, 7);
export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
