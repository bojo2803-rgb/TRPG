// 共有されたシナリオを読むページ（share.html）：…/share.html#f=ファイルid&k=APIキー。編集はできない。
// Googleドライブの「リンクを知っている人は読める」ファイルを、API キーで読む（ログインは要らない）
import { h, byTitle } from './util.js';
import { renderMarkdown } from './ui/markdown.js';
import { formatTime } from './cal/index.js';
import { kindOf, templatesFor, placePath, KINDS } from './model.js';
import { drawChart } from './ui/chartView.js';
import { bornOf, periodOf, ageIn } from './ui/elements.js';
import { PKG } from './share.js';
import { layoutChart, NODE_TYPES, CHART_W } from './chart.js';
import { panZoom } from './ui/panzoom.js';

const root = document.getElementById('share');
const q = new URLSearchParams(location.hash.slice(1)), f = q.get('f'), k = q.get('k');
const fail = msg => root.replaceChildren(h('h1', {}, 'シナリオを開けませんでした'), h('p', {}, msg));

async function start() {
  if (!f || !k) return fail('リンクがまちがっています（共有した人に、もう一度リンクを送ってもらってください）。');
  let pkg;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f)}?alt=media&key=${encodeURIComponent(k)}`);
    if (!r.ok) return fail(r.status === 404 ? '共有がやめられたか、リンクがまちがっています。' : `読み込めませんでした（${r.status}）。`);
    pkg = await r.json();
  } catch (e) { return fail(`読み込めませんでした（${e.message}）。通信を確かめてください。`); }
  if (pkg?.format !== PKG) return fail('シナリオのファイルではありません。');
  render(pkg);
}

function render(pkg) {
  const w = { name: pkg.title, settings: pkg.settings, tracks: pkg.tracks, calendars: pkg.calendars || {}, templates: pkg.templates || {}, notes: pkg.notes, links: pkg.links || {}, boards: {}, maps: {}, images: {} };
  const sc = w.notes[pkg.scenario];
  document.title = `${sc.title || 'シナリオ'} — シナリオ`;
  const when = v => v ? formatTime(v.t, { track: w.tracks.find(t => t.id === v.tr), tz: v.tz, prec: v.prec, approx: v.approx, until: v.until }, w) : '';
  const find = t => Object.values(w.notes).find(n => n.title === t);
  const md = src => h('div', { class: 'md', html: renderMarkdown(src, { resolveLink: find, imageUrl: id => pkg.images?.[id]?.data || '' }) });
  const fields = n => {
    const rows = [];
    for (const t of templatesFor(w, n)) for (const fd of t.fields) {
      if (fd.type === 'section') { if (rows.length && rows.at(-1).tagName === 'H4') rows.pop(); rows.push(h('h4', {}, fd.label)); continue; }
      const v = n.fields?.[fd.key];
      if (v === undefined || v === '') continue;
      rows.push(h('div', { class: 'sf' }, h('span', { class: 'lbl' }, fd.label), fd.type === 'long' ? md(String(v)) : h('span', {}, String(v))));
    }
    if (rows.at(-1)?.tagName === 'H4') rows.pop();
    return rows.length ? h('div', { class: 'share-fields' }, ...rows) : null;
  };
  const path = id => placePath(w, id).map(x => w.notes[x].title || '名前なし').join(' › ');
  const cardOf = (n, anchor = true) => h('article', { class: `share-card k-${kindOf(n)}`, id: anchor ? 'card-' + n.id : null },
    n.pic && pkg.images?.[n.pic]?.data ? h('img', { class: 'share-pic', src: pkg.images[n.pic].data, alt: '' }) : null,
    h('h3', {}, n.title || '（名前なし）', kindOf(n) === 'person' && ageIn(w, n, sc) ? h('span', { class: 'note-text' }, `（${ageIn(w, n, sc)}）`) : null),
    kindOf(n) === 'person' && bornOf(w, n) ? h('p', { class: 'note-text' }, `生年月日：${when(bornOf(w, n))}`) : null,
    n.at && w.notes[n.at] ? h('p', { class: 'note-text' }, `場所：${path(n.at)}`) : null,
    kindOf(n) === 'place' && placePath(w, n.id).length > 1 ? h('p', { class: 'note-text' }, path(n.id)) : null,
    fields(n), n.body ? md(n.body) : null);
  const card = n => cardOf(n);
  const events = Object.values(w.notes).filter(n => n.when && n.id !== sc.id).sort((a, b) => a.when.t.d - b.when.t.d || a.when.t.s - b.when.t.s);
  const group = kind => Object.values(w.notes).filter(n => n.id !== sc.id && kindOf(n) === kind).sort(byTitle);
  const others = Object.values(w.notes).filter(n => n.id !== sc.id && kindOf(n) === 'note' && !n.when).sort(byTitle);
  // 項目は見出しを押すとたためる（数があれば見出しの横に）
  const fold = (title, n, kids, open = true) => h('details', { class: 'share-sec fold', open }, h('summary', {}, h('h2', {}, title), n ? h('span', { class: 'fold-n' }, String(n)) : null), ...kids);
  const section = (title, list) => list.length ? fold(title, list.length, list) : null;
  // ストーリーチャート：左に全体（引っぱって動かす・拡大縮小）、右にえらんだ点を全部読める欄。
  // 点を押すと右の欄が変わる（ページは動かない）。「このあと」で PL の行動をたどって次の点へ。登場人物などの名前は、右の欄の中で開く。
  // スマホは、点を押すと下から読む欄が出る。印刷では、すべての点を順に並べる
  let chartBox = null, allBox = null, selectPoint = null;
  if (Object.keys(sc.chart?.nodes || {}).length) {
    const C = sc.chart, edges = Object.values(C.edges), pos0 = layoutChart(C);
    const order = Object.values(C.nodes).sort((a, b) => pos0[a.id].y - pos0[b.id].y || pos0[a.id].x - pos0[b.id].x);
    const ins = id => edges.filter(e => e.to === id && C.nodes[e.from]), outs = id => edges.filter(e => e.from === id && C.nodes[e.to]);
    const stage = h('div', { class: 'rd-stage', 'aria-label': 'ストーリーチャート（引っぱって動かす・ホイールやピンチで拡大）' }), layer = h('div', { class: 'share-chart-layer' });
    stage.append(layer);
    // 欄は3段：上（戻る）・中（読む。ここだけ動く）・下（このあと）。上と下は高さを決めてあるので、選択肢はいつも同じ場所に出る
    const slots = Math.min(4, Math.max(1, ...order.map(n => outs(n.id).length)));
    const bar = h('div', { class: 'rd-bar' }), body = h('div', { class: 'rd-body', 'aria-live': 'polite' }), next = h('nav', { class: 'rd-next', 'aria-label': 'このあと' });
    const panel = h('aside', { class: 'rd-panel', 'aria-label': 'えらんだ点', style: { '--rd-slots': slots } }, bar, body, next);
    let sel = order[0].id, card = null, cur = null, trail = []; // trail：読んできた道（戻るで1つずつ戻る）
    const phone = () => matchMedia('(max-width: 760px)').matches;
    const pz = panZoom(stage, layer, { onClick: el => { if (el.dataset.node) choose(el.dataset.node); } });
    const draw = () => {
      cur = drawChart(layer, C, { readOnly: true, selected: sel, cardTitle: id => w.notes[id]?.title || '', placeLabel: id => w.notes[id] ? path(id) : '' });
      const size = cur.drawEdges();
      Object.assign(layer.style, { width: size.w + 60 + 'px', height: size.h + 30 + 'px' }); // 印刷のときの大きさ
      return size;
    };
    const fit = () => { const size = draw(); pz.fit(-24, -24, size.w + 48, size.h + 24, 1, 0.75); };
    // えらんだ点が見えていなければ、真ん中へ動かす（自分で押した点は動かさない）
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
    const wrap = h('div', { class: 'rd-wrap' }, stage, panel), smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    // スマホは下から出す。パソコンは、読む欄が画面からはみ出していれば、はみ出さないところまでだけ動かす（選択肢が見切れないように）
    const openSheet = () => {
      if (phone()) return panel.classList.add('open');
      const r = wrap.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) wrap.scrollIntoView({ block: 'nearest', behavior: smooth() });
    };
    function choose(id, { follow = false } = {}) {
      if (id !== sel || card) trail.push({ sel, card });
      sel = id; card = null;
      draw(); renderPanel(); openSheet();
      if (follow) reveal(id);
    }
    const showCard = id => { trail.push({ sel, card }); card = id; renderPanel(); };
    const back = () => { const t = trail.pop(); if (!t) return; const moved = t.sel !== sel; sel = t.sel; card = t.card; if (moved) draw(); renderPanel(); if (moved) reveal(sel); };
    // 数字キーで「このあと」の何番目かへ（本のゲームのように読める）
    addEventListener('keydown', e => {
      if (!chartBox.open || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
      if (phone() && !panel.classList.contains('open')) return;
      const go = outs(sel)[+e.key - 1];
      if (/^[1-9]$/.test(e.key) && go) { e.preventDefault(); choose(go.to, { follow: true }); }
    });
    selectPoint = id => { chartBox.open = true; (phone() ? stage : wrap).scrollIntoView({ behavior: smooth(), block: 'center' }); choose(id, { follow: true }); };
    const nameBtns = ids => (ids || []).filter(id => w.notes[id]).map(id => h('button', { type: 'button', class: 'rd-name', onclick: () => showCard(id) }, w.notes[id].title || '（名前なし）'));
    const row = (label, ...vals) => vals.length ? [h('dt', {}, label), h('dd', {}, ...vals)] : [];
    function renderPanel() {
      const n = C.nodes[sel], t = NODE_TYPES[n.type] || NODE_TYPES.memo, nx = outs(n.id), pv = ins(n.id), last = trail.at(-1);
      const lastName = last && (last.card ? w.notes[last.card]?.title : C.nodes[last.sel]?.title);
      bar.replaceChildren(...[
        h('button', { type: 'button', class: 'linkish rd-back', disabled: !last, onclick: back }, last ? `← 「${lastName || '題名なし'}」に戻る` : '← 戻る'),
        h('button', { type: 'button', class: 'btn icon rd-close', 'aria-label': '閉じる', onclick: () => panel.classList.remove('open') }, '×')]);
      if (card && w.notes[card]) {
        // このカードが出てくる点（場所・登場・アイテム・関係）。押すとその点へ
        const at = order.filter(x => [x.place, ...(x.cast || []), ...(x.items || []), ...(x.refs || [])].includes(card));
        body.replaceChildren(...[cardOf(w.notes[card], false),
          at.length ? h('section', { class: 'rd-prev' }, h('h4', {}, 'チャートでの出番'), ...at.map(x => h('button', { type: 'button', class: 'rd-back-to', onclick: () => choose(x.id, { follow: true }) }, `「${x.title || '題名なし'}」${x.place === card ? 'の場所' : ''}`))) : null].filter(Boolean));
      } else {
        body.replaceChildren(...[
          h('div', { class: 'rd-title-row' }, h('h3', { class: 'rd-title' }, n.title || '（題名なし）'), h('span', { class: `rd-type t-${n.type}` }, t.label)),
          h('dl', { class: 'rd-meta' },
            ...row('いつ', ...(n.time ? [n.time] : [])),
            ...row('場所', ...(n.place && w.notes[n.place] ? [h('button', { type: 'button', class: 'rd-name', onclick: () => showCard(n.place) }, path(n.place))] : [])),
            ...row('登場', ...nameBtns(n.cast)),
            ...row('アイテム', ...nameBtns(n.items)),
            ...row('関係', ...nameBtns(n.refs))),
          n.body ? md(n.body) : h('p', { class: 'note-text' }, 'メモはありません。'),
          pv.length ? h('section', { class: 'rd-prev' }, h('h4', {}, 'ここに来るまで'),
            ...pv.map(e => h('button', { type: 'button', class: 'rd-back-to', onclick: () => choose(e.from, { follow: true }) }, `「${C.nodes[e.from].title || '題名なし'}」${e.label ? `で ${e.label}` : 'から'}`))) : null,
        ].filter(Boolean));
      }
      // このあと：番号つき。文字は1行ずつ（長いときは「…」、押す前に全文が出る）
      next.replaceChildren(h('h4', {}, card ? `このあと（「${n.title || '題名なし'}」から）` : 'このあと'),
        ...(nx.length ? nx.map((e, i) => {
          const full = `${e.label || 'そのまま進む'} → ${C.nodes[e.to].title || '題名なし'}`;
          return h('button', { type: 'button', class: 'rd-go', title: full, 'aria-label': full, onclick: () => choose(e.to, { follow: true }) },
            h('span', { class: 'rd-num', 'aria-hidden': 'true' }, i < 9 ? String(i + 1) : ''), h('span', { class: 'rd-act' }, e.label || 'そのまま進む'), h('span', { class: 'rd-to' }, `→ ${C.nodes[e.to].title || '題名なし'}`));
        }) : [h('p', { class: 'note-text rd-end' }, n.type === 'ending' ? 'ここで終わりです。' : 'この先の点はありません。')]));
      body.scrollTop = 0;
    }
    // たたんでいる間は大きさが測れないので、開いたときに描き直す
    chartBox = h('details', { class: 'share-sec fold rd', open: true, ontoggle: () => { if (chartBox.open) fit(); else panel.classList.remove('open'); } },
      h('summary', { class: 'rd-head' }, h('h2', {}, 'ストーリーチャート'),
        h('span', { class: 'note-text' }, `点を押すと${phone() ? '下' : '右'}に全部出ます。引っぱって動かせます`),
        h('button', { type: 'button', class: 'btn small', onclick: e => { e.preventDefault(); fit(); } }, '全体を見る')),
      wrap);
    requestAnimationFrame(() => { fit(); renderPanel(); });
    addEventListener('resize', () => { if (!phone()) panel.classList.remove('open'); });
    new IntersectionObserver(([e]) => { if (e.intersectionRatio < 0.2) panel.classList.remove('open'); }, { threshold: 0.2 }).observe(stage); // スマホ：チャートがほとんど見えなくなったら下の欄をしまう
    // すべての点を順に（読み物として・印刷用）。ふだんはたたんでおく
    allBox = fold('すべての点を順に読む', order.length, order.map(n => {
        const t = NODE_TYPES[n.type] || NODE_TYPES.memo, names = ids => (ids || []).map(id => w.notes[id]?.title).filter(Boolean).join('・');
        const meta = (label, v) => v ? h('p', { class: 'cpoint-m' }, h('span', { class: 'lbl' }, label), v) : null;
        return h('article', { class: `share-card cpoint t-${n.type}` },
          h('div', { class: 'rd-title-row' }, h('h3', {}, n.title || '（題名なし）'), h('span', { class: `rd-type t-${n.type}` }, t.label),
            h('button', { type: 'button', class: 'btn small rd-show', onclick: () => selectPoint(n.id) }, 'チャートで見る')),
          meta('いつ', n.time), meta('場所', n.place && w.notes[n.place] ? path(n.place) : ''), meta('登場', names(n.cast)), meta('アイテム', names(n.items)),
          n.body ? md(n.body) : null,
          meta('このあと', outs(n.id).map(e => `${e.label ? `${e.label} ` : ''}→ 「${C.nodes[e.to].title || '題名なし'}」`).join('／')));
      }), false);
  }
  const period = periodOf(w, sc);
  root.replaceChildren(...[
    h('header', { class: 'share-head' },
      h('p', { class: 'note-text' }, 'シナリオ'),
      h('h1', {}, sc.title || '（名前なし）'),
      h('p', { class: 'note-text' }, `${new Date(pkg.sharedAt).toLocaleString('ja-JP', { dateStyle: 'long', timeStyle: 'short' })}の内容`, period ? ` ・ 時期：${when(period)}` : '', sc.at && w.notes[sc.at] ? ` ・ 舞台：${path(sc.at)}` : ''),
      h('div', { class: 'row share-tools' },
        h('button', { type: 'button', class: 'btn', onclick: () => print() }, '印刷'),
        h('a', { class: 'btn', href: `./#import&f=${encodeURIComponent(f)}&k=${encodeURIComponent(k)}`, title: 'TRPG 世界設定のアプリで、いま開いている世界にこのシナリオを取り込みます' }, '自分のアプリに取り込む'))),
    fields(sc) ? fold('シナリオの基本', 0, [fields(sc)]) : null,
    sc.body ? fold('メモ', 0, [md(sc.body)]) : null,
    chartBox,
    allBox,
    section('出来事', events.map(n => h('article', { class: 'share-card', id: 'card-' + n.id }, h('p', { class: 'data' }, when(n.when)), h('h3', {}, n.title || '（名前なし）'), n.body ? md(n.body) : null))),
    ...['person', 'item', 'group', 'place'].map(kd => section(kd === 'person' ? '登場人物' : KINDS[kd].label, group(kd).map(card))),
    section('付箋', others.map(card)),
    sc.sessions?.length ? section('遊んだ記録', sc.sessions.map(s => h('article', { class: 'share-card' }, h('h3', {}, s.date || ''), s.who ? h('p', { class: 'note-text' }, `参加者：${s.who}`) : null, s.memo ? md(s.memo) : null))) : null,
    h('footer', { class: 'note-text share-foot' }, 'TRPG 世界設定で作ったシナリオです。このページは読むだけで、書き換えはできません。')].filter(Boolean));
  root.addEventListener('click', e => {
    const a = e.target.closest('a.nlink'); if (!a) return;
    e.preventDefault();
    const el = a.dataset.note && document.getElementById('card-' + a.dataset.note);
    if (el) { el.closest('details').open = true; el.scrollIntoView({ behavior: 'smooth' }); }
  });
  // 印刷では全部開いて、終わったら元のたたみ方に戻す
  let shut = [];
  addEventListener('beforeprint', () => { shut = [...root.querySelectorAll('details:not([open])')]; shut.forEach(d => { d.open = true; }); });
  addEventListener('afterprint', () => { shut.forEach(d => { d.open = false; }); });
}
start();
