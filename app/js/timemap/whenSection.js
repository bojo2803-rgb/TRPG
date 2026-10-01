// 付箋の編集画面の「時系列」：この付箋を時系列マップのどの世界線の、いつに置くか
import { h, debounce } from '../util.js';
import { T, utcToWall, wallToUtc } from '../cal/time.js';
import { formatAll, calName } from '../cal/index.js';
import { dateInput } from '../ui/dateInput.js';

const EXTRA = [['wareki', '和暦'], ['kyureki', '旧暦'], ['hijri', 'ヒジュラ暦']];

export function whenSection(ctx, n, { edit, rerender, k: iterK = 0 }) {
  const w = ctx.world;
  if (!n.when) {
    return h('div', { class: 'row' },
      h('span', { class: 'note-text' }, '時系列マップには置いていません'),
      h('button', { type: 'button', class: 'btn small', onclick: () => {
        const tz = w.settings.tz || 'Asia/Tokyo';
        ctx.commit(w => { w.notes[n.id].when = { tr: 'main', t: localMidnightToday(tz), prec: 'day', tz }; }, '時系列マップに置く');
      } }, '＋ 時系列マップに置く'),
      n.legs ? null : h('button', { type: 'button', class: 'btn small', title: '時系列マップ上に、生まれてから体験した道筋を持つ人物にする', onclick: () => ctx.go('timemap', { subjectForm: n.id }) }, '＋ 主体（道筋を持つ人物）にする'));
  }
  const wh = n.when, track = w.tracks.find(t => t.id === wh.tr) || w.tracks[0];
  const shown = h('div', { class: 'when-shown' }, ...formatAll(wh, w).map((s, i) => h('div', { class: i ? 'note-text' : 'data' }, s)));
  const trSel = h('select', { 'aria-label': '世界線' }, ...w.tracks.map(t => h('option', { value: t.id, selected: t.id === wh.tr }, t.name + (t.loop ? `（ループ ${t.loop}周）` : ''))));
  const err = h('p', { class: 'err', hidden: true });
  let di;
  const save = debounce(() => {
    try {
      const v = di.read();
      err.hidden = true;
      edit((w, n) => {
        const keep = { ...n.when };
        n.when = { ...keep, tr: trSel.value, t: v.t, prec: v.prec, tz: v.tz };
        for (const k of ['approx', 'until']) if (v[k]) n.when[k] = v[k]; else delete n.when[k];
        // 入力に使った暦は、自動で追加の暦になる
        if (v.cal && !(n.when.cals || []).includes(v.cal)) n.when.cals = [...(n.when.cals || []), v.cal];
      }, '日時を変更');
      shown.replaceChildren(...formatAll(ctx.world.notes[n.id].when, ctx.world).map((s, i) => h('div', { class: i ? 'note-text' : 'data' }, s)));
    } catch (e) { err.textContent = typeof e === 'string' ? e : e.message; err.hidden = false; }
  }, 500);
  di = dateInput(w, { track, value: { ...wh, cal: wh.cals?.[wh.cals.length - 1] }, onChange: save });
  trSel.addEventListener('change', () => {
    const nt = w.tracks.find(t => t.id === trSel.value);
    // 暦の種類が違う世界線へ移すときは、その世界線の始まりに置く
    if ((nt.cal === 'fict') !== (track.cal === 'fict') || nt.calId !== track.calId) ctx.commit(w => { Object.assign(w.notes[n.id].when, { tr: nt.id, t: { ...nt.from }, tz: nt.cal === 'fict' ? null : w.settings.tz }); delete w.notes[n.id].when.until; }, '世界線を変更');
    else ctx.commit(w => { w.notes[n.id].when.tr = nt.id; }, '世界線を変更');
  });
  const cals = h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'ほかの暦でも表示'),
    ...(track.cal === 'fict' ? [h('span', { class: 'note-text' }, `${calName('fict:' + track.calId, w)}の世界線`)] : EXTRA.map(([id, name]) => h('label', { class: 'cb' },
      h('input', { type: 'checkbox', checked: (wh.cals || []).includes(id), onchange: e => ctx.commit(w => { const x = w.notes[n.id].when; x.cals = e.target.checked ? [...(x.cals || []), id] : (x.cals || []).filter(c => c !== id); if (!x.cals.length) delete x.cals; }, '表示する暦を変更') }), name))));
  return h('div', { class: 'fields' },
    shown,
    h('label', {}, '世界線', trSel),
    di.el, err, cals,
    track.loop ? loopSec(ctx, n, track, iterK) : null,
    versionsSec(ctx, n),
    h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: !!wh.branch, onchange: e => ctx.commit(w => { if (e.target.checked) w.notes[n.id].when.branch = true; else delete w.notes[n.id].when.branch; }, '分岐点の印を変更') }), '分岐点（ここで世界が分かれうる。パラドックスが起きる世界観なら、ここから世界線を分ける）'),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('timemap', { focus: n.id }) }, '時系列マップで見る'),
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('timemap', { branchFrom: n.id }) }, '＋ ここで世界線を分ける'),
      h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.commit(w => { delete w.notes[n.id].when; }, '時系列マップから外す') }, '時系列マップから外す')));
}
// 今日の0時（そのタイムゾーン）を世界時で
export function localMidnightToday(tz) {
  const now = Date.now() / 1000, t = T(2440588 + Math.floor(now / 86400), Math.floor(now % 86400));
  return wallToUtc(tz, { d: utcToWall(tz, t).d, s: 0 });
}

// ループの世界線の出来事：どの周に起こるか。周回から開いたときは、その周だけの書き換え（周ごとの出来事は1周目のコピー）
function loopSec(ctx, n, track, iterK) {
  const wh = n.when, set = (fn, label) => ctx.commit(w => fn(w.notes[n.id].when), label);
  const which = h('select', { 'aria-label': '起こる周', onchange: e => set(x => { if (e.target.value) { x.k = +e.target.value; delete x.per; } else delete x.k; }, '起こる周を変更') },
    h('option', { value: '' }, `すべての周（${track.loop}周とも。2周目以降は1周目のコピー）`),
    ...Array.from({ length: track.loop }, (_, i) => h('option', { value: i + 1, selected: wh.k === i + 1 }, `${i + 1}周目だけ`)));
  const kids = [h('label', {}, '起こる周', which)];
  const overridden = Object.keys(wh.per || {}).sort((a, b) => a - b);
  if (overridden.length) kids.push(h('p', { class: 'note-text' }, '書き換えた周：' + overridden.map(k => `${k}周目（${wh.per[k] ? wh.per[k].title : '起こらない'}）`).join('・')));
  if (iterK && !wh.k) {
    const cur = wh.per?.[iterK], mode = cur === null ? 'skip' : cur ? 'iter' : 'all';
    const title = h('input', { value: cur?.title ?? n.title, 'aria-label': `${iterK}周目の名前` });
    const tags = h('input', { value: (cur?.tags ?? n.tags).join('、'), 'aria-label': `${iterK}周目のタグ` });
    const sel = h('select', { 'aria-label': `${iterK}周目` }, h('option', { value: 'all', selected: mode === 'all' }, 'そのまま（1周目のコピー）'), h('option', { value: 'iter', selected: mode === 'iter' }, 'この周だけ書き換える'), h('option', { value: 'skip', selected: mode === 'skip' }, 'この周では起こらない'));
    const box = h('div', { class: 'sub', hidden: mode !== 'iter' }, h('label', {}, 'この周での名前', title), h('label', {}, 'この周でのタグ（「、」で区切る）', tags));
    const save = () => set(x => {
      const per = { ...x.per };
      if (sel.value === 'all') delete per[iterK];
      else per[iterK] = sel.value === 'skip' ? null : { title: title.value.trim() || n.title, tags: tags.value.split(/[、,，]/).map(t => t.trim()).filter(Boolean) };
      if (Object.keys(per).length) x.per = per; else delete x.per;
    }, `${iterK}周目を書き換え`);
    sel.addEventListener('change', () => { box.hidden = sel.value !== 'iter'; save(); });
    title.addEventListener('change', save); tags.addEventListener('change', save);
    kids.push(h('div', { class: 'sub' }, h('label', {}, `${iterK}周目（時系列マップのこの周から開きました）`, sel), box));
  }
  return h('div', { class: 'fields' }, ...kids);
}
// 別バージョン：世界線が分かれた瞬間の、分岐元の出来事と、分岐先で同じ瞬間に起きた出来事が対になる
function versionsSec(ctx, n) {
  const w = ctx.world, wh = n.when, eq = (a, b) => a && b && a.d === b.d && a.s === b.s;
  const pairs = [];
  for (const t of w.tracks) {
    if (!t.fork) continue;
    const [ptr, pt] = t.fork;
    let other = null;
    if (wh.tr === ptr && eq(wh.t, pt)) other = [t.id, t.from];
    else if (wh.tr === t.id && eq(wh.t, t.from)) other = [ptr, pt];
    if (other) for (const o of Object.values(w.notes)) if (o.id !== n.id && o.when?.tr === other[0] && eq(o.when.t, other[1])) pairs.push(o);
  }
  if (!pairs.length) return null;
  return h('div', { class: 'row' }, h('span', { class: 'lbl' }, '別バージョン'), ...pairs.map(o => h('button', { type: 'button', class: 'chip', onclick: () => ctx.openNote(o.id) }, `${o.title}（${w.tracks.find(t => t.id === o.when.tr)?.name}）`)));
}
