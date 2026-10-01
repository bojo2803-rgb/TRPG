// 時系列の画面：アプリの世界 ⇄ 時系列マップのデータ（試作品と同じ形）をつなぐ
//   世界線 world.tracks、出来事 = 「時系列」のある付箋、主体 = 道筋（legs）のある付箋、まとめ = 出来事の親の付箋
//   時系列マップの中では日時を「日の小数」で扱う。書き戻すときは、元の {d,s} に正確に戻す（丸めで日時がずれないように）
import { h } from '../util.js';
import { newNote, kindOf } from '../model.js';
import { toDays, fromDays, utcToWall, wallToUtc } from '../cal/time.js';
import { formatTime, yearLengthOf } from '../cal/index.js';
import { formatFict } from '../cal/fict.js';
import { dateInput } from '../ui/dateInput.js';
import { createTimeMap, LEGEND_HTML } from './engine.js';
import { localMidnightToday } from './whenSection.js';

const PREC = { year: 'year', month: 'month', day: 'day', min: 'minute' };

export function mount(el, ctx, arg) {
  const root = h('div', { class: 'tm', html: `
    <div class="bar tm-bar">
      <h2>時系列</h2>
      <div class="chips" id="tm-views" role="group" aria-label="視点"></div>
      <span class="sp"></span>
      <div class="chips tm-tools" role="toolbar" aria-label="時系列マップの編集">
        <button class="chip tool" id="tm-addCard" title="出来事の付箋を足す">＋ 出来事</button>
        <button class="chip tool" id="tm-addTrack">＋ 世界線</button>
        <button class="chip tool" id="tm-addLink" title="出発点と行き先を順にクリックして、主体の移動やループを作ります">＋ つなぐ</button>
        <button class="chip tool" id="tm-addSub">＋ 主体</button>
        <button class="chip tool" id="tm-addScen" title="出来事をまとめてシナリオにする（もやで覆われます）">＋ シナリオ</button>
        <button class="chip tool" id="tm-editSub" disabled title="主体の視点で使えます">この主体を編集</button>
        <button class="chip tool" id="tm-listBtn" aria-pressed="false">一覧</button>
      </div>
    </div>
    <details class="tm-settings"><summary>絞り込み・表示の設定（付箋・◆・線をクリックで編集。付箋を引っぱると、そこから分岐・移動・ループを延ばせます）</summary>
      <div class="tm-panel">
        <span>検索</span><div class="row"><input id="tm-q" type="search" placeholder="出来事の名前やタグ" aria-label="出来事を検索"></div>
        <span>タグ</span><div class="row"><div class="chips" id="tm-tags"></div></div>
        <span>世界線</span><div class="row"><div class="chips" id="tm-tracks"></div></div>
        <span>主体</span><div class="row"><label class="cb"><input id="tm-onlySub" type="checkbox"> 選んだ主体に関係する出来事だけ表示</label></div>
        <span>つながり</span><div class="row"><div class="chips" id="tm-linkList"></div></div>
      </div>
    </details>
    <div class="tm-stage" id="tm-stage">
      <svg id="tm-map" role="img" aria-label="時系列マップ"></svg>
      <div class="zoom"><button id="tm-zin" aria-label="拡大">＋</button><button id="tm-zout" aria-label="縮小">−</button><button id="tm-fit">全体</button></div>
      <div id="tm-tip" hidden></div>
      <div id="tm-pickHint" hidden role="status"></div>
      <aside id="tm-list" hidden aria-label="出来事の一覧">
        <div class="list-h"><b>出来事の一覧（世界線ごと・時系列順）</b><button type="button" class="mini" id="tm-listClose">閉じる</button></div>
        <div id="tm-listBody"></div>
      </aside>
    </div>
    ${LEGEND_HTML}` });
  el.append(root);

  // 日時：{d,s} ⇄ 日の小数。作った小数から元の {d,s} を引けるようにしておく
  const exact = new Map();
  const F = t => { const x = toDays(t); exact.set(x, t); return x; };
  const B = x => exact.get(x) ?? fromDays(x);
  const pt = q => q && [q[0], F(q[1]), ...(q[2] ? [q[2]] : [])];
  const ptBack = q => q && [q[0], B(q[1]), ...(q[2] ? [q[2]] : [])];
  const world = () => ctx.world;
  const trackOf = id => world().tracks.find(t => t.id === id);

  // アプリの世界 → 時系列マップのデータ
  function load() {
    const w = world(), tids = new Set(w.tracks.map(t => t.id));
    const tracks = w.tracks.map(t => {
      const o = { id: t.id, name: t.name, lane: t.lane, color: t.color, cal: t.cal, from: F(t.from), to: F(t.to) };
      if (t.fork) o.fork = pt(t.fork);
      if (t.merge) o.merge = pt(t.merge);
      if (t.loop) o.loop = t.loop;
      if (t.calId) o.calId = t.calId;
      return o;
    });
    const groups = {}, events = [], subjects = [];
    for (const n of Object.values(w.notes)) {
      if (n.when && tids.has(n.when.tr)) {
        const e = { tr: n.when.tr, t: F(n.when.t), title: n.title || '（名前なし）', tags: [...n.tags], _id: n.id };
        if (n.when.branch) e.branch = true;
        if (n.when.k) e.k = n.when.k;
        if (n.when.per) e.per = JSON.parse(JSON.stringify(n.when.per));
        // シナリオ（なければ最初のまとめ）。時系列ではもやで覆う
        const g = n.parents.find(p => kindOf(w.notes[p]) === 'scenario') || n.parents.find(p => w.notes[p]);
        if (g) { e.group = g; groups[g] ||= { title: w.notes[g].title || '（名前なし）', open: !w.notes[g].collapsed, color: w.notes[g].color ?? null }; }
        events.push(e);
      }
      if (n.legs) {
        const s = { id: n.id, name: n.title || '（名前なし）', legs: n.legs.filter(g => tids.has(g.tr)).map(g => ({ ...g, a: F(g.a), b: F(g.b) })) };
        if (n.origin && w.notes[n.origin]?.legs) s.origin = n.origin;
        subjects.push(s);
      }
    }
    return { tracks, subjects, events, groups };
  }
  // 時系列マップのデータ → アプリの世界（commit の中で呼ぶ）
  function writeBack(w, tm) {
    const before = new Map(w.tracks.map(t => [t.id, t]));
    w.tracks = tm.tracks.map(t => {
      const o = { id: t.id, name: t.name, lane: t.lane, color: t.color, cal: t.cal, from: B(t.from), to: B(t.to) };
      if (t.fork) o.fork = ptBack(t.fork);
      if (t.merge) o.merge = ptBack(t.merge);
      if (t.loop) o.loop = t.loop;
      if (t.calId) o.calId = t.calId;
      for (const k of Object.keys(before.get(t.id) || {})) if (!(k in o) && !['fork', 'merge', 'loop', 'calId'].includes(k)) o[k] = before.get(t.id)[k];
      return o;
    });
    const tids = new Set(w.tracks.map(t => t.id));
    // 主体
    const seenS = new Set();
    for (const s of tm.subjects) {
      let n = w.notes[s.id];
      if (!n) { n = newNote({ id: s.id, title: s.name }); w.notes[s.id] = n; }
      if (n.title !== s.name && !(n.title === '' && s.name === '（名前なし）')) n.title = s.name;
      n.legs = s.legs.map(g => { const o = { ...g, a: B(g.a), b: B(g.b) }; return o; });
      if (s.origin) n.origin = s.origin; else delete n.origin;
      seenS.add(s.id);
    }
    for (const n of Object.values(w.notes)) if (n.legs && !seenS.has(n.id)) delete n.legs;
    // 出来事
    const seenE = new Set();
    for (const e of tm.events) {
      let n = e._id && w.notes[e._id];
      if (!n) { // 時系列マップの中で増えた出来事（分岐の別バージョン・ループの1周目のコピー）
        n = newNote({ title: e.title, tags: [...(e.tags || [])] });
        w.notes[n.id] = n;
        const isWest = trackOf(e.tr)?.cal !== 'fict' && tm.tracks.find(t => t.id === e.tr)?.cal !== 'fict';
        n.when = { prec: B(e.t).s ? 'minute' : 'day', tz: isWest ? w.settings.tz : null };
      }
      n.when = { ...n.when, tr: e.tr, t: B(e.t) };
      for (const k of ['branch', 'k', 'per']) if (e[k] != null && e[k] !== false) n.when[k] = e[k]; else delete n.when[k];
      if (e.group && w.notes[e.group] && !n.parents.includes(e.group)) n.parents.push(e.group);
      seenE.add(n.id);
    }
    for (const n of Object.values(w.notes)) {
      if (!n.when || seenE.has(n.id) || !tids.has(n.when.tr) && before.has(n.when.tr) === false) continue;
      // 時系列マップの中で消えた出来事（ループを消したときのコピーなど）：中身がなければ付箋ごと消す
      const empty = !n.body && !Object.keys(n.fields).length && !n.legs && !Object.values(w.links).some(l => l.a === n.id || l.b === n.id) && !Object.values(w.boards).some(b => b.items[n.id]);
      if (empty) delete w.notes[n.id]; else delete n.when;
    }
    for (const [gid, g] of Object.entries(tm.groups)) if (w.notes[gid]) w.notes[gid].collapsed = !g.open;
  }

  const host = {
    load,
    commit(mutate, label, tmRef) { ctx.commit(w => { mutate(); writeBack(w, tmRef()); }, label); },
    fmt(t, x, p, withName) {
      const tr = trackOf(t.id) || t, tt = B(x), prec = PREC[p] || 'day', w = world();
      if (tr.cal === 'fict') { const c = w.calendars[tr.calId]; return c ? formatFict(c, tt.d, prec === 'minute' ? 'day' : prec, withName) + (prec === 'minute' ? ` ${String(Math.floor(tt.s / 3600)).padStart(2, '0')}:${String(Math.floor(tt.s % 3600 / 60)).padStart(2, '0')}` : '') : `${tt.d}日目`; }
      const s = formatTime(tt, { track: tr, prec }, w);
      return withName ? `${t.id === 'main' ? '西暦' : `西暦;${t.name}`} ${s}` : s;
    },
    yearLen: t => yearLengthOf(trackOf(t.id) || t, world()),
    calName: t => world().calendars[t.calId]?.name || '架空の暦',
    calendars: () => Object.values(world().calendars),
    fictYears: (spec, n) => { const c = world().calendars[spec.calId]; return c ? Math.round(n * c.months.reduce((s, m) => s + m.days, 0)) : n * 360; },
    openDialog: o => ctx.openDialog(o), showMenu: (...a) => ctx.showMenu(...a), toast: m => ctx.toast(m),
    dateInput(spec, x) {
      const tr = spec?.id ? trackOf(spec.id) || spec : spec, t = B(x), w = world();
      const wall = tr?.cal === 'fict' ? t : utcToWall(w.settings.tz, t);
      return dateInput(w, { track: tr?.cal === 'fict' ? tr : null, value: { t, prec: wall.s ? 'minute' : 'day', tz: w.settings.tz }, fuzzy: false });
    },
    toFloat: t => F(t),
    fromFloat: x => B(x),
    // 長さを足す（年・か月は暦の平均の長さ。西暦系は365.2425日・30.436875日）
    addDuration(spec, t, n, unit) {
      const tr = spec?.id ? trackOf(spec.id) || spec : spec, yl = yearLengthOf(tr, world());
      const days = n * { year: yl, month: yl / 12, day: 1, hour: 1 / 24 }[unit];
      const whole = Math.floor(days), secs = Math.round((days - whole) * 86400);
      return { d: t.d + whole + Math.floor((t.s + secs) / 86400), s: (t.s + secs) % 86400 };
    },
    openNote: (id, opts) => ctx.openNote(id, { ...opts, section: 'when' }),
    // ＋ 出来事：時系列の付箋を作って開く
    newEvent({ tr, t, k, title, tags }) {
      const w = world(), track = trackOf(tr) || w.tracks[0], west = track.cal !== 'fict';
      const tt = t != null ? B(t) : west ? localMidnightToday(w.settings.tz) : { ...track.from };
      const n = newNote({ title, tags, when: { tr: track.id, t: tt, prec: tt.s ? 'minute' : 'day', tz: west ? w.settings.tz : null } });
      ctx.commit(w => { w.notes[n.id] = n; }, '出来事を追加');
      ctx.openNote(n.id, { focusTitle: true, section: 'when' });
    },
  };
  const tm = createTimeMap(root, host);
  root.querySelector('#tm-addScen').onclick = () => scenarioDialog(ctx);
  tm.refresh(true);
  window.__tm = tm; // 自動確認用
  if (arg?.focus) setTimeout(() => tm.focusNote(arg.focus), 50);
  if (arg?.subjectForm) setTimeout(() => tm.subjectForm(arg.subjectForm, world().notes[arg.subjectForm]?.title), 50);
  if (arg?.branchFrom) setTimeout(() => tm.branchFrom(arg.branchFrom), 50);
  if (arg?.subject) setTimeout(() => tm.viewSubject(arg.subject), 50);
  return {
    update: e => { if (e?.type !== 'search') tm.refresh(false); },
    destroy: () => tm.destroy(),
  };
}

// ＋ シナリオ：名前（いまあるシナリオの名前なら、そこに足す）と、入れる出来事（世界線ごと・時間順）を選ぶ
function scenarioDialog(ctx) {
  const w = ctx.world, scen = Object.values(w.notes).filter(n => kindOf(n) === 'scenario');
  const name = h('input', { list: 'tm-scen-list', placeholder: 'シナリオの名前', autocomplete: 'off', 'aria-label': 'シナリオの名前' });
  const evs = Object.values(w.notes).filter(n => n.when && w.tracks.some(t => t.id === n.when.tr));
  const key = n => n.when.t.d * 86400 + n.when.t.s;
  const boxes = w.tracks.map(tr => {
    const list = evs.filter(n => n.when.tr === tr.id).sort((a, b) => key(a) - key(b));
    return list.length ? h('fieldset', { class: 'scen-pick' }, h('legend', {}, tr.name), ...list.map(n => h('label', { class: 'cb' }, h('input', { type: 'checkbox', value: n.id }),
      `${formatTime(n.when.t, { track: tr, tz: n.when.tz, prec: n.when.prec }, w)}　${n.title || '（名前なし）'}`))) : null;
  });
  ctx.openDialog({
    title: '＋ シナリオ', ok: '作る', wide: true,
    body: h('div', { class: 'fields' }, h('label', {}, 'シナリオの名前', name, h('datalist', { id: 'tm-scen-list' }, ...scen.map(n => h('option', { value: n.title })))),
      h('p', { class: 'note-text' }, '入れる出来事を選んでください。時系列では、選んだ出来事がもやで覆われます。'), ...boxes),
    onSave: () => {
      const t = name.value.trim();
      if (!t) throw '名前を入れてください';
      const ids = [...document.querySelectorAll('#dlgBody .scen-pick input:checked')].map(x => x.value);
      if (!ids.length) throw '出来事を1つ以上選んでください';
      ctx.commit(w => {
        let sc = Object.values(w.notes).find(n => kindOf(n) === 'scenario' && n.title === t);
        if (!sc) { sc = newNote({ kind: 'scenario', title: t }); w.notes[sc.id] = sc; }
        for (const id of ids) { const n = w.notes[id]; n.parents = [sc.id, ...n.parents.filter(p => p !== sc.id)]; }
      }, 'シナリオを作る');
    },
  });
}
