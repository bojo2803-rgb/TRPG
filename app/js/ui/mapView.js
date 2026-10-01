// 地図：自分で用意した画像（街・国・星系図など）に、付箋をピンで留める
import { h, esc, uid } from '../util.js';
import { panZoom } from './panzoom.js';
import { pickNote } from './picker.js';

let mapId = null;

export function mount(el, ctx, arg) {
  if (arg?.map) mapId = arg.map;
  const bar = h('div', { class: 'bar' }), stage = h('div', { class: 'map-stage', 'aria-label': '地図' }), layer = h('div', { class: 'map-layer' });
  stage.append(layer);
  el.append(bar, stage);
  let placing = null, first = true, imgUrl = null, imgFor = null;
  const pz = panZoom(stage, layer, {
    onClick: (el, e) => {
      if (el.dataset.click === 'img' && placing) {
        const r = layer.querySelector('img').getBoundingClientRect(), m = map(), x = (e.clientX - r.left) / r.width * m.w, y = (e.clientY - r.top) / r.height * m.h;
        const note = placing; placing = null;
        ctx.commit(w => { w.maps[mapId].pins.push({ note, x: Math.round(x), y: Math.round(y) }); }, 'ピンを留める');
        return;
      }
      if (el.dataset.pin != null) ctx.openNote(map().pins[+el.dataset.pin].note);
    },
    onDragItem: (el, dx, dy, done) => {
      const i = +el.dataset.pin, p = map().pins[i], s = scale();
      if (!done) { el.style.left = (p.x + dx / s) * s + 'px'; el.style.top = (p.y + dy / s) * s + 'px'; return; }
      ctx.commit(w => { const q = w.maps[mapId].pins[i]; q.x = Math.round(p.x + dx / s); q.y = Math.round(p.y + dy / s); }, 'ピンを動かす');
    },
  });
  const map = () => ctx.world.maps[mapId];
  // 画像は横幅1000の大きさに合わせて置く
  const scale = () => 1000 / (map()?.w || 1000);
  stage.addEventListener('contextmenu', e => {
    const pin = e.target.closest('[data-pin]');
    if (!pin) return;
    e.preventDefault();
    const i = +pin.dataset.pin;
    ctx.showMenu(esc(ctx.world.notes[map().pins[i].note]?.title || ''), [['開く', () => ctx.openNote(map().pins[i].note)], ['ピンを外す', () => ctx.commit(w => { w.maps[mapId].pins.splice(i, 1); }, 'ピンを外す'), { danger: true }]], e.clientX, e.clientY);
  });

  async function newMap() {
    const file = h('input', { type: 'file', accept: 'image/*', id: 'mp_file' });
    ctx.openDialog({
      title: '新しい地図', ok: '作る',
      body: h('div', { class: 'fields' }, h('label', {}, '地図の名前', h('input', { id: 'mp_name', value: '地図', autocomplete: 'off' })), h('label', {}, '画像（街・国・世界・星系図など）', file),
        h('p', { class: 'note-text' }, '画像は保存先（このブラウザ、またはGoogleドライブの世界のフォルダ）に置かれます。')),
      onSave: async () => {
        const f = file.files[0], name = document.getElementById('mp_name').value.trim() || '地図';
        if (!f) throw '画像を選んでください';
        const id = uid('i'), size = await imageSize(f);
        await ctx.persist.putImage(id, f);
        const m = { id: uid('m'), name, image: id, w: size.w, h: size.h, pins: [] };
        ctx.commit(w => { w.images[id] = { id, name: f.name, mime: f.type }; w.maps[m.id] = m; }, '地図を追加');
        mapId = m.id; first = true; render();
      },
    });
  }
  async function render() {
    const w = ctx.world, maps = Object.values(w.maps);
    if (!w.maps[mapId]) mapId = maps[0]?.id || null;
    const m = map();
    bar.replaceChildren(...[
      h('h2', {}, '地図'),
      maps.length ? h('select', { 'aria-label': '地図を選ぶ', onchange: e => { mapId = e.target.value; first = true; render(); } }, ...maps.map(x => h('option', { value: x.id, selected: x.id === mapId }, x.name))) : null,
      h('span', { class: 'sp' }),
      placing ? h('span', { class: 'pick-hint' }, `「${ctx.world.notes[placing]?.title}」を留める場所をクリック`, h('button', { type: 'button', class: 'btn small', onclick: () => { placing = null; render(); } }, 'やめる')) : null,
      m ? h('button', { type: 'button', class: 'btn', onclick: () => pickNote(ctx, { title: 'ピンで留める付箋', onPick: id => { placing = id; render(); } }) }, '＋ ピンを留める') : null,
      h('button', { type: 'button', class: 'btn', onclick: newMap }, '＋ 地図'),
      m ? h('button', { type: 'button', class: 'btn icon', 'aria-label': '地図のメニュー', onclick: e => ctx.menuAt(e.currentTarget, null, [
        ['名前を変える', () => ctx.openDialog({ title: '地図の名前', body: `<label>名前<input id="mp_rn" value="${esc(m.name)}"></label>`, onSave: () => ctx.commit(w => { w.maps[mapId].name = document.getElementById('mp_rn').value.trim() || '地図'; }, '地図の名前を変更') })],
        ['この地図を削除', () => ctx.openDialog({ title: '地図を削除', ok: null, body: `<p>「${esc(m.name)}」とピンを削除します。付箋は消えません。</p>`, onDelete: () => ctx.commit(w => { delete w.maps[mapId]; }, '地図を削除') }), { danger: true }],
      ]) }, '…') : null,
    ].filter(Boolean));
    stage.classList.toggle('placing', !!placing);
    if (!m) { layer.replaceChildren(h('div', { class: 'fam-empty' }, '地図がまだありません。「＋ 地図」で画像を読み込むと、付箋をピンで留められます。')); pz.fit(0, 0, 400, 100); return; }
    if (imgFor !== m.image) { imgUrl = await ctx.imageUrl(m.image); imgFor = m.image; }
    const s = scale();
    layer.replaceChildren(
      h('img', { src: imgUrl || '', alt: m.name, 'data-click': 'img', draggable: false, style: { width: m.w * s + 'px', height: m.h * s + 'px' } }),
      ...m.pins.map((p, i) => { const n = ctx.world.notes[p.note]; return n ? h('div', { class: `map-pin p-${n.color ?? 0}${arg?.focus === p.note ? ' focus' : ''}`, 'data-pin': i, 'data-click': 'pin', 'data-drag': '1', style: { left: p.x * s + 'px', top: p.y * s + 'px' }, title: n.title }, h('span', {}, n.title || '名前なし')) : null; }).filter(Boolean));
    if (!imgUrl) layer.append(h('div', { class: 'fam-empty' }, '画像が見つかりません（別の端末で読み込んだ画像は、Googleドライブにつないでいると表示されます）'));
    if (first) { pz.fit(0, 0, m.w * s, m.h * s, 2); first = false; }
  }
  render();
  return { update: e => { if (e?.type !== 'search') render(); } };
}
function imageSize(file) {
  return new Promise(ok => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { ok({ w: img.naturalWidth || 1000, h: img.naturalHeight || 700 }); URL.revokeObjectURL(u); }; img.onerror = () => ok({ w: 1000, h: 700 }); img.src = u; });
}
