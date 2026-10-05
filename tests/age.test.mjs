// 年齢：誕生日をまたいだかまで見る。架空の暦はその暦の年月日で。暦が違えば出さない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld } from '../app/js/model.js';
import { ageAt } from '../app/js/cal/age.js';
import { T, wallToUtc } from '../app/js/cal/time.js';
import { jdnG } from '../app/js/cal/western.js';

const w = newWorld();
const day = (y, m, d, prec = 'day') => ({ tr: 'main', t: wallToUtc('Asia/Tokyo', T(jdnG(y, m, d))), prec, tz: 'Asia/Tokyo' });

test('age counts whether the birthday has passed', () => {
  assert.deepEqual(ageAt(w, day(1890, 4, 1), day(1928, 3, 31)), { age: 37, approx: false });
  assert.deepEqual(ageAt(w, day(1890, 4, 1), day(1928, 4, 1)), { age: 38, approx: false });
  assert.equal(ageAt(w, day(1928, 1, 1), day(1890, 1, 1)).before, true); // 生まれる前
  assert.equal(ageAt(w, day(1890, 1, 1, 'year'), day(1928, 6, 1)).approx, true); // 年だけなら「約」
  assert.equal(ageAt(w, null, day(1928, 6, 1)), null);
});

test('fictional calendar uses its own years; different calendars give nothing', () => {
  const c = { id: 'c1', name: '夢の暦', months: Array.from({ length: 12 }, (_, i) => ({ name: `${i + 1}`, days: 30 })), weekdays: [], firstYear: 1, leap: { every: 0, month: 11, days: 1 } };
  const wf = newWorld(); wf.calendars.c1 = c; wf.tracks.push({ id: 'dream', name: '夢', cal: 'fict', calId: 'c1', from: T(0), to: T(36000) });
  const at = d => ({ tr: 'dream', t: T(d), prec: 'day', tz: null });
  assert.equal(ageAt(wf, at(360 * 3 + 10), at(360 * 20 + 9)).age, 16); // 誕生日の前日
  assert.equal(ageAt(wf, at(360 * 3 + 10), at(360 * 20 + 10)).age, 17);
  assert.equal(ageAt(wf, at(0), day(1928, 1, 1)), null);
});
