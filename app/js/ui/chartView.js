// ストーリーチャートの画面（シナリオを開いたとき）：点を作る・「＋ 次へ」・つなぐ・動かす・自動に並べる・手がかりの一覧。
// drawChart は共有の読むページでも使う（readOnly）
import { h, esc } from '../util.js';
import { NODE_TYPES, CHART_W, layoutChart, clueList, emptyChart, newChartNode, newChartEdge, scenesByPlace } from '../chart.js';
import { KINDS, newNote, kindOf, placePath, childrenOf } from '../model.js';
import { panZoom } from './panzoom.js';
import { pickNote } from './picker.js';

// 点と矢印を描く。onRef(id)：結び付けたカードを押したとき。placeLabel(id)：場所の道すじ。
// selected：えらんでいる点（その点と、そこに出入りする矢印を目立たせ、ほかの矢印は薄くする）
export function drawChart(layer, chart, { readOnly = false, linking = null, selected = null, cardTitle = id => id, placeLabel = cardTitle, onRef = null, moved = {} } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('chart-edges');
  const nodes = Object.values(chart.nodes).map(n => {
    const t = NODE_TYPES[n.type] || NODE_TYPES.memo, preview = (n.body || '').split('\n').filter(Boolean).slice(0, 2).join(' ');
    // onRef がなければ（共有ページ）、名前はただの字（押すと点がえらばれる）
    const chips = (ids, icon) => ids?.length ? h('div', { class: 'cnode-refs' }, h('span', { class: 'cnode-ic', 'aria-hidden': 'true' }, icon), ...ids.map(r => onRef ? h('button', { type: 'button', class: 'chip', onclick: e => { e.stopPropagation(); onRef(r); } }, cardTitle(r)) : h('span', { class: 'chip' }, cardTitle(r)))) : null;
    return h('div', { class: `cnode t-${n.type}${linking === n.id ? ' linking' : ''}${selected === n.id ? ' sel' : ''}${n.pos ? ' placed' : ''}`, 'aria-current': selected === n.id ? 'true' : null, 'data-node': n.id, 'data-click': 'node', 'data-drag': readOnly ? null : '1', style: { width: CHART_W + 'px' } },
      h('div', { class: 'cnode-type' }, `${t.icon} ${t.label}`),
      h('div', { class: 'cnode-t' }, n.title || '（題名なし）'),
      n.time ? h('div', { class: 'cnode-m' }, `🕒 ${n.time}`) : null,
      n.place ? (onRef ? h('button', { type: 'button', class: 'cnode-m cnode-place', title: '場所', onclick: e => { e.stopPropagation(); onRef(n.place); } }, `📍 ${placeLabel(n.place)}`) : h('div', { class: 'cnode-m cnode-place' }, `📍 ${placeLabel(n.place)}`)) : null,
      preview ? h('div', { class: 'cnode-b' }, preview) : null,
      chips(n.cast, '👤'), chips(n.items, '🎁'), chips(n.refs, '🔗'),
      // えらんだ点の下の「＋」：次の点を作る（点の外に重ねるので、点の高さ・並びは変わらない）
      !readOnly && selected === n.id ? h('button', { type: 'button', class: 'cnode-add', 'data-act': 'next', title: '矢印でつながった次の点を作る', 'aria-label': '次の点を作る' }, '＋') : null);
  });
  layer.replaceChildren(svg, ...nodes);
  // 描いてから高さを測り、段の高さを合わせて並べる（場所や登場の多い点が、下の点に重ならない）
  const hs = new Map(nodes.map(el => [el.dataset.node, el.offsetHeight]));
  const pos = layoutChart(chart, id => hs.get(id) || 0);
  for (const [id, p] of Object.entries(moved)) pos[id] = p;
  // 左や上へはみ出す点（分かれ道は真ん中から左右へ広がる）があれば、描くときだけ全体をずらす（記録する位置はずらさない）
  const ps = Object.values(pos), ox = -Math.min(0, ...ps.map(p => p.x)), oy = -Math.min(0, ...ps.map(p => p.y));
  for (const el of nodes) Object.assign(el.style, { left: pos[el.dataset.node].x + ox + 'px', top: pos[el.dataset.node].y + oy + 'px' });
  // 矢印：上の点の下から、下の点の上へ。前の場面へ戻る矢印は右側を回る
  const drawEdges = (over = {}) => {
    const box = id => { const el = layer.querySelector(`[data-node="${id}"]`), p = over[id] || pos[id]; return { x: p.x + ox, y: p.y + oy, w: CHART_W, h: el?.offsetHeight || 80 }; };
    let maxX = 0, maxY = 0, out = '<defs><marker id="carr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>';
    for (const id of Object.keys(chart.nodes)) { const b = box(id); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
    for (const e of Object.values(chart.edges)) {
      if (!chart.nodes[e.from] || !chart.nodes[e.to]) continue;
      const A = box(e.from), B = box(e.to);
      let d, lx, ly;
      if (B.y > A.y + A.h / 2) {
        const x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y - 2, my = (y1 + y2) / 2;
        d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`; lx = (x1 + x2) / 2; ly = my;
      } else {
        const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = B.x + B.w + 2, y2 = B.y + B.h / 2, cx = Math.max(x1, x2) + 60;
        d = `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`; lx = cx - 10; ly = (y1 + y2) / 2;
      }
      out += `<g class="cedge${selected ? (e.from === selected || e.to === selected ? ' on' : ' dim') : ''}"><path d="${d}" class="cedge-line" marker-end="url(#carr)"/>` + (readOnly ? '' : `<path d="${d}" class="cedge-hit" data-click="edge" data-edge="${e.id}"/>`) +
        (e.label ? `<text x="${lx}" y="${ly}" class="cedge-l" text-anchor="middle"${readOnly ? '' : ` data-click="edge" data-edge="${e.id}"`}>${esc(e.label)}</text>` : '') + '</g>';
    }
    svg.setAttribute('width', maxX + 120); svg.setAttribute('height', maxY + 40);
    svg.innerHTML = out;
    return { w: maxX, h: maxY };
  };
  return { pos, off: { x: ox, y: oy }, drawEdges };
}

export function mount(el, ctx, arg) {
  const sid = arg.scenario;
  const bar = h('div', { class: 'bar ce-bar' }), stage = h('div', { class: 'chart-stage', 'aria-label': 'ストーリーチャート（点を押すと右で直せます）' }), layer = h('div', { class: 'chart-layer' });
  stage.append(layer);
  // えらんだ点を直す欄（右。スマホは下から出る）。上（種類・メニュー）・中（直す。ここだけ動く）・下（このあと。高さを決めてあるので、いつも同じ場所）
  const pbar = h('div', { class: 'rd-bar' }), pbody = h('div', { class: 'rd-body ce-form' }), pnext = h('nav', { class: 'rd-next ce-next', 'aria-label': 'このあと' });
  const panel = h('aside', { class: 'rd-panel ce-panel', 'aria-label': 'えらんだ点' }, pbar, pbody, pnext);
  const wrap = h('div', { class: 'ce-wrap' }, stage, panel);
  el.append(bar, wrap);
  let linking = null, first = true, cur = null, sel = arg.focus || null, form = null, mine = 0;
  const sc = () => ctx.world.notes[sid];
  const chart = () => sc()?.chart || emptyChart();
  // 自分で書き換えたとき（mine）は、チャートだけ描き直して、直している欄はそのまま（打っている途中の字が消えない）
  const own = fn => { mine++; try { return fn(); } finally { mine--; } };
  const C = (fn, label) => own(() => ctx.commit(w => { const n = w.notes[sid]; n.chart ||= emptyChart(); fn(n.chart, w); }, label));
  const CP = (fn, label) => { flush(); C(fn, label); renderPanel(); }; // 欄に出ているもの（結び付け・このあと）を変えるとき
  const phone = () => matchMedia('(max-width: 760px)').matches;
  const pz = panZoom(stage, layer, {
    onClick: target => {
      if (target.dataset.click === 'edge') { const e = chart().edges[target.dataset.edge]; if (e) { choose(e.from); focusEdge(e.id); } return; }
      if (target.dataset.click !== 'node') return;
      const id = target.dataset.node;
      if (linking) { const from = linking; linking = null; if (from !== id) { const ed = newChartEdge(from, id); C(c => { c.edges[ed.id] = ed; }, '矢印を引く'); choose(from, { force: true }); focusEdge(ed.id); } else render(); return; }
      choose(id);
    },
    onDragItem: (target, dx, dy, done) => {
      const id = target.dataset.node, p = cur.pos[id], np = { x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
      if (!done) { target.style.left = np.x + cur.off.x + 'px'; target.style.top = np.y + cur.off.y + 'px'; cur.drawEdges({ [id]: np }); return; }
      C(c => { c.nodes[id].pos = np; }, '点を動かす');
    },
  });
  // えらんだ点の「＋」
  layer.addEventListener('click', e => { if (e.target.closest('[data-act="next"]')) addNext(); });

  const pathOf = pid => placePath(ctx.world, pid).map(x => ctx.world.notes[x].title || '名前なし').join(' › ');
  // 場所の欄：候補は道すじ（日本 › 東京都 › 図書館）。名前だけでもよい。ない名前なら、そのロケーションを作る
  function placeField(cur, onChange) {
    const list = 'cn-places', w = ctx.world;
    const input = h('input', { list, value: cur && w.notes[cur] ? pathOf(cur) : '', autocomplete: 'off', placeholder: '例：日本 › 東京都 › 図書館（名前だけでもよい）', onchange: onChange });
    const places = Object.values(w.notes).filter(x => kindOf(x) === 'place');
    return {
      el: h('label', {}, '場所', input, h('datalist', { id: list }, ...places.map(x => h('option', { value: pathOf(x.id) })))),
      resolve(w) {
        const t = input.value.trim();
        if (!t) return null;
        const hit = places.find(x => pathOf(x.id) === t) || places.find(x => x.title === t) || places.find(x => x.title === t.split('›').pop().trim());
        if (hit) return hit.id;
        const pl = newNote({ kind: 'place', title: t.split('›').pop().trim() });
        w.notes[pl.id] = pl;
        return pl.id;
      },
    };
  }
  // いくつも入れる欄（登場・アイテム）：名前を入れて Enter で1つ足す。×で外す。
  // cast（シナリオの登場）があれば、候補はその中だけ。「ほかから選ぶ」で世界の全員から選べ、選んだ人はシナリオの登場にも入る
  function namesField(label, ids, kinds, newKind, ph, cast = null, onChange = () => {}) {
    const list = 'cn-' + newKind, w = ctx.world, cur = ids.filter(x => w.notes[x]).map(x => ({ id: x }));
    let wide = !cast;
    const input = h('input', { list, autocomplete: 'off', placeholder: `${ph}（Enter で足す）` });
    const chipsEl = h('span', { class: 'names-chips' }), dl = h('datalist', { id: list });
    const fill = () => dl.replaceChildren(...Object.values(w.notes).filter(x => kinds.includes(kindOf(x)) && (wide || cast.has(x.id))).map(x => h('option', { value: x.title })));
    // 名前を押すと、そのカードを小窓で開く
    const draw = () => chipsEl.replaceChildren(...cur.map((x, i) => h('span', { class: 'chip' }, x.id ? h('button', { type: 'button', class: 'linkish chip-name', title: '開く', onclick: () => ctx.openRelated(x.id) }, w.notes[x.id]?.title || '名前なし') : `${x.name}（新しく作る）`, x.join ? h('span', { class: 'note-text' }, '（登場に入れる）') : null, h('button', { type: 'button', class: 'x', 'aria-label': '外す', onclick: () => { cur.splice(i, 1); draw(); onChange(); } }, '×'))));
    const add = () => {
      const t = input.value.trim();
      if (!t) return;
      // 同じ名前の人がいれば、登場の外の人でもその人を使う（同じ名前の人を新しく作らない）
      const hit = Object.values(w.notes).find(x => x.title === t && kinds.includes(kindOf(x)) && (!cast || cast.has(x.id))) || Object.values(w.notes).find(x => x.title === t && kinds.includes(kindOf(x)));
      if (!cur.some(x => (hit ? x.id === hit.id : x.name === t))) cur.push(hit ? { id: hit.id, join: !!cast && !cast.has(hit.id) } : { name: t });
      input.value = ''; draw(); onChange();
    };
    const widen = cast ? h('button', { type: 'button', class: 'btn small', title: 'このシナリオの登場人物でない人も候補に出す（選ぶと登場に入ります）', onclick: e => { wide = !wide; fill(); e.currentTarget.textContent = wide ? '登場人物だけにする' : 'ほかから選ぶ'; input.focus(); } }, 'ほかから選ぶ') : null;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); add(); } });
    input.addEventListener('input', e => { if (e.inputType === 'insertReplacementText') add(); }); // 候補から選んだとき
    input.addEventListener('change', add);
    draw(); fill();
    const settle = () => { draw(); fill(); };
    return {
      el: h('div', { class: 'fields' }, h('span', {}, label), h('div', { class: 'row names' }, chipsEl, input, widen), dl),
      resolve(w) {
        if (input.value.trim()) add();
        const ids = cur.map(x => {
          if (x.id) { if (x.join && !w.notes[x.id].parents.includes(sid)) w.notes[x.id].parents.push(sid); return x.id; }
          const nn = newNote({ kind: newKind, title: x.name, parents: [sid] }); // 新しい人物・アイテムは、このシナリオの登場に入れる
          w.notes[nn.id] = nn;
          return nn.id;
        });
        // 作ったカードは、次からはそのカードとして持つ（同じ名前でもう1枚作らない）
        cur.forEach((x, i) => { x.id = ids[i]; x.join = false; delete x.name; });
        setTimeout(settle);
        return ids;
      },
    };
  }
  // ===== えらんだ点を直す欄 =====
  // 字は打つそばからチャートの点にも出し、欄を離れたとき（ほかの点をえらぶ・次の点を作る・画面を移る）に1回で記録する
  const flush = () => { if (form?.dirty) form.save(); };
  function renderPanel() {
    const c = chart(), n = c.nodes[sel];
    form = null;
    if (!n) { panel.hidden = true; return; }
    panel.hidden = false;
    const t = NODE_TYPES[n.type] || NODE_TYPES.memo, outs = Object.values(c.edges).filter(e => e.from === n.id && c.nodes[e.to]), ins = Object.values(c.edges).filter(e => e.to === n.id && c.nodes[e.from]);
    const castIds = new Set(childrenOf(ctx.world, sid).filter(x => ['person', 'group'].includes(kindOf(x))).map(x => x.id));
    const f = { id: n.id, dirty: false };
    const save = () => f.save();
    const title = h('input', { class: 'ce-title', value: n.title || '', autocomplete: 'off', placeholder: '題名（例：図書館で古い日記を見つける）', 'aria-label': '題名',
      oninput: e => { f.dirty = true; const el = layer.querySelector(`[data-node="${n.id}"] .cnode-t`); if (el) el.textContent = e.target.value || '（題名なし）'; }, onchange: save,
      onkeydown: e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.target.blur(); } } });
    const type = h('select', { class: 'ce-type', 'aria-label': '種類', onchange: save }, ...Object.entries(NODE_TYPES).map(([k, v]) => h('option', { value: k, selected: k === (n.type || 'event') }, `${v.icon} ${v.label}`)));
    const time = h('input', { value: n.time || '', autocomplete: 'off', placeholder: '例：1日目・夜、23時ごろ', oninput: () => { f.dirty = true; }, onchange: save });
    const body = h('textarea', { rows: 6, placeholder: 'この点で起きること・わかること・次に考えられる動き', oninput: () => { f.dirty = true; }, onchange: save }, n.body || '');
    const place = placeField(n.place, save);
    const cast = namesField('登場（人物・集団）', n.cast || [], ['person', 'group'], 'person', '例：アーミテッジ', castIds, save);
    const items = namesField('アイテム（手に入る・使う）', n.items || [], ['item'], 'item', '例：古い鍵', null, save);
    f.save = () => {
      f.dirty = false;
      if (!chart().nodes[f.id]) return;
      own(() => ctx.commitNew(w => {
        const x = w.notes[sid].chart.nodes[f.id];
        Object.assign(x, { title: title.value.trim(), type: type.value, body: body.value, time: time.value.trim(), place: place.resolve(w), cast: cast.resolve(w), items: items.resolve(w) });
        if (!x.time) delete x.time;
        if (!x.place) delete x.place;
      }, '点を直す'));
    };
    form = f;
    const refs = (n.refs || []).filter(r => ctx.world.notes[r]);
    pbar.replaceChildren(type, h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'この点のメニュー', onclick: e => nodeMenu(n.id, e.currentTarget) }, '…'),
      h('button', { type: 'button', class: 'btn icon rd-close', 'aria-label': '閉じる', onclick: () => { flush(); panel.classList.remove('open'); } }, '×'));
    pbody.replaceChildren(...[
      title,
      h('label', {}, 'メモ', body),
      h('label', {}, 'いつ', time),
      place.el, cast.el, items.el,
      refs.length ? h('div', { class: 'fields' }, h('span', {}, '結び付けたカード'), h('div', { class: 'row names' }, ...refs.map(r => h('span', { class: 'chip' }, h('button', { type: 'button', class: 'linkish chip-name', onclick: () => ctx.openRelated(r) }, ctx.world.notes[r].title || '名前なし'), h('button', { type: 'button', class: 'x', 'aria-label': '外す', onclick: () => CP(c => { c.nodes[n.id].refs = c.nodes[n.id].refs.filter(x => x !== r); }, '結び付けを外す') }, '×'))))) : null,
      // ここに来るまで：前の点と、矢印に書くPLの行動（次の点を作ったら、ここにそのまま書ける）
      ins.length ? h('section', { class: 'rd-prev' }, h('h4', {}, 'ここに来るまで（矢印に書く、PLの行動・条件）'), ...ins.map(e => h('div', { class: 'ce-out ce-in', 'data-edge': e.id },
        h('button', { type: 'button', class: 'linkish ce-to', title: 'この点へ移る', onclick: () => choose(e.from, { follow: true }) }, `「${c.nodes[e.from].title || '題名なし'}」から`),
        edgeLabel(e, c)))) : null,
    ].filter(Boolean));
    // このあと：矢印ごとに「PLの行動」を書く欄と、行き先へ移るボタン。いちばん下に「＋ 次の点」「→ つなぐ」
    pnext.style.setProperty('--rd-slots', Math.min(4, Math.max(1, ...Object.values(c.nodes).map(x => Object.values(c.edges).filter(e => e.from === x.id).length))) + 1);
    pnext.replaceChildren(h('h4', {}, 'このあと（矢印に書くのは、PLの行動・条件）'),
      ...outs.map(e => h('div', { class: 'ce-out', 'data-edge': e.id },
        edgeLabel(e, c),
        h('button', { type: 'button', class: 'linkish ce-to', title: 'この点へ移る', onclick: () => choose(e.to, { follow: true }) }, `→ ${c.nodes[e.to].title || '題名なし'}`),
        h('button', { type: 'button', class: 'btn icon small', 'aria-label': 'この矢印のメニュー', onclick: ev => ctx.menuAt(ev.currentTarget, '矢印', [
          ['向きを入れ替える', () => CP(c => { const x = c.edges[e.id]; [x.from, x.to] = [x.to, x.from]; }, '矢印の向きを入れ替える')],
          ['矢印を消す', () => CP(c => { delete c.edges[e.id]; }, '矢印を消す'), { danger: true }]]) }, '…'))),
      h('div', { class: 'ce-add' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => addNext() }, '＋ 次の点'),
        h('button', { type: 'button', class: 'btn', title: '押してから、チャートで相手の点を押す', onclick: () => { flush(); linking = n.id; render(); } }, '→ ほかの点へつなぐ')));
    pbody.scrollTop = 0;
  }
  // 矢印に書くこと（打つそばからチャートの矢印にも出し、欄を離れたら記録）
  function edgeLabel(e, c) {
    return h('input', { value: e.label || '', autocomplete: 'off', placeholder: 'そのまま進む', 'aria-label': `「${c.nodes[e.from].title || '題名なし'}」→「${c.nodes[e.to].title || '題名なし'}」のPLの行動`,
      onchange: ev => C(c => { if (c.edges[e.id]) c.edges[e.id].label = ev.target.value.trim(); }, '矢印を直す'),
      onkeydown: ev => { if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); ev.target.blur(); } } });
  }
  const focusEdge = eid => setTimeout(() => pnext.querySelector(`[data-edge="${eid}"] input`)?.focus());
  // 点をえらぶ（force：同じ点でも欄を作り直す）。follow：見えていなければ、その点が見えるところまで動かす
  function choose(id, { follow = false, force = false } = {}) {
    if (id === sel && !force) { openSheet(); return; }
    flush();
    sel = id;
    drawOnly(); renderPanel(); openSheet();
    if (follow) reveal(id);
  }
  // 次の点（えらんだ点から矢印でつながる）を作って、すぐ題名を打てるようにする。場所は前の点と同じにしておく
  function addNext(from = sel) {
    flush();
    const nid = newChartNode().id, prev = chart().nodes[from];
    C(c => {
      c.nodes[nid] = newChartNode({ id: nid, ...(prev?.place && { place: prev.place }) });
      if (prev) { const ed = newChartEdge(from, nid); c.edges[ed.id] = ed; }
    }, prev ? '次の点を作る' : '点を作る');
    sel = nid; linking = null;
    drawOnly(from); renderPanel(); openSheet(); reveal(nid);
    setTimeout(() => pbody.querySelector('.ce-title')?.focus());
  }
  const openSheet = () => { if (phone()) panel.classList.add('open'); };
  const reveal = id => {
    const el = layer.querySelector(`[data-node="${id}"]`), r = el?.getBoundingClientRect(), st = stage.getBoundingClientRect();
    // スマホで下の欄が出ているときは、その上に見えるところまで
    const s0 = { left: st.left, right: st.right, top: st.top, bottom: phone() && panel.classList.contains('open') ? Math.min(st.bottom, innerHeight - panel.offsetHeight) : st.bottom };
    if (!r || (r.left >= s0.left && r.right <= s0.right && r.top >= s0.top && r.bottom <= s0.bottom)) return;
    // 見えるところまでだけ動かす（真ん中へ飛ばさない）
    const m = 24, dx = r.left < s0.left + m ? s0.left + m - r.left : r.right > s0.right - m ? Math.max(s0.left + m - r.left, s0.right - m - r.right) : 0;
    const dy = r.top < s0.top + m ? s0.top + m - r.top : r.bottom > s0.bottom - m ? Math.max(s0.top + m - r.top, s0.bottom - m - r.bottom) : 0;
    pz.view.x += dx; pz.view.y += dy; pz.apply();
  };
  function nodeMenu(id, btn) {
    const n = chart().nodes[id];
    ctx.menuAt(btn, esc(n.title || '題名なし'), [
      ['カードを結び付ける', () => pickNote(ctx, { title: 'この点に結び付けるカード（場所・人物・アイテム・出来事など）', exclude: [sid, ...(n.refs || [])], onPick: r => CP(c => { (c.nodes[id].refs ||= []).push(r); }, 'カードを結び付ける') })],
      ['出来事として時系列に置く', () => toEvent(id)],
      ['カードにする…', () => toCard(id)],
      ...(n.pos ? [['自動の位置に戻す', () => C(c => { delete c.nodes[id].pos; }, '自動の位置に戻す')]] : []),
      '-',
      ['この点を消す', () => {
        form = null; // 消す点の書きかけは記録しない
        const back = Object.values(chart().edges).find(e => e.to === id && e.from !== id)?.from || null; // 消したら、前の点をえらぶ
        C(c => { delete c.nodes[id]; for (const e of Object.values(c.edges)) if (e.from === id || e.to === id) delete c.edges[e.id]; }, '点を消す');
        sel = back; render();
      }, { danger: true }],
    ]);
  }
  // 点から、時系列の出来事（シナリオに入る）を作る。日時はシナリオの時期（なければ今日）
  async function toEvent(id) {
    const n = chart().nodes[id], { periodOf } = await import('./elements.js'), { T, wallToUtc, UNIX_EPOCH_JDN } = await import('../cal/time.js');
    const tz = ctx.world.settings.tz, at = periodOf(ctx.world, sc()) || { tr: 'main', t: wallToUtc(tz, T(UNIX_EPOCH_JDN + Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000))), prec: 'day', tz };
    const ev = newNote({ title: n.title, body: n.body, parents: [sid], when: { tr: at.tr, t: at.t, prec: at.prec || 'day', tz: at.tz }, ...(n.place && ctx.world.notes[n.place] && { at: n.place }) });
    ctx.commit(w => { w.notes[ev.id] = ev; w.notes[sid].chart.nodes[id].refs = [...(w.notes[sid].chart.nodes[id].refs || []), ev.id]; }, '出来事として時系列に置く');
    ctx.openNote(ev.id, { section: 'when' });
  }
  function toCard(id) {
    const n = chart().nodes[id];
    ctx.openDialog({
      title: 'カードにする', ok: '作る',
      body: `<p class="note-text">「${esc(n.title)}」を、その種類のカードとして作ります（点はカードと結び付いたまま残ります）。</p><label>種類<select id="cc_kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === (n.type === 'place' ? 'place' : 'note') ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>`,
      onSave: () => {
        const kind = document.getElementById('cc_kind').value;
        const card = newNote({ kind, title: n.title, body: n.body, parents: kind === 'place' ? [] : [sid] });
        ctx.commit(w => { w.notes[card.id] = card; const x = w.notes[sid].chart.nodes[id]; x.refs = [...(x.refs || []), card.id]; }, 'カードにする');
        setTimeout(() => ctx.openNote(card.id), 0);
      },
    });
  }
  // 場所ごとの一覧：点を場所（道すじ）ごとにまとめる
  function scenes() {
    const groups = scenesByPlace(chart(), ctx.world);
    ctx.openDialog({
      title: '場所ごとの一覧', wide: true,
      body: h('div', { class: 'fields' }, h('p', { class: 'note-text' }, 'チャートの点を、場所ごとにまとめました。その場所で何が起き、何がわかるかを見渡せます。'),
        ...groups.map(g => h('div', { class: 'clue' }, h('b', {}, g.place ? `📍 ${g.label}` : g.label),
          h('ul', {}, ...g.nodes.map(n => h('li', {}, `${(NODE_TYPES[n.type] || NODE_TYPES.memo).icon} ${n.title || '題名なし'}${n.time ? `（${n.time}）` : ''}`)))))),
    });
  }
  function clues() {
    const list = clueList(chart());
    ctx.openDialog({
      title: '手がかりの一覧', wide: true,
      body: list.length ? h('div', { class: 'fields' }, h('p', { class: 'note-text' }, '種類が「情報」の点と、そこへ入る矢印（どの点で・どんな行動で手に入るか）です。'),
        ...list.map(c => h('div', { class: `clue${c.orphan ? ' orphan' : ''}` }, h('b', {}, `${NODE_TYPES.info.icon} ${c.node.title || '題名なし'}`),
          c.orphan ? h('span', { class: 'err' }, ' どこからもつながっていません') : h('ul', {}, ...c.from.map(f => h('li', {}, `「${f.node.title || '題名なし'}」で${f.label ? `「${f.label}」` : ''}`))))))
        : h('p', { class: 'note-text' }, 'まだ「情報」の点がありません。点の種類を「情報」にすると、ここに集まります。'),
    });
  }

  // チャートだけ描き直す。全体の位置合わせ（左や上へはみ出す点のためのずらし）が変わっても、画面の上では点が動かないように見る位置で打ち消す
  function drawOnly() {
    const c = chart();
    if (!Object.keys(c.nodes).length || wrap.classList.contains('empty')) return render(); // 空になった・空でなくなったときは、上の段も作り直す
    const z = pz.view.z, o = cur?.off;
    cur = drawChart(layer, c, { linking, selected: sel, cardTitle: r => ctx.world.notes[r]?.title || '（消えたカード）', placeLabel: r => ctx.world.notes[r] ? pathOf(r) : '（消えた場所）' });
    const size = cur.drawEdges();
    if (first) { pz.fit(-30, -30, size.w + 90, size.h + 30, 1, 0.8); first = false; if (sel) reveal(sel); }
    else if (o) { pz.view.x -= (cur.off.x - o.x) * z; pz.view.y -= (cur.off.y - o.y) * z; pz.apply(); }
  }
  function render() {
    const c = chart(), empty = !Object.keys(c.nodes).length;
    if (sel && !c.nodes[sel]) sel = null;
    if (!sel && !empty) { const p = layoutChart(c); sel = Object.keys(c.nodes).sort((a, b) => p[a].y - p[b].y || p[a].x - p[b].x)[0]; } // はじめは一番上の点
    bar.replaceChildren(...[
      h('h2', {}, 'ストーリーチャート'),
      linking ? h('span', { class: 'pick-hint' }, `「${c.nodes[linking]?.title || '題名なし'}」から矢印を引く相手の点を押す`, h('button', { type: 'button', class: 'btn small', onclick: () => { linking = null; render(); } }, 'やめる')) : null,
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn', title: 'どこにもつながっていない点を作る', onclick: () => addNext(null) }, '＋ 点'),
      empty ? null : h('button', { type: 'button', class: 'btn', onclick: e => ctx.menuAt(e.currentTarget, 'ストーリーチャート', [
        ['手がかりの一覧', clues], ['場所ごとの一覧', scenes], '-',
        ['自動に並べ直す（手で動かした点も戻す）', () => { C(c => { for (const n of Object.values(c.nodes)) delete n.pos; }, '自動に並べる'); first = true; drawOnly(); }]]) }, '一覧・並べ方 ▾'),
      empty ? null : h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { const size = cur.drawEdges(); pz.fit(-30, -30, size.w + 90, size.h + 30, 1); } }, '⤢'),
    ].filter(Boolean));
    stage.classList.toggle('placing', !!linking);
    wrap.classList.toggle('empty', empty);
    if (empty) { form = null; cur = null; panel.hidden = true; layer.replaceChildren(h('div', { class: 'fam-empty' }, h('p', {}, 'まだ点がありません。導入の出来事を最初の点にして、えらんだ点の「＋ 次の点」で、PLの行動ごとに次の点をつなげていきます。'), h('button', { type: 'button', class: 'btn primary', onclick: () => addNext(null) }, '＋ 最初の点'))); pz.fit(-24, -24, 444, 164); return; }
    drawOnly(); renderPanel();
  }
  render();
  return {
    update: e => {
      if (e?.type === 'search' || !sc()) return;
      // 自分で書き換えたとき・ほかの画面での変更で、いま直している点がまだあるときは、欄はそのまま（打っている字を消さない）
      if (mine || (e?.type === 'change' && form && chart().nodes[form.id] && panel.contains(document.activeElement))) { drawOnly(); return; }
      render();
    },
    destroy: flush,
  };
}
