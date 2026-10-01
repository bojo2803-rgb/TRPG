// ヒジュラ暦（イスラム暦・太陰暦）。本来は三日月を目で見て月の始まりを決めるので、国や流派で1〜2日ずれる。
// 流派（設計メモ §5.5 (c)。よく使われる順）：
//   uaq     ウンム・アル＝クラー暦（サウジアラビア公式）。表があるのは1343〜1500年（西暦1924〜2077年）。表の外は表形式（16型・7月16日紀元）で計算し、±1〜2日の不確かさを示す
//   tabular 表形式ヒジュラ暦（計算式）：30年周期の閏年の置き方4種類 × 紀元日2種類
//   turkey  トルコ（宗務庁）の計算暦：地球上のどこかの日没時に月の高度5度以上・離角8度以上なら翌日が1日（天文計算による目安）
//   mabims  東南アジア（MABIMS 新基準）：ジャカルタの日没時に月の高度3度以上・離角6.4度以上なら翌日が1日（天文計算による目安）
// 1日の始まり：深夜0時（★。簡略）／日没（メッカの日没）
import { UAQ_FIRST_MONTH, UAQ_STARTS } from './hijri-uaq.js';
import { newMoon, moonIndexNear, ttToUt, utToTt, sunset, moonPosition, eclToEq, altitude, elongation } from './astro.js';

const fdiv = (a, b) => Math.floor(a / b), mod = (a, b) => a - b * Math.floor(a / b);
export const MONTHS = ['ムハッラム', 'サファル', 'ラビーウ・アル＝アウワル', 'ラビーウ・アッ＝サーニー', 'ジュマーダー・アル＝ウーラー', 'ジュマーダー・アル＝アーヒラ', 'ラジャブ', 'シャアバーン', 'ラマダーン', 'シャウワール', 'ズー・アル＝カアダ', 'ズー・アル＝ヒッジャ'];
export const LEAP_PATTERNS = {
  16: [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29],
  15: [2, 5, 7, 10, 13, 15, 18, 21, 24, 26, 29],
  indian: [2, 5, 8, 10, 13, 16, 19, 21, 24, 27, 29],
  habash: [2, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30],
};
export const EPOCHS = { civil: 1948440, astronomical: 1948439 }; // ユリウス暦622年7月16日（金）／7月15日（木）
export const HIJRI_SCHOOLS = {
  method: [['uaq', 'ウンム・アル＝クラー暦（サウジアラビア公式。表の範囲外は表形式で計算）'], ['tabular', '表形式ヒジュラ暦（計算式）'], ['turkey', 'トルコの計算暦（天文計算による目安）'], ['mabims', '東南アジア MABIMS 新基準（天文計算による目安）']],
  leap: [['16', '16型（最も一般的）'], ['15', '15型'], ['indian', 'インド型'], ['habash', 'ハバシュ・アル＝ハースィブ型']],
  epoch: [['civil', '622年7月16日紀元（市民紀元）'], ['astronomical', '622年7月15日紀元（天文紀元）']],
  dayStart: [['midnight', '深夜0時で区切る（簡略）'], ['sunset', '日没で区切る（メッカの日没）']],
};

// ===== 表形式 =====
const leapsBefore = (y, pat) => fdiv(y - 1, 30) * 11 + pat.filter(p => p <= mod(y - 1, 30)).length;
export const isLeapTab = (y, pat = LEAP_PATTERNS[16]) => pat.includes(mod(y - 1, 30) + 1);
function tabToJdn(y, m, d, o) {
  const pat = LEAP_PATTERNS[o.leap || 16], ep = EPOCHS[o.epoch || 'civil'];
  return ep - 1 + (y - 1) * 354 + leapsBefore(y, pat) + 29 * (m - 1) + fdiv(m, 2) + d;
}
const tabMonthLen = (y, m, o) => m % 2 ? 30 : m === 12 && isLeapTab(y, LEAP_PATTERNS[o.leap || 16]) ? 30 : 29;
function tabFromJdn(jdn, o) {
  let y = fdiv(30 * (jdn - EPOCHS[o.epoch || 'civil']) + 10646, 10631);
  while (tabToJdn(y + 1, 1, 1, o) <= jdn) y++;
  while (tabToJdn(y, 1, 1, o) > jdn) y--;
  let m = 1;
  while (m < 12 && tabToJdn(y, m + 1, 1, o) <= jdn) m++;
  return { y, m, d: jdn - tabToJdn(y, m, 1, o) + 1 };
}

// ===== ウンム・アル＝クラー暦 =====
const UAQ_LO = UAQ_STARTS[0] + 2400000, UAQ_HI = UAQ_STARTS.at(-1) + 2400000;
function uaqFromJdn(jdn) {
  const r = jdn - 2400000;
  let lo = 0, hi = UAQ_STARTS.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (UAQ_STARTS[mid] <= r) lo = mid; else hi = mid; }
  const months = lo + UAQ_FIRST_MONTH;
  return { y: fdiv(months, 12) + 1, m: mod(months, 12) + 1, d: r - UAQ_STARTS[lo] + 1 };
}
function uaqToJdn(y, m, d) {
  const i = (y - 1) * 12 + m - 1 - UAQ_FIRST_MONTH;
  if (i < 0 || i >= UAQ_STARTS.length - 1) return undefined;
  const len = UAQ_STARTS[i + 1] - UAQ_STARTS[i];
  return d >= 1 && d <= len ? UAQ_STARTS[i] + d + 2400000 - 1 : null;
}

// ===== 天文計算による目安（トルコ・MABIMS） =====
const PLACES = { mecca: [21.4225, 39.8262], jakarta: [-6.2, 106.8] };
function crescentOk(jdnEvening, lat, lon, minAlt, minElong, conjUT) {
  const ss = sunset(jdnEvening, lat, lon);
  if (ss == null || ss < conjUT) return false;
  const tt = utToTt(ss), mp = moonPosition(tt), eq = eclToEq(mp.lon, mp.lat, tt);
  return altitude(eq.ra, eq.dec, ss, lat, lon) >= minAlt && elongation(tt) >= minElong;
}
const visCache = new Map();
// k番目の朔のあとの月の1日（ユリウス通日）
function visualStart(k, method) {
  const key = method + k;
  if (visCache.has(key)) return visCache.get(key);
  const conj = ttToUt(newMoon(k)), d0 = Math.floor(conj + 0.5);
  let start = d0 + 2;
  for (let d = d0; d <= d0 + 1 && start === d0 + 2; d++) {
    if (method === 'mabims') { if (crescentOk(d, ...PLACES.jakarta, 3, 6.4, conj)) start = d + 1; }
    else {
      // 地球上のどこか（世界時の深夜0時より前の日没）
      outer: for (let lat = -60; lat <= 60; lat += 10) for (let lon = -180; lon < 180; lon += 15) {
        const ss = sunset(d, lat, lon);
        if (ss != null && ss < d + 0.5 && crescentOk(d, lat, lon, 5, 8, conj)) { start = d + 1; break outer; }
      }
    }
  }
  visCache.set(key, start);
  return start;
}
// 天文計算の暦：表形式の月の始まりの近くの朔から決める
function visToJdn(y, m, d, method) {
  const approx = tabToJdn(y, m, 1, {}), k = moonIndexNear(approx - 1.5);
  // 近くの朔を前後に探して、この月の1日を決める
  let best = null;
  for (const kk of [k - 1, k, k + 1]) { const s = visualStart(kk, method); if (best == null || Math.abs(s - approx) < Math.abs(best - approx)) best = s; }
  const k2 = moonIndexNear(best - 1.5), next = visualStart(k2 + 1, method);
  return d >= 1 && d <= next - best ? best + d - 1 : null;
}
function visFromJdn(jdn, method) {
  const t = tabFromJdn(jdn, {});
  for (const [y, m] of [[t.y, t.m], ...[-1, 1].map(o => { const mm = t.m + o; return mm < 1 ? [t.y - 1, 12] : mm > 12 ? [t.y + 1, 1] : [t.y, mm]; })]) {
    const s = visToJdn(y, m, 1, method);
    if (s == null) continue;
    const len = visToJdn(y, m, 30, method) != null ? 30 : 29;
    if (s <= jdn && jdn < s + len) return { y, m, d: jdn - s + 1 };
  }
  return t;
}

// ===== 公開する形 =====
// { y, m, d, approx：表の外で計算した（±1〜2日）か、天文計算の目安か }
export function fromJdn(jdn, o = {}) {
  const method = o.method || 'uaq';
  if (jdn < EPOCHS.civil - 1) return null; // ヒジュラ紀元より前
  if (method === 'uaq') {
    if (jdn >= UAQ_LO && jdn < UAQ_HI) return { ...uaqFromJdn(jdn), approx: null };
    return { ...tabFromJdn(jdn, { leap: '16', epoch: 'civil' }), approx: '±1〜2日' };
  }
  if (method === 'turkey' || method === 'mabims') {
    if (jdn < 2378497 || jdn > 2524594) return { ...tabFromJdn(jdn, {}), approx: '±1〜2日' }; // 1800〜2200年の外は表形式
    return { ...visFromJdn(jdn, method), approx: '計算による目安' };
  }
  return { ...tabFromJdn(jdn, o), approx: null };
}
export function toJdn(y, m, d, o = {}) {
  if (m < 1 || m > 12 || d < 1 || d > 30 || y < 1) return null;
  const method = o.method || 'uaq';
  if (method === 'uaq') { const r = uaqToJdn(y, m, d); if (r !== undefined) return r; return d <= tabMonthLen(y, m, {}) ? tabToJdn(y, m, d, {}) : null; }
  if (method === 'turkey' || method === 'mabims') {
    const a = tabToJdn(y, m, 1, {});
    if (a < 2378497 || a > 2524594) return d <= tabMonthLen(y, m, {}) ? tabToJdn(y, m, d, {}) : null;
    return visToJdn(y, m, d, method);
  }
  return d <= tabMonthLen(y, m, o) ? tabToJdn(y, m, d, o) : null;
}
export const sunsetMecca = jdn => sunset(jdn, ...PLACES.mecca);
export function formatHijri(jdn, prec = 'day', o = {}) {
  const r = fromJdn(jdn, o);
  if (!r) return '';
  const ys = `ヒジュラ暦${r.y}年`, tail = r.approx ? `（${r.approx}）` : '';
  if (prec === 'year') return ys + tail;
  if (prec === 'month') return `${ys}${r.m}月（${MONTHS[r.m - 1]}）${tail}`;
  return `${ys}${r.m}月${r.d}日（${MONTHS[r.m - 1]}）${tail}`;
}
