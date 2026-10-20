// タグ：一覧（何枚・どの種類に）、名前を変える（同じ名前のタグがあれば、まとめる）、全部のカードから外す。
// テンプレートの「このタグのカードに出す」と、タグのボード（board.tag）も一緒に変える。画面を持たない決まり（commit の中で使う）
import { kindOf } from './model.js';
import { collator } from './util.js';
import { boardSpots } from './listing.js';

export function tagList(w) {
  const m = new Map();
  // memo：タグの説明（w.tagInfo[タグ].memo）
  for (const n of Object.values(w.notes)) for (const t of n.tags || []) {
    const e = m.get(t) || { tag: t, count: 0, kinds: {}, memo: tagMemo(w, t) };
    e.count++; e.kinds[kindOf(n)] = (e.kinds[kindOf(n)] || 0) + 1;
    m.set(t, e);
  }
  return [...m.values()].sort((a, b) => collator.compare(a.tag, b.tag));
}
// タグの説明（このタグの意味・決まり）。空なら持たない
export const tagMemo = (w, tag) => w.tagInfo?.[tag]?.memo || '';
export function setTagMemo(w, tag, memo) {
  w.tagInfo ||= {};
  memo = String(memo ?? '').trim();
  if (memo) w.tagInfo[tag] = { ...w.tagInfo[tag], memo }; else delete w.tagInfo[tag];
}
// 検索：「#呪」「呪」で、名前にその字を含むタグ（名前がその字で始まるものを先に）。「#」だけなら全部
export function searchTags(w, q) {
  q = String(q || '').trim();
  const sharp = q.startsWith('#'), s = q.replace(/^#/, '').toLowerCase();
  if (!q || (!s && !sharp)) return [];
  const hits = tagList(w).filter(t => t.tag.toLowerCase().includes(s));
  return hits.sort((a, b) => (b.tag.toLowerCase().startsWith(s) - a.tag.toLowerCase().startsWith(s)) || collator.compare(a.tag, b.tag));
}
export const tagBoardOf = (w, tag) => Object.values(w.boards).find(b => b.tag === tag) || null;
const swap = (list, from, to) => [...new Set(list.map(t => (t === from ? to : t)))];

export function renameTag(w, from, to) {
  to = String(to ?? '').trim();
  if (!to) throw '新しい名前を入れてください';
  if (to === from) return;
  for (const n of Object.values(w.notes)) if (n.tags?.includes(from)) n.tags = swap(n.tags, from, to);
  for (const t of Object.values(w.templates)) if (t.tags?.includes(from)) t.tags = swap(t.tags, from, to);
  // ボード：まとめる先にもボードがあれば、そちらの並びを残して、足りないカードだけ移す
  // 説明：まとめる先にもあれば、両方を残す
  const ma = tagMemo(w, from), mb = tagMemo(w, to);
  if (ma) { setTagMemo(w, to, mb && mb !== ma ? `${mb}\n\n${ma}` : ma); setTagMemo(w, from, ''); }
  const a = tagBoardOf(w, from), b = tagBoardOf(w, to);
  if (a && b) { for (const [id, p] of Object.entries(a.items)) b.items[id] ||= p; delete w.boards[a.id]; }
  else if (a) a.tag = to;
}
export function removeTag(w, tag) {
  for (const n of Object.values(w.notes)) if (n.tags?.includes(tag)) n.tags = n.tags.filter(t => t !== tag);
  for (const t of Object.values(w.templates)) if (t.tags?.includes(tag)) t.tags = t.tags.filter(x => x !== tag);
  const b = tagBoardOf(w, tag);
  if (b) delete w.boards[b.id];
  setTagMemo(w, tag, '');
}
// タグのボード：タグが付いていて、まだ貼っていないカードの位置
export const tagBoardSpots = (w, tag, items) => boardSpots(w, Object.values(w.notes).filter(n => n.tags?.includes(tag)).map(n => n.id), items);
