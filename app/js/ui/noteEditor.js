// カードの情報の画面。2か所で使う：
// - ページ（layout: 'page'）：人物などを開いたときの真ん中。広い画面は2段組（左：絵・名前・欄・メモ、右：ほかとのつながり）
// - 小窓（layout: 'peek'）：右に重ねて開く。1段組
// 何行も書く欄は、書いてあるものだけを出す（空のものは「＋ 外見」のボタンにたたむ）
import { h, esc, uid, debounce, byTitle } from '../util.js';
import { templatesFor, allTags, childrenOf, newLink, findByTitle, KINDS, kindOf, isElement } from '../model.js';
import { membersSec, holdersSec, holdingsSec, scenariosSec, contentsSec, sessionsSec, orgSec, boardLabel, atSec, nestSec, hereSec, AT_LABEL, bornSec, periodSec } from './elements.js';
import { renderMarkdown } from './markdown.js';
import { pickNote } from './picker.js';
import { openDialog, showMenu, toast } from './dialog.js';
import { picOf, hintOf } from '../listing.js';
import { linkSuggest } from './linkSuggest.js';

const COLORS = ['白', '黄', '桃', '緑', '青', '紫', '橙', '灰'];
const MORE = { when: '時系列', family: '家族', links: 'つながり', group: 'まとめ' };

export function createEditor(ctx, root, { layout = 'peek' } = {}) {
  let curId = null, self = false, bodyMode = 'view', armedDelete = false, iterK = 0, showMore = false, shownJson = '';
  const revealed = new Set(); // 開いた「＋ 外見」などの欄
  const page = layout === 'page';

  function open(id, opts = {}) {
    if (!ctx.world.notes[id]) return;
    if (curId !== id) { bodyMode = ctx.world.notes[id].body || isElement(ctx.world.notes[id]) ? 'view' : 'edit'; armedDelete = false; showMore = false; revealed.clear(); root.scrollTop = 0; }
    curId = id; iterK = opts.k || 0; // ループの何周目から開いたか（その周だけの書き換えができる）
    render();
    if (opts.focusTitle) root.querySelector('.ne-title')?.select();
    if (opts.section) root.querySelector(`[data-sec="${opts.section}"]`)?.scrollIntoView({ block: 'start' });
  }
  function close() { curId = null; root.replaceChildren(); }
  function update(e) {
    if (!curId || !ctx.world.notes[curId]) return;
    if (self) return; // 自分で書き換えたときは、入力中の欄を作り直さない
    // ほかで変更があったとき（もう一方の端末の変更・その場で作ったカードなど）：このカードが変わっていなければ、
    // 入力中の欄は作り直さない（まだ保存していない打ちかけの文字が消えないように）
    const a = document.activeElement;
    if (root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && JSON.stringify(ctx.world.notes[curId]) === shownJson) return;
    render();
  }
  // この画面からの変更：入力欄を作り直さない
  function edit(fn, label) { self = true; try { ctx.commit(w => fn(w, w.notes[curId]), label); shownJson = JSON.stringify(ctx.world.notes[curId]); } finally { self = false; } }

  function render() {
    const w = ctx.world, n = w.notes[curId];
    shownJson = JSON.stringify(n);
    const scrollTop = root.scrollTop;
    const sec = (key, title, ...body) => h('section', { class: 'ne-sec', 'data-sec': key }, h('h3', {}, title), ...body);
    const k = kindOf(n), el = k !== 'note', isSc = id => kindOf(w.notes[id]) === 'scenario', isGr = id => kindOf(w.notes[id]) === 'group';
    const L = Object.values(w.links), mine = (l, kinds) => kinds.includes(l.kind) && (l.a === n.id || l.b === n.id);
    const isPl = id => kindOf(w.notes[id]) === 'place';
    const otherParents = n.parents.filter(p => !isSc(p) && !(k === 'group' && isGr(p)) && !(k === 'place' && isPl(p))), otherKids = k === 'scenario' ? [] : childrenOf(w, n.id).filter(c => !(k === 'group' && kindOf(c) === 'group') && !(k === 'place' && kindOf(c) === 'place'));
    const used = { when: !!(n.when || n.legs), group: otherParents.length > 0 || otherKids.length > 0, family: L.some(l => mine(l, ['parent', 'spouse', 'ancestor'])), links: L.some(l => mine(l, ['link', 'order'])), scen: n.parents.some(isSc) };
    // その種類で使える「もっと」の欄（家族は人物だけ、まとめは付箋だけ）
    const avail = { when: true, links: true, family: k === 'person' || used.family, group: !el || used.group };
    const show = key => avail[key] && (showMore || used[key] || (el && key === 'links') || (k === 'person' && (key === 'family' || key === 'when')));
    const hidden = Object.keys(MORE).filter(key => avail[key] && !show(key));
    const main = [
      head(w, n),
      el ? null : colorsRow(n), el ? null : tagsSec(w, n),
      ...templatesFor(w, n).map(t => templateSec(t, n)),
      k === 'person' ? sec('born', '生年月日', bornSec(ctx, w, n)) : null,
      k === 'scenario' ? sec('period', '時期', periodSec(ctx, w, n)) : null,
      sec('body', el ? 'メモ' : '本文', bodySec(w, n)),
    ];
    const side = [
      k === 'person' || k === 'group' ? sec('member', k === 'person' ? '所属' : 'メンバー', membersSec(ctx, w, n)) : null,
      k === 'group' ? sec('org', '上部組織・下部組織', orgSec(ctx, w, n)) : null,
      k === 'item' ? sec('holders', '持ち主の移り変わり', holdersSec(ctx, w, n)) : null,
      k === 'person' || k === 'group' ? sec('holdings', '持ち物', holdingsSec(ctx, w, n)) : null,
      k === 'place' ? sec('nest', '上と中のロケーション', nestSec(ctx, w, n)) : null,
      k === 'place' ? sec('here', 'ここにあるもの', hereSec(ctx, w, n)) : null,
      k !== 'place' && (el || n.at || n.when || showMore) ? sec('at', AT_LABEL[k], atSec(ctx, w, n)) : null,
      k === 'scenario' ? sec('contents', '中身', contentsSec(ctx, w, n)) : null,
      k === 'scenario' ? sec('sessions', '遊んだ記録', sessionsSec(ctx, w, n, edit)) : null,
      k === 'scenario' ? sec('share', '共有', lazy(() => import('./shareUI.js').then(m => m.shareSec(ctx, ctx.world, ctx.world.notes[n.id])))) : null,
      k !== 'scenario' && k !== 'place' && (el || used.scen || n.when) ? sec('scen', el ? '登場するシナリオ' : 'シナリオ', scenariosSec(ctx, w, n)) : null,
      show('family') ? sec('family', '家族', familySec(w, n)) : null,
      show('when') ? sec('when', '時系列', whenSec(n)) : null,
      show('links') ? sec('links', 'ほかとのつながり', linksSec(w, n)) : null,
      show('group') ? sec('group', 'まとめ', groupSec(w, n)) : null,
      hidden.length ? h('button', { type: 'button', class: 'btn small more', onclick: () => { showMore = true; render(); } }, `もっと（${hidden.map(x => MORE[x]).join('・')}）`) : null,
    ];
    // そのほか：要素は色・タグもここ（あまり使わないので下に）
    const foot = [
      el ? h('section', { class: 'ne-sec', 'data-sec': 'misc' }, h('h3', {}, 'そのほか'), colorsRow(n), tagsSec(w, n)) : null,
      sec('where', el ? 'ボード・地図・リンク' : '貼ってあるところ', whereSec(w, n)),
      h('div', { class: 'ne-foot' },
        h('button', { type: 'button', class: 'btn danger small', onclick: e => {
          if (!armedDelete) { armedDelete = true; e.target.textContent = 'もう一度押すと削除'; return; }
          const t = n.title; ctx.deleteNote(n.id); toast(`「${t || '名前なし'}」を削除しました（元に戻すで戻せます）`);
        } }, `この${KINDS[k].label}を削除`)),
    ];
    const cls = `ne p-${n.color ?? 0}${page ? ' page' : ''}`;
    root.replaceChildren(page && el
      ? h('div', { class: cls }, h('div', { class: 'ne-main' }, ...main), h('div', { class: 'ne-side' }, ...side), h('div', { class: 'ne-end' }, ...foot))
      : h('div', { class: cls }, ...main, ...side, ...foot));
    root.scrollTop = scrollTop;
    fillImages();
  }

  function head(w, n) {
    let before = n.title;
    const title = h('input', { class: 'ne-title', value: n.title, placeholder: '名前', 'aria-label': '名前', autocomplete: 'off' });
    const save = debounce(() => edit((w, n) => { n.title = title.value; }, '名前を変更'), 500);
    title.addEventListener('input', save);
    title.addEventListener('focus', () => { before = ctx.world.notes[curId].title; });
    // 名前を変えたら、ほかのカードの本文の [[前の名前]] も直す
    title.addEventListener('change', () => {
      save.flush();
      const after = title.value;
      if (!before || before === after) return;
      const re = new RegExp(`\\[\\[${before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]*)?\\]\\]`, 'g');
      const hit = Object.values(ctx.world.notes).filter(o => o.id !== curId && re.test(o.body));
      if (hit.length) { ctx.commit(w => { for (const o of hit) w.notes[o.id].body = w.notes[o.id].body.replace(re, (_, lbl) => `[[${after}${lbl || ''}]]`); }, 'リンクの名前を変更'); toast(`ほかのカードのリンク（${hit.length}件）も新しい名前に直しました`); }
      before = after;
    });
    const menu = h('button', { type: 'button', class: 'btn icon', title: 'そのほか', 'aria-label': 'そのほか', onclick: e => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(null, [
        ['グラフで見る', () => ctx.go('graph', { focus: n.id })],
        ...(n.when ? [['時系列マップで見る', () => ctx.go('timemap', { focus: n.id })]] : []),
        ['複製する', () => { const c = JSON.parse(JSON.stringify(ctx.world.notes[n.id])); c.id = uid('n'); c.title += '（コピー）'; delete c.board; ctx.commit(w => { w.notes[c.id] = c; }, `${KINDS[kindOf(c)].label}を複製`); ctx.openNote(c.id); }],
        '-',
        ...Object.keys(KINDS).filter(k => k !== kindOf(n)).map(k => [k === 'note' ? '付箋に戻す' : `${KINDS[k].label}にする`, () => ctx.setKind(n.id, k)]),
      ], r.left - 120, r.bottom + 4);
    } }, '…');
    const el = isElement(n), hint = el ? hintOf(w, n) : '';
    return h('header', { class: `ne-head${page ? ' big' : ''}` },
      h('div', { class: 'row ne-head-row' }, el ? picSlot(n, page ? 'big' : 'small') : null,
        h('div', { class: 'ne-head-t' }, h('div', { class: 'row' }, title, menu),
          el && !page ? h('span', { class: `kind-badge k-${kindOf(n)}` }, KINDS[kindOf(n)].label) : null,
          hint ? h('span', { class: 'note-text ne-hint' }, hint) : null)));
  }
  // 絵：押すと、選ぶ・外す
  function picSlot(n, size) {
    const id = picOf(ctx.world, n), letter = (n.title || '？').trim().slice(0, 1);
    const box = h('button', { type: 'button', class: `pic pic-${size} p-${n.color ?? 0}`, title: '絵を選ぶ', 'aria-label': '絵を選ぶ', onclick: e => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(null, [['画像を選ぶ', () => file.click()], ...(n.pic ? [['絵を外す', () => edit((w, x) => { delete x.pic; }, '絵を外す') || render()]] : [])], r.left, r.bottom + 4);
    } }, id ? h('img', { alt: '', 'data-img': id }) : h('span', {}, letter));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const iid = uid('i');
      try { await ctx.persist.putImage(iid, f); } catch (err) { toast(`画像を保存できませんでした：${err.message}`); return; }
      ctx.commit(w => { w.images[iid] = { id: iid, name: f.name, mime: f.type }; w.notes[n.id].pic = iid; }, '絵を付ける');
    } });
    return h('span', { class: 'pic-wrap' }, box, file);
  }
  function colorsRow(n) {
    return h('div', { class: 'row swatches', role: 'radiogroup', 'aria-label': '色' },
      ...COLORS.map((c, i) => h('button', { type: 'button', class: `sw p-${i}`, role: 'radio', 'aria-checked': String((n.color ?? 0) === i), title: c, 'aria-label': c,
        onclick: () => edit((w, n) => { n.color = i; }, '色を変更') || render() })));
  }
  function tagsSec(w, n) {
    const input = h('input', { list: 'ne-tags', placeholder: '＋ タグ', 'aria-label': 'タグを足す', autocomplete: 'off', size: 8 });
    const add = () => {
      const t = input.value.trim().replace(/^#/, '');
      if (!t || n.tags.includes(t)) { input.value = ''; return; }
      ctx.commit(w => { w.notes[curId].tags.push(t); }, 'タグを追加');
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',' || e.key === '、') { e.preventDefault(); add(); } });
    input.addEventListener('change', add);
    return h('div', { class: 'row ne-tags' },
      ...n.tags.map(t => h('span', { class: 'chip' }, t, h('button', { type: 'button', class: 'x', 'aria-label': `タグ「${t}」を外す`, onclick: () => ctx.commit(w => { w.notes[curId].tags = w.notes[curId].tags.filter(x => x !== t); }, 'タグを外す') }, '×'))),
      input, h('datalist', { id: 'ne-tags' }, ...allTags(w).map(t => h('option', { value: t }))));
  }

  // テンプレートの欄。何行も書く欄は、空なら「＋ 名前」にたたむ
  function templateSec(tpl, n) {
    const box = h('div', { class: 'tpl-grid' }), folded = [];
    for (const f of tpl.fields) {
      if (f.type === 'section') { box.append(h('h4', {}, f.label)); continue; }
      const v = n.fields[f.key] ?? '';
      if (f.type === 'long' && v === '' && !revealed.has(f.key)) {
        folded.push(h('button', { type: 'button', class: 'btn small add-field', onclick: () => { revealed.add(f.key); render(); root.querySelector(`[data-field="${CSS.escape(f.key)}"]`)?.focus(); } }, `＋ ${f.label}`));
        continue;
      }
      let input;
      if (f.type === 'long') input = h('textarea', { rows: 3 }, v);
      else if (f.type === 'select') input = h('select', {}, h('option', { value: '' }, ''), ...(f.options || []).map(o => h('option', { value: o, selected: o === v }, o)));
      else input = h('input', { type: f.type === 'number' ? 'number' : 'text', value: v, inputmode: f.type === 'number' ? 'decimal' : null, placeholder: f.type === 'date' ? '例：1890年4月1日' : '' });
      input.dataset.field = f.key;
      const save = debounce(() => edit((w, n) => { const x = input.value; if (x === '') delete n.fields[f.key]; else n.fields[f.key] = f.type === 'number' && x !== '' && !isNaN(+x) ? +x : x; }, `「${f.label}」を変更`), 500);
      input.addEventListener('input', save);
      input.addEventListener('change', () => save.flush());
      box.append(h('label', { class: f.type === 'long' ? 'wide' : '' }, h('span', {}, f.label), input));
    }
    // h4 の後に何も出ない見出しは消す
    for (const h4 of [...box.querySelectorAll('h4')]) if (!h4.nextElementSibling || h4.nextElementSibling.tagName === 'H4') h4.remove();
    return h('section', { class: 'ne-sec', 'data-sec': 'tpl' }, h('h3', {}, tpl.name), box, folded.length ? h('div', { class: 'row folded' }, ...folded) : null);
  }

  function bodySec(w, n) {
    const resolve = t => findByTitle(ctx.world, t);
    const startEdit = () => { bodyMode = 'edit'; render(); root.querySelector('.ne-body')?.focus(); };
    if (bodyMode === 'view') {
      const div = h('div', { class: 'md', html: n.body ? renderMarkdown(n.body, { resolveLink: resolve }) : '<p class="note-text">（まだ何も書いていません。ダブルクリックか「編集」で書けます）</p>' });
      div.addEventListener('click', e => {
        const a = e.target.closest('a.nlink');
        if (!a) return;
        e.preventDefault();
        if (a.dataset.note) ctx.openRelated(a.dataset.note);
        else ctx.createAs(a.dataset.new, a, { open: true });
      });
      div.addEventListener('dblclick', startEdit);
      return h('div', {}, h('div', { class: 'row' }, h('span', { class: 'sp' }), h('button', { type: 'button', class: 'btn small', onclick: startEdit }, '編集')), div);
    }
    const ta = h('textarea', { class: 'ne-body', rows: 10, 'aria-label': '本文', placeholder: '[[ と打つと、人物・場所・付箋などの名前の候補が出て、リンクできます' }, n.body);
    const save = debounce(() => edit((w, n) => { n.body = ta.value; }, '本文を編集'), 600);
    ta.addEventListener('input', save);
    ta.addEventListener('blur', () => save.flush());
    // 書式のボタン：選んだ文字を囲む・行の頭に付ける
    const wrap = (a, b = a) => () => { const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value; ta.value = v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e); ta.focus(); ta.setSelectionRange(s + a.length, e + a.length); save(); };
    const prefix = p => () => { const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1; ta.value = v.slice(0, ls) + p + v.slice(ls); ta.focus(); ta.setSelectionRange(s + p.length, s + p.length); save(); };
    const link = () => pickNote(ctx, { title: 'リンクするカード', exclude: [curId], onPick: id => { const t = ctx.world.notes[id].title; ta.focus(); const s = ta.selectionStart; ta.setRangeText(`[[${t}]]`, s, ta.selectionEnd, 'end'); save.flush(); } });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const id = uid('i'), s = ta.selectionStart;
      try { await ctx.persist.putImage(id, f); } catch (err) { toast(`画像を保存できませんでした：${err.message}`); return; }
      ta.setRangeText(`![${f.name.replace(/[[\]]/g, '')}](img:${id})`, s, s, 'end');
      save.cancel?.();
      edit((w, n) => { w.images[id] = { id, name: f.name, mime: f.type }; n.body = ta.value; }, '画像を追加');
    } });
    return h('div', { class: 'fields' },
      h('div', { class: 'row md-tools' },
        h('button', { type: 'button', class: 'btn small', title: '見出し', onclick: prefix('## ') }, '見出し'),
        h('button', { type: 'button', class: 'btn small', title: '太字', onclick: wrap('**') }, h('b', {}, '太')),
        h('button', { type: 'button', class: 'btn small', title: '箇条書き', onclick: prefix('- ') }, '・箇条'),
        h('button', { type: 'button', class: 'btn small', title: 'ほかのカードへリンク', onclick: link }, '[[リンク]]'),
        h('button', { type: 'button', class: 'btn small', title: '画像', onclick: () => file.click() }, '画像'), file,
        h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'btn small', onclick: () => { save.flush(); bodyMode = 'view'; render(); } }, '表示')),
      linkSuggest(ctx, ta, { exclude: curId, onChange: () => save.flush() }));
  }
  // 本文の画像と絵：保存先から読み込んで表示する
  async function fillImages() {
    for (const img of root.querySelectorAll('img[data-img]')) {
      const url = await ctx.imageUrl(img.dataset.img).catch(() => null);
      if (url) img.src = url; else img.alt = `（画像が見つかりません：${img.alt}）`;
    }
  }
  // 時系列：時系列マップの画面が用意する（日時の入力は暦の部品を使う）
  function whenSec(n) {
    const box = h('div', {}, h('p', { class: 'note-text' }, '読み込んでいます…'));
    import('../timemap/whenSection.js')
      .then(m => box.replaceChildren(m.whenSection(ctx, n, { edit, rerender: render, k: iterK })))
      .catch(e => box.replaceChildren(h('p', { class: 'err' }, `読み込めませんでした：${e.message}`)));
    return box;
  }
  const noteChip = (id, onRemove, extra) => {
    const o = ctx.world.notes[id];
    if (!o) return null;
    return h('span', { class: `chip p-${o.color ?? 0}` },
      h('a', { href: '#', onclick: e => { e.preventDefault(); ctx.openRelated(id); } }, o.title || '（名前なし）'), extra || null,
      onRemove ? h('button', { type: 'button', class: 'x', 'aria-label': '外す', onclick: onRemove }, '×') : null);
  };

  // まとめ：シナリオ → 章 → 場面 のような入れ子。親も子も何人でもよく、循環してもよい
  function groupSec(w, n) {
    const kids = childrenOf(w, n.id).sort(byTitle);
    return h('div', { class: 'fields' },
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, '入っているまとめ'),
        ...n.parents.map(p => noteChip(p, () => ctx.commit(w => { w.notes[n.id].parents = w.notes[n.id].parents.filter(x => x !== p); }, 'まとめから外す'))),
        h('button', { type: 'button', class: 'btn small', onclick: () => pickNote(ctx, { title: 'どのまとめに入れるか', exclude: [n.id, ...n.parents], onPick: id => ctx.commit(w => { w.notes[n.id].parents.push(id); }, 'まとめに入れる') }) }, '＋')),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, '中身'),
        ...kids.map(k => noteChip(k.id, () => ctx.commit(w => { w.notes[k.id].parents = w.notes[k.id].parents.filter(x => x !== n.id); }, '中身から外す'))),
        h('button', { type: 'button', class: 'btn small', onclick: () => pickNote(ctx, { title: '中身に足すカード', exclude: [n.id, ...kids.map(k => k.id)], onPick: id => ctx.commit(w => { if (!w.notes[id].parents.includes(n.id)) w.notes[id].parents.push(n.id); }, '中身を足す') }) }, '＋')),
      kids.length ? h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: !!n.collapsed, onchange: e => ctx.commit(w => { w.notes[n.id].collapsed = e.target.checked; }, e.target.checked ? 'まとめをたたむ' : 'まとめをひらく') }), '時系列マップでたたむ（中身を1枚にまとめる）') : null);
  }

  // 家族：親子・夫婦（家系図の画面がこのつながりから自動で並べる）
  function familySec(w, n) {
    const L = Object.values(w.links);
    const parents = L.filter(l => l.kind === 'parent' && l.b === n.id), children = L.filter(l => l.kind === 'parent' && l.a === n.id);
    const spouses = L.filter(l => l.kind === 'spouse' && (l.a === n.id || l.b === n.id));
    const ancestors = L.filter(l => l.kind === 'ancestor' && l.b === n.id), descendants = L.filter(l => l.kind === 'ancestor' && l.a === n.id);
    const rm = l => () => ctx.commit(w => { delete w.links[l.id]; }, '家族のつながりを外す');
    // 遠い先祖・子孫：相手を選んでから、何代離れているかを聞く（わからなければ空）
    const addFar = asAncestor => () => pickNote(ctx, { title: asAncestor ? '遠い先祖' : '遠い子孫', kinds: ['person'], newKind: 'person', exclude: [n.id], onPick: id => setTimeout(() => ancestorDialog(ctx, asAncestor ? newLink(id, n.id, { kind: 'ancestor', gen: null }) : newLink(n.id, id, { kind: 'ancestor', gen: null }), true), 0) });
    const farRow = (label, list, other, addFn) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), ...list.map(l => noteChip(other(l), rm(l), h('span', { class: 'note-text' }, l.gen ? ` ${l.gen}代` : ' 遠い'))), h('button', { type: 'button', class: 'btn small', onclick: addFn }, '＋'));
    const add = (kind, asParent) => () => pickNote(ctx, { title: kind === 'spouse' ? '配偶者' : asParent ? '親' : '子', kinds: ['person'], newKind: 'person', exclude: [n.id], onPick: id => {
      const l = kind === 'spouse' ? newLink(n.id, id, { kind }) : asParent ? newLink(id, n.id, { kind }) : newLink(n.id, id, { kind });
      ctx.commit(w => { w.links[l.id] = l; }, '家族のつながりを追加');
    } });
    const row = (label, list, other, addFn) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), ...list.map(l => noteChip(other(l), rm(l))), h('button', { type: 'button', class: 'btn small', onclick: addFn }, '＋'));
    // つないである続き柄だけ行を出す。足すのは「＋ 家族をつなぐ」から続き柄を選ぶ（空の行を5つ並べない）
    const kinds = [['親', add('parent', true)], ['子', add('parent', false)], ['配偶者', add('spouse')], ['遠い先祖', addFar(true)], ['遠い子孫', addFar(false)]];
    const any = parents.length + children.length + spouses.length + ancestors.length + descendants.length;
    return h('div', { class: 'fields' },
      parents.length ? row('親', parents, l => l.a, add('parent', true)) : null,
      children.length ? row('子', children, l => l.b, add('parent', false)) : null,
      spouses.length ? row('配偶者', spouses, l => l.a === n.id ? l.b : l.a, add('spouse')) : null,
      ancestors.length ? farRow('遠い先祖', ancestors, l => l.a, addFar(true)) : null,
      descendants.length ? farRow('遠い子孫', descendants, l => l.b, addFar(false)) : null,
      h('div', { class: 'row' }, any ? null : h('span', { class: 'note-text' }, 'まだつないでいません'),
        h('button', { type: 'button', class: 'btn small', onclick: e => ctx.menuAt(e.currentTarget, 'どの続き柄でつなぐか', kinds.map(([label, fn]) => [label, fn])) }, '＋ 家族をつなぐ')));
  }

  // つながり：ラベル・色・線の種類・矢印を付けられる線（ボードとグラフに出る）
  function linksSec(w, n) {
    const ls = Object.values(w.links).filter(l => (l.kind === 'link' || l.kind === 'order') && (l.a === n.id || l.b === n.id));
    return h('div', { class: 'fields' },
      ...ls.map(l => {
        const other = l.a === n.id ? l.b : l.a, dir = l.kind === 'order' ? (l.a === n.id ? 'この後に →' : '← この前に') : l.arrow === 'end' ? (l.a === n.id ? '→' : '←') : l.arrow === 'both' ? '↔' : '—';
        return h('div', { class: 'row link-row' }, h('span', { class: 'data dir' }, dir), noteChip(other), l.label ? h('span', { class: 'note-text' }, l.label) : null,
          h('span', { class: 'sp' }), h('button', { type: 'button', class: 'btn small', onclick: () => editLink(ctx, l.id) }, '編集'));
      }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', onclick: () => pickNote(ctx, { title: 'つなぐ相手', exclude: [n.id], onPick: id => { const l = newLink(n.id, id); ctx.commit(w => { w.links[l.id] = l; }, 'つなぐ'); editLink(ctx, l.id); } }) }, '＋ つなぐ'),
        h('button', { type: 'button', class: 'btn small', title: '日付のない出来事どうしの前後', onclick: () => pickNote(ctx, { title: 'この後に起きること', exclude: [n.id], onPick: id => { const l = newLink(n.id, id, { kind: 'order', arrow: 'end' }); ctx.commit(w => { w.links[l.id] = l; }, '前後をつなぐ'); } }) }, '＋ この後に起きること')));
  }

  function whereSec(w, n) {
    const boards = Object.values(w.boards).filter(b => b.items[n.id]);
    const maps = Object.values(w.maps).filter(m => m.pins.some(p => p.note === n.id));
    const back = n.title ? Object.values(w.notes).filter(o => o.id !== n.id && o.body.includes(`[[${n.title}`)).sort(byTitle) : [];
    return h('div', { class: 'fields' },
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'ボード'), ...(boards.length ? boards.map(b => h('button', { type: 'button', class: 'chip', onclick: () => b.owner ? ctx.openElement(b.owner, { mode: 'board' }) : ctx.go('board', { board: b.id, focus: n.id }) }, boardLabel(w, b))) : [h('span', { class: 'note-text' }, 'なし')]),
        h('button', { type: 'button', class: 'btn small', onclick: () => pinTo(ctx, n.id) }, '＋ 貼る')),
      maps.length ? h('div', { class: 'row' }, h('span', { class: 'lbl' }, '地図'), ...maps.map(m => h('button', { type: 'button', class: 'chip', onclick: () => m.owner ? ctx.openElement(m.owner, { mode: 'map' }) : ctx.go('places', { sub: 'maps', map: m.id, focus: n.id }) }, m.name))) : null,
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'ここへのリンク'), ...(back.length ? back.map(o => noteChip(o.id)) : [h('span', { class: 'note-text' }, 'なし')])));
  }

  return { open, close, update, current: () => curId };
}

// あとから読み込む欄（使うときだけ読み込む部品）
function lazy(load) {
  const box = h('div', {}, h('p', { class: 'note-text' }, '読み込んでいます…'));
  load().then(el => box.replaceChildren(el), e => box.replaceChildren(h('p', { class: 'err' }, `読み込めませんでした：${e.message}`)));
  return box;
}

// 遠い先祖のつながり：何代前か（空ならわからない）。isNew なら保存したときに足す
function ancestorDialog(ctx, l, isNew = false) {
  const t = id => esc(ctx.world.notes[id]?.title || '名前なし');
  openDialog({
    title: '遠い先祖', ok: '保存',
    body: `<p>${t(l.a)} は ${t(l.b)} の遠い先祖</p><label>何代前か（わからなければ空。2以上）<input id="anc_gen" type="number" min="2" inputmode="numeric" value="${l.gen ?? ''}" style="width:6em"></label>`,
    onSave: () => { const g = +document.getElementById('anc_gen').value || null; if (g !== null && g < 2) throw '2代以上で入れてください（1代なら「親」です）'; ctx.commit(w => { w.links[l.id] = { ...l, gen: g }; }, isNew ? '遠い先祖をつなぐ' : '遠い先祖を直す'); },
    onDelete: isNew ? null : () => ctx.commit(w => { delete w.links[l.id]; }, '遠い先祖を外す'),
  });
}

const STYLE = { solid: '実線', dashed: '破線', dotted: '点線' }, ARROW = { none: 'なし', end: '片方', both: '両方' };
export async function editLink(ctx, id) {
  const l = ctx.world.links[id];
  if (!l) return;
  // 種類の決まったつながりは、それぞれの窓で直す（ふつうのつながりの窓だと種類が変わってしまう）
  if (l.kind === 'ancestor') return ancestorDialog(ctx, l);
  if (l.kind === 'member') return (await import('./elements.js')).memberDialog(ctx, { linkId: id });
  if (l.kind === 'holds') return (await import('./elements.js')).holderDialog(ctx, l.b, id);
  if (l.kind === 'parent' || l.kind === 'spouse') return openDialog({ title: '家族のつながり', ok: null, body: `<p>${esc(ctx.world.notes[l.a]?.title)} ${l.kind === 'spouse' ? 'と' : 'は'} ${esc(ctx.world.notes[l.b]?.title)} ${l.kind === 'spouse' ? 'は夫婦' : 'の親'}</p><p class="note-text">家族の欄で直せます。</p>`, onDelete: () => ctx.commit(w => { delete w.links[id]; }, '家族のつながりを外す') });
  const A = ctx.world.notes[l.a]?.title, B = ctx.world.notes[l.b]?.title;
  openDialog({
    title: 'つながりを編集',
    body: `<p class="note-text">${esc(A)} — ${esc(B)}</p>
      <label>ラベル<input id="lk_label" value="${esc(l.label)}" autocomplete="off"></label>
      <label>種類<select id="lk_kind"><option value="link">つながり</option><option value="order"${l.kind === 'order' ? ' selected' : ''}>前後（${esc(A)} の後に ${esc(B)}）</option></select></label>
      <div class="row"><label>線<select id="lk_style">${Object.entries(STYLE).map(([k, v]) => `<option value="${k}"${l.style === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>矢印<select id="lk_arrow">${Object.entries(ARROW).map(([k, v]) => `<option value="${k}"${l.arrow === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>色<select id="lk_color"><option value="">ふつう</option>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<option value="${i}"${l.color === i ? ' selected' : ''}>色${i + 1}</option>`).join('')}</select></label></div>
      <button type="button" class="btn small" id="lk_swap">向きを入れ替える</button>`,
    onClick: e => { if (e.target.id === 'lk_swap') ctx.commit(w => { const x = w.links[id]; [x.a, x.b] = [x.b, x.a]; }, 'つながりの向きを入れ替え'); },
    onSave: () => {
      const v = s => document.getElementById(s).value;
      ctx.commit(w => { Object.assign(w.links[id], { label: v('lk_label').trim(), kind: v('lk_kind'), style: v('lk_style'), arrow: v('lk_arrow'), color: v('lk_color') === '' ? null : +v('lk_color') }); }, 'つながりを編集');
    },
    onDelete: () => ctx.commit(w => { delete w.links[id]; }, 'つながりを削除'),
  });
}

// 貼る：自由なボードか、要素のボード（要素のボードはなければ作る）を選ぶ
function pinTo(ctx, id) {
  const w = ctx.world, on = new Set(Object.values(w.boards).filter(b => b.items[id]).map(b => b.owner || b.id));
  const free = Object.values(w.boards).filter(b => !b.owner && !on.has(b.id)).map(b => [b.name, () => ctx.commit(w => { w.boards[b.id].items[id] = freeSpot(w.boards[b.id]); }, 'ボードに貼る')]);
  const els = Object.values(w.notes).filter(o => isElement(o) && o.id !== id && !on.has(o.id)).sort(byTitle)
    .map(o => [`${KINDS[kindOf(o)].label}：${o.title || '名前なし'}`, () => pickBoard(ctx, o.id, id)]);
  showMenu('どのボードに貼るか', [...free, ...(free.length && els.length ? ['-'] : []), ...els], innerWidth / 2 - 100, innerHeight / 4);
}
async function pickBoard(ctx, owner, id) {
  const { ensureOwnBoard } = await import('./elements.js');
  const bid = ensureOwnBoard(ctx, owner);
  ctx.commit(w => { w.boards[bid].items[id] = freeSpot(w.boards[bid]); }, 'ボードに貼る');
}
// ボードの空いている所（右下へずらしていく）
export function freeSpot(b) {
  const ps = Object.values(b.items);
  if (!ps.length) return { x: 40, y: 40 };
  const maxY = Math.max(...ps.map(p => p.y));
  const row = ps.filter(p => p.y === maxY);
  const x = Math.max(...row.map(p => p.x)) + 220;
  return x > 1100 ? { x: 40, y: maxY + 140 } : { x, y: maxY };
}
