// 2台の端末の変更を合わせる（三方向の取り込み）。base：前に保存した姿、local：この端末、remote：もう一方の端末が保存した姿。
// 決まり（設計メモ §7）：
//   片方だけが変えたもの → その変更を取る。両方が同じに変えた → そのまま。
//   同じ付箋を両方で直していた → 同じ付箋が2枚になる（もう一方の端末の版をそのまま残し、この端末の版を「（この端末の版）」として足す）
//   片方が消し、もう片方が直した → 直した方を残す
//   ボード：貼ってある付箋の位置は1枚ずつ取り込む。そのほか（つながり・テンプレートなど）は、両方が直していればこの端末の版
import { uid } from './util.js';
import { dropLines } from './model.js';

const J = v => JSON.stringify(v);
const COLLECTIONS = ['notes', 'links', 'boards', 'templates', 'maps', 'calendars', 'images'];

export function mergeWorlds(base, local, remote) {
  const out = JSON.parse(J(remote)), conflicts = [];
  base ||= { notes: {}, links: {}, boards: {}, templates: {}, maps: {}, calendars: {}, images: {}, tracks: [] };
  for (const key of COLLECTIONS) {
    const B = base[key] || {}, L = local[key] || {}, R = remote[key] || {};
    const res = {};
    for (const id of new Set([...Object.keys(R), ...Object.keys(L), ...Object.keys(B)])) {
      const b = B[id], l = L[id], r = R[id];
      const jl = J(l), jr = J(r), jb = J(b);
      if (jl === jr) { if (l) res[id] = l; continue; }
      if (jl === jb) { if (r) res[id] = r; continue; } // この端末は変えていない
      if (jr === jb) { if (l) res[id] = l; continue; } // もう一方は変えていない
      // 両方が変えた
      if (!l || !r) { res[id] = l || r; continue; } // 片方が消し、もう片方が直した：直した方を残す
      if (key === 'notes') {
        res[id] = r;
        const copy = { ...JSON.parse(jl), id: uid('n'), title: `${l.title || '名前なし'}（この端末の版）` };
        delete copy.board;
        res[copy.id] = copy;
        conflicts.push({ id, copy: copy.id, title: l.title });
      } else if (key === 'boards') {
        res[id] = mergeBoard(b, l, r);
      } else res[id] = l;
    }
    out[key] = res;
  }
  // 世界線（並び順はもう一方の端末のもの。この端末で足した世界線は後ろに）
  const tb = new Map((base.tracks || []).map(t => [t.id, t])), tl = new Map((local.tracks || []).map(t => [t.id, t])), tr = new Map((remote.tracks || []).map(t => [t.id, t]));
  const ids = [...tr.keys(), ...[...tl.keys()].filter(id => !tr.has(id))];
  out.tracks = [];
  for (const id of new Set([...ids, ...tb.keys()])) {
    const b = tb.get(id), l = tl.get(id), r = tr.get(id), jl = J(l), jr = J(r), jb = J(b);
    const pick = jl === jr ? l : jl === jb ? r : jr === jb ? l : (l || r);
    if (pick) out.tracks.push(pick);
  }
  if (!out.tracks.some(t => t.id === 'main')) out.tracks.unshift(local.tracks.find(t => t.id === 'main') || remote.tracks.find(t => t.id === 'main'));
  // 名前と設定：この端末が変えていればこの端末の版
  for (const k of ['name', 'settings']) if (J(local[k]) !== J(base[k])) out[k] = local[k];
  // 片方で消した世界線に、もう片方が出来事や主体を置いていたら、世界線を残す
  const need = new Set(Object.values(out.notes).flatMap(n => [n.when?.tr, ...(n.legs || []).map(g => g.tr)]).filter(Boolean));
  for (const id of need) if (!out.tracks.some(t => t.id === id)) { const t = tl.get(id) || tr.get(id); if (t) out.tracks.push(t); }
  cleanup(out);
  return { world: out, conflicts };
}

function mergeBoard(b, l, r) {
  const out = { ...r, items: { ...r.items }, collapsed: [...new Set([...(r.collapsed || []), ...(l.collapsed || [])])] };
  if (J(l.name) !== J(b?.name)) out.name = l.name;
  const bi = b?.items || {};
  for (const id of new Set([...Object.keys(l.items), ...Object.keys(r.items), ...Object.keys(bi)])) {
    const x = l.items[id], y = r.items[id], z = bi[id];
    if (J(x) === J(y)) { if (x) out.items[id] = x; else delete out.items[id]; continue; }
    if (J(x) === J(z)) { if (y) out.items[id] = y; else delete out.items[id]; continue; }
    if (x) out.items[id] = x; else if (J(y) === J(z)) delete out.items[id];
  }
  return out;
}
// 消えた付箋を指しているものを片付ける
function cleanup(w) {
  const has = id => !!w.notes[id];
  for (const l of Object.values(w.links)) if (!has(l.a) || !has(l.b)) delete w.links[l.id];
  for (const b of Object.values(w.boards)) {
    if (b.owner && !has(b.owner)) { delete w.boards[b.id]; continue; }
    for (const id of Object.keys(b.items)) if (!has(id)) delete b.items[id];
    b.collapsed = (b.collapsed || []).filter(has);
  }
  for (const m of Object.values(w.maps)) { m.pins = (m.pins || []).filter(p => has(p.note)); dropLines(m); }
  const tids = new Set(w.tracks.map(t => t.id));
  for (const n of Object.values(w.notes)) {
    n.parents = (n.parents || []).filter(has);
    if (n.origin && !has(n.origin)) delete n.origin;
    if (n.when && !tids.has(n.when.tr)) delete n.when;
    if (n.legs) n.legs = n.legs.filter(g => tids.has(g.tr));
  }
}
