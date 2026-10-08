// 地図：自分で用意した画像（街・国・星系図など）か、画像なしの方眼の紙に、カードをピンで留める。ピンどうしは線（道・航路など）で結べる。
// ロケーションの地図（owner）：中のロケーションをピンにし、地図を持つロケーションのピンを押すと、その中の地図へ入る
import { h, esc, uid, byTitle } from '../util.js';
import { dropLines, kindOf, mapOf, placeKids, placePath, hereCounts } from '../model.js';
import { panZoom } from './panzoom.js';
import { pickNote } from './picker.js';

let mapId = null;
const BLANK = { w: 2000, h: 1400 }; // 画像なしの地図の大きさ（地図の中の単位）
const STYLE = { solid: '実線', dashed: '破線', dotted: '点線' }, DASH = { solid: '', dashed: '10 6', dotted: '2 6' };

// arg.owner：そのロケーションの地図だけを出す（ロケーションを開いた画面の中。地図がなければ作るボタン）
export function mount(el, ctx, arg) {
  const owner = arg?.owner || null;
  let mid = owner ? null : arg?.map || mapId;
  const bar = h('div', { class: 'bar' }), stage = h('div', { class: 'map-stage', 'aria-label': '地図' }), layer = h('div', { class: 'map-layer' });
  stage.append(layer);
  el.append(bar, stage);
  let placing = null, linking = null, first = true, imgUrl = null, imgFor = null;
  const map = () => ctx.world.maps[mid];
  const pinOf = id => map()?.pins.find(p => p.id === id);
  // 地図は横幅1000の大きさに合わせて置く
  const scale = () => 1000 / (map()?.w || 1000);
  const pz = panZoom(stage, layer, {
    onClick: (el, e) => {
      const m = map(), kind = el.dataset.click;
      if (kind === 'sheet' && placing) {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * m.w, y = (e.clientY - r.top) / r.height * m.h, note = placing;
        placing = null;
        ctx.commit(w => { w.maps[mid].pins.push({ id: uid('p'), note, x: Math.round(x), y: Math.round(y) }); }, 'ピンを留める');
        return;
      }
      if (kind === 'pin') {
        const pid = el.dataset.pin;
        if (linking === '*') { linking = pid; render(); return; } // 「＋ 線」：はじめのピン
        if (linking) { const a = linking; linking = null; if (a !== pid) addLine(a, pid); else render(); return; }
        enter(pinOf(pid).note);
        return;
      }
      if (kind === 'line') editLine(el.dataset.line);
    },
    onDragItem: (el, dx, dy, done) => {
      const p = pinOf(el.dataset.pin), s = scale();
      if (!done) { el.style.left = (p.x + dx / s) * s + 'px'; el.style.top = (p.y + dy / s) * s + 'px'; drawLines({ [p.id]: { x: p.x + dx / s, y: p.y + dy / s } }); return; }
      ctx.commit(w => { const q = w.maps[mid].pins.find(x => x.id === p.id); q.x = Math.round(p.x + dx / s); q.y = Math.round(p.y + dy / s); }, 'ピンを動かす');
    },
  });
  stage.addEventListener('contextmenu', e => {
    const pin = e.target.closest('[data-pin]');
    if (!pin) return;
    e.preventDefault();
    const p = pinOf(pin.dataset.pin);
    ctx.showMenu(esc(ctx.world.notes[p.note]?.title || ''), [
      ['開く', () => ctx.openNote(p.note)],
      ['ここから線を引く', () => { linking = p.id; placing = null; render(); }],
      ['ピンを外す', () => ctx.commit(w => { const m = w.maps[mid]; m.pins = m.pins.filter(x => x.id !== p.id); dropLines(m); }, 'ピンを外す'), { danger: true }],
    ], e.clientX, e.clientY);
  });

  // 地図を持つロケーションのピン：その中の地図へ（ロケーションを開いた画面なら、そのロケーションを開く）。ほかは詳しい画面
  function enter(id) {
    const w = ctx.world, inner = kindOf(w.notes[id]) === 'place' && mapOf(w, id);
    if (!inner) { ctx.openNote(id); return; }
    if (owner) { ctx.openElement(id, { mode: 'map' }); return; }
    mid = inner.id; first = true; placing = linking = null; render();
  }
  function addLine(a, b) {
    const l = { id: uid('ml'), a, b, label: '', color: null, style: 'solid' };
    ctx.commit(w => { (w.maps[mid].lines ||= []).push(l); }, '線を引く');
    editLine(l.id);
  }
  function editLine(id) {
    const l = map().lines.find(x => x.id === id);
    if (!l) return;
    const name = pid => ctx.world.notes[pinOf(pid)?.note]?.title || '';
    ctx.openDialog({
      title: '線',
      body: `<p class="note-text">${esc(name(l.a))} — ${esc(name(l.b))}</p>
        <label>ラベル（道の名前・距離など）<input id="ml_label" value="${esc(l.label)}" autocomplete="off"></label>
        <div class="row"><label>線<select id="ml_style">${Object.entries(STYLE).map(([k, v]) => `<option value="${k}"${l.style === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>色<select id="ml_color"><option value="">ふつう</option>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<option value="${i}"${l.color === i ? ' selected' : ''}>色${i + 1}</option>`).join('')}</select></label></div>`,
      onSave: () => {
        const v = s => document.getElementById(s).value;
        ctx.commit(w => { Object.assign(w.maps[mid].lines.find(x => x.id === id), { label: v('ml_label').trim(), style: v('ml_style'), color: v('ml_color') === '' ? null : +v('ml_color') }); }, '線を直す');
      },
      onDelete: () => ctx.commit(w => { const m = w.maps[mid]; m.lines = m.lines.filter(x => x.id !== id); }, '線を消す'),
    });
  }

  async function newMap(forPlace = null, blank0 = false) {
    const file = h('input', { type: 'file', accept: 'image/*', id: 'mp_file' }), fileRow = h('label', { hidden: blank0 }, '画像（街・国・世界・星系図など）', file);
    const kind = (v, label, checked) => h('label', { class: 'cb' }, h('input', { type: 'radio', name: 'mp_kind', value: v, checked, onchange: () => { fileRow.hidden = v !== 'image'; } }), label);
    const place = forPlace && ctx.world.notes[forPlace];
    ctx.openDialog({
      title: place ? `「${place.title || '名前なし'}」の地図` : '新しい地図', ok: '作る',
      body: h('div', { class: 'fields' }, h('label', {}, '地図の名前', h('input', { id: 'mp_name', value: place?.title || '地図', autocomplete: 'off' })),
        h('div', { class: 'row' }, kind('image', '画像を読み込む', !blank0), kind('blank', '画像なし（方眼の紙）', blank0)),
        fileRow,
        h('p', { class: 'note-text' }, '画像は保存先（このブラウザ、またはGoogleドライブの世界のフォルダ）に置かれます。画像なしの地図は、ピンとピンを結ぶ線だけで描きます（星系図・路線図など）。')),
      onSave: async () => {
        const name = document.getElementById('mp_name').value.trim() || '地図', blank = document.querySelector('input[name="mp_kind"]:checked').value === 'blank';
        let m;
        if (blank) m = { id: uid('m'), name, image: null, ...BLANK, pins: [], lines: [] };
        else {
          const f = file.files[0];
          if (!f) throw '画像を選んでください（画像なしなら「画像なし」を選んでください）';
          const id = uid('i'), size = await imageSize(f);
          await ctx.persist.putImage(id, f);
          ctx.commit(w => { w.images[id] = { id, name: f.name, mime: f.type }; }, '画像を追加');
          m = { id: uid('m'), name, image: id, w: size.w, h: size.h, pins: [], lines: [] };
        }
        if (forPlace) m.owner = forPlace;
        ctx.commit(w => { w.maps[m.id] = m; }, '地図を追加');
        mid = m.id; first = true; render();
      },
    });
  }
  function drawLines(moved = {}) {
    const m = map(), svg = layer.querySelector('svg.map-lines');
    if (!m || !svg) return;
    const s = scale(), at = id => moved[id] || pinOf(id);
    svg.innerHTML = (m.lines || []).map(l => {
      const a = at(l.a), b = at(l.b);
      if (!a || !b) return '';
      const [x1, y1, x2, y2] = [a.x * s, a.y * s, b.x * s, b.y * s], col = l.color != null ? `var(--c-c${l.color})` : 'var(--fg)';
      return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.5" ${DASH[l.style] ? `stroke-dasharray="${DASH[l.style]}"` : ''}/>` +
        `<line class="map-line-hit" data-click="line" data-line="${l.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
        (l.label ? `<text class="map-line-l" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">${esc(l.label)}</text>` : '') + '</g>';
    }).join('');
  }
  async function render() {
    const w = ctx.world, maps = Object.values(w.maps);
    if (owner) mid = mapOf(w, owner)?.id || null;
    else { if (!w.maps[mid]) mid = maps.find(x => !x.owner)?.id || maps[0]?.id || null; mapId = mid; }
    const m = map(), own = m?.owner && w.notes[m.owner] ? m.owner : null;
    if (linking && linking !== '*' && !pinOf(linking)) linking = null;
    // 中のロケーションで、まだこの地図に置いていないもの
    const unplaced = own ? placeKids(w, own).filter(k => !m.pins.some(p => p.note === k.id)).sort(byTitle) : [];
    const opt = x => h('option', { value: x.id, selected: x.id === mid }, x.owner ? `${w.notes[x.owner]?.title || '名前なし'}（ロケーション）` : x.name);
    bar.replaceChildren(...[
      owner ? null : h('h2', {}, '地図'),
      !owner && maps.length ? h('select', { 'aria-label': '地図を選ぶ', onchange: e => { mid = e.target.value; first = true; placing = linking = null; render(); } },
        ...maps.filter(x => !x.owner).map(opt), maps.some(x => x.owner) ? h('optgroup', { label: 'ロケーションの地図' }, ...maps.filter(x => x.owner).map(opt)) : null) : null,
      // 道しるべ：上のロケーション（地図があれば押すとその地図へ）
      !owner && own ? h('nav', { class: 'crumbs', 'aria-label': '上のロケーション' }, ...placePath(w, own).flatMap((p, i) => {
        const pm = mapOf(w, p), t = w.notes[p].title || '名前なし';
        return [i ? h('span', { 'aria-hidden': 'true' }, '›') : null, pm && pm.id !== mid ? h('button', { type: 'button', class: 'linkish', onclick: () => { mid = pm.id; first = true; render(); } }, t) : h('span', {}, t)];
      }).filter(Boolean)) : null,
      unplaced.length && !placing ? h('div', { class: 'row unplaced', role: 'group', 'aria-label': '地図に置く' }, h('span', { class: 'note-text' }, '地図に置く：'),
        ...unplaced.map(k => h('button', { type: 'button', class: 'chip', onclick: () => { placing = k.id; linking = null; render(); } }, k.title || '名前なし'))) : null,
      h('span', { class: 'sp' }),
      placing ? h('span', { class: 'pick-hint' }, `「${w.notes[placing]?.title}」を留める場所をクリック`, h('button', { type: 'button', class: 'btn small', onclick: () => { placing = null; render(); } }, 'やめる')) : null,
      linking ? h('span', { class: 'pick-hint' }, linking === '*' ? '線を引く：はじめのピンをクリック' : `「${w.notes[pinOf(linking).note]?.title}」から線を引く相手のピンをクリック`, h('button', { type: 'button', class: 'btn small', onclick: () => { linking = null; render(); } }, 'やめる')) : null,
      m ? h('button', { type: 'button', class: 'btn', onclick: () => pickNote(ctx, { title: 'ピンで留めるカード', onPick: id => { placing = id; linking = null; render(); } }) }, '＋ ピン') : null,
      m && m.pins.length > 1 ? h('button', { type: 'button', class: 'btn', title: 'ピンを2つ順に押すと、そのあいだに線を引きます', onclick: () => { placing = null; linking = '*'; render(); } }, '＋ 線') : null,
      owner ? null : h('button', { type: 'button', class: 'btn', onclick: () => newMap() }, '＋ 地図'),
      m ? h('button', { type: 'button', class: 'btn icon', 'aria-label': '地図のメニュー', onclick: e => ctx.menuAt(e.currentTarget, null, [
        ['名前を変える', () => ctx.openDialog({ title: '地図の名前', body: `<label>名前<input id="mp_rn" value="${esc(m.name)}"></label>`, onSave: () => ctx.commit(w => { w.maps[mid].name = document.getElementById('mp_rn').value.trim() || '地図'; }, '地図の名前を変更') })],
        ['この地図を削除', () => ctx.openDialog({ title: '地図を削除', ok: null, body: `<p>「${esc(m.name)}」とピン・線を削除します。カードは消えません。</p>`, onDelete: () => ctx.commit(w => { delete w.maps[mid]; }, '地図を削除') }), { danger: true }],
      ]) }, '…') : null,
    ].filter(Boolean));
    stage.classList.toggle('placing', !!placing || !!linking);
    if (!m && owner) {
      layer.replaceChildren(h('div', { class: 'fam-empty' }, h('p', {}, `「${w.notes[owner]?.title || '名前なし'}」の地図はまだありません。作ると、中のロケーションをピンで置けます。`),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => newMap(owner, false) }, '画像を読み込んで作る'), h('button', { type: 'button', class: 'btn', onclick: () => newMap(owner, true) }, '画像なし（方眼の紙）で作る'))));
      pz.fit(-24, -24, 444, 144); return;
    }
    if (!m) { layer.replaceChildren(h('div', { class: 'fam-empty' }, '地図がまだありません。「＋ 地図」で、画像を読み込むか、画像なしの方眼の紙で作れます。カードをピンで留め、ピンどうしを線で結べます。ロケーションの地図は、ロケーションを開いて作れます。')); pz.fit(-24, -24, 424, 124); return; }
    if (m.image && imgFor !== m.image) { imgUrl = await ctx.imageUrl(m.image); imgFor = m.image; }
    const s = scale(), W = m.w * s, H = m.h * s, count = hereCounts(w);
    const sheet = m.image ? h('img', { src: imgUrl || '', alt: m.name, 'data-click': 'sheet', draggable: false, style: { width: W + 'px', height: H + 'px' } })
      : h('div', { class: 'map-sheet', 'data-click': 'sheet', style: { width: W + 'px', height: H + 'px' } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('map-lines'); svg.setAttribute('width', W); svg.setAttribute('height', H);
    layer.replaceChildren(sheet, svg,
      ...m.pins.map(p => {
        const n = w.notes[p.note];
        if (!n) return null;
        // ロケーションのピン：中の地図があれば印、そこ（中も含む）にいる・ある・起きたものの数
        const isPl = kindOf(n) === 'place', inner = isPl && mapOf(w, n.id), c = isPl ? count[n.id] : 0;
        return h('div', { class: `map-pin p-${n.color ?? 0}${isPl ? ' place' : ''}${arg?.focus === p.note ? ' focus' : ''}${linking === p.id ? ' linking' : ''}`, 'data-pin': p.id, 'data-click': 'pin', 'data-drag': '1', style: { left: p.x * s + 'px', top: p.y * s + 'px' }, title: inner ? `${n.title}（押すと中の地図へ）` : n.title },
          h('span', {}, n.title || '名前なし'), inner ? h('span', { class: 'pin-in', 'aria-hidden': 'true' }, ' ⤵') : null, c ? h('span', { class: 'pin-n', title: 'ここ（中も含む）にいる・ある・起きたもの' }, String(c)) : null);
      }).filter(Boolean));
    drawLines();
    if (m.image && !imgUrl) layer.append(h('div', { class: 'fam-empty' }, '画像が見つかりません（別の端末で読み込んだ画像は、Googleドライブにつないでいると表示されます）'));
    if (first) { pz.fit(0, 0, W, H, 2); first = false; }
  }
  render();
  return { update: e => { if (e?.type !== 'search') render(); } };
}
function imageSize(file) {
  return new Promise(ok => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { ok({ w: img.naturalWidth || 1000, h: img.naturalHeight || 700 }); URL.revokeObjectURL(u); }; img.onerror = () => ok({ w: 1000, h: 700 }); img.src = u; });
}
