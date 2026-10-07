// ストーリーチャートの画面（シナリオを開いたとき）：点を作る・「＋ 次へ」・つなぐ・動かす・自動に並べる・手がかりの一覧。
// drawChart は共有の読むページでも使う（readOnly）
import { h, esc } from '../util.js';
import { NODE_TYPES, CHART_W, layoutChart, clueList, emptyChart, newChartNode, newChartEdge } from '../chart.js';
import { KINDS, newNote } from '../model.js';
import { panZoom } from './panzoom.js';
import { pickNote } from './picker.js';

// 点と矢印を描く。onRef(id)：結び付けたカードを押したとき
export function drawChart(layer, chart, { readOnly = false, linking = null, cardTitle = id => id, onRef = null, moved = {} } = {}) {
  const pos = layoutChart(chart);
  for (const [id, p] of Object.entries(moved)) pos[id] = p;
  // 左や上へはみ出す点（分かれ道は真ん中から左右へ広がる）があれば、描くときだけ全体をずらす（記録する位置はずらさない）
  const ps = Object.values(pos), ox = -Math.min(0, ...ps.map(p => p.x)), oy = -Math.min(0, ...ps.map(p => p.y));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('chart-edges');
  const nodes = Object.values(chart.nodes).map(n => {
    const t = NODE_TYPES[n.type] || NODE_TYPES.memo, preview = (n.body || '').split('\n').filter(Boolean).slice(0, 2).join(' ');
    return h('div', { class: `cnode t-${n.type}${linking === n.id ? ' linking' : ''}${n.pos ? ' placed' : ''}`, 'data-node': n.id, 'data-click': 'node', 'data-drag': readOnly ? null : '1', style: { left: pos[n.id].x + ox + 'px', top: pos[n.id].y + oy + 'px', width: CHART_W + 'px' } },
      h('div', { class: 'cnode-type' }, `${t.icon} ${t.label}`),
      h('div', { class: 'cnode-t' }, n.title || '（題名なし）'),
      preview ? h('div', { class: 'cnode-b' }, preview) : null,
      n.refs?.length ? h('div', { class: 'cnode-refs' }, ...n.refs.map(r => h('button', { type: 'button', class: 'chip', onclick: e => { e.stopPropagation(); onRef?.(r); } }, cardTitle(r)))) : null,
      readOnly ? null : h('div', { class: 'cnode-acts' },
        h('button', { type: 'button', class: 'btn small', 'data-act': 'next', title: '矢印でつながった次の点を作る' }, '＋ 次へ'),
        h('button', { type: 'button', class: 'btn small', 'data-act': 'link', title: 'ほかの点へ矢印を引く' }, '→ つなぐ'),
        h('button', { type: 'button', class: 'btn small', 'data-act': 'menu', 'aria-label': '点のメニュー' }, '…')));
  });
  layer.replaceChildren(svg, ...nodes);
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
      out += `<g class="cedge"><path d="${d}" class="cedge-line" marker-end="url(#carr)"/>` + (readOnly ? '' : `<path d="${d}" class="cedge-hit" data-click="edge" data-edge="${e.id}"/>`) +
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
  const bar = h('div', { class: 'bar' }), stage = h('div', { class: 'chart-stage', 'aria-label': 'ストーリーチャート' }), layer = h('div', { class: 'chart-layer' });
  stage.append(layer);
  el.append(bar, stage);
  let linking = null, first = true, cur = null;
  const sc = () => ctx.world.notes[sid];
  const chart = () => sc()?.chart || emptyChart();
  const C = (fn, label) => ctx.commit(w => { const n = w.notes[sid]; n.chart ||= emptyChart(); fn(n.chart, w); }, label);
  const pz = panZoom(stage, layer, {
    onClick: (target, e) => {
      if (target.dataset.click === 'edge') { editEdge(target.dataset.edge); return; }
      if (target.dataset.click !== 'node') return;
      const id = target.dataset.node;
      if (linking) { const from = linking; linking = null; if (from !== id) { const ed = newChartEdge(from, id); C(c => { c.edges[ed.id] = ed; }, '矢印を引く'); editEdge(ed.id); } else render(); return; }
      editNode(id);
    },
    onDragItem: (target, dx, dy, done) => {
      const id = target.dataset.node, p = cur.pos[id], np = { x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
      if (!done) { target.style.left = np.x + cur.off.x + 'px'; target.style.top = np.y + cur.off.y + 'px'; cur.drawEdges({ [id]: np }); return; }
      C(c => { c.nodes[id].pos = np; }, '点を動かす');
    },
  });
  // 点の中のボタン（＋ 次へ・つなぐ・メニュー）
  layer.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-node]').dataset.node;
    if (b.dataset.act === 'next') editNode(null, id);
    else if (b.dataset.act === 'link') { linking = id; render(); }
    else nodeMenu(id, b);
  });

  const typeSel = v => `<select id="cn_type">${Object.entries(NODE_TYPES).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>`;
  // 点を直す・作る（from があれば、その点から矢印でつながった次の点）
  function editNode(id, from = null) {
    const n = id ? chart().nodes[id] : null, prev = from ? chart().nodes[from] : null;
    ctx.openDialog({
      title: n ? '点を直す' : prev ? `「${prev.title || '題名なし'}」の次の点` : '点を作る', ok: n ? '保存' : '作る',
      body: `<label>題名<input id="cn_title" value="${esc(n?.title || '')}" autocomplete="off" placeholder="例：図書館で古い日記を見つける"></label>
        <label>種類${typeSel(n?.type || 'event')}</label>
        ${prev ? '<label>矢印に書くこと（PLの行動・条件）<input id="cn_label" autocomplete="off" placeholder="例：図書館を調べる・〈目星〉成功"></label>' : ''}
        <label>メモ<textarea id="cn_body" rows="4" placeholder="この点で起きること・わかること・次に考えられる動き">${esc(n?.body || '')}</textarea></label>`,
      onSave: () => {
        const v = s => document.getElementById(s)?.value ?? '';
        const title = v('cn_title').trim(), type = v('cn_type'), body = v('cn_body');
        if (!title) throw '題名を入れてください';
        if (n) { C(c => Object.assign(c.nodes[id], { title, type, body }), '点を直す'); return; }
        const nn = newChartNode({ title, type, body }), ed = prev && newChartEdge(from, nn.id, v('cn_label').trim());
        C(c => { c.nodes[nn.id] = nn; if (ed) c.edges[ed.id] = ed; }, prev ? '次の点を作る' : '点を作る');
      },
      onDelete: n ? () => C(c => { delete c.nodes[id]; for (const e of Object.values(c.edges)) if (e.from === id || e.to === id) delete c.edges[e.id]; }, '点を消す') : null,
    });
  }
  function editEdge(eid) {
    const e = chart().edges[eid];
    if (!e) return;
    const t = id => esc(chart().nodes[id]?.title || '題名なし');
    ctx.openDialog({
      title: '矢印',
      body: `<p class="note-text">${t(e.from)} → ${t(e.to)}</p><label>PLの行動・条件<input id="ce_label" value="${esc(e.label)}" autocomplete="off" placeholder="例：図書館を調べる・〈目星〉成功"></label><button type="button" class="btn small" id="ce_swap">向きを入れ替える</button>`,
      onClick: ev => { if (ev.target.id === 'ce_swap') C(c => { const x = c.edges[eid]; [x.from, x.to] = [x.to, x.from]; }, '矢印の向きを入れ替える'); },
      onSave: () => C(c => { c.edges[eid].label = document.getElementById('ce_label').value.trim(); }, '矢印を直す'),
      onDelete: () => C(c => { delete c.edges[eid]; }, '矢印を消す'),
    });
  }
  function nodeMenu(id, btn) {
    const n = chart().nodes[id], w = ctx.world;
    ctx.menuAt(btn, esc(n.title || '題名なし'), [
      ['直す', () => editNode(id)],
      ['カードを結び付ける', () => pickNote(ctx, { title: 'この点に結び付けるカード（場所・人物・アイテム・出来事など）', exclude: [sid, ...(n.refs || [])], onPick: r => C(c => { (c.nodes[id].refs ||= []).push(r); }, 'カードを結び付ける') })],
      ['出来事として時系列に置く', () => toEvent(id)],
      ['カードにする…', () => toCard(id)],
      ...(n.refs || []).filter(r => w.notes[r]).map(r => [`結び付けを外す：${w.notes[r].title || '名前なし'}`, () => C(c => { c.nodes[id].refs = c.nodes[id].refs.filter(x => x !== r); }, '結び付けを外す')]),
      ...(n.pos ? [['自動の位置に戻す', () => C(c => { delete c.nodes[id].pos; }, '自動の位置に戻す')]] : []),
      '-',
      ['この点を消す', () => C(c => { delete c.nodes[id]; for (const e of Object.values(c.edges)) if (e.from === id || e.to === id) delete c.edges[e.id]; }, '点を消す'), { danger: true }],
    ]);
  }
  // 点から、時系列の出来事（シナリオに入る）を作る。日時はシナリオの時期（なければ今日）
  async function toEvent(id) {
    const n = chart().nodes[id], { periodOf } = await import('./elements.js'), { T, wallToUtc, UNIX_EPOCH_JDN } = await import('../cal/time.js');
    const tz = ctx.world.settings.tz, at = periodOf(ctx.world, sc()) || { tr: 'main', t: wallToUtc(tz, T(UNIX_EPOCH_JDN + Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000))), prec: 'day', tz };
    const ev = newNote({ title: n.title, body: n.body, parents: [sid], when: { tr: at.tr, t: at.t, prec: at.prec || 'day', tz: at.tz } });
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

  function render() {
    const c = chart(), empty = !Object.keys(c.nodes).length;
    bar.replaceChildren(...[
      h('h2', {}, 'ストーリーチャート'),
      linking ? h('span', { class: 'pick-hint' }, `「${c.nodes[linking]?.title || '題名なし'}」から矢印を引く相手の点を押す`, h('button', { type: 'button', class: 'btn small', onclick: () => { linking = null; render(); } }, 'やめる')) : null,
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn', onclick: () => editNode(null) }, '＋ 点'),
      empty ? null : h('button', { type: 'button', class: 'btn', title: '手で動かした点も、自動の位置に戻す', onclick: () => { C(c => { for (const n of Object.values(c.nodes)) delete n.pos; }, '自動に並べる'); first = true; } }, '自動に並べる'),
      empty ? null : h('button', { type: 'button', class: 'btn', onclick: clues }, '手がかりの一覧'),
      h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { first = true; render(); } }, '⤢'),
    ].filter(Boolean));
    stage.classList.toggle('placing', !!linking);
    if (empty) { layer.replaceChildren(h('div', { class: 'fam-empty' }, h('p', {}, 'まだ点がありません。導入の出来事などを「＋ 点」で作り、点の「＋ 次へ」で、PLの行動ごとに次の点をつなげていきます。'), h('button', { type: 'button', class: 'btn primary', onclick: () => editNode(null) }, '＋ 最初の点'))); pz.fit(0, 0, 420, 140); return; }
    cur = drawChart(layer, c, { linking, cardTitle: r => ctx.world.notes[r]?.title || '（消えたカード）', onRef: r => ctx.world.notes[r] && ctx.openNote(r) });
    const size = cur.drawEdges();
    if (first) { pz.fit(-30, -30, size.w + 90, size.h + 30, 1); first = false; }
  }
  render();
  return { update: e => { if (e?.type !== 'search') { if (!sc()) return; render(); } } };
}
