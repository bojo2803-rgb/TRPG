// 架空の暦：月の名前・月の数・月ごとの日数・曜日・紀元（最初の年の番号）・閏年を自分で決める。
// 日時の d は「紀元の最初の日（firstYear 年の最初の月の1日）からの日数」
// 暦 { id, name, months: [{ name, days }], weekdays: [名前], firstYear: 1, leap: { every: 0（0 = 閏年なし）, month: 月の番号（0始まり）, days: 1 } }
const fdiv = (a, b) => Math.floor(a / b), mod = (a, b) => a - b * Math.floor(a / b);

export const newCalendar = (p = {}) => ({ name: '架空の暦', months: Array.from({ length: 12 }, (_, i) => ({ name: `${i + 1}月`, days: 30 })), weekdays: [], firstYear: 1, leap: { every: 0, month: 11, days: 1 }, ...p });
const base = c => c.months.reduce((s, m) => s + m.days, 0);
const isLeapIdx = (c, i) => c.leap?.every > 0 && mod(i + 1, c.leap.every) === 0;
const monthDays = (c, i, m) => c.months[m].days + (isLeapIdx(c, i) && c.leap.month === m ? c.leap.days : 0);
export const yearLength = (c, i = 0) => base(c) + (isLeapIdx(c, i) ? c.leap.days : 0);
// 1年の平均の日数（時系列マップの「≈」の年数に使う）
export const meanYear = c => base(c) + (c.leap?.every > 0 ? c.leap.days / c.leap.every : 0);

function yearIndexOf(c, d) {
  const B = base(c), N = c.leap?.every > 0 ? c.leap.every : 0;
  if (!N) { const i = fdiv(d, B); return [i, d - i * B]; }
  const C = N * B + c.leap.days, k = fdiv(d, C), r = d - k * C, yi = Math.min(fdiv(r, B), N - 1);
  return [k * N + yi, r - yi * B];
}
export function fromDay(c, d) {
  const [i, rem0] = yearIndexOf(c, d);
  let rem = rem0, m = 0;
  while (m < c.months.length - 1 && rem >= monthDays(c, i, m)) { rem -= monthDays(c, i, m); m++; }
  return { y: (c.firstYear ?? 1) + i, m: m + 1, d: rem + 1 };
}
export function toDay(c, y, m, d) {
  const i = y - (c.firstYear ?? 1);
  if (m < 1 || m > c.months.length || d < 1 || d > monthDays(c, i, m - 1)) return null;
  const B = base(c), N = c.leap?.every > 0 ? c.leap.every : 0;
  let day = i * B + (N ? fdiv(i, N) * c.leap.days : 0);
  for (let k = 0; k < m - 1; k++) day += monthDays(c, i, k);
  return day + d - 1;
}
export const weekdayName = (c, d) => c.weekdays?.length ? c.weekdays[mod(d, c.weekdays.length)] : '';
export function formatFict(c, d, prec = 'day', withName = true) {
  const r = fromDay(c, d), pre = withName ? c.name + ' ' : '', mn = c.months[r.m - 1]?.name ?? `${r.m}月`;
  if (prec === 'year') return `${pre}${r.y}年`;
  if (prec === 'month') return `${pre}${r.y}年 ${mn}`;
  const wd = weekdayName(c, d);
  return `${pre}${r.y}年 ${mn}${r.d}日${wd ? `（${wd}）` : ''}`;
}
