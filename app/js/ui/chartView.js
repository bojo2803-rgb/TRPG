// ストーリーチャートの画面（シナリオを開いたとき）：点を作る・「＋ 次へ」・つなぐ・動かす・自動に並べる・手がかりの一覧。
// drawChart は共有の読むページでも使う（readOnly）
import { h, esc } from '../util.js';
import { NODE_TYPES, CHART_W, layoutChart, clueList, emptyChart, newChartNode, newChartEdge, scenesByPlace } from '../chart.js';
import { KINDS, newNote, kindOf, placePath, childrenOf } from '../model.js';
import { panZoom } from './panzoom.js';
import { pickNote } from './picker.js';

// 点と矢印を描く。onRef(id)：結び付けたカードを押したとき。placeLabel(id)：場所の道すじ
export function drawChart(layer, chart, { readOnly = false, linking = null, cardTitle = id => id, placeLabel = cardTitle, onRef = null, moved = {} } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('chart-edges');
  const nodes = Object.values(chart.nodes).map(n => {
    const t = NODE_TYPES[n.type] || NODE_TYPES.memo, preview = (n.body || '').split('\n').filter(Boolean).slice(0, 2).join(' ');
    const chips = (ids, icon) => ids?.length ? h('div', { class: 'cnode-refs' }, h('span', { class: 'cnode-ic', 'aria-hidden': 'true' }, icon), ...ids.map(r => h('button', { type: 'button', class: 'chip', onclick: e => { e.stopPropagation(); onRef?.(r); } }, cardTitle(r)))) : null;
    return h('div', { class: `cnode t-${n.type}${linking === n.id ? ' linking' : ''}${n.pos ? ' placed' : ''}`, 'data-node': n.id, 'data-click': 'node', 'data-drag': readOnly ? null : '1', style: { width: CHART_W + 'px' } },
      h('div', { class: 'cnode-type' }, `${t.icon} ${t.label}`),
      h('div', { class: 'cnode-t' }, n.title || '（題名なし）'),
      n.time ? h('div', { class: 'cnode-m' }, `🕒 ${n.time}`) : null,
      n.place ? h('button', { type: 'button', class: 'cnode-m cnode-place', title: '場所', onclick: e => { e.stopPropagation(); onRef?.(n.place); } }, `📍 ${placeLabel(n.place)}`) : null,
      preview ? h('div', { class: 'cnode-b' }, preview) : null,
      chips(n.cast, '👤'), chips(n.items, '🎁'), chips(n.refs, '🔗'),
      readOnly ? null : h('div', { class: 'cnode-acts' },
        h('button', { type: 'button', class: 'btn small', 'data-act': 'next', title: '矢印でつながった次の点を作る' }, '＋ 次へ'),
        h('button', { type: 'button', class: 'btn small', 'data-act': 'link', title: 'ほかの点へ矢印を引く' }, '→ つなぐ'),
        h('button', { type: 'button', class: 'btn small', 'data-act': 'menu', 'aria-label': '点のメニュー' }, '…')));
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

  const pathOf = pid => placePath(ctx.world, pid).map(x => ctx.world.notes[x].title || '名前なし').join(' › ');
  // 場所の欄：候補は道すじ（日本 › 東京都 › 図書館）。名前だけでもよい。ない名前なら、そのロケーションを作る
  function placeField(cur) {
    const list = 'cn-places', w = ctx.world;
    const input = h('input', { list, value: cur && w.notes[cur] ? pathOf(cur) : '', autocomplete: 'off', placeholder: '例：日本 › 東京都 › 図書館（名前だけでもよい）' });
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
  function namesField(label, ids, kinds, newKind, ph, cast = null) {
    const list = 'cn-' + newKind, w = ctx.world, cur = ids.filter(x => w.notes[x]).map(x => ({ id: x }));
    let wide = !cast;
    const input = h('input', { list, autocomplete: 'off', placeholder: `${ph}（Enter で足す）` });
    const chipsEl = h('span', { class: 'names-chips' }), dl = h('datalist', { id: list });
    const fill = () => dl.replaceChildren(...Object.values(w.notes).filter(x => kinds.includes(kindOf(x)) && (wide || cast.has(x.id))).map(x => h('option', { value: x.title })));
    const draw = () => chipsEl.replaceChildren(...cur.map((x, i) => h('span', { class: 'chip' }, x.id ? w.notes[x.id].title || '名前なし' : `${x.name}（新しく作る）`, x.join ? h('span', { class: 'note-text' }, '（登場に入れる）') : null, h('button', { type: 'button', class: 'x', 'aria-label': '外す', onclick: () => { cur.splice(i, 1); draw(); } }, '×'))));
    const add = () => {
      const t = input.value.trim();
      if (!t) return;
      // 同じ名前の人がいれば、登場の外の人でもその人を使う（同じ名前の人を新しく作らない）
      const hit = Object.values(w.notes).find(x => x.title === t && kinds.includes(kindOf(x)) && (!cast || cast.has(x.id))) || Object.values(w.notes).find(x => x.title === t && kinds.includes(kindOf(x)));
      if (!cur.some(x => (hit ? x.id === hit.id : x.name === t))) cur.push(hit ? { id: hit.id, join: !!cast && !cast.has(hit.id) } : { name: t });
      input.value = ''; draw();
    };
    const widen = cast ? h('button', { type: 'button', class: 'btn small', title: 'このシナリオの登場人物でない人も候補に出す（選ぶと登場に入ります）', onclick: e => { wide = !wide; fill(); e.currentTarget.textContent = wide ? '登場人物だけにする' : 'ほかから選ぶ'; input.focus(); } }, 'ほかから選ぶ') : null;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); add(); } });
    input.addEventListener('input', e => { if (e.inputType === 'insertReplacementText') add(); }); // 候補から選んだとき
    input.addEventListener('change', add);
    draw(); fill();
    return {
      el: h('div', { class: 'fields' }, h('span', {}, label), h('div', { class: 'row names' }, chipsEl, input, widen), dl),
      resolve(w) {
        if (input.value.trim()) add();
        return cur.map(x => {
          if (x.id) { if (x.join && !w.notes[x.id].parents.includes(sid)) w.notes[x.id].parents.push(sid); return x.id; }
          const nn = newNote({ kind: newKind, title: x.name, parents: [sid] }); // 新しい人物・アイテムは、このシナリオの登場に入れる
          w.notes[nn.id] = nn;
          return nn.id;
        });
      },
    };
  }
  // 点を直す・作る（from があれば、その点から矢印でつながった次の点）。
  // 場所・登場・アイテムは名前で入れる（候補から選ぶ。ない名前なら、そのカードを作る。登場・アイテムはシナリオに入る）
  function editNode(id, from = null) {
    const n = id ? chart().nodes[id] : null, prev = from ? chart().nodes[from] : null;
    const place = placeField(n?.place ?? prev?.place), cast = namesField('登場（人物・集団）', n?.cast || [], ['person', 'group'], 'person', '例：アーミテッジ', new Set(childrenOf(ctx.world, sid).filter(x => ['person', 'group'].includes(kindOf(x))).map(x => x.id))), items = namesField('アイテム（手に入る・使う）', n?.items || [], ['item'], 'item', '例：古い鍵');
    const typeEl = h('select', { id: 'cn_type' }, ...Object.entries(NODE_TYPES).map(([k, t]) => h('option', { value: k, selected: k === (n?.type || 'event') }, `${t.icon} ${t.label}`)));
    ctx.openDialog({
      title: n ? '点を直す' : prev ? `「${prev.title || '題名なし'}」の次の点` : '点を作る', ok: n ? '保存' : '作る', wide: true,
      body: h('div', { class: 'fields' },
        h('label', {}, '題名', h('input', { id: 'cn_title', value: n?.title || '', autocomplete: 'off', placeholder: '例：図書館で古い日記を見つける' })),
        h('div', { class: 'row' }, h('label', {}, '種類', typeEl), h('label', { style: { flex: '1' } }, 'いつ', h('input', { id: 'cn_time', value: n?.time || '', autocomplete: 'off', placeholder: '例：1日目・夜、23時ごろ' }))),
        prev ? h('label', {}, '矢印に書くこと（PLの行動・条件）', h('input', { id: 'cn_label', autocomplete: 'off', placeholder: '例：図書館を調べる・〈目星〉成功' })) : null,
        place.el, cast.el, items.el,
        h('label', {}, 'メモ', h('textarea', { id: 'cn_body', rows: 4, placeholder: 'この点で起きること・わかること・次に考えられる動き' }, n?.body || ''))),
      onSave: () => {
        const v = s => document.getElementById(s)?.value ?? '';
        const title = v('cn_title').trim(), type = v('cn_type'), body = v('cn_body'), time = v('cn_time').trim();
        if (!title) throw '題名を入れてください';
        const label = v('cn_label').trim(), nid = n ? id : newChartNode().id;
        ctx.commitNew(w => {
          const sc = w.notes[sid]; sc.chart ||= emptyChart();
          const fields = { title, type, body, place: place.resolve(w), cast: cast.resolve(w), items: items.resolve(w) };
          if (time) fields.time = time;
          if (n) { const x = sc.chart.nodes[id]; Object.assign(x, fields); if (!time) delete x.time; if (!fields.place) delete x.place; return; }
          sc.chart.nodes[nid] = newChartNode({ ...fields, id: nid });
          if (!fields.place) delete sc.chart.nodes[nid].place;
          if (prev) { const ed = newChartEdge(from, nid, label); sc.chart.edges[ed.id] = ed; }
        }, n ? '点を直す' : prev ? '次の点を作る' : '点を作る');
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

  function render() {
    const c = chart(), empty = !Object.keys(c.nodes).length;
    bar.replaceChildren(...[
      h('h2', {}, 'ストーリーチャート'),
      linking ? h('span', { class: 'pick-hint' }, `「${c.nodes[linking]?.title || '題名なし'}」から矢印を引く相手の点を押す`, h('button', { type: 'button', class: 'btn small', onclick: () => { linking = null; render(); } }, 'やめる')) : null,
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn', onclick: () => editNode(null) }, '＋ 点'),
      empty ? null : h('button', { type: 'button', class: 'btn', title: '手で動かした点も、自動の位置に戻す', onclick: () => { C(c => { for (const n of Object.values(c.nodes)) delete n.pos; }, '自動に並べる'); first = true; } }, '自動に並べる'),
      empty ? null : h('button', { type: 'button', class: 'btn', onclick: clues }, '手がかりの一覧'),
      empty ? null : h('button', { type: 'button', class: 'btn', onclick: scenes }, '場所ごとの一覧'),
      h('button', { type: 'button', class: 'btn icon', 'aria-label': '全体を見る', title: '全体を見る', onclick: () => { first = true; render(); } }, '⤢'),
    ].filter(Boolean));
    stage.classList.toggle('placing', !!linking);
    if (empty) { layer.replaceChildren(h('div', { class: 'fam-empty' }, h('p', {}, 'まだ点がありません。導入の出来事などを「＋ 点」で作り、点の「＋ 次へ」で、PLの行動ごとに次の点をつなげていきます。'), h('button', { type: 'button', class: 'btn primary', onclick: () => editNode(null) }, '＋ 最初の点'))); pz.fit(0, 0, 420, 140); return; }
    cur = drawChart(layer, c, { linking, cardTitle: r => ctx.world.notes[r]?.title || '（消えたカード）', placeLabel: r => ctx.world.notes[r] ? pathOf(r) : '（消えた場所）', onRef: r => ctx.world.notes[r] && ctx.openRelated(r) });
    const size = cur.drawEdges();
    if (first) { pz.fit(-30, -30, size.w + 90, size.h + 30, 1); first = false; }
  }
  render();
  return { update: e => { if (e?.type !== 'search') { if (!sc()) return; render(); } } };
}
