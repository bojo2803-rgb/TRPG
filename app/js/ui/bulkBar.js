// まとめての操作の帯：選んだカードを、シナリオに入れる・外す、場所を移す、所属に入れる、タグを付ける、消す。
// どれも1回の変更（元に戻すと1回で全部戻る）
import { h, byTitle } from '../util.js';
import { KINDS, kindOf, allTags, placeParent, newNote } from '../model.js';
import { addToScenario, removeFromScenario, setPlace, addMember, addTag, deleteMany } from '../bulk.js';
import { pickNote } from './picker.js';
import { closeDialog } from './dialog.js';

const CAN = {
  scen: ['person', 'item', 'group', 'note'],
  place: ['person', 'item', 'group', 'scenario', 'note'],
  member: ['person'],
};

// ids：選んでいるもの。done()：選ぶのをやめる（終わったあとも呼ぶ）
export function bulkBar(ctx, ids, done) {
  const w = ctx.world, ns = ids.map(id => w.notes[id]).filter(Boolean);
  const kinds = new Set(ns.map(kindOf)), can = key => [...kinds].every(k => CAN[key].includes(k));
  const unit = kinds.size === 1 && kinds.has('person') ? '人' : '件';
  const n = `${ns.length}${unit}`;
  const act = (label, fn, msg) => { let c = 0; ctx.commit(w => { c = fn(w); }, label); ctx.toast(msg(c)); done(); };
  const toScen = () => pickNote(ctx, { title: `${n}を入れるシナリオ`, kinds: ['scenario'], newKind: 'scenario', onPick: sid => act('まとめてシナリオに入れる', w => addToScenario(w, ids, sid), c => `${c}${unit}をシナリオ「${ctx.world.notes[sid].title}」に入れました`) });
  const fromScen = e => {
    const scs = [...new Set(ns.flatMap(x => x.parents))].map(id => w.notes[id]).filter(x => kindOf(x) === 'scenario').sort(byTitle);
    if (!scs.length) { ctx.toast('選んだものは、どのシナリオにも入っていません'); return; }
    ctx.menuAt(e.currentTarget, 'どのシナリオから外すか', scs.map(s => [s.title || '名前なし', () => act('まとめてシナリオから外す', w => removeFromScenario(w, ids, s.id), c => `${c}${unit}をシナリオ「${s.title}」から外しました`)]));
  };
  const toPlace = () => pickPlace(ctx, `${n}をどこへ移すか`, pid => act('まとめて場所を移す', w => setPlace(w, ids, pid), c => `${c}${unit}の場所を${pid ? `「${ctx.world.notes[pid].title}」` : 'なし'}にしました`));
  const toGroup = () => {
    const groups = Object.values(w.notes).filter(x => kindOf(x) === 'group').sort(byTitle);
    const g = h('input', { list: 'bk_groups', autocomplete: 'off', placeholder: '集団の名前（ない名前なら作ります）' }), role = h('input', { autocomplete: 'off', placeholder: '例：信者・下っ端（空でもよい）' });
    ctx.openDialog({
      title: `${n}を集団に入れる`, ok: '入れる',
      body: h('div', { class: 'fields' }, h('label', {}, '集団', g, h('datalist', { id: 'bk_groups' }, ...groups.map(x => h('option', { value: x.title })))), h('label', {}, '役職', role)),
      onSave: () => {
        const t = g.value.trim();
        if (!t) throw '集団の名前を入れてください';
        let gid = groups.find(x => x.title === t)?.id, made = null, c = 0;
        ctx.commit(w => {
          if (!gid) { const x = newNote({ kind: 'group', title: t }); w.notes[x.id] = x; gid = made = x.id; }
          c = addMember(w, ids, gid, role.value.trim());
        }, 'まとめて集団に入れる');
        ctx.toast(`${c}人を「${t}」に入れました${ns.length - c ? `（${ns.length - c}人はもう入っていました）` : ''}`);
        if (made) setTimeout(() => ctx.created([made]), 1500);
        done();
      },
    });
  };
  const tag = () => {
    const t = h('input', { list: 'bk_tags', autocomplete: 'off', placeholder: '例：NPC・要確認' });
    ctx.openDialog({
      title: `${n}にタグを付ける`, ok: '付ける',
      body: h('label', {}, 'タグ', t, h('datalist', { id: 'bk_tags' }, ...allTags(w).map(x => h('option', { value: x })))),
      onSave: () => { const v = t.value.trim().replace(/^#/, ''); if (!v) throw 'タグを入れてください'; act('まとめてタグを付ける', w => addTag(w, ids, v), c => `${c}${unit}にタグ「${v}」を付けました`); },
    });
  };
  const del = () => ctx.openDialog({
    title: `${n}を消す`, ok: '消す',
    body: h('div', { class: 'fields' }, h('p', {}, ns.slice(0, 12).map(x => `「${x.title || '名前なし'}」`).join('') + (ns.length > 12 ? ` ほか${ns.length - 12}${unit}` : '')), h('p', { class: 'note-text' }, '元に戻すで、まとめて戻せます。')),
    onSave: () => act('まとめて消す', w => deleteMany(w, ids), c => `${c}${unit}を消しました（元に戻すで戻せます）`),
  });
  const b = (label, fn) => h('button', { type: 'button', class: 'btn small', onclick: fn }, label);
  return h('div', { class: 'bulk', role: 'toolbar', 'aria-label': 'まとめての操作' },
    h('b', {}, `${n}を選んでいます`),
    can('scen') ? b('シナリオに入れる', toScen) : null,
    can('scen') ? b('シナリオから外す', fromScen) : null,
    can('place') ? b('場所を移す', toPlace) : null,
    can('member') ? b('所属に入れる', toGroup) : null,
    b('タグを付ける', tag),
    h('button', { type: 'button', class: 'btn small danger', onclick: del }, '消す'),
    h('span', { class: 'sp' }),
    b('選ぶのをやめる', done));
}

// 選ぶチェック：Shift を押しながらだと、前に押したものとの間をまとめて
export function selBox(s, id, order, rerender) {
  return h('input', { type: 'checkbox', class: 'csel', checked: s.sel.has(id), 'aria-label': '選ぶ', onclick: e => {
    e.stopPropagation();
    const on = !s.sel.has(id);
    if (e.shiftKey && s.last && order.includes(s.last)) {
      const a = order.indexOf(s.last), b = order.indexOf(id);
      for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? s.sel.add(x) : s.sel.delete(x);
    } else on ? s.sel.add(id) : s.sel.delete(id);
    s.last = id; rerender();
  } });
}
// ロケーションを木の形から選ぶ（「場所なし」も）
export function pickPlace(ctx, title, onPick) {
  const w = ctx.world, opts = [], seen = new Set();
  const add = (p, d) => {
    if (seen.has(p.id)) return; seen.add(p.id);
    opts.push(h('button', { type: 'button', class: 'move-opt', style: { paddingLeft: 10 + d * 18 + 'px' }, onclick: () => { closeDialog(); onPick(p.id); } }, p.title || '（名前なし）'));
    for (const k of Object.values(w.notes).filter(x => kindOf(x) === 'place' && placeParent(w, x.id) === p.id).sort(byTitle)) add(k, d + 1);
  };
  for (const r of Object.values(w.notes).filter(x => kindOf(x) === 'place' && !placeParent(w, x.id)).sort(byTitle)) add(r, 0);
  ctx.openDialog({ title, body: h('div', { class: 'pick-list move-list' }, h('button', { type: 'button', class: 'move-opt', onclick: () => { closeDialog(); onPick(null); } }, '場所なし（どこにも置かない）'), ...opts,
    opts.length ? null : h('p', { class: 'note-text' }, `まだロケーションがありません（${KINDS.place.label}のタブで作れます）`)) });
}
