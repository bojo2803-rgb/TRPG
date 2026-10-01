// 要素（人物・シナリオ・アイテム・集団）の編集画面の欄と、期間つきのつながり（所属・持ち主）の窓
import { h, esc, uid, debounce, byTitle } from '../util.js';
import { KINDS, kindOf, newBoard, newLink, newNote, childrenOf, findByTitle, placePath, placeKids, isWithin } from '../model.js';
import { formatTime } from '../cal/index.js';
import { pickNote } from './picker.js';

// 要素のボード（なければ作る。真ん中に要素自身のカード）。ボードの id を返す
export function ensureOwnBoard(ctx, id) {
  const b = Object.values(ctx.world.boards).find(b => b.owner === id);
  if (b) return b.id;
  const nb = newBoard({ name: ctx.world.notes[id]?.title || '名前なし', owner: id, items: { [id]: { x: 40, y: 40 } } });
  ctx.commit(w => { w.boards[nb.id] = nb; }, 'ボードを作成');
  return nb.id;
}
export const boardLabel = (w, b) => b.owner ? `${w.notes[b.owner]?.title || '名前なし'}のボード` : b.name;

// 期間：「1550年〜1582年」。わからない端は「？」
const fmtWhen = (w, v) => v ? formatTime(v.t, { track: w.tracks.find(t => t.id === v.tr), tz: v.tz, prec: v.prec, approx: v.approx, until: v.until }, w) : '';
export function periodText(w, l) {
  const a = fmtWhen(w, l.from), b = fmtWhen(w, l.to) || (l.done ? '？' : '');
  return a || b ? `${a || '？'}〜${b}` : '';
}
const whenOf = v => v && { tr: 'main', t: v.t, prec: v.prec, tz: v.tz, ...(v.approx && { approx: true }), ...(v.until && { until: v.until }) };
const t0 = l => l.from ? l.from.t.d * 86400 + l.from.t.s : -Infinity;
const byFrom = (a, b) => t0(a) - t0(b);

export const linksOfKind = (w, kind, side, id) => Object.values(w.links).filter(l => l.kind === kind && l[side] === id && w.notes[l.a] && w.notes[l.b]);
// いまの持ち主（終わっていない持ち主の、いちばん新しいもの）
export const currentHolder = (w, itemId) => linksOfKind(w, 'holds', 'b', itemId).filter(l => !l.to && !l.done).sort(byFrom).pop()?.a || null;

const chip = (ctx, id, extra, onRemove) => {
  const o = ctx.world.notes[id];
  if (!o) return null;
  return h('span', { class: `chip p-${o.color ?? 0}` },
    h('a', { href: '#', onclick: e => { e.preventDefault(); ctx.openNote(id); } }, o.title || '（名前なし）'), extra ? h('span', { class: 'note-text' }, ' ' + extra) : null,
    onRemove ? h('button', { type: 'button', class: 'x', 'aria-label': '外す', onclick: onRemove }, '×') : null);
};
const row = (label, ...kids) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), ...kids);
const add = (label, onclick) => h('button', { type: 'button', class: 'btn small', onclick }, label);

// ===== 名前で選ぶ欄（候補つき。ない名前なら、その種類で新しく作る） =====
function nameField(ctx, label, kinds, value, newKind) {
  const id = 'nf' + uid('');
  const names = Object.values(ctx.world.notes).filter(n => kinds.includes(kindOf(n))).sort(byTitle);
  const input = h('input', { list: id, value: value ? ctx.world.notes[value]?.title || '' : '', autocomplete: 'off', placeholder: `${KINDS[newKind].label}の名前` });
  return {
    el: h('label', {}, label, input, h('datalist', { id }, ...names.map(n => h('option', { value: n.title }, KINDS[kindOf(n)].label)))),
    // 選んだカードの id。ない名前なら作る（commit の中で呼ぶ）
    resolve(w) {
      const t = input.value.trim();
      if (!t) throw `${label}を入れてください`;
      const hit = Object.values(w.notes).find(n => n.title === t && kinds.includes(kindOf(n))) || findByTitle(w, t);
      if (hit) return hit.id;
      const n = newNote({ kind: newKind, title: t });
      w.notes[n.id] = n;
      return n.id;
    },
  };
}
// 日時の欄（「わかる」のチェックで出す）。読むと出来事の日時の形か null
async function whenField(ctx, label, value) {
  const { dateInput } = await import('./dateInput.js');
  const main = ctx.world.tracks.find(t => t.id === 'main');
  const di = dateInput(ctx.world, { track: main, value: value || null });
  const known = h('input', { type: 'checkbox', checked: !!value });
  const box = h('div', { hidden: !value }, di.el);
  known.addEventListener('change', () => { box.hidden = !known.checked; });
  return { el: h('div', { class: 'fields' }, h('label', { class: 'cb' }, known, label), box), read: () => known.checked ? whenOf(di.read()) : null };
}

// ===== 所属（人物 → 集団。役職・入った時・抜けた時） =====
export async function memberDialog(ctx, { person = null, group = null, linkId = null }) {
  const l = linkId ? ctx.world.links[linkId] : null;
  const P = nameField(ctx, '人物', ['person'], l?.a || person, 'person'), G = nameField(ctx, '集団', ['group'], l?.b || group, 'group');
  const role = h('input', { value: l?.label || '', placeholder: '例：教祖・幹部・下っ端', autocomplete: 'off' });
  const A = await whenField(ctx, '入った時がわかる', l?.from), B = await whenField(ctx, '抜けた時がわかる', l?.to);
  ctx.openDialog({
    title: l ? '所属を直す' : '所属を足す', ok: '保存', wide: true,
    body: h('div', { class: 'fields' }, person && !l ? null : P.el, group && !l ? null : G.el, h('label', {}, '役職', role), A.el, B.el),
    onSave: () => {
      const from = A.read(), to = B.read();
      ctx.commit(w => {
        const a = person && !l ? person : P.resolve(w), b = group && !l ? group : G.resolve(w);
        const x = l ? w.links[l.id] : newLink(a, b, { kind: 'member', style: 'dashed' });
        Object.assign(x, { a, b, label: role.value.trim(), from, to });
        w.links[x.id] = x;
      }, l ? '所属を直す' : '所属を足す');
    },
    onDelete: l ? () => ctx.commit(w => { delete w.links[l.id]; }, '所属を外す') : null,
  });
}

// ===== 持ち主（a 持ち主 → b アイテム。どうやって・いつから・いつまで） =====
export async function holderDialog(ctx, item, linkId = null) {
  const w0 = ctx.world, l = linkId ? w0.links[linkId] : null, itemTitle = w0.notes[item]?.title || '名前なし';
  const who = nameField(ctx, l ? '持ち主' : '新しい持ち主', ['person', 'group', 'note', 'scenario'], l?.a, 'person');
  const how = h('input', { value: l?.label || '', placeholder: '例：盗んだ・譲られた・発掘した', autocomplete: 'off' });
  const A = await whenField(ctx, l ? 'いつからがわかる' : 'いつ渡ったかがわかる', l?.from);
  const B = l ? await whenField(ctx, 'いつまでがわかる', l.to) : null;
  const ev = l ? null : h('input', { type: 'checkbox', checked: true });
  ctx.openDialog({
    title: l ? '持ち主を直す' : `「${itemTitle}」の持ち主を変える`, ok: '保存', wide: true,
    body: h('div', { class: 'fields' }, who.el, h('label', {}, 'どうやって', how), A.el, B?.el,
      ev ? h('label', { class: 'cb' }, ev, '日時がわかれば、時系列の本線に「渡る」出来事も置く') : null,
      l ? null : h('p', { class: 'note-text' }, 'いまの持ち主の期間は、ここで終わります。')),
    onSave: () => {
      const from = A.read(), to = B ? B.read() : null;
      ctx.commit(w => {
        const a = who.resolve(w);
        if (l) { Object.assign(w.links[l.id], { a, label: how.value.trim(), from, to }); if (to) delete w.links[l.id].done; return; }
        for (const o of linksOfKind(w, 'holds', 'b', item)) if (!o.to && !o.done) { if (from) o.to = from; else o.done = true; }
        const x = newLink(a, item, { kind: 'holds', style: 'dotted', arrow: 'end', label: how.value.trim(), from, to: null });
        w.links[x.id] = x;
        if (from && ev.checked) {
          const holder = w.notes[a].title, e = newNote({ title: `「${itemTitle}」が${holder}の手に渡る`, body: `[[${itemTitle}]] が [[${holder}]] の手に渡る。${how.value.trim()}`.trim(), when: from });
          w.notes[e.id] = e;
        }
      }, l ? '持ち主を直す' : '持ち主を変える');
    },
    onDelete: l ? () => ctx.commit(w => { delete w.links[l.id]; }, '持ち主を消す') : null,
  });
}

// ===== 編集画面の欄 =====
// 所属（人物の画面）・メンバー（集団の画面）
export function membersSec(ctx, w, n) {
  const asPerson = kindOf(n) === 'person', ls = linksOfKind(w, 'member', asPerson ? 'a' : 'b', n.id).sort(byFrom);
  return h('div', { class: 'fields' },
    ...ls.map(l => h('div', { class: 'row link-row' }, chip(ctx, asPerson ? l.b : l.a, [l.label, periodText(w, l)].filter(Boolean).join('・')),
      h('span', { class: 'sp' }), add('直す', () => memberDialog(ctx, { linkId: l.id })))),
    ls.length ? null : h('p', { class: 'note-text' }, asPerson ? 'どの集団にも入っていません' : 'メンバーはまだいません'),
    h('div', { class: 'row' }, add(asPerson ? '＋ 集団に入れる' : '＋ メンバーを足す', () => memberDialog(ctx, asPerson ? { person: n.id } : { group: n.id }))));
}
// 持ち主の移り変わり（アイテムの画面）
export function holdersSec(ctx, w, n) {
  const ls = linksOfKind(w, 'holds', 'b', n.id).sort(byFrom), cur = currentHolder(w, n.id);
  return h('div', { class: 'fields' },
    ...ls.map(l => h('div', { class: 'row link-row' }, chip(ctx, l.a, [l.label, periodText(w, l), l.a === cur && l === ls.find(x => x.a === cur && !x.to && !x.done) ? 'いまの持ち主' : ''].filter(Boolean).join('・')),
      h('span', { class: 'sp' }), add('直す', () => holderDialog(ctx, n.id, l.id)))),
    ls.length ? null : h('p', { class: 'note-text' }, '持ち主はまだいません'),
    h('div', { class: 'row' }, add('＋ 持ち主を変える', () => holderDialog(ctx, n.id))));
}
// 持ち物（人物・集団の画面）
export function holdingsSec(ctx, w, n) {
  const ls = linksOfKind(w, 'holds', 'a', n.id).sort(byFrom);
  return h('div', { class: 'fields' },
    ls.length ? h('div', { class: 'row' }, ...ls.map(l => chip(ctx, l.b, [periodText(w, l), !l.to && !l.done ? 'いま' : ''].filter(Boolean).join('・')))) : h('p', { class: 'note-text' }, '持ち物はありません（アイテムの画面の「持ち主を変える」で持たせます）'));
}
// 入っているシナリオ（人物・アイテム・集団・出来事の画面）
export function scenariosSec(ctx, w, n) {
  const ps = n.parents.filter(p => kindOf(w.notes[p]) === 'scenario');
  const rm = p => () => ctx.commit(w => { w.notes[n.id].parents = w.notes[n.id].parents.filter(x => x !== p); }, 'シナリオから外す');
  return h('div', { class: 'row' }, ...ps.map(p => chip(ctx, p, null, rm(p))), ps.length ? null : h('span', { class: 'note-text' }, 'なし'),
    add('＋ シナリオに入れる', () => pickNote(ctx, { title: 'どのシナリオに入れるか', kinds: ['scenario'], newKind: 'scenario', exclude: [n.id, ...ps], onPick: id => ctx.commit(w => { w.notes[n.id].parents.push(id); }, 'シナリオに入れる') })));
}
// シナリオの中身：出来事（時間順）・登場（人物・アイテム・集団）・付箋
const tKey = n => n.when ? n.when.t.d * 86400 + n.when.t.s : Infinity;
export function contentsSec(ctx, w, n) {
  const kids = childrenOf(w, n.id), out = id => () => ctx.commit(w => { w.notes[id].parents = w.notes[id].parents.filter(x => x !== n.id); }, 'シナリオから外す');
  const put = (title, kinds, newKind, filter = () => true) => () => pickNote(ctx, { title, kinds, newKind, exclude: [n.id, ...kids.map(k => k.id)], filter, onPick: id => ctx.commit(w => { if (!w.notes[id].parents.includes(n.id)) w.notes[id].parents.push(n.id); }, 'シナリオに入れる') });
  const events = kids.filter(k => k.when).sort((a, b) => tKey(a) - tKey(b));
  const cast = kids.filter(k => ['person', 'item', 'group'].includes(kindOf(k))).sort((a, b) => kindOf(a).localeCompare(kindOf(b)) || byTitle(a, b));
  const rest = kids.filter(k => !k.when && !cast.includes(k));
  return h('div', { class: 'fields' },
    h('div', { class: 'fields' }, h('span', { class: 'lbl' }, '出来事'),
      ...events.map(e => h('div', { class: 'row link-row' }, h('span', { class: 'data dir' }, fmtWhen(w, e.when)), chip(ctx, e.id, null, out(e.id)))),
      h('div', { class: 'row' }, add('＋ 出来事を入れる', put('入れる出来事（時系列にある付箋）', ['note'], 'note', o => !!o.when)))),
    row('登場', ...cast.map(c => chip(ctx, c.id, KINDS[kindOf(c)].label, out(c.id))), add('＋', put('登場させる人物・アイテム・集団', ['person', 'item', 'group'], 'person'))),
    rest.length ? row('付箋', ...rest.map(c => chip(ctx, c.id, null, out(c.id)))) : null);
}
// 遊んだ記録（シナリオ）：日付・参加者・メモを何回分でも
export function sessionsSec(ctx, w, n, edit) {
  const list = n.sessions || [];
  const field = (s, key, el) => {
    const save = debounce(() => edit((w, x) => { const t = x.sessions.find(y => y.id === s.id); if (t) t[key] = el.value; }, '遊んだ記録を直す'), 500);
    el.addEventListener('input', save); el.addEventListener('change', () => save.flush());
    return el;
  };
  return h('div', { class: 'fields' },
    ...list.map(s => h('div', { class: 'session' },
      h('div', { class: 'row' },
        field(s, 'date', h('input', { type: 'date', value: s.date || '', 'aria-label': '遊んだ日' })),
        field(s, 'who', h('input', { value: s.who || '', placeholder: '参加者', 'aria-label': '参加者', autocomplete: 'off' })),
        h('button', { type: 'button', class: 'btn small danger', 'aria-label': 'この記録を消す', onclick: () => ctx.commit(w => { w.notes[n.id].sessions = w.notes[n.id].sessions.filter(x => x.id !== s.id); }, '遊んだ記録を消す') }, '×')),
      field(s, 'memo', h('textarea', { rows: 2, placeholder: 'メモ（どうなったか・次回への引き）', 'aria-label': 'メモ' }, s.memo || '')))),
    h('div', { class: 'row' }, add('＋ 記録を足す', () => ctx.commit(w => { const x = w.notes[n.id]; x.sessions = [...(x.sessions || []), { id: uid('s'), date: new Date().toISOString().slice(0, 10), who: '', memo: '' }]; }, '遊んだ記録を足す'))));
}
// 上部組織・下部組織（集団どうしのまとめ）
export function orgSec(ctx, w, n) {
  const ups = n.parents.filter(p => kindOf(w.notes[p]) === 'group'), downs = childrenOf(w, n.id).filter(k => kindOf(k) === 'group').sort(byTitle);
  const pick = (title, onPick, ex) => () => pickNote(ctx, { title, kinds: ['group'], newKind: 'group', exclude: [n.id, ...ex], onPick });
  return h('div', { class: 'fields' },
    row('上部組織', ...ups.map(p => chip(ctx, p, null, () => ctx.commit(w => { w.notes[n.id].parents = w.notes[n.id].parents.filter(x => x !== p); }, '上部組織から外す'))),
      add('＋', pick('上部組織', id => ctx.commit(w => { w.notes[n.id].parents.push(id); }, '上部組織を足す'), ups))),
    row('下部組織', ...downs.map(k => chip(ctx, k.id, null, () => ctx.commit(w => { w.notes[k.id].parents = w.notes[k.id].parents.filter(x => x !== n.id); }, '下部組織から外す'))),
      add('＋', pick('下部組織', id => ctx.commit(w => { if (!w.notes[id].parents.includes(n.id)) w.notes[id].parents.push(n.id); }, '下部組織を足す'), downs.map(k => k.id)))));
}
// ===== ロケーション =====
export const pathText = (w, id) => placePath(w, id).map(x => w.notes[x].title || '名前なし').join(' › ');
export const AT_LABEL = { person: 'いる所', item: 'ある所', group: '拠点', scenario: '舞台', note: '起きた所' };
// 場所の欄（人物・アイテム・集団・シナリオ・出来事）
export function atSec(ctx, w, n) {
  const set = id => ctx.commit(w => { w.notes[n.id].at = id; }, '場所を変える');
  const pick = () => pickNote(ctx, { title: AT_LABEL[kindOf(n)] || '場所', kinds: ['place'], newKind: 'place', exclude: [n.id], onPick: set });
  return h('div', { class: 'row' },
    n.at && w.notes[n.at] ? h('span', { class: 'chip p-0' }, h('a', { href: '#', onclick: e => { e.preventDefault(); ctx.openElement(n.at); } }, pathText(w, n.at)),
      h('button', { type: 'button', class: 'x', 'aria-label': '場所を外す', onclick: () => ctx.commit(w => { delete w.notes[n.id].at; }, '場所を外す') }, '×')) : h('span', { class: 'note-text' }, 'まだ決めていません'),
    add(n.at ? '変える' : '＋ 決める', pick));
}
// 上のロケーション・中のロケーション
export function nestSec(ctx, w, n) {
  const ups = n.parents.filter(p => kindOf(w.notes[p]) === 'place'), kids = placeKids(w, n.id).sort(byTitle);
  return h('div', { class: 'fields' },
    row('上', ...ups.map(p => chip(ctx, p, null, () => ctx.commit(w => { w.notes[n.id].parents = w.notes[n.id].parents.filter(x => x !== p); }, '上のロケーションから外す'))),
      add('＋', () => pickNote(ctx, { title: '上のロケーション', kinds: ['place'], newKind: 'place', exclude: [n.id, ...ups], onPick: id => ctx.commit(w => { w.notes[n.id].parents.unshift(id); }, '上のロケーションを足す') }))),
    row('中', ...kids.map(k => chip(ctx, k.id, k.fields?.['種類'] || null)),
      add('＋', () => newPlaceDialog(ctx, n.id))));
}
// 中にロケーションを作る（名前を入れて Enter）
export function newPlaceDialog(ctx, parent) {
  const input = h('input', { autocomplete: 'off', placeholder: '例：東京都・新宿駅・305号室' });
  ctx.openDialog({
    title: parent ? `「${ctx.world.notes[parent]?.title || '名前なし'}」の中に作る` : 'ロケーションを作る', ok: '作る',
    body: h('label', {}, '名前', input),
    onSave: () => {
      const t = input.value.trim();
      if (!t) throw '名前を入れてください';
      const p = newNote({ kind: 'place', title: t, parents: parent ? [parent] : [] });
      ctx.commit(w => { w.notes[p.id] = p; }, 'ロケーションを追加');
    },
  });
}
// ここにあるもの：このロケーションと中のロケーションを場所にしているカード（種類ごと、どこにあるかつき）
export function hereSec(ctx, w, n) {
  const here = Object.values(w.notes).filter(o => o.id !== n.id && isWithin(w, o.at, n.id)).sort(byTitle);
  if (!here.length) return h('p', { class: 'note-text' }, 'まだ何もありません（人物などの「場所」の欄で、ここを選ぶと出ます）');
  return h('div', { class: 'fields' }, ...['person', 'group', 'item', 'scenario', 'note'].map(k => {
    const xs = here.filter(o => kindOf(o) === k);
    return xs.length ? row(k === 'note' ? '出来事など' : KINDS[k].label, ...xs.map(o => chip(ctx, o.id, o.at !== n.id ? `（${w.notes[o.at].title}）` : null))) : null;
  }));
}

// 一覧のカードに出す短い説明
export function summaryOf(w, n) {
  const f = k => n.fields?.[k];
  switch (kindOf(n)) {
    case 'person': return [f('職業'), f('年齢'), ...linksOfKind(w, 'member', 'a', n.id).filter(l => !l.to && !l.done).map(l => w.notes[l.b].title + (l.label ? `（${l.label}）` : ''))].filter(Boolean).join('・');
    case 'scenario': return [f('状態'), f('概要')].filter(Boolean).join('・');
    case 'item': { const c = currentHolder(w, n.id); return [f('区分'), c ? `持ち主：${w.notes[c].title}` : '', f('効果')].filter(Boolean).join('・'); }
    case 'group': { const m = linksOfKind(w, 'member', 'b', n.id).filter(l => !l.to && !l.done).length; return [f('種類'), m ? `${m}人` : '', f('目的')].filter(Boolean).join('・'); }
    default: return '';
  }
}
export { esc };
