// 年齢：生まれた日時と、ある日時（シナリオの時期など）から。誕生日をまたいだかまで見る。
// 日時は出来事と同じ形 { tr, t, prec, tz, approx?, until? }。西暦系の世界線どうしなら西暦（国の改暦の設定どおり）で、
// 同じ架空の暦の世界線どうしならその暦で数える。暦が違えば数えない（null）。タイムトラベルなどの体感の年数は数えない
import { utcToWall } from './time.js';
import { fromJdn } from './western.js';
import { fromDay } from './fict.js';

function ymd(w, v) {
  const tr = w.tracks.find(t => t.id === v.tr);
  if (!tr) return null;
  if (tr.cal === 'fict') { const c = w.calendars?.[tr.calId]; return c ? { cal: 'f:' + c.id, ...fromDay(c, v.t.d) } : null; }
  const d = utcToWall(v.tz || w.settings?.tz || 'Asia/Tokyo', v.t).d;
  return { cal: 'west', ...fromJdn(d, w.settings?.cal?.western) };
}
const rough = v => v.prec === 'year' || v.prec === 'month' || !!v.approx || !!v.until;

// { age, approx }（approx：年だけ・〜頃などで、前後1年ずれうる）、生まれる前なら { before: true }、数えられなければ null
export function ageAt(w, born, at) {
  if (!born || !at) return null;
  const a = ymd(w, born), b = ymd(w, at);
  if (!a || !b || a.cal !== b.cal) return null;
  const age = b.y - a.y - (b.m < a.m || (b.m === a.m && b.d < a.d) ? 1 : 0);
  if (age < 0) return { before: true };
  return { age, approx: rough(born) || rough(at) };
}
export const ageText = r => !r ? '' : r.before ? '生まれる前' : `${r.approx ? '約' : ''}${r.age}歳`;
