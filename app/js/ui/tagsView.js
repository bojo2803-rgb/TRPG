// タグの画面：左にタグの一覧（何枚）、右にえらんだタグ（付いているカード・種類で絞る・ボード）。
// 名前を変える（同じ名前があればまとめる）・全部から外す。アドレス：#/tags/<タグ>[/board]?sub=<種類>
// カードのタグを押すとここへ来る（そのカードの種類で絞った一覧から）
import { h } from '../util.js';
import { KINDS, kindOf, newBoard } from '../model.js';
import { hintOf } from '../listing.js';
import { tagList, renameTag, removeTag, tagBoardOf, tagBoardSpots, setTagMemo } from '../tags.js';
import { picEl, fillPics } from './kindView.js';

const ORDER = ['person', 'scenario', 'place', 'group', 'item', 'note'];
let q = ''; // 左の一覧の絞り込み（画面を移っても覚えておく）

// タグのボード：なければ作り、そのタグのカードを種類ごとの行で並べておく
export function ensureTagBoard(ctx, tag) {
  const b = tagBoardOf(ctx.world, tag);
  if (b) return b.id;
  const nb = newBoard({ name: tag, tag, items: tagBoardSpots(ctx.world, tag, {}) });
  ctx.commit(w => { w.boards[nb.id] = nb; }, 'タグのボードを作成');
  return nb.id;
}

export function mount(el, ctx, arg) {
  let sel = arg?.open || null, mode = arg?.mode === 'board' ? 'board' : 'list', kind = arg?.sub || 'all', inner = null, seq = 0, quiet = false;
  const bar = h('div', { class: 'bar' }), wrap = h('div', { class: 'explorer tags' });
  el.append(bar, wrap);
  const left = h('div', { class: 'explorer-tree scroll' }), right = h('div', { class: 'explorer-main tag-main' });
  wrap.append(left, right);
  const route = () => ctx.setRoute(sel ? { open: sel, ...(mode === 'board' && { mode }), ...(kind !== 'all' && { sub: kind }) } : null);
  const pick = t => { sel = t; mode = 'list'; kind = 'all'; route(); render(); };

  function renderBar(all) {
    const filter = h('input', { type: 'search', value: q, placeholder: 'タグを絞る', 'aria-label': 'タグを絞る', oninput: e => { q = e.target.value; renderLeft(); } });
    bar.replaceChildren(h('h2', {}, 'タグ'), h('span', { class: 'note-text' }, `${all.length}個`), filter);
  }
  function renderLeft() {
    const all = tagList(ctx.world), s = q.trim().toLowerCase(), list = all.filter(t => !s || t.tag.toLowerCase().includes(s));
    left.replaceChildren(all.length ? h('div', { class: 'tree tag-list' }, ...list.map(t => h('button', { type: 'button', class: 'tree-row tag-row', 'aria-current': String(t.tag === sel), onclick: () => pick(t.tag), title: [ORDER.filter(k => t.kinds[k]).map(k => `${KINDS[k].label} ${t.kinds[k]}`).join('・'), t.memo].filter(Boolean).join('\n') },
      h('span', { class: 'tree-name' }, `# ${t.tag}`), h('span', { class: 'sp' }), h('span', { class: 'note-text tree-n' }, String(t.count)))),
      list.length ? null : h('p', { class: 'note-text' }, '当てはまるタグがありません'))
      : h('p', { class: 'note-text pad' }, 'まだタグがありません。カードの「そのほか」の「＋ タグ」で付けられます（一覧で複数えらんで「タグを付ける」でも）。'));
  }
  function renderRight() {
    inner?.destroy?.(); inner = null;
    const my = ++seq;
    const w = ctx.world, info = tagList(w).find(t => t.tag === sel);
    wrap.classList.toggle('has-sel', !!info);
    if (!info) { right.replaceChildren(h('p', { class: 'note-text pad' }, sel ? `タグ「${sel}」はもう、どのカードにも付いていません。左から選んでください。` : '左からタグを選ぶと、そのタグの付いたカードと、タグのボードが見られます。')); return; }
    const kinds = ORDER.filter(k => info.kinds[k]);
    if (kind !== 'all' && !info.kinds[kind]) kind = 'all';
    const tpls = Object.values(w.templates).filter(t => t.tags?.includes(sel));
    const head = h('div', { class: 'row explorer-head tag-head' },
      h('button', { type: 'button', class: 'btn small phone-only', onclick: () => { sel = null; route(); render(); } }, '← タグの一覧'),
      h('h3', {}, `# ${sel}`), h('span', { class: 'note-text tag-count' }, `${info.count}枚`),
      h('div', { class: 'seg', role: 'group', 'aria-label': '見せ方' }, ...[['list', '一覧'], ['board', 'ボード']].map(([k, v]) => h('button', { type: 'button', 'aria-pressed': String(mode === k), onclick: () => { if (mode === k) return; mode = k; route(); renderRight(); } }, v))),
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn small', onclick: renameDialog }, '名前を変える・まとめる'),
      h('button', { type: 'button', class: 'btn small danger', onclick: removeDialog }, '全部から外す'));
    // 説明（このタグの意味・決まり）と、ほかの見方へ（このタグを目立たせて開く）
    const memo = h('textarea', { class: 'tag-memo', rows: info.memo ? Math.min(6, info.memo.split('\n').length + 1) : 1, placeholder: 'このタグの説明（例：持つと正気度が減る品。AI用まとめにも入ります）', 'aria-label': 'タグの説明',
      onchange: e => ctx.commit(w => setTagMemo(w, sel, e.target.value), 'タグの説明を直す') }, info.memo);
    const timed = Object.values(w.notes).some(n => n.when && n.tags.includes(sel));
    const views = h('div', { class: 'row tag-views' }, h('span', { class: 'note-text' }, 'ほかの見方で目立たせる：'),
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('graph', { tag: sel }) }, 'グラフ'),
      timed ? h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('timemap', { tag: sel }) }, '時系列') : null);
    const note = h('div', { class: 'fields tag-info' }, memo, views,
      tpls.length ? h('p', { class: 'note-text' }, `このタグのカードには、テンプレート「${tpls.map(t => t.name).join('」「')}」の欄が出ます。`) : null);
    if (mode === 'board') {
      const body = h('div', { class: 'el-board tag-board' });
      right.replaceChildren(...[head, note, body].filter(Boolean));
      quiet = true; // ボードを作った変更で、描いている途中に描き直さない
      const id = ensureTagBoard(ctx, sel);
      quiet = false;
      import('./board.js').then(m => { if (my === seq) inner = m.mount(body, ctx, { board: id, embedded: true }); });
      return;
    }
    // 一覧：種類で絞る（すべてなら種類ごとに見出し）
    const chips = h('div', { class: 'row tagbar', role: 'group', 'aria-label': '種類で絞る' },
      ...[['all', `すべて ${info.count}`], ...kinds.map(k => [k, `${KINDS[k].label} ${info.kinds[k]}`])].map(([k, v]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(kind === k), onclick: () => { kind = k; route(); renderRight(); } }, v)));
    const cards = Object.values(w.notes).filter(n => n.tags.includes(sel));
    const card = n => h('button', { type: 'button', class: `ncard el p-${n.color ?? 0} k-${kindOf(n)}`, 'data-id': n.id, onclick: () => ctx.openElement(n.id) },
      h('span', { class: 'ncard-row' }, picEl(ctx, n), h('span', { class: 'ncard-t' }, n.title || '（名前なし）')),
      hintOf(w, n) ? h('span', { class: 'ncard-b' }, hintOf(w, n)) : null,
      n.tags.length > 1 ? h('span', { class: 'ncard-tags' }, n.tags.filter(t => t !== sel).map(t => `#${t}`).join(' ')) : null);
    const group = k => { const xs = cards.filter(n => kindOf(n) === k).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja', { numeric: true })); return xs.length ? [kind === 'all' ? h('h4', {}, `${KINDS[k].label}（${xs.length}）`) : null, h('div', { class: 'ngrid' }, ...xs.map(card))] : []; };
    const list = h('div', { class: 'scroll tag-cards' }, ...(kind === 'all' ? ORDER : [kind]).flatMap(group).filter(Boolean));
    right.replaceChildren(...[head, note, chips, list].filter(Boolean));
    fillPics(ctx, list);
  }
  function renameDialog() {
    const others = tagList(ctx.world).map(t => t.tag).filter(t => t !== sel);
    const input = h('input', { value: sel, list: 'tag-others', autocomplete: 'off', 'aria-label': '新しい名前' });
    const hint = h('p', { class: 'note-text' });
    const upd = () => { const v = input.value.trim(); hint.textContent = v && v !== sel && others.includes(v) ? `「${v}」はもうあるので、「${sel}」の付いたカードを「${v}」にまとめます（両方付いていたカードは1つに）。` : '付いているカード・テンプレート・タグのボードも、新しい名前になります。'; };
    input.addEventListener('input', upd); upd();
    ctx.openDialog({
      title: `タグ「${sel}」の名前を変える`, ok: '変える',
      body: h('div', { class: 'fields' }, h('label', {}, '新しい名前（ほかのタグの名前にすると、まとめる）', input), h('datalist', { id: 'tag-others' }, ...others.map(t => h('option', { value: t }))), hint),
      onSave: () => {
        const to = input.value.trim();
        ctx.commit(w => renameTag(w, sel, to), others.includes(to) ? 'タグをまとめる' : 'タグの名前を変える');
        sel = to; route(); render();
      },
    });
  }
  function removeDialog() {
    const info = tagList(ctx.world).find(t => t.tag === sel);
    ctx.openDialog({
      title: `タグ「${sel}」を全部から外す`, ok: '外す',
      body: h('p', {}, `${info?.count || 0}枚のカードから「${sel}」を外します。カードそのものは消えません。テンプレートの「このタグで出す」と、タグのボードもなくなります（元に戻すで戻せます）。`),
      onSave: () => { const t = sel; ctx.commit(w => removeTag(w, t), 'タグを外す'); sel = null; route(); render(); },
    });
  }
  function render() { renderBar(tagList(ctx.world)); renderLeft(); renderRight(); }
  render();
  return {
    update: e => {
      if (e?.type === 'search' || quiet) return;
      renderBar(tagList(ctx.world)); renderLeft();
      const info = tagList(ctx.world).find(t => t.tag === sel);
      if (mode === 'board' && inner && info) { inner.update?.(e); const c = right.querySelector('.tag-count'); if (c) c.textContent = `${info.count}枚`; } else renderRight();
    },
    destroy: () => inner?.destroy?.(),
  };
}
