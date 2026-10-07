// 共有されたシナリオを読むページ（share.html）：…/share.html#f=ファイルid&k=APIキー。編集はできない。
// Googleドライブの「リンクを知っている人は読める」ファイルを、API キーで読む（ログインは要らない）
import { h, byTitle } from './util.js';
import { renderMarkdown } from './ui/markdown.js';
import { formatTime } from './cal/index.js';
import { kindOf, templatesFor, placePath, KINDS } from './model.js';
import { drawChart } from './ui/chartView.js';
import { bornOf, periodOf, ageIn } from './ui/elements.js';
import { PKG } from './share.js';

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
    h('h3', {}, n.title || '（名前なし）', kindOf(n) === 'person' && ageIn(w, n, sc) ? h('span', { class: 'note-text' }, `（${ageIn(w, n, sc)}）`) : null),
    kindOf(n) === 'person' && bornOf(w, n) ? h('p', { class: 'note-text' }, `生年月日：${when(bornOf(w, n))}`) : null,
    n.at && w.notes[n.at] ? h('p', { class: 'note-text' }, `場所：${path(n.at)}`) : null,
    kindOf(n) === 'place' && placePath(w, n.id).length > 1 ? h('p', { class: 'note-text' }, path(n.id)) : null,
    fields(n), n.body ? md(n.body) : null);
  const events = Object.values(w.notes).filter(n => n.when && n.id !== sc.id).sort((a, b) => a.when.t.d - b.when.t.d || a.when.t.s - b.when.t.s);
  const group = kind => Object.values(w.notes).filter(n => n.id !== sc.id && kindOf(n) === kind).sort(byTitle);
  const others = Object.values(w.notes).filter(n => n.id !== sc.id && kindOf(n) === 'note' && !n.when).sort(byTitle);
  const section = (title, list) => list.length ? h('section', { class: 'share-sec' }, h('h2', {}, title), ...list) : null;
  // チャート（見るだけ）
  let chartBox = null;
  if (Object.keys(sc.chart?.nodes || {}).length) {
    const layer = h('div', { class: 'share-chart-layer' });
    chartBox = h('section', { class: 'share-sec' }, h('h2', {}, 'ストーリーチャート'), h('div', { class: 'share-chart' }, layer));
    requestAnimationFrame(() => {
      const r = drawChart(layer, sc.chart, { readOnly: true, cardTitle: id => w.notes[id]?.title || '', onRef: id => document.getElementById('card-' + id)?.scrollIntoView({ behavior: 'smooth' }) });
      const size = r.drawEdges();
      Object.assign(layer.style, { width: size.w + 100 + 'px', height: size.h + 30 + 'px' });
    });
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
    fields(sc) ? h('section', { class: 'share-sec' }, fields(sc)) : null,
    sc.body ? h('section', { class: 'share-sec' }, h('h2', {}, 'メモ'), md(sc.body)) : null,
    chartBox,
    section('出来事', events.map(n => h('article', { class: 'share-card', id: 'card-' + n.id }, h('p', { class: 'data' }, when(n.when)), h('h3', {}, n.title || '（名前なし）'), n.body ? md(n.body) : null))),
    ...['person', 'item', 'group', 'place'].map(kd => section(kd === 'person' ? '登場人物' : KINDS[kd].label, group(kd).map(card))),
    section('付箋', others.map(card)),
    sc.sessions?.length ? section('遊んだ記録', sc.sessions.map(s => h('article', { class: 'share-card' }, h('h3', {}, s.date || ''), s.who ? h('p', { class: 'note-text' }, `参加者：${s.who}`) : null, s.memo ? md(s.memo) : null))) : null,
    h('footer', { class: 'note-text share-foot' }, 'TRPG 世界設定で作ったシナリオです。このページは読むだけで、書き換えはできません。')].filter(Boolean));
  root.addEventListener('click', e => { const a = e.target.closest('a.nlink'); if (!a) return; e.preventDefault(); if (a.dataset.note) document.getElementById('card-' + a.dataset.note)?.scrollIntoView({ behavior: 'smooth' }); });
}
start();
