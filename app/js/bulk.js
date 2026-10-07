// まとめての操作：選んだカードに同じことをする（1回の commit の中で呼ぶので、元に戻すと1回で全部戻る）。戻り値は変えた数
import { newLink, deleteNote } from './model.js';

export function addToScenario(w, ids, sid) {
  let c = 0;
  for (const id of ids) { const n = w.notes[id]; if (n && id !== sid && !n.parents.includes(sid)) { n.parents.push(sid); c++; } }
  return c;
}
export function removeFromScenario(w, ids, sid) {
  let c = 0;
  for (const id of ids) { const n = w.notes[id]; if (n?.parents.includes(sid)) { n.parents = n.parents.filter(p => p !== sid); c++; } }
  return c;
}
// 場所（いる所・ある所・拠点・舞台・起きた所）を変える。pid が null なら場所なし
export function setPlace(w, ids, pid) {
  let c = 0;
  for (const id of ids) {
    const n = w.notes[id];
    if (!n || id === pid || (n.at || null) === (pid || null)) continue;
    if (pid) n.at = pid; else delete n.at;
    c++;
  }
  return c;
}
// 集団に入れる（いま入っている人は飛ばす）
export function addMember(w, ids, gid, role = '') {
  let c = 0;
  for (const id of ids) {
    if (!w.notes[id] || id === gid) continue;
    if (Object.values(w.links).some(l => l.kind === 'member' && l.a === id && l.b === gid && !l.to && !l.done)) continue;
    const l = newLink(id, gid, { kind: 'member', style: 'dashed', label: role });
    w.links[l.id] = l; c++;
  }
  return c;
}
export function addTag(w, ids, tag) {
  let c = 0;
  for (const id of ids) { const n = w.notes[id]; if (n && !n.tags.includes(tag)) { n.tags.push(tag); c++; } }
  return c;
}
export function deleteMany(w, ids) {
  let c = 0;
  for (const id of ids) if (w.notes[id]) { deleteNote(w, id); c++; }
  return c;
}
