// シナリオで絞る：人物・アイテム・集団の一覧、家系図、相関図、グラフで共通（1か所で選ぶと全部に効く。読み込み直すと「すべて」に戻る）
import { h, byTitle } from '../util.js';
import { kindOf } from '../model.js';
import { inScenario, scenarioGroups } from '../listing.js';

export const scope = { sid: '' };
const valid = w => scope.sid && w.notes[scope.sid] && kindOf(w.notes[scope.sid]) === 'scenario';
// 絞っているときは、そのシナリオに出るもの（集団の相関図は scenarioGroups）。絞っていなければ null
export const scopeIds = w => valid(w) ? inScenario(w, scope.sid) : null;
export const scopeGroupIds = w => valid(w) ? scenarioGroups(w, scope.sid) : null;

export function scopeSelect(ctx, onChange) {
  const w = ctx.world, scs = Object.values(w.notes).filter(n => kindOf(n) === 'scenario').sort(byTitle);
  if (!valid(w)) scope.sid = '';
  if (!scs.length) return null;
  return h('select', { class: `scope-sel${scope.sid ? ' on' : ''}`, 'aria-label': 'シナリオで絞る', onchange: e => { scope.sid = e.target.value; onChange(); } },
    h('option', { value: '' }, 'シナリオ：すべて'), ...scs.map(s => h('option', { value: s.id, selected: s.id === scope.sid }, `シナリオ：${s.title || '名前なし'}`)));
}
// 絞っているあいだの印。shown / total と単位（人・件）。× で「すべて」に戻す
export function scopeChip(ctx, onChange, shown, total, unit = '件') {
  if (!valid(ctx.world)) return null;
  return h('span', { class: 'scope-chip' }, `シナリオ「${ctx.world.notes[scope.sid].title || '名前なし'}」で絞っています（${shown} / ${total}${unit}）`,
    h('button', { type: 'button', class: 'x', 'aria-label': '絞るのをやめる', title: '絞るのをやめる', onclick: () => { scope.sid = ''; onChange(); } }, '×'));
}
