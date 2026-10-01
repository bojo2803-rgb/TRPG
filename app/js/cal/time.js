// 日時の持ち方：{ d: 日の通し番号（整数）, s: その日の中の秒数（0〜86399の整数） }。
// 西暦系の世界線では d はユリウス通日（世界時の正午ではなく、0時始まりの暦日の番号。2000年1月1日 = 2451545）。
// 架空の暦の世界線では d はその暦の紀元からの日数。宇宙の始まり（約138億年前、d ≈ -5e12）でも秒まで正確に持てる。
// 時系列マップの計算には「日の小数」(d + s/86400) を使う。保存には使わない
export const DAY = 86400;
export const T = (d, s = 0) => norm({ d: Math.floor(d), s: Math.round(s + (d - Math.floor(d)) * DAY) });
export function norm(t) {
  let { d, s } = t;
  if (s < 0 || s >= DAY) { const k = Math.floor(s / DAY); d += k; s -= k * DAY; }
  return { d, s };
}
export const toDays = t => t.d + t.s / DAY;
// 日の小数から：大きな日付では小数の精度が落ちるので、なるべく元の {d,s} を持ち歩くこと
export const fromDays = x => { const d = Math.floor(x); return norm({ d, s: Math.round((x - d) * DAY) }); };
export const cmp = (a, b) => a.d - b.d || a.s - b.s;
export const eq = (a, b) => !!a && !!b && a.d === b.d && a.s === b.s;
export const addSeconds = (t, n) => norm({ d: t.d, s: t.s + n });
export const addDays = (t, n) => ({ d: t.d + n, s: t.s });
export const isT = v => !!v && Number.isInteger(v.d) && Number.isInteger(v.s);

// 1970-01-01 = ユリウス通日 2440588
export const UNIX_EPOCH_JDN = 2440588;
const MAX_DATE_DAYS = 100000000; // JS の Date が扱える範囲（±1億日）

// タイムゾーンの時差（分）。その瞬間（世界時の {d,s}）に、そのタイムゾーンで時計が何分進んでいたか。
// ブラウザのタイムゾーン表（IANA）を使う。表の範囲外（Date が扱えない遠い過去・未来）は、表の端の時差を使う
const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) dtfCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' }));
  return dtfCache.get(tz);
}
export function offsetSeconds(tz, t) {
  if (!tz || tz === 'UTC') return 0;
  let days = t.d - UNIX_EPOCH_JDN;
  // 範囲外は端の時差。1800年より前は地方平均時（LMT）になっているので、その値をそのまま使う
  days = Math.max(-MAX_DATE_DAYS + 2, Math.min(MAX_DATE_DAYS - 2, days));
  const ms = days * DAY * 1000 + t.s * 1000;
  const date = new Date(ms);
  const p = Object.fromEntries(dtf(tz).formatToParts(date).map(x => [x.type, x.value]));
  let y = +p.year;
  if (p.era === 'BC' || p.era === 'B') y = 1 - y;
  const wall = new Date(0);
  wall.setUTCFullYear(y, +p.month - 1, +p.day);
  wall.setUTCHours(+p.hour, +p.minute, +p.second, 0);
  return Math.round((wall.getTime() - ms) / 1000);
}
export const offsetMinutes = (tz, t) => Math.round(offsetSeconds(tz, t) / 60);
// 世界時 → そのタイムゾーンの壁時計の {d,s}
export const utcToWall = (tz, t) => addSeconds(t, offsetSeconds(tz, t));
// 壁時計 → 世界時（夏時間の切り替わりで2通りあるときは早い方）
export function wallToUtc(tz, w) {
  let u = addSeconds(w, -offsetSeconds(tz, w));
  u = addSeconds(w, -offsetSeconds(tz, u));
  return u;
}
// 時差の表記：+09:00、+09:18:59
export function fmtOffset(sec) {
  const sg = sec < 0 ? '−' : '+', a = Math.abs(sec), hh = Math.floor(a / 3600), mm = Math.floor(a % 3600 / 60), ss = a % 60;
  return `${sg}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${ss ? ':' + String(ss).padStart(2, '0') : ''}`;
}
export const hms = s => ({ h: Math.floor(s / 3600), m: Math.floor(s % 3600 / 60), sec: s % 60 });
export const fmtHM = s => { const { h, m } = hms(s); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
