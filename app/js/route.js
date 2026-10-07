// 画面のアドレス：#/people（人物の一覧）・#/people/<id>（人物のページ）・#/people/<id>/board（そのボード）・#/people?sub=family（家系図）など。
// ブラウザの「戻る」「進む」で画面を行き来するために使う。#/ で始まらないもの（#import&… #drive=…）は画面の指定ではない
const KEYS = ['sub', 'board', 'map', 'focus'];

export function formatRoute(view, arg) {
  const a = arg || {};
  let s = '#/' + view;
  if (a.open) s += '/' + encodeURIComponent(a.open) + (a.mode ? '/' + a.mode : '');
  const q = new URLSearchParams();
  for (const k of KEYS) if (a[k]) q.set(k, a[k]);
  const qs = q.toString();
  return qs ? `${s}?${qs}` : s;
}

export function parseRoute(hash) {
  const m = /^#\/([\w-]+)(?:\/([^/?]+)(?:\/([\w-]+))?)?(?:\?(.*))?$/.exec(hash || '');
  if (!m) return null;
  const r = { view: m[1] };
  if (m[2]) r.open = decodeURIComponent(m[2]);
  if (m[3]) r.mode = m[3];
  for (const [k, v] of new URLSearchParams(m[4] || '')) if (KEYS.includes(k)) r[k] = v;
  return r;
}

// 最近開いたもの：新しい順、重ねない、max 件まで
export const pushRecent = (list, id, max = 10) => [id, ...list.filter(x => x !== id)].slice(0, max);
