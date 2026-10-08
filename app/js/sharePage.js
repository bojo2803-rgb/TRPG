// 共有されたシナリオを読むページ（share.html）：…/share.html#f=ファイルid&k=APIキー。編集はできない。
// Googleドライブの「リンクを知っている人は読める」ファイルを、API キーで読む（ログインは要らない）
import { h, byTitle } from './util.js';
import { renderMarkdown } from './ui/markdown.js';
import { formatTime } from './cal/index.js';
import { kindOf, templatesFor, placePath, KINDS } from './model.js';
import { drawChart } from './ui/chartView.js';
import { bornOf, periodOf, ageIn } from './ui/elements.js';
import { PKG } from './share.js';
import { scenesByPlace, layoutChart, NODE_TYPES } from './chart.js';

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
  const card = n => h('article', { class: `share-card k-${kindOf(n)}`, id: 'card-' + n.id },
    n.pic && pkg.images?.[n.pic]?.data ? h('img', { class: 'share-pic', src: pkg.images[n.pic].data, alt: '' }) : null,
    h('h3', {}, n.title || '（名前なし）', kindOf(n) === 'person' && ageIn(w, n, sc) ? h('span', { class: 'note-text' }, `（${ageIn(w, n, sc)}）`) : null),
    kindOf(n) === 'person' && bornOf(w, n) ? h('p', { class: 'note-text' }, `生年月日：${when(bornOf(w, n))}`) : null,
    n.at && w.notes[n.at] ? h('p', { class: 'note-text' }, `場所：${path(n.at)}`) : null,
    kindOf(n) === 'place' && placePath(w, n.id).length > 1 ? h('p', { class: 'note-text' }, path(n.id)) : null,
    fields(n), n.body ? md(n.body) : null);
  const events = Object.values(w.notes).filter(n => n.when && n.id !== sc.id).sort((a, b) => a.when.t.d - b.when.t.d || a.when.t.s - b.when.t.s);
  const group = kind => Object.values(w.notes).filter(n => n.id !== sc.id && kindOf(n) === kind).sort(byTitle);
  const others = Object.values(w.notes).filter(n => n.id !== sc.id && kindOf(n) === 'note' && !n.when).sort(byTitle);
  const section = (title, list) => list.length ? h('section', { class: 'share-sec' }, h('h2', {}, title), ...list) : null;
  // チャート（見るだけ）。点を押すと、下の「チャートの点」でその点のメモを全部読める
  let chartBox = null, pointsBox = null;
  const flash = el => { if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  if (Object.keys(sc.chart?.nodes || {}).length) {
    const layer = h('div', { class: 'share-chart-layer' });
    layer.addEventListener('click', e => { const nd = e.target.closest('[data-node]'); if (nd && !e.target.closest('button')) flash(document.getElementById('pt-' + nd.dataset.node)); });
    chartBox = h('section', { class: 'share-sec' }, h('h2', {}, 'ストーリーチャート'), h('p', { class: 'note-text' }, '点を押すと、その点のメモを下の「チャートの点」で全部読めます。'), h('div', { class: 'share-chart' }, layer));
    requestAnimationFrame(() => {
      const r = drawChart(layer, sc.chart, { readOnly: true, cardTitle: id => w.notes[id]?.title || '', placeLabel: id => w.notes[id] ? path(id) : '', onRef: id => flash(document.getElementById('card-' + id)) });
      const size = r.drawEdges();
      Object.assign(layer.style, { width: size.w + 100 + 'px', height: size.h + 30 + 'px' });
    });
    // チャートの点：上から下、左から右の順に、メモを全部と、つながる点（PLの行動）
    const C = sc.chart, pos = layoutChart(C), edges = Object.values(C.edges);
    const order = Object.values(C.nodes).sort((a, b) => pos[a.id].y - pos[b.id].y || pos[a.id].x - pos[b.id].x);
    const ptLink = id => h('a', { href: '#', onclick: e => { e.preventDefault(); flash(document.getElementById('pt-' + id)); } }, C.nodes[id]?.title || '（題名なし）');
    const cardLink = id => w.notes[id] ? h('a', { href: '#', onclick: e => { e.preventDefault(); flash(document.getElementById('card-' + id)); } }, w.notes[id].title || '（名前なし）') : null;
    const names = ids => (ids || []).filter(id => w.notes[id]).flatMap((id, i) => [i ? '・' : '', cardLink(id)]);
    const meta = (icon, label, ...kids) => kids.length ? h('p', { class: 'cpoint-m' }, h('span', { class: 'lbl' }, `${icon} ${label}`), ...kids) : null;
    pointsBox = section('チャートの点', order.map(n => {
      const t = NODE_TYPES[n.type] || NODE_TYPES.memo;
      const ins = edges.filter(e => e.to === n.id && C.nodes[e.from]), outs = edges.filter(e => e.from === n.id && C.nodes[e.to]);
      return h('article', { class: `share-card cpoint t-${n.type}`, id: 'pt-' + n.id },
        h('div', { class: 'row' }, h('span', { class: 'note-text' }, `${t.icon} ${t.label}`), h('span', { class: 'sp' }),
          h('button', { type: 'button', class: 'btn small', onclick: () => flash(layer.querySelector(`[data-node="${n.id}"]`)) }, '↑ チャートで見る')),
        h('h3', {}, n.title || '（題名なし）'),
        n.time ? meta('🕒', 'いつ', n.time) : null,
        n.place && w.notes[n.place] ? meta('📍', '場所', h('a', { href: '#', onclick: e => { e.preventDefault(); flash(document.getElementById('card-' + n.place)); } }, path(n.place))) : null,
        n.cast?.some(id => w.notes[id]) ? meta('👤', '登場', ...names(n.cast)) : null,
        n.items?.some(id => w.notes[id]) ? meta('🎁', 'アイテム', ...names(n.items)) : null,
        n.refs?.some(id => w.notes[id]) ? meta('🔗', '結び付け', ...names(n.refs)) : null,
        n.body ? md(n.body) : null,
        ins.length ? meta('←', 'ここへ', ...ins.flatMap((e, i) => [i ? '／' : '', '「', ptLink(e.from), '」から', e.label ? `（${e.label}）` : ''])) : null,
        outs.length ? meta('→', 'ここから', ...outs.flatMap((e, i) => [i ? '／' : '', e.label ? `${e.label} → ` : '', '「', ptLink(e.to), '」'])) : null);
    }));
  }
  // 場所ごとのシーン（チャートの点に場所があるときだけ）
  const byPlace = Object.values(sc.chart?.nodes || {}).some(x => x.place && w.notes[x.place]) ? scenesByPlace(sc.chart, w) : [];
  const tt = n => w.notes[n]?.title || '';
  const sceneCard = g => h('article', { class: 'share-card' }, h('h3', {}, g.place ? `📍 ${g.label}` : g.label),
    h('ul', {}, ...g.nodes.map(x => h('li', {}, h('b', {}, x.title || '（題名なし）'), x.time ? `（${x.time}）` : '',
      x.cast?.length ? ` 👤 ${x.cast.map(tt).filter(Boolean).join('・')}` : '', x.items?.length ? ` 🎁 ${x.items.map(tt).filter(Boolean).join('・')}` : ''))));
  const period = periodOf(w, sc);
  root.replaceChildren(...[
    h('header', { class: 'share-head' },
      h('p', { class: 'note-text' }, 'シナリオ'),
      h('h1', {}, sc.title || '（名前なし）'),
      h('p', { class: 'note-text' }, `${new Date(pkg.sharedAt).toLocaleString('ja-JP', { dateStyle: 'long', timeStyle: 'short' })}の内容`, period ? ` ・ 時期：${when(period)}` : '', sc.at && w.notes[sc.at] ? ` ・ 舞台：${path(sc.at)}` : ''),
      h('div', { class: 'row share-tools' },
        h('button', { type: 'button', class: 'btn', onclick: () => print() }, '印刷'),
        h('a', { class: 'btn', href: `./#import&f=${encodeURIComponent(f)}&k=${encodeURIComponent(k)}`, title: 'TRPG 世界設定のアプリで、いま開いている世界にこのシナリオを取り込みます' }, '自分のアプリに取り込む'))),
    fields(sc) ? h('section', { class: 'share-sec' }, fields(sc)) : null,
    sc.body ? h('section', { class: 'share-sec' }, h('h2', {}, 'メモ'), md(sc.body)) : null,
    chartBox,
    pointsBox,
    section('場所ごとのシーン', byPlace.map(sceneCard)),
    section('出来事', events.map(n => h('article', { class: 'share-card', id: 'card-' + n.id }, h('p', { class: 'data' }, when(n.when)), h('h3', {}, n.title || '（名前なし）'), n.body ? md(n.body) : null))),
    ...['person', 'item', 'group', 'place'].map(kd => section(kd === 'person' ? '登場人物' : KINDS[kd].label, group(kd).map(card))),
    section('付箋', others.map(card)),
    sc.sessions?.length ? section('遊んだ記録', sc.sessions.map(s => h('article', { class: 'share-card' }, h('h3', {}, s.date || ''), s.who ? h('p', { class: 'note-text' }, `参加者：${s.who}`) : null, s.memo ? md(s.memo) : null))) : null,
    h('footer', { class: 'note-text share-foot' }, 'TRPG 世界設定で作ったシナリオです。このページは読むだけで、書き換えはできません。')].filter(Boolean));
  root.addEventListener('click', e => { const a = e.target.closest('a.nlink'); if (!a) return; e.preventDefault(); if (a.dataset.note) document.getElementById('card-' + a.dataset.note)?.scrollIntoView({ behavior: 'smooth' }); });
}
start();
