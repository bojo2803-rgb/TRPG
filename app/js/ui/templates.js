// テンプレート：タグごとに決まった入力欄を持たせる。画面上で作り、直せる
import { h, uid } from '../util.js';
import { allTags } from '../model.js';

const TYPES = [['text', '1行の文字'], ['long', '複数行の文字'], ['number', '数'], ['date', '日付（文字）'], ['select', '選ぶ（選択肢）'], ['section', '見出し（区切り）']];
let selected = null;

export function mount(el, ctx) {
  const side = h('div', { class: 'tpl-side' }), main = h('div', { class: 'tpl-main scroll' });
  el.append(h('div', { class: 'bar' }, h('h2', {}, 'テンプレート'), h('span', { class: 'note-text' }, 'タグを付けた付箋に、決まった入力欄が出ます'), h('span', { class: 'sp' }),
    h('button', { type: 'button', class: 'btn', onclick: () => { const t = { id: uid('tpl'), name: '新しいテンプレート', tags: [], fields: [] }; ctx.commit(w => { w.templates[t.id] = t; }, 'テンプレートを追加'); selected = t.id; render(); } }, '＋ テンプレート')),
    h('div', { class: 'tpl-wrap' }, side, main));
  const render = () => {
    const w = ctx.world, list = Object.values(w.templates);
    if (!w.templates[selected]) selected = list[0]?.id || null;
    side.replaceChildren(...list.map(t => h('button', { type: 'button', class: 'tpl-item', 'aria-current': String(t.id === selected), onclick: () => { selected = t.id; render(); } },
      h('b', {}, t.name), h('span', { class: 'note-text' }, t.tags.length ? t.tags.map(x => '#' + x).join(' ') : 'タグなし（どの付箋にも出ない）'))));
    const t = w.templates[selected];
    if (!t) { main.replaceChildren(h('p', { class: 'note-text' }, 'テンプレートがありません')); return; }
    const set = (fn, label) => ctx.commit(w => fn(w.templates[t.id]), label);
    const tagIn = h('input', { value: t.tags.join('、'), list: 'tpl-tags', 'aria-label': 'タグ', placeholder: '例：探索者、NPC' });
    tagIn.addEventListener('change', () => set(x => { x.tags = tagIn.value.split(/[、,，\s]+/).map(s => s.trim().replace(/^#/, '')).filter(Boolean); }, 'テンプレートのタグを変更'));
    const nameIn = h('input', { value: t.name, 'aria-label': 'テンプレートの名前' });
    nameIn.addEventListener('change', () => set(x => { x.name = nameIn.value.trim() || '名前なし'; }, 'テンプレートの名前を変更'));
    const used = Object.values(w.notes).filter(n => t.tags.some(tag => n.tags.includes(tag))).length;
    const rows = t.fields.map((f, i) => {
      const label = h('input', { value: f.label, 'aria-label': '項目名' });
      label.addEventListener('change', () => set(x => { x.fields[i].label = label.value.trim() || '項目'; }, '項目名を変更'));
      const type = h('select', { 'aria-label': '種類', onchange: e => set(x => { x.fields[i].type = e.target.value; }, '項目の種類を変更') }, ...TYPES.map(([k, v]) => h('option', { value: k, selected: k === f.type }, v)));
      const opts = f.type === 'select' ? h('input', { value: (f.options || []).join('、'), placeholder: '選択肢を「、」で区切る', 'aria-label': '選択肢', onchange: e => set(x => { x.fields[i].options = e.target.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean); }, '選択肢を変更') }) : null;
      const mv = d => () => set(x => { const j = i + d; if (j < 0 || j >= x.fields.length) return; [x.fields[i], x.fields[j]] = [x.fields[j], x.fields[i]]; }, '項目を移動');
      return h('div', { class: `tpl-row${f.type === 'section' ? ' sec' : ''}` }, label, type, opts,
        h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'btn small', 'aria-label': '上へ', onclick: mv(-1), disabled: i === 0 }, '↑'),
        h('button', { type: 'button', class: 'btn small', 'aria-label': '下へ', onclick: mv(1), disabled: i === t.fields.length - 1 }, '↓'),
        h('button', { type: 'button', class: 'btn small danger', 'aria-label': '項目を消す', onclick: () => set(x => { x.fields.splice(i, 1); }, '項目を削除') }, '×'));
    });
    let armed = false;
    main.replaceChildren(h('div', { class: 'fields' },
      h('label', {}, '名前', nameIn),
      h('label', {}, 'このタグの付箋に入力欄を出す（「、」で区切る）', tagIn, h('datalist', { id: 'tpl-tags' }, ...allTags(w).map(x => h('option', { value: x })))),
      h('p', { class: 'note-text' }, `いま当てはまる付箋：${used}枚。項目を消しても、付箋に入れた値は消えません（項目を戻すとまた出ます）。`),
      h('h3', {}, '項目'),
      h('div', { class: 'tpl-rows' }, ...rows),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: () => set(x => { x.fields.push({ key: uid('f'), label: '新しい項目', type: 'text' }); }, '項目を追加') }, '＋ 項目'),
        h('button', { type: 'button', class: 'btn', onclick: () => set(x => { x.fields.push({ key: uid('s'), label: '見出し', type: 'section' }); }, '見出しを追加') }, '＋ 見出し'),
        h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'btn', onclick: () => { const c = JSON.parse(JSON.stringify(t)); c.id = uid('tpl'); c.name += '（コピー）'; ctx.commit(w => { w.templates[c.id] = c; }, 'テンプレートを複製'); selected = c.id; render(); } }, '複製'),
        h('button', { type: 'button', class: 'btn danger', onclick: e => { if (!armed) { armed = true; e.target.textContent = 'もう一度押すと削除'; return; } ctx.commit(w => { delete w.templates[t.id]; }, 'テンプレートを削除'); } }, '削除'))));
  };
  render();
  return { update: render };
}
