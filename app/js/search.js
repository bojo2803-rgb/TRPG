// どこからでも探す：世界のすべてのカードから名前・欄・タグ・メモで探す。いま開いているシナリオに出るものを先に
import { kindOf } from './model.js';
import { collator } from './util.js';
import { hintOf } from './listing.js';

// 並び：名前が打った字で始まる → 名前に含む → よみ・欄・タグ・メモに含む。同じなら最近開いた順 → 名前順。
// scope（シナリオに出るものの集まり）があれば、その中のものを先に（inScope の印つき）。何も打っていなければ最近開いたもの
export function searchAll(w, q, { recent = [], scope = null, limit = 30 } = {}) {
  q = (q || '').trim().toLowerCase();
  const item = n => ({ id: n.id, kind: kindOf(n), title: n.title || '', hint: hintOf(w, n), inScope: !!scope?.has(n.id) });
  if (!q) return recent.map(id => w.notes[id]).filter(Boolean).slice(0, limit).map(item);
  const ri = id => { const i = recent.indexOf(id); return i < 0 ? Infinity : i; };
  const hits = [];
  for (const n of Object.values(w.notes)) {
    const t = (n.title || '').toLowerCase();
    const r = t.startsWith(q) ? 0 : t.includes(q) ? 1
      : [...Object.values(n.fields || {}).map(String), ...n.tags, n.body || ''].some(v => v.toLowerCase().includes(q)) ? 2 : -1;
    if (r >= 0) hits.push({ n, r: r + (scope && !scope.has(n.id) ? 10 : 0) });
  }
  hits.sort((a, b) => a.r - b.r || ri(a.n.id) - ri(b.n.id) || collator.compare(a.n.title || '', b.n.title || ''));
  return hits.slice(0, limit).map(x => item(x.n));
}

// メモの打ちかけのリンク：カーソルの前の「[[」から後ろ（「]]」や改行をまたがない）。{ start：[[ の位置, q：打った字 } か null
export function linkQuery(text, caret) {
  const before = text.slice(0, caret), i = before.lastIndexOf('[[');
  if (i < 0) return null;
  const q = before.slice(i + 2);
  return /[\]\n]/.test(q) ? null : { start: i, q };
}
