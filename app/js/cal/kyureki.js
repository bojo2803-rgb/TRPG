// 明治6年（1873年）以降の「旧暦」：天保暦の決まりを、現代の天文計算（朔と中気。日本時間）に当てはめる
//   月は朔の日に始まる。中気（冬至・大寒・雨水…）を含む月がその番号の月（冬至 → 11月、春分 → 2月、夏至 → 5月、秋分 → 8月…）。
//   冬至から次の冬至までに13か月あるときは、中気を含まない月が閏月（前の月の閏）。
//   2033〜2034年は、この決まりでは閏月の場所が1つに決まらない（2033年問題）。設定で「決定不能」（★）／閏11月／閏7月／閏1月を選ぶ
import { newMoon, moonIndexNear, sunAt, ttToUt } from './astro.js';

const JST = 9 / 24;
const civilDay = jdUT => Math.floor(jdUT + 0.5 + JST); // 日本時間の暦日（ユリウス通日）
export const KYUREKI_START = 2405160; // 1873年1月1日
export const Y2033_OPTIONS = [['undecided', '決定不能と表示し、3つの案を併記する'], ['11', '閏11月にする（2033年）'], ['7', '閏7月にする（2033年）'], ['1', '閏1月にする（2034年）']];

const segCache = new Map(), resCache = new Map();
// 冬至（黄経270度）の日：その年の12月
const solsticeDay = y => civilDay(ttToUt(sunAt(270, 2451545 + (y - 2000) * 365.2422 + 355)));
const zhongqiDay = (lon, guessJd) => civilDay(ttToUt(sunAt(lon, guessJd)));
const expect = lon => ((lon / 30 + 1) % 12) + 1; // 中気の黄経 → 月の番号（春分0度 → 2月、冬至270度 → 11月）

// y年の冬至を含む月から、次の冬至を含む月の前の月まで。各月の始まり・終わりと、含む中気
function seg(y) {
  if (segCache.has(y)) return segCache.get(y);
  const s0 = solsticeDay(y), s1 = solsticeDay(y + 1);
  let k = moonIndexNear(s0 - 0.5) - 2;
  const starts = [];
  while (starts.length < 18) { starts.push(civilDay(ttToUt(newMoon(k)))); k++; }
  const i0 = starts.findLastIndex(d => d <= s0), i1 = starts.findLastIndex(d => d <= s1);
  const months = [];
  for (let i = i0; i < i1; i++) months.push({ start: starts[i], end: starts[i + 1], zq: [] });
  for (let lon = 270, j = 0; j <= 12; j++, lon = (lon + 30) % 360) {
    const d = zhongqiDay(lon, 2451545 + (y - 2000) * 365.2422 + 355 + j * 30.44);
    const m = months.find(m => m.start <= d && d < m.end);
    if (m && !m.zq.includes(lon)) m.zq.push(lon);
  }
  segCache.set(y, months);
  return months;
}
// 月の並びに番号を付ける（11月から。leaps：閏月にする位置）
function number(months, leaps) {
  let n = 11; const out = [];
  months.forEach((m, i) => { if (leaps.includes(i)) out.push({ n: out[i - 1].n, leap: true }); else { out.push({ n, leap: false }); n = n % 12 + 1; } });
  return out;
}
const valid = (months, nums) => months.every((m, i) => m.zq.every(z => !nums[i].leap && nums[i].n === expect(z)));
// 冬至から冬至までの1区間で、決まりに合う番号付け（なければ null）
function plansOf(months) {
  const need = months.length - 12; // 閏月の数（0か1）
  const cands = need <= 0 ? [[]] : months.map((m, i) => i).filter(i => i > 0 && !months[i].zq.length).map(i => [i]);
  return cands.map(leaps => ({ leaps, nums: number(months, leaps) }));
}
const decided = y => { const ms = seg(y), ok = plansOf(ms).filter(p => valid(ms, p.nums)); return ok.length === 1 ? ok[0] : null; };

// y年の区間の番号付け。決まらないときは、隣の決まらない区間と合わせた2年分の窓で、中気のない月のどれを閏月にするかの案を並べる
function resolve(y) {
  if (resCache.has(y)) return resCache.get(y);
  let r;
  const d = decided(y);
  if (d) r = { y0: y, months: seg(y), plans: [d], decided: true };
  else {
    const y0 = !decided(y - 1) ? y - 1 : !decided(y + 1) ? y : y;
    const months = y0 === y && decided(y + 1) ? seg(y) : [...seg(y0), ...seg(y0 + 1)];
    const need = months.length - 12 * Math.round(months.length / 12.37);
    const cands = months.map((m, i) => i).filter(i => i > 0 && !months[i].zq.length);
    const plans = need > 0 ? cands.map(i => ({ leaps: [i], nums: number(months, [i]) })) : [{ leaps: [], nums: number(months, []) }];
    r = { y0, months, plans, decided: false };
  }
  for (const yy of r.months === seg(y) ? [y] : [r.y0, r.y0 + 1]) resCache.set(yy, r);
  return r;
}
// 何番目の月がどの年か：1月（閏でない）を過ぎるたびに1年進む
const yearFor = (nums, i, y0) => y0 + nums.slice(0, i + 1).filter(x => x.n === 1 && !x.leap).length;
const optionOf = p => p.leaps.length ? String(p.nums[p.leaps[0]].n) : '';

// 旧暦の年月日。決まらないときは undecided に案ごとの答え（[{ option, year, month, leap, day }]）
export function fromJdn(jdn, opts = {}) {
  if (jdn < KYUREKI_START) return null;
  for (const y of [yearOf(jdn) - 1, yearOf(jdn), yearOf(jdn) - 2]) {
    const ms = seg(y);
    if (!(ms[0].start <= jdn && jdn < ms.at(-1).end)) continue;
    const r = resolve(y), i = r.months.findIndex(m => m.start <= jdn && jdn < m.end);
    const day = jdn - r.months[i].start + 1;
    const at = p => ({ year: yearFor(p.nums, i, r.y0), month: p.nums[i].n, leap: p.nums[i].leap, day, option: optionOf(p) });
    const cands = r.plans.map(at);
    if (cands.length === 1) { const { option, ...x } = cands[0]; return x; }
    if (cands.every(c => c.month === cands[0].month && c.leap === cands[0].leap && c.year === cands[0].year)) { const { option, ...x } = cands[0]; return x; }
    const pick = opts.y2033 && opts.y2033 !== 'undecided' && cands.find(c => c.option === opts.y2033);
    if (pick) return { ...pick, note: `閏月の場所が決まらない期間（閏${pick.option}月とする案）` };
    return { ...cands[0], undecided: cands };
  }
  return null;
}
function yearOf(jdn) { return Math.floor((jdn - 1721425.5) / 365.2425) + 1; } // ユリウス通日 → グレゴリオ暦の年（おおよそ）

// 旧暦の年月日 → ユリウス通日（決まらない期間は、選んだ案で。案を選んでいなければ最初の案）
export function toJdn({ year, month, leap = false, day }, opts = {}) {
  for (const y of [year - 1, year, year - 2]) {
    const r = resolve(y), p = r.plans.find(p => optionOf(p) === opts.y2033) || r.plans[0];
    for (let i = 0; i < r.months.length; i++) {
      if (yearFor(p.nums, i, r.y0) === year && p.nums[i].n === month && p.nums[i].leap === !!leap) {
        const len = r.months[i].end - r.months[i].start;
        return day >= 1 && day <= len ? r.months[i].start + day - 1 : null;
      }
    }
  }
  return null;
}
// 月の長さ（大の月30日・小の月29日）
export function monthLength(jdn) {
  for (const y of [yearOf(jdn) - 1, yearOf(jdn), yearOf(jdn) - 2]) { const m = seg(y).find(m => m.start <= jdn && jdn < m.end); if (m) return m.end - m.start; }
  return null;
}
