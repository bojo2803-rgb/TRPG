// 家系図の自動配置：親子・夫婦のつながりから、世代ごとの段に並べる。親は子の真上、夫婦は隣どうし。循環していても止まる
export const NODE_W = 150, NODE_H = 56, GAP = 34, SPOUSE_GAP = 26, ROW = 130;

// people：人物の id の並び（名前順）。parents：[{ a: 親, b: 子 }]。spouses：[{ a, b }]
export function layoutFamily(people, parents, spouses) {
  const ids = [...people], set = new Set(ids);
  const P = parents.filter(l => set.has(l.a) && set.has(l.b) && l.a !== l.b), S = spouses.filter(l => set.has(l.a) && set.has(l.b) && l.a !== l.b);
  const gen = Object.fromEntries(ids.map(id => [id, 0]));
  // 世代：子は親の1つ下、夫婦は同じ段（循環があれば、決まった回数で打ち切る）
  for (let it = 0; it < ids.length + 2; it++) {
    let ch = false;
    for (const l of P) if (gen[l.b] < gen[l.a] + 1) { gen[l.b] = gen[l.a] + 1; ch = true; }
    for (const l of S) { const g = Math.max(gen[l.a], gen[l.b]); if (gen[l.a] !== g || gen[l.b] !== g) { gen[l.a] = gen[l.b] = g; ch = true; } }
    if (!ch) break;
  }
  // 子のいない人を、親に近い段へ寄せる（夫婦の相手がいる段など）。つながりのまとまりごとに一番上を0にする
  const comp = components(ids, [...P, ...S]);
  for (const c of comp) { const m = Math.min(...c.map(id => gen[id])); for (const id of c) gen[id] -= m; }
  const spouseOf = id => S.filter(l => l.a === id || l.b === id).map(l => (l.a === id ? l.b : l.a)).filter(o => gen[o] === gen[id]);
  const parentsOf = id => P.filter(l => l.b === id).map(l => l.a);
  const childrenOf = id => P.filter(l => l.a === id).map(l => l.b);
  const pos = {}, compOf = {};
  comp.forEach((c, i) => c.forEach(id => { compOf[id] = i; }));
  const maxG = Math.max(0, ...ids.map(id => gen[id]));
  let xOffset = 0;
  // まとまりごとに左から並べる
  for (const c of comp) {
    const inC = new Set(c);
    for (let g = 0; g <= maxG; g++) {
      const row = c.filter(id => gen[id] === g);
      if (!row.length) continue;
      // 並び順：親の位置の平均（上の段が決まっている）→ 名前順。夫婦はひとまとまり
      const key = id => { const ps = parentsOf(id).filter(p => pos[p]); return ps.length ? ps.reduce((s, p) => s + pos[p].x, 0) / ps.length : Infinity; };
      const units = [], used = new Set();
      for (const id of row) {
        if (used.has(id)) continue;
        const unit = [id];
        used.add(id);
        for (const s of spouseOf(id)) if (!used.has(s)) { unit.push(s); used.add(s); }
        units.push(unit);
      }
      units.sort((u, v) => Math.min(...u.map(key)) - Math.min(...v.map(key)) || ids.indexOf(u[0]) - ids.indexOf(v[0]));
      // 夫婦の中は、親のいる人を外側に（親の下に来るように）
      for (const u of units) u.sort((a, b) => key(a) - key(b));
      let x = xOffset;
      for (const u of units) for (let i = 0; i < u.length; i++) { pos[u[i]] = { x, y: g * ROW }; x += NODE_W + (i < u.length - 1 ? SPOUSE_GAP : GAP); }
    }
    // 親を子の真上へ寄せる（下の段から上へ）。重ならないよう左から順に詰める
    for (let pass = 0; pass < 3; pass++) {
      for (let g = maxG - 1; g >= 0; g--) {
        const row = c.filter(id => gen[id] === g).sort((a, b) => pos[a].x - pos[b].x);
        let right = -Infinity;
        for (let i = 0; i < row.length; i++) {
          const id = row[i], sp = spouseOf(id).find(s => row.includes(s) && pos[s].x > pos[id].x);
          const unit = sp ? [id, sp] : [id];
          if (sp) i++;
          const kids = [...new Set(unit.flatMap(childrenOf))].filter(k => inC.has(k) && gen[k] === g + 1);
          const width = unit.length * NODE_W + (unit.length - 1) * SPOUSE_GAP;
          let x0 = pos[unit[0]].x;
          if (kids.length) { const kx = kids.map(k => pos[k].x + NODE_W / 2); x0 = (Math.min(...kx) + Math.max(...kx)) / 2 - width / 2; }
          x0 = Math.max(x0, right + GAP);
          unit.forEach((u, j) => { pos[u].x = x0 + j * (NODE_W + SPOUSE_GAP); });
          right = x0 + width;
        }
      }
      // 子の段も、詰めすぎないよう左から並べ直す
      for (let g = 1; g <= maxG; g++) {
        const row = c.filter(id => gen[id] === g).sort((a, b) => pos[a].x - pos[b].x);
        let right = -Infinity;
        for (const id of row) { if (pos[id].x < right + GAP) pos[id].x = right + GAP; right = pos[id].x + NODE_W; }
      }
    }
    xOffset = Math.max(...c.map(id => pos[id].x)) + NODE_W + GAP * 3;
  }
  return { pos, gen };
}
function components(ids, links) {
  const adj = Object.fromEntries(ids.map(id => [id, []]));
  for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
  const seen = new Set(), out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const c = [], st = [id];
    seen.add(id);
    while (st.length) { const x = st.pop(); c.push(x); for (const y of adj[x]) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    out.push(ids.filter(i => c.includes(i)));
  }
  return out;
}
