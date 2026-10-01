// グラフの配置：つながった付箋どうしを引き寄せ、すべての付箋を押し離す（ばねと反発）。毎回同じ結果になるよう、最初の位置は決めておく。
// 遠くの付箋どうしの反発は省く（升目に分けて近くだけ計算）ので、付箋が多くても速い
export function forceLayout(ids, edges, { iterations = 300, ideal = 90 } = {}) {
  const n = ids.length, idx = new Map(ids.map((id, i) => [id, i]));
  const x = new Float64Array(n), y = new Float64Array(n), dx = new Float64Array(n), dy = new Float64Array(n);
  // 黄金角の渦巻きに並べて始める
  for (let i = 0; i < n; i++) { const r = ideal * Math.sqrt(i + 0.5), a = i * 2.399963; x[i] = r * Math.cos(a); y[i] = r * Math.sin(a); }
  const E = edges.map(e => [idx.get(e.a), idx.get(e.b)]).filter(([a, b]) => a != null && b != null && a !== b);
  const cell = ideal * 3;
  let temp = ideal * 2;
  for (let it = 0; it < iterations; it++) {
    dx.fill(0); dy.fill(0);
    const grid = new Map();
    for (let i = 0; i < n; i++) { const k = `${Math.floor(x[i] / cell)},${Math.floor(y[i] / cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const j of grid.get(`${gx},${gy}`) || []) {
          if (j <= i) continue;
          let ddx = x[i] - x[j], ddy = y[i] - y[j], d2 = ddx * ddx + ddy * ddy;
          if (d2 < 0.01) { ddx = 0.1 * (i - j); ddy = 0.1; d2 = ddx * ddx + ddy * ddy; }
          const f = ideal * ideal / d2;
          dx[i] += ddx * f; dy[i] += ddy * f; dx[j] -= ddx * f; dy[j] -= ddy * f;
        }
      }
    }
    for (const [a, b] of E) {
      const ddx = x[a] - x[b], ddy = y[a] - y[b], d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01, f = d / ideal;
      dx[a] -= ddx * f; dy[a] -= ddy * f; dx[b] += ddx * f; dy[b] += ddy * f;
    }
    for (let i = 0; i < n; i++) {
      dx[i] -= x[i] * 0.01; dy[i] -= y[i] * 0.01; // 真ん中へ弱く引く（離れたまとまりが飛んでいかないように）
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, m = Math.min(d, temp);
      x[i] += dx[i] / d * m; y[i] += dy[i] / d * m;
    }
    temp = Math.max(1, temp * 0.97);
  }
  return Object.fromEntries(ids.map((id, i) => [id, { x: x[i], y: y[i] }]));
}
