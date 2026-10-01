// 設定：見た目（端末ごと）、暦の流派・標準のタイムゾーン（世界ごと）、架空の暦、Googleドライブ
import { h, esc, uid } from '../util.js';
import { WESTERN_SCHOOLS } from '../cal/western.js';
import { WAREKI_SCHOOLS } from '../cal/wareki.js';
import { Y2033_OPTIONS } from '../cal/kyureki.js';
import { HIJRI_SCHOOLS } from '../cal/hijri.js';
import { COMMON_TZ, allTimeZones, tzLabel } from '../cal/index.js';
import { newCalendar } from '../cal/fict.js';
import { DEFAULT_SETTINGS } from '../model.js';

const THEME_KEY = 'trpg-theme';
export function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* なし */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  return t;
}

// 流派の選び方（よく使われる順に並べ、最初が初期設定）
const GROUPS = [
  ['西暦', 'western', [['switch', 'ユリウス暦とグレゴリオ暦の切り替え', WESTERN_SCHOOLS.switch], ['era', '紀元前の数え方', WESTERN_SCHOOLS.era], ['yearStart', '年の始まり', WESTERN_SCHOOLS.yearStart]]],
  ['和暦', 'wareki', [['nanboku', '南北朝の元号', WAREKI_SCHOOLS.nanboku], ['kaigen', '改元した年', WAREKI_SCHOOLS.kaigen], ['legend', '伝承期間（神武天皇〜）', WAREKI_SCHOOLS.legend]]],
  ['旧暦（明治6年以降）', 'kyureki', [['y2033', '2033年問題（閏月の場所が決まらない）', Y2033_OPTIONS]]],
  ['ヒジュラ暦', 'hijri', [['method', '月の始まりの決め方', HIJRI_SCHOOLS.method], ['leap', '表形式の閏年の置き方', HIJRI_SCHOOLS.leap], ['epoch', '表形式の紀元日', HIJRI_SCHOOLS.epoch], ['dayStart', '1日の始まり', HIJRI_SCHOOLS.dayStart]]],
];

export function open(ctx) {
  const w = ctx.world, cal = w.settings.cal;
  const theme = applyTheme();
  const sel = (id, opts, cur) => h('select', { id }, ...opts.map(([v, label], i) => h('option', { value: v, selected: v === cur }, label + (i === 0 ? '（初期設定）' : ''))));
  const tzIn = h('input', { id: 'st_tz', list: 'st_tzl', value: w.settings.tz || 'Asia/Tokyo' });
  const body = h('div', { class: 'fields settings' },
    h('h3', {}, '見た目（この端末だけ）'),
    h('label', {}, '明るさ', sel('st_theme', [['auto', '端末に合わせる'], ['light', '明るい'], ['dark', '暗い']], theme)),
    h('h3', {}, 'この世界の暦'),
    h('label', {}, '標準のタイムゾーン（日時を入れるときの初期値）', tzIn, h('datalist', { id: 'st_tzl' }, ...[...COMMON_TZ, ...allTimeZones().filter(z => !COMMON_TZ.includes(z))].map(z => h('option', { value: z }, tzLabel(z))))),
    ...GROUPS.map(([title, key, items]) => h('fieldset', { class: 'st-group' }, h('legend', {}, title),
      ...items.map(([k, label, opts]) => h('label', {}, label, sel(`st_${key}_${k}`, opts, cal[key]?.[k] ?? DEFAULT_SETTINGS().cal[key][k]))))),
    h('p', { class: 'note-text' }, '流派はよく使われる順に並べています。ヒジュラ暦のトルコ・MABIMS は天文計算による目安で、公式の発表と1日ずれることがあります。各国の実際の目視記録はまとまったデータがないため選べません。和暦の旧暦の日付は445年から出せます（それより前は皇紀と干支だけ）。'),
    h('h3', {}, '架空の暦'),
    h('div', { class: 'row' }, ...Object.values(w.calendars).map(c => h('button', { type: 'button', class: 'chip', onclick: () => calendarDialog(ctx, c.id) }, c.name)),
      h('button', { type: 'button', class: 'btn small', onclick: () => calendarDialog(ctx, null) }, '＋ 架空の暦')),
    h('h3', {}, 'Googleドライブ'),
    h('div', { id: 'st_drive' }, h('p', { class: 'note-text' }, '読み込んでいます…')),
  );
  ctx.openDialog({
    title: '設定', wide: true, body,
    onSave: () => {
      const v = id => document.getElementById(id).value;
      try { localStorage.setItem(THEME_KEY, v('st_theme')); } catch { /* なし */ }
      applyTheme();
      const tz = v('st_tz').trim() || 'Asia/Tokyo';
      if (tz !== 'UTC' && !allTimeZones().includes(tz)) throw `タイムゾーン「${tz}」がわかりません（例：Asia/Tokyo、Europe/London）`;
      ctx.commit(w => {
        w.settings.tz = tz;
        for (const [, key, items] of GROUPS) { w.settings.cal[key] ||= {}; for (const [k] of items) w.settings.cal[key][k] = v(`st_${key}_${k}`); }
      }, '設定を変更');
    },
  });
  import('../persist/drive.js').then(m => m.settingsSection(ctx, document.getElementById('st_drive'))).catch(() => { const el = document.getElementById('st_drive'); if (el) el.replaceChildren(h('p', { class: 'note-text' }, 'Googleドライブにつなぐ部品を読み込めませんでした')); });
}

// 架空の暦の編集：月の名前と日数、曜日、最初の年の番号、閏年
export function calendarDialog(ctx, id) {
  const c = id ? ctx.world.calendars[id] : newCalendar({ name: '新しい暦' });
  const used = id ? ctx.world.tracks.filter(t => t.calId === id).length : 0;
  const months = c.months.map(m => `${m.name}:${m.days}`).join('\n');
  ctx.openDialog({
    title: id ? '架空の暦を編集' : '架空の暦を追加', wide: true,
    body: `<label>暦の名前<input id="cl_name" value="${esc(c.name)}" autocomplete="off"></label>
      <label>月（1行に1か月。「名前:日数」）<textarea id="cl_months" rows="8" class="data">${esc(months)}</textarea></label>
      <label>曜日（「、」で区切る。空なら曜日なし）<input id="cl_week" value="${esc((c.weekdays || []).join('、'))}" autocomplete="off"></label>
      <div class="row"><label>最初の年の番号<input type="number" id="cl_first" value="${c.firstYear ?? 1}" style="width:7em"></label>
      <label>閏年：何年ごと（0 = なし）<input type="number" id="cl_every" min="0" value="${c.leap?.every ?? 0}" style="width:6em"></label>
      <label>閏日を足す月（番号）<input type="number" id="cl_lm" min="1" value="${(c.leap?.month ?? c.months.length - 1) + 1}" style="width:6em"></label>
      <label>足す日数<input type="number" id="cl_ld" min="1" value="${c.leap?.days ?? 1}" style="width:6em"></label></div>
      ${used ? `<p class="note-text">この暦を使っている世界線：${used}本。日数を変えると、その世界線の日付の読み方が変わります。</p>` : ''}`,
    onSave: () => {
      const v = s => document.getElementById(s).value;
      const name = v('cl_name').trim(); if (!name) throw '名前を入れてください';
      const ms = v('cl_months').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => { const m = /^(.*?)[:：]\s*(\d+)$/.exec(l); if (!m) throw `${i + 1}行目は「名前:日数」の形にしてください`; const days = +m[2]; if (!(days >= 1 && days <= 1000)) throw `${i + 1}行目の日数は1〜1000にしてください`; return { name: m[1].trim() || `${i + 1}月`, days }; });
      if (!ms.length) throw '月を1つ以上入れてください';
      const every = Math.max(0, Math.trunc(+v('cl_every') || 0)), lm = Math.trunc(+v('cl_lm')) - 1, ld = Math.max(1, Math.trunc(+v('cl_ld') || 1));
      if (every && !(lm >= 0 && lm < ms.length)) throw `閏日を足す月は1〜${ms.length}にしてください`;
      const nc = { ...c, id: c.id || uid('c'), name, months: ms, weekdays: v('cl_week').split(/[、,，]/).map(s => s.trim()).filter(Boolean), firstYear: Math.trunc(+v('cl_first') || 0), leap: { every, month: Math.max(0, lm), days: ld } };
      ctx.commit(w => { w.calendars[nc.id] = nc; }, id ? '架空の暦を変更' : '架空の暦を追加');
    },
    onDelete: id ? () => { if (used) throw 'この暦を使っている世界線があるので削除できません'; ctx.commit(w => { delete w.calendars[id]; }, '架空の暦を削除'); } : null,
  });
}
