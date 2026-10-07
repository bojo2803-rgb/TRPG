// ストーリーチャート：シナリオのカードの chart = { nodes: { id: { id, title, body, type, refs, pos? } }, edges: { id: { id, from, to, label } } }。
// 点は出来事・情報・探索の考えなど、矢印は「PLがこうしたら」。分岐・合流・前へ戻る（輪）を許す
import { uid } from './util.js';

export const NODE_TYPES = {
  event: { label: '出来事', icon: '◆' },
  info: { label: '情報', icon: '🔎' },
  place: { label: '場所', icon: '📍' },
  check: { label: '判定', icon: '🎲' },
  choice: { label: '選択', icon: '⑂' },
  ending: { label: 'エンディング', icon: '🏁' },
  memo: { label: 'メモ', icon: '✎' },
};
export const CHART_W = 200, CHART_GAP = 40, CHART_ROW = 150;
export const emptyChart = () => ({ nodes: {}, edges: {} });
export const newChartNode = (p = {}) => ({ id: uid('cn'), title: '', body: '', type: 'event', refs: [], ...p });
export const newChartEdge = (from, to, label = '') => ({ id: uid('ce'), from, to, label });

// 自動の並び：入ってくる矢印のない点を一番上に、上→下の段へ。輪になる矢印（前の場面へ戻る）は段の計算に使わない。
// 段の中は、上の点の真ん中の平均で並べ、重ならないよう詰めてから、段全体を上の点の真ん中に寄せる。
// 手で置いた点（pos）はそのまま。戻り値：点の id → 左上の { x, y }
export function layoutChart(chart) {
  const nodes = Object.values(chart.nodes), ids = nodes.map(n => n.id), has = new Set(ids);
  const edges = Object.values(chart.edges).filter(e => has.has(e.from) && has.has(e.to) && e.from !== e.to);
  const out = new Map(ids.map(id => [id, []]));
  for (const e of edges) out.get(e.from).push(e);
  // 輪になる矢印を見つける（たどっている途中の点へ戻る矢印）
  const back = new Set(), state = new Map();
  const dfs = id => { state.set(id, 1); for (const e of out.get(id)) { const s = state.get(e.to); if (s === 1) back.add(e.id); else if (!s) dfs(e.to); } state.set(id, 2); };
  const incoming = new Set(edges.map(e => e.to));
  for (const id of ids) if (!incoming.has(id) && !state.get(id)) dfs(id);
  for (const id of ids) if (!state.get(id)) dfs(id);
  const fwd = edges.filter(e => !back.has(e.id));
  // 段：上からの一番長い道のり
  const layer = new Map(ids.map(id => [id, 0])), indeg = new Map(ids.map(id => [id, 0]));
  for (const e of fwd) indeg.set(e.to, indeg.get(e.to) + 1);
  const queue = ids.filter(id => !indeg.get(id));
  while (queue.length) {
    const id = queue.shift();
    for (const e of fwd) if (e.from === id) { layer.set(e.to, Math.max(layer.get(e.to), layer.get(id) + 1)); indeg.set(e.to, indeg.get(e.to) - 1); if (!indeg.get(e.to)) queue.push(e.to); }
  }
  const parents = id => fwd.filter(e => e.to === id).map(e => e.from);
  const pos = {}, cx = {};
  for (const n of nodes) if (n.pos) { pos[n.id] = { x: n.pos.x, y: n.pos.y }; cx[n.id] = n.pos.x + CHART_W / 2; }
  const maxL = Math.max(0, ...layer.values());
  for (let L = 0; L <= maxL; L++) {
    const row = nodes.filter(n => !n.pos && layer.get(n.id) === L).map((n, i) => {
      const ps = parents(n.id).filter(p => p in cx);
      return { id: n.id, i, want: ps.length ? ps.reduce((s, p) => s + cx[p], 0) / ps.length : null };
    });
    row.sort((a, b) => (a.want ?? Infinity) - (b.want ?? Infinity) || a.i - b.i);
    let prev = -Infinity;
    for (const r of row) { r.x = Math.max(r.want ?? (prev === -Infinity ? 0 : prev + CHART_W + CHART_GAP), prev + CHART_W + CHART_GAP); prev = r.x; }
    const wants = row.filter(r => r.want != null), shift = wants.length ? wants.reduce((s, r) => s + r.want - r.x, 0) / wants.length : 0;
    for (const r of row) { cx[r.id] = r.x + shift; pos[r.id] = { x: Math.round(cx[r.id] - CHART_W / 2), y: L * CHART_ROW }; }
  }
  return pos;
}

// 手がかりの一覧：「情報」の点と、そこへ入る矢印（どの点で・どの行動で）。入ってくる矢印がなければ orphan
export function clueList(chart) {
  const edges = Object.values(chart.edges);
  return Object.values(chart.nodes).filter(n => n.type === 'info').map(n => {
    const from = edges.filter(e => e.to === n.id && chart.nodes[e.from]).map(e => ({ node: chart.nodes[e.from], label: e.label }));
    return { node: n, from, orphan: !from.length };
  });
}
