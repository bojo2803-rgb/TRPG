// 日時の入力欄：どの暦でも入れられる。精度（年まで・月まで・日まで・時刻まで）、「〜頃」、「AとBの間のどこか」、タイムゾーン。
// 入力に使った暦は、その付箋の追加の暦になる（設計メモ §5.1）
import { h } from '../util.js';
import { T, utcToWall, wallToUtc, fmtHM } from '../cal/time.js';
import * as W from '../cal/western.js';
import * as J from '../cal/wareki.js';
import * as K from '../cal/kyureki.js';
import * as H from '../cal/hijri.js';
import * as F from '../cal/fict.js';
import { formatTime, allTimeZones, COMMON_TZ, tzLabel } from '../cal/index.js';

const PRECS = [['year', '年まで'], ['month', '月まで'], ['day', '日まで'], ['minute', '時刻まで']];
const CALS = [['west', '西暦'], ['wareki', '和暦'], ['kyureki', '旧暦（明治6年以降）'], ['hijri', 'ヒジュラ暦'], ['ago', '〜年前']];
let seq = 0;

// world：世界（設定と架空の暦）。track：世界線（架空の暦なら、その暦で入れる）。value：{ t, prec, approx, until, tz, cal }
export function dateInput(world, { track = null, value = null, fuzzy = true, onChange = null } = {}) {
  const id = 'di' + (++seq), settings = world.settings || {};
  const fict = track?.cal === 'fict' ? world.calendars?.[track.calId] : null;
  const v0 = value || { t: T(W.jdnG(2000, 1, 1)), prec: 'day', tz: settings.tz };
  let tz = v0.tz || settings.tz || 'Asia/Tokyo';
  let cal = fict ? 'fict' : v0.cal && v0.cal !== 'west' ? v0.cal : (W.isDeepPast(utcToWall(tz, v0.t).d) ? 'ago' : 'west');
  const el = h('div', { class: 'dinput' });
  const prec = h('select', { 'aria-label': '精度' }, ...PRECS.map(([k, v]) => h('option', { value: k, selected: k === (v0.prec || 'day') }, v)));
  const approx = h('input', { type: 'checkbox', checked: !!v0.approx });
  const between = h('input', { type: 'checkbox', checked: !!v0.until });
  const calSel = fict ? null : h('select', { 'aria-label': '暦' }, ...CALS.map(([k, v]) => h('option', { value: k, selected: k === cal }, v)));
  const tzIn = fict ? null : h('input', { list: id + '-tz', value: tz, size: 14, 'aria-label': 'タイムゾーン', title: 'タイムゾーン（日本は Asia/Tokyo）' });
  const preview = h('div', { class: 'note-text dpreview' });
  const A = block(), B = block();
  const blocks = h('div', { class: 'dblocks' }, A.el, h('span', { class: 'dbetween' }, '〜'), B.el);
  el.append(
    h('div', { class: 'row' }, calSel, prec,
      fuzzy ? h('label', { class: 'cb' }, approx, '〜頃') : null,
      fuzzy ? h('label', { class: 'cb' }, between, 'AとBの間のどこか') : null),
    blocks,
    tzIn ? h('div', { class: 'row dtz' }, h('span', { class: 'note-text' }, 'タイムゾーン'), tzIn, h('datalist', { id: id + '-tz' }, ...[...COMMON_TZ, ...allTimeZones().filter(z => !COMMON_TZ.includes(z))].map(z => h('option', { value: z }, tzLabel(z))))) : null,
    preview);

  // 1つの日時の入力欄（暦ごとに中身が変わる）
  function block() {
    const b = { el: h('div', { class: 'row dblock' }), f: {} };
    b.render = jdnSecs => {
      const [jdn, secs] = jdnSecs || [null, 0];
      const f = b.f = {}, box = b.box = {};
      const num = (k, label, w = 5, val = '') => (f[k] = h('input', { type: 'number', value: val, 'aria-label': label, style: { width: w + 'em' }, inputmode: 'numeric' }));
      // 年・月・日・閏はそれぞれ箱に入れ、精度に合わせて隠す
      const grp = (k, ...kids) => (box[k] = h('span', { class: 'dgrp' }, ...kids));
      const kids = [];
      if (cal === 'ago') {
        const y = jdn == null ? '' : (W.J2000 - jdn) / W.YEAR, u = y >= 1e8 ? 1e8 : y >= 1e4 ? 1e4 : 1;
        kids.push(f.n = h('input', { type: 'number', step: 'any', value: jdn == null ? '' : +(y / u).toPrecision(6), 'aria-label': '何年前', style: { width: '7em' } }),
          f.u = h('select', { 'aria-label': '単位' }, ...[[1, '年'], [1e4, '万年'], [1e8, '億年']].map(([k, v]) => h('option', { value: k, selected: k === u }, v))), h('span', {}, '前'));
      } else if (cal === 'west') {
        const p = jdn == null ? null : W.fromJdn(jdn, settings.cal?.western);
        const astro = settings.cal?.western?.era === 'astronomical', bc = p && !astro && p.y <= 0;
        if (!astro) kids.push(h('label', { class: 'cb' }, f.bc = h('input', { type: 'checkbox', checked: bc }), '紀元前'));
        kids.push(grp('y', num('y', '年', 6, p ? (bc ? 1 - p.y : p.y) : ''), '年'), grp('m', num('m', '月', 3.5, p?.m ?? ''), '月'), grp('d', num('d', '日', 3.5, p?.d ?? ''), '日'));
      } else if (cal === 'wareki') {
        const r = jdn == null ? null : J.fromJdn(jdn, settings.cal?.wareki), e = r?.eras?.[0];
        kids.push(f.era = h('input', { list: id + '-era', value: e?.name ?? '', size: 5, 'aria-label': '元号', placeholder: '元号' }), h('datalist', { id: id + '-era' }, ...J.ERA_NAMES.map(n => h('option', { value: n }))),
          grp('y', num('y', '年', 4, e?.year ?? ''), '年'), grp('leap', h('label', { class: 'cb' }, f.leap = h('input', { type: 'checkbox', checked: !!r?.lunar?.leap }), '閏')),
          grp('m', num('m', '月', 3.5, r?.lunar?.month ?? ''), '月'), grp('d', num('d', '日', 3.5, r?.lunar?.day ?? ''), '日'));
      } else if (cal === 'kyureki') {
        const r = jdn == null ? null : K.fromJdn(jdn, settings.cal?.kyureki);
        kids.push(grp('y', num('y', '年', 5, r?.year ?? ''), '年'), grp('leap', h('label', { class: 'cb' }, f.leap = h('input', { type: 'checkbox', checked: !!r?.leap }), '閏')),
          grp('m', num('m', '月', 3.5, r?.month ?? ''), '月'), grp('d', num('d', '日', 3.5, r?.day ?? ''), '日'));
      } else if (cal === 'hijri') {
        const r = jdn == null ? null : H.fromJdn(jdn, settings.cal?.hijri);
        kids.push(grp('y', num('y', '年', 5, r?.y ?? ''), '年'), grp('m', f.m = h('select', { 'aria-label': '月' }, ...H.MONTHS.map((n, i) => h('option', { value: i + 1, selected: r?.m === i + 1 }, `${i + 1}月 ${n}`)))), grp('d', num('d', '日', 3.5, r?.d ?? ''), '日'));
      } else if (cal === 'fict') {
        const r = jdn == null ? null : F.fromDay(fict, jdn);
        kids.push(grp('y', num('y', '年', 6, r?.y ?? ''), '年'), grp('m', f.m = h('select', { 'aria-label': '月' }, ...fict.months.map((m, i) => h('option', { value: i + 1, selected: r?.m === i + 1 }, m.name)))), grp('d', num('d', '日', 3.5, r?.d ?? ''), '日'));
      }
      if (cal !== 'ago') kids.push(f.time = h('input', { type: 'time', value: fmtHM(secs || 0), 'aria-label': '時刻' }));
      b.el.replaceChildren(...kids);
      showPrec();
    };
    // 入力 → [ユリウス通日（架空の暦なら日数）, 秒]。読めなければ理由を投げる
    b.read = () => {
      const f = b.f, p = prec.value, val = k => String(f[k]?.value ?? '').trim();
      const int = (k, name, need = true) => { const s = val(k); if (s === '') { if (need) throw `${name}を入れてください`; return null; } const n = Number(s); if (!Number.isInteger(n)) throw `${name}は整数で入れてください`; return n; };
      const y = cal === 'ago' ? null : int('y', '年');
      const m = p === 'year' ? 1 : cal === 'ago' ? null : int('m', '月');
      const d = p === 'year' || p === 'month' ? 1 : cal === 'ago' ? null : int('d', '日');
      let jdn = null;
      if (cal === 'ago') {
        const n = Number(val('n'));
        if (!(n > 0)) throw '「〜年前」には正の数を入れてください';
        jdn = Math.round(W.J2000 - n * Number(f.u.value) * W.YEAR);
      } else if (cal === 'west') {
        const ay = W.astroYear(y, f.bc?.checked, settings.cal?.western);
        jdn = W.toJdn(ay, m, d, settings.cal?.western);
        if (jdn == null) throw 'その日付は暦にありません（例：2月30日、1582年10月5〜14日）';
      } else if (cal === 'wareki') {
        jdn = J.toJdn({ era: val('era'), year: y, month: m, leap: f.leap.checked, day: d });
        if (jdn == null) throw 'その和暦の日付はありません（元号・閏月・月の日数を確かめてください。旧暦は445年から、元号は大化から）';
      } else if (cal === 'kyureki') {
        jdn = K.toJdn({ year: y, month: m, leap: f.leap.checked, day: d }, settings.cal?.kyureki);
        if (jdn == null) throw 'その旧暦の日付はありません（明治6年＝1873年以降。閏月と月の日数を確かめてください）';
      } else if (cal === 'hijri') {
        jdn = H.toJdn(y, m, d, settings.cal?.hijri);
        if (jdn == null) throw 'そのヒジュラ暦の日付はありません（1年1月1日から。月の日数を確かめてください）';
      } else if (cal === 'fict') {
        jdn = F.toDay(fict, y, m, d);
        if (jdn == null) throw `${fict.name}にその日付はありません`;
      }
      const [hh, mi] = p === 'minute' && f.time?.value ? f.time.value.split(':').map(Number) : [0, 0];
      return [jdn, hh * 3600 + mi * 60];
    };
    return b;
  }
  const toT = ([jdn, secs]) => fict ? T(jdn, secs) : wallToUtc(tz, { d: jdn, s: secs });
  const fromT = t => { if (fict) return [t.d, t.s]; const w = utcToWall(tz, t); return [w.d, w.s]; };
  function showPrec() {
    if (cal === 'ago' && prec.value !== 'year') prec.value = 'year';
    const p = prec.value;
    for (const b of [A, B]) {
      if (b.f.time) b.f.time.hidden = p !== 'minute';
      if (b.box?.m) b.box.m.hidden = p === 'year';
      if (b.box?.leap) b.box.leap.hidden = p === 'year';
      if (b.box?.d) b.box.d.hidden = p === 'year' || p === 'month';
    }
    B.el.hidden = !between.checked; blocks.querySelector('.dbetween').hidden = !between.checked;
  }
  // 最初の値
  A.render(fromT(v0.t));
  B.render(v0.until ? fromT(v0.until) : fromT(v0.t));
  const orig = JSON.stringify(snapshot());
  function snapshot() { return [cal, prec.value, approx.checked, between.checked, tzIn?.value, ...[A, B].map(b => Object.values(b.f).map(x => x.type === 'checkbox' ? x.checked : x.value))]; }

  // 読み取り：変えていなければ元の値をそのまま返す（丸めで日時がずれないように）
  function read() {
    if (JSON.stringify(snapshot()) === orig && value) return { ...value, tz: fict ? null : tz };
    if (tzIn) { const z = tzIn.value.trim() || 'UTC'; if (!allTimeZones().includes(z) && z !== 'UTC') throw `タイムゾーン「${z}」がわかりません（例：Asia/Tokyo、Europe/London）`; tz = z; }
    const t = toT(A.read());
    const out = { t, prec: prec.value, tz: fict ? null : tz };
    if (approx.checked) out.approx = true;
    if (between.checked) { const u = toT(B.read()); if (!(u.d > t.d || (u.d === t.d && u.s > t.s))) throw '「AとBの間」は、Bを後にしてください'; out.until = u; }
    if (cal !== 'west' && cal !== 'ago' && cal !== 'fict') out.cal = cal;
    return out;
  }
  function update() {
    showPrec();
    try {
      const r = read();
      preview.textContent = '→ ' + [formatTime(r.t, { ...r, track, cal: 'west' }, world), r.cal ? formatTime(r.t, { ...r, track }, world) : null].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join('　／　');
      preview.classList.remove('err');
    } catch (e) { preview.textContent = typeof e === 'string' ? e : e.message; preview.classList.add('err'); }
    onChange?.();
  }
  calSel?.addEventListener('change', () => {
    // 暦を変えたら、いまの日時をその暦で入れ直す（読めなければ空に）
    let cur = null, curB = null;
    try { cur = A.read(); } catch { /* 空のまま */ }
    try { curB = B.read(); } catch { /* 空のまま */ }
    cal = calSel.value;
    if (cal === 'ago') prec.value = 'year';
    A.render(cur); B.render(curB || cur);
    update();
  });
  el.addEventListener('input', update);
  el.addEventListener('change', update);
  update();
  return { el, read, set track(t) { /* 世界線を変えたら、呼ぶ側が作り直す */ } };
}
