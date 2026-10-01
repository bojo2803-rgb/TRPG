// 暦の確かめ：既知の日付と、往復して同じ日に戻ること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../app/js/cal/western.js';
import * as K from '../app/js/cal/kyureki.js';
import * as H from '../app/js/cal/hijri.js';
import * as J from '../app/js/cal/wareki.js';
import * as F from '../app/js/cal/fict.js';
import { T, offsetSeconds, wallToUtc, utcToWall } from '../app/js/cal/time.js';
import { formatTime } from '../app/js/cal/index.js';
const g = W.jdnG;

test('western: switch, gaps, BC, deep time, round trips', () => {
  assert.equal(g(2000, 1, 1), 2451545);
  assert.equal(W.jdnJ(1582, 10, 4) + 1, g(1582, 10, 15));
  assert.equal(W.toJdn(1582, 10, 10), null);
  assert.equal(W.toJdn(2023, 2, 29), null);
  assert.equal(W.formatWestern(W.jdnJ(-43, 3, 15)), '紀元前44年3月15日（ユリウス暦）');
  assert.equal(W.formatWestern(W.jdnJ(-43, 3, 15), 'day', { era: 'astronomical' }), '-43年3月15日（ユリウス暦）');
  assert.equal(W.formatWestern(-5040344048455), '約138億年前');
  assert.equal(W.toJdn(1752, 9, 10, { switch: 'country:gb' }), null);
  for (const j of [-5040344048455, -1e9, -1, 0, 1721426, 2299160, 2299161, 2451545, 5e8]) {
    const a = W.fromJdnG(j), b = W.fromJdnJ(j);
    assert.equal(W.jdnG(a.y, a.m, a.d), j); assert.equal(W.jdnJ(b.y, b.m, b.d), j);
  }
});

test('wareki: kaigen, nanboku, honnoji, meiji switch', () => {
  assert.equal(J.formatWareki(2168353), '貞応3年閏7月1日（年表では元仁元年）');
  assert.equal(J.formatWareki(2299055), '天正10年6月2日');
  assert.equal(W.fromJdnJ(J.toJdn({ era: '天正', year: 10, month: 6, day: 2 })).d, 21);
  assert.equal(J.formatWareki(g(2019, 4, 1)), '平成31年4月1日（年表では令和元年）');
  assert.equal(J.formatWareki(W.jdnJ(1350, 6, 1)), '正平5年・観応元年4月26日');
  assert.equal(J.formatWareki(W.jdnJ(1350, 6, 1), 'day', { nanboku: 'north' }), '観応元年4月26日');
  assert.equal(J.toJdn({ era: '明治', year: 5, month: 12, day: 3 }), null);
  assert.equal(J.formatWareki(g(1873, 1, 1)), '明治6年1月1日');
  assert.match(J.formatWareki(W.jdnJ(300, 6, 1)), /皇紀960年/);
});

test('kyureki: known leap months and the 2033 problem', () => {
  const at = (y, m, d) => K.fromJdn(g(y, m, d));
  for (const [y, m, d, mon] of [[2012, 4, 21, 3], [2014, 10, 24, 9], [2017, 6, 24, 5], [2020, 5, 23, 4], [2023, 3, 22, 2], [2025, 7, 25, 6]]) {
    const r = at(y, m, d); assert.deepEqual([r.leap, r.month, r.day], [true, mon, 1], `${y}`);
  }
  assert.deepEqual([at(2025, 1, 29).month, at(2025, 1, 29).day], [1, 1]);
  const u = at(2033, 12, 22);
  assert.deepEqual(u.undecided.map(c => [c.option, c.leap, c.month]), [['7', false, 11], ['11', true, 11], ['1', false, 12]]);
  assert.deepEqual([K.fromJdn(g(2033, 8, 25), { y2033: '7' }).leap, K.fromJdn(g(2033, 8, 25), { y2033: '7' }).month], [true, 7]);
  assert.equal(K.toJdn({ year: 2025, month: 6, leap: true, day: 1 }), g(2025, 7, 25));
});

test('hijri: Umm al-Qura, tabular, Turkey, MABIMS', () => {
  assert.equal(H.toJdn(1445, 9, 1), g(2024, 3, 11));
  assert.equal(H.toJdn(1, 1, 1, { method: 'tabular' }), 1948440);
  assert.deepEqual(H.fromJdn(g(2000, 1, 1), { method: 'tabular' }), { y: 1420, m: 9, d: 24, approx: null });
  assert.equal(H.toJdn(1445, 10, 1, { method: 'turkey' }), g(2024, 4, 10));
  assert.equal(H.toJdn(1445, 9, 1, { method: 'mabims' }), g(2024, 3, 12));
});

test('fictional calendar with leap years round-trips', () => {
  const c = F.newCalendar({ months: [{ name: '春', days: 91 }, { name: '夏', days: 91 }, { name: '秋', days: 91 }, { name: '冬', days: 92 }], firstYear: 0, leap: { every: 4, month: 3, days: 1 } });
  for (let d = -3000; d < 3000; d += 7) { const r = F.fromDay(c, d); assert.equal(F.toDay(c, r.y, r.m, r.d), d); }
  assert.equal(F.toDay(c, 2, 4, 93), null);
});

test('time zones: LMT before 1888, DST, wall-clock round trip', () => {
  assert.equal(offsetSeconds('Asia/Tokyo', T(g(1880, 1, 1))), 9 * 3600 + 18 * 60 + 59);
  assert.equal(offsetSeconds('Asia/Tokyo', T(g(2020, 1, 1))), 9 * 3600);
  assert.equal(offsetSeconds('Europe/London', T(g(2020, 7, 1), 43200)), 3600);
  const wall = { d: g(1582, 6, 21), s: 4 * 3600 };
  assert.deepEqual(utcToWall('Asia/Tokyo', wallToUtc('Asia/Tokyo', wall)), wall);
  // 遠い過去もエラーにならない（表の端の時差）
  assert.ok(Number.isFinite(offsetSeconds('Asia/Tokyo', T(-5040344048455))));
});

test('formatTime: fuzzy dates, time of day, fictional tracks', () => {
  const world = { settings: { tz: 'Asia/Tokyo', cal: {} }, calendars: { c1: F.newCalendar({ id: 'c1', name: '夢暦' }) } };
  const t = wallToUtc('Asia/Tokyo', { d: W.jdnJ(1582, 6, 21), s: 4 * 3600 });
  assert.equal(formatTime(t, { prec: 'minute' }, world), '1582年6月21日（ユリウス暦） 04:00');
  assert.equal(formatTime(t, { prec: 'year', approx: true }, world), '1582年頃');
  assert.equal(formatTime(t, { prec: 'year', until: wallToUtc('Asia/Tokyo', { d: W.jdnJ(1585, 1, 1), s: 0 }) }, world), '1582年〜1585年のどこか');
  assert.equal(formatTime(t, { prec: 'day', cal: 'wareki' }, world), '天正10年6月2日');
  assert.equal(formatTime({ d: 360, s: 0 }, { prec: 'day', track: { cal: 'fict', calId: 'c1' } }, world), '夢暦 2年 1月1日');
});
