// 暦をまとめて扱う：日時を文字にする（どの暦でも）、あいまいな日付の書き方、タイムゾーン
import { utcToWall, fmtHM, fmtOffset, offsetSeconds } from './time.js';
import { formatWestern, isDeepPast, agoText } from './western.js';
import { formatWareki } from './wareki.js';
import * as kyureki from './kyureki.js';
import { formatHijri, sunsetMecca } from './hijri.js';
import { formatFict, meanYear } from './fict.js';

// 暦の一覧（よく使われる順）。架空の暦は世界ごと
export const BUILTIN_CALS = [
  { id: 'west', name: '西暦' },
  { id: 'wareki', name: '和暦（元号・旧暦）' },
  { id: 'kyureki', name: '旧暦（明治6年以降の天文計算）' },
  { id: 'hijri', name: 'ヒジュラ暦' },
];
export const calList = world => [...BUILTIN_CALS, ...Object.values(world?.calendars || {}).map(c => ({ id: 'fict:' + c.id, name: c.name, fict: c }))];
export const calName = (id, world) => calList(world).find(c => c.id === id)?.name || id;

// 西暦系のユリウス通日 → その暦の文字
export function formatDay(jdn, calId, prec, settings = {}) {
  const s = settings.cal || {};
  if (calId === 'wareki') return formatWareki(jdn, prec, s.wareki);
  if (calId === 'kyureki') {
    const r = kyureki.fromJdn(jdn, s.kyureki);
    if (!r) return '';
    const one = x => `旧暦${x.year}年${prec === 'year' ? '' : `${x.leap ? '閏' : ''}${x.month}月${prec === 'month' ? '' : `${x.day}日`}`}`;
    if (r.undecided) return `${one(r)}（2033年問題で決まらない。案：${r.undecided.map(c => `閏${c.option}月なら${c.leap ? '閏' : ''}${c.month}月${prec === 'day' ? c.day + '日' : ''}`).join('／')}）`;
    return one(r) + (r.note ? `（${r.note}）` : '');
  }
  if (calId === 'hijri') return formatHijri(jdn, prec, s.hijri);
  return formatWestern(jdn, prec, s.western);
}

// 時刻の文字（世界時の {d,s} → タイムゾーンの壁時計）
// opts：{ track（世界線。架空の暦なら calId）, tz, prec: year|month|day|minute, approx（〜頃）, until（AとBの間）, cal（表示に使う暦） }
export function formatTime(t, opts = {}, world = null) {
  const settings = world?.settings || {}, track = opts.track;
  const fict = track?.cal === 'fict' ? world?.calendars?.[track.calId] : null;
  const prec = opts.prec || 'day';
  const one = (tt, withTime) => {
    if (fict) {
      const s = formatFict(fict, tt.d, prec === 'minute' ? 'day' : prec);
      return withTime && prec === 'minute' ? `${s} ${fmtHM(tt.s)}` : s;
    }
    const tz = opts.tz || settings.tz || 'UTC', w = utcToWall(tz, tt);
    if (isDeepPast(w.d)) return agoText(w.d);
    let day = w.d;
    // ヒジュラ暦で「日没で区切る」：メッカの日没より後の時刻は、次のヒジュラ暦の日
    if (opts.cal === 'hijri' && settings.cal?.hijri?.dayStart === 'sunset' && prec === 'minute') { const ss = sunsetMecca(w.d); if (ss != null && tt.d + tt.s / 86400 - 0.5 >= ss) day = w.d + 1; }
    const s = formatDay(day, opts.cal || 'west', prec === 'minute' ? 'day' : prec, settings);
    return withTime && prec === 'minute' ? `${s} ${fmtHM(w.s)}` : s;
  };
  let text = one(t, true);
  if (opts.until) text = `${text}〜${one(opts.until, true)}のどこか`;
  else if (opts.approx) text += '頃';
  if (!fict && opts.tz && opts.tz !== (settings.tz || 'UTC') && prec === 'minute') text += `［${tzLabel(opts.tz)}］`;
  return text;
}
// 付箋に付ける暦（入力した暦と、追加した暦）での表記の一覧。最初が主な表記
export function formatAll(when, world) {
  const track = world.tracks.find(t => t.id === when.tr);
  const base = { track, tz: when.tz, prec: when.prec, approx: when.approx, until: when.until };
  if (track?.cal === 'fict') return [formatTime(when.t, base, world)];
  const cals = ['west', ...(when.cals || []).filter(c => c !== 'west')];
  return [...new Set(cals.map(cal => formatTime(when.t, { ...base, cal }, world)).filter(Boolean))];
}

// 1年の日数（「≈◯年」の計算に使う）
export const yearLengthOf = (track, world) => track?.cal === 'fict' && world?.calendars?.[track.calId] ? meanYear(world.calendars[track.calId]) : 365.2425;

// タイムゾーン：よく使うもの（日本標準時が最初）と、すべて
export const COMMON_TZ = ['Asia/Tokyo', 'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Kolkata', 'Asia/Riyadh', 'Africa/Cairo', 'Australia/Sydney', 'Pacific/Auckland'];
const TZ_NAMES = { 'Asia/Tokyo': '日本', UTC: '世界時', 'Europe/London': 'ロンドン', 'Europe/Paris': 'パリ', 'Europe/Berlin': 'ベルリン', 'Europe/Moscow': 'モスクワ', 'America/New_York': 'ニューヨーク', 'America/Chicago': 'シカゴ', 'America/Los_Angeles': 'ロサンゼルス', 'Asia/Shanghai': '上海', 'Asia/Seoul': 'ソウル', 'Asia/Kolkata': 'インド', 'Asia/Riyadh': 'リヤド', 'Africa/Cairo': 'カイロ', 'Australia/Sydney': 'シドニー', 'Pacific/Auckland': 'オークランド' };
export const tzLabel = tz => TZ_NAMES[tz] ? `${TZ_NAMES[tz]}時間` : tz;
export function allTimeZones() {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return COMMON_TZ; }
}
export const tzOffsetText = (tz, t) => fmtOffset(offsetSeconds(tz, t));
