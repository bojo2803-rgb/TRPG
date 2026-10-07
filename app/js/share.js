// シナリオの包み：1つのシナリオと、それが使うもの（中身・登場・場所とその上・チャートで結んだカード・それらのつながり）を切り出す。
// 共有リンクの読むページと、ほかの人の世界への取り込みで使う
import { uid, clone } from './util.js';
import { childrenOf, placePath } from './model.js';
import { imageIds } from './ui/markdown.js';
import { nodeCards } from './chart.js';

export const PKG = 'trpg-scenario';

// sessions：遊んだ記録も入れるか。画像は id だけ挙げる（中身は呼ぶ側が images に入れる）
export function scenarioPackage(w, sid, { sessions = false } = {}) {
  const sc = w.notes[sid];
  if (!sc) throw new Error('シナリオが見つかりません');
  const ids = new Set([sid]);
  for (const n of childrenOf(w, sid)) ids.add(n.id);
  for (const nd of Object.values(sc.chart?.nodes || {})) for (const r of nodeCards(nd)) if (w.notes[r]) ids.add(r);
  // 場所：入るカードの場所と、ロケーションの上をたどったもの
  for (const id of [...ids]) {
    const n = w.notes[id];
    for (const p of [...(n.at && w.notes[n.at] ? placePath(w, n.at) : []), ...(n.kind === 'place' ? placePath(w, id) : [])]) ids.add(p);
  }
  const notes = {};
  for (const id of ids) {
    const n = clone(w.notes[id]);
    n.parents = n.parents.filter(p => ids.has(p));
    if (n.at && !ids.has(n.at)) delete n.at;
    if (n.origin && !ids.has(n.origin)) delete n.origin;
    delete n.share;
    if (id === sid && !sessions) delete n.sessions;
    notes[id] = n;
  }
  const links = Object.fromEntries(Object.values(w.links).filter(l => ids.has(l.a) && ids.has(l.b)).map(l => [l.id, clone(l)]));
  return {
    format: PKG, version: 1, title: sc.title, sharedAt: new Date().toISOString(), scenario: sid,
    settings: clone(w.settings), tracks: clone(w.tracks), calendars: clone(w.calendars || {}), templates: clone(w.templates),
    notes, links, imageIds: [...new Set(Object.values(notes).flatMap(n => [...imageIds(n.body || ''), ...(n.pic ? [n.pic] : [])]))], images: {},
  };
}

// 取り込み：カードとつながりは新しい id（相手の世界を上書きしない）。世界線・暦・テンプレートは、同じ id がなければ足す。
// 戻り値：{ scenarioId, images }（画像 { id: { name, mime, data } } は呼ぶ側が保存先に置く）
export function importPackage(w, pkg) {
  if (pkg?.format !== PKG) throw new Error('シナリオのファイルではありません');
  const map = Object.fromEntries(Object.keys(pkg.notes).map(id => [id, uid('n')]));
  const re = id => map[id] || null;
  for (const t of pkg.tracks || []) if (!w.tracks.some(x => x.id === t.id)) w.tracks.push(clone(t));
  for (const [id, c] of Object.entries(pkg.calendars || {})) if (!w.calendars[id]) w.calendars[id] = clone(c);
  for (const [id, t] of Object.entries(pkg.templates || {})) if (!w.templates[id]) w.templates[id] = clone(t);
  for (const [id, n0] of Object.entries(pkg.notes)) {
    const n = clone(n0);
    n.id = map[id];
    n.parents = n.parents.map(re).filter(Boolean);
    if (n.at) n.at = re(n.at) || undefined;
    if (n.origin) n.origin = re(n.origin) || undefined;
    if (!n.at) delete n.at;
    if (!n.origin) delete n.origin;
    for (const nd of Object.values(n.chart?.nodes || {})) {
      for (const k of ['refs', 'cast', 'items']) if (nd[k]) nd[k] = nd[k].map(re).filter(Boolean);
      if (nd.place) { nd.place = re(nd.place); if (!nd.place) delete nd.place; }
    }
    w.notes[n.id] = n;
  }
  for (const l of Object.values(pkg.links || {})) if (map[l.a] && map[l.b]) { const nl = { ...clone(l), id: uid('l'), a: map[l.a], b: map[l.b] }; w.links[nl.id] = nl; }
  for (const [id, im] of Object.entries(pkg.images || {})) w.images[id] = { id, name: im.name, mime: im.mime };
  return { scenarioId: map[pkg.scenario], images: pkg.images || {} };
}
