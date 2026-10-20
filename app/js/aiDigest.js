// AIに読ませる文章：世界全体（シナリオ・人物・場所・出来事・ストーリーチャートなど）を、AIが読みやすい1つの Markdown にする。
// 先頭に「AIへのお願い」（矛盾・時系列や年齢のずれ・シナリオの抜けを調べてもらう頼み文）。画面を持たない決まり（ドライブへの書き出しでも使う）
import { KINDS, kindOf, placePath, childrenOf, templatesFor, bornOf, periodOf } from './model.js';
import { formatTime } from './cal/index.js';
import { ageAt, ageText } from './cal/age.js';
import { NODE_TYPES, layoutChart } from './chart.js';
import { byTitle } from './util.js';
import { tagList } from './tags.js';

export const REQUEST = `あなたはTRPG（テーブルトークRPG）のシナリオと世界設定の編集者です。この文章は、作者がアプリ「TRPG 世界設定」で作った世界を、全部書き出したものです。全部読んで、作者のために精査してください。
シナリオを1本ずつ見るのではなく、同じ世界にあるすべてのシナリオ・人物・場所・アイテム・出来事を見通して、次のことを探してください。

1. 矛盾：設定どうしの食い違い（同じ人物の説明がところによって違う、いる所と出来事の場所が合わない、所属や持ち物の期間が重なる、など）
2. 時系列と年齢のずれ：出来事の順番のおかしさ、生年月日とシナリオの時期から数えた年齢が役柄や説明と合わない、いなくなったはずの人物が後で出る、など
3. シナリオの抜け：ストーリーチャートで、どこからも来られない点・行き止まり・エンディングに届かない道、「情報」の点が手に入らない、登場人物やアイテムが一度も使われない、伏線が回収されない、など
4. シナリオどうしのつながり：同じ人物・場所・アイテムが複数のシナリオに出るときの食い違いと、つなげると面白くなりそうなところ
5. 表記ゆれ・重複：同じものに別の名前、別のものに同じ名前

答え方：
- 見つけたことを、重要なものから順に箇条書きで。
- それぞれに「どのカード（名前）」「何が問題か」「根拠（どこに何と書いてあるか）」「直し方の案」を付けてください。
- 書いていないことを事実として扱わないでください。わからないことは、最後に「作者への質問」としてまとめてください。
- 設定を書き直した全文は要りません。`;

const READING = `- 下は、世界の中身を種類ごとに並べたものです（世界線と暦 → ロケーション → 集団 → 人物 → アイテム → シナリオ → 時系列 → 付箋 → タグ → つながり）。タグの説明は、作者がそのタグに込めた意味です。
- カードは名前で呼びます。同じ名前が2つ以上あるときは「名前〔種類・番号〕」で区別しています。
- メモの中の [[名前]] は、ほかのカードへのリンクです。
- 人物に固定の年齢はありません。生年月日と、シナリオの時期から数えた「その時の年齢」を、登場するシナリオの横に書いています（「約」は、生年月日などが「〜頃」「年まで」で、前後1年ずれうるもの）。
- ストーリーチャートの点は P1, P2… の番号で、矢印は「PLの行動・条件」→ 行き先、です。`;

// 複数行の文を、箇条書きの下に字下げして入れる
const indent = (s, pad = '  ') => String(s).replace(/\r/g, '').split('\n').map(l => (l ? pad + l : '')).join('\n');

export function worldDigest(w, { request = true, now = new Date() } = {}) {
  const notes = Object.values(w.notes), links = Object.values(w.links);
  const of = k => notes.filter(n => kindOf(n) === k).sort(byTitle);
  // 名前：同じ名前があれば〔種類・番号〕を付ける
  const same = new Map();
  for (const n of notes) { const t = n.title || '（名前なし）'; same.set(t, [...(same.get(t) || []), n.id]); }
  const nm = id => {
    const n = w.notes[id];
    if (!n) return '（消えたカード）';
    const t = n.title || '（名前なし）', ids = same.get(t);
    return ids.length > 1 ? `${t}〔${KINDS[kindOf(n)].label}・${ids.indexOf(id) + 1}〕` : t;
  };
  const names = ids => ids.filter(id => w.notes[id]).map(nm).join('、');
  const path = id => w.notes[id] ? placePath(w, id).map(nm).join(' › ') : '';
  const track = id => w.tracks.find(t => t.id === id);
  const when = v => v ? formatTime(v.t, { track: track(v.tr), tz: v.tz, prec: v.prec, approx: v.approx, until: v.until }, w) + (v.tr !== 'main' && track(v.tr) ? `（${track(v.tr).name}）` : '') : '';
  const period = l => { const a = when(l.from), b = when(l.to) || (l.done ? '？' : ''); return a || b ? `${a || '？'}〜${b}` : ''; };
  const ofKind = (kind, side, id) => links.filter(l => l.kind === kind && l[side] === id && w.notes[l.a] && w.notes[l.b]);
  const scenariosOf = n => n.parents.filter(p => kindOf(w.notes[p]) === 'scenario');
  // 欄：その種類のテンプレートの順。空は書かない。長い欄は字下げ
  const fields = n => {
    const out = [];
    for (const t of templatesFor(w, n)) for (const f of t.fields) {
      if (f.type === 'section' || f.key === 'よみ') continue;
      const v = n.fields?.[f.key];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      out.push(f.type === 'long' || String(v).includes('\n') ? `- ${f.label}：\n${indent(v)}` : `- ${f.label}：${v}`);
    }
    return out;
  };
  const memo = n => n.body?.trim() ? [`- メモ：\n${indent(n.body.trim())}`] : [];
  const tags = n => n.tags?.length ? [`- タグ：${n.tags.join('、')}`] : [];
  const at = (label, n) => n.at && w.notes[n.at] ? [`- ${label}：${path(n.at)}`] : [];
  const card = (head, lines) => [`### ${head}`, ...lines.flat().filter(Boolean), ''].join('\n');

  const out = [`# 世界「${w.name}」のまとめ（AIに読ませる用）`, '',
    `書き出した日時：${now.toLocaleString('ja-JP')}　／　${['scenario', 'person', 'place', 'group', 'item', 'note'].map(k => `${KINDS[k].label} ${of(k).length}`).join('・')}`, ''];
  if (request) out.push('## AIへのお願い', '', REQUEST, '');
  out.push('## 読み方', '', READING, '');

  // 世界線と暦
  out.push('## 世界線と暦', '');
  for (const t of w.tracks) {
    const cal = t.cal === 'fict' ? `架空の暦「${w.calendars?.[t.calId]?.name || '？'}」` : '西暦など（ふつうの暦）';
    const span = t.from && t.to ? `${formatTime(t.from, { track: t, tz: w.settings?.tz, prec: 'year' }, w)}〜${formatTime(t.to, { track: t, tz: w.settings?.tz, prec: 'year' }, w)}` : '';
    out.push(`- ${t.name}：${cal}${span ? `。${span}` : ''}${t.fork ? `。「${track(t.fork[0])?.name || '？'}」から分かれる` : ''}${t.merge ? `。「${track(t.merge[0])?.name || '？'}」に合流` : ''}${t.loop ? '。くり返す（ループ）' : ''}`);
  }
  out.push('');

  // ロケーション：道すじの順
  const places = of('place').sort((a, b) => path(a.id).localeCompare(path(b.id), 'ja'));
  if (places.length) out.push('## ロケーション', '', ...places.map(n => card(path(n.id), [fields(n), tags(n), memo(n)])));

  // 集団
  const groups = of('group');
  if (groups.length) out.push('## 集団', '', ...groups.map(n => card(nm(n.id), [
    fields(n), at('拠点', n),
    ofKind('member', 'b', n.id).length ? `- メンバー：${ofKind('member', 'b', n.id).map(l => `${nm(l.a)}${[l.label, period(l)].filter(Boolean).length ? `（${[l.label, period(l)].filter(Boolean).join('・')}）` : ''}`).join('、')}` : '',
    n.parents.filter(p => kindOf(w.notes[p]) === 'group').length ? `- 上部組織：${names(n.parents.filter(p => kindOf(w.notes[p]) === 'group'))}` : '',
    groups.filter(g => g.parents.includes(n.id)).length ? `- 下部組織：${names(groups.filter(g => g.parents.includes(n.id)).map(g => g.id))}` : '',
    tags(n), memo(n)])));

  // 人物
  const people = of('person');
  if (people.length) out.push('## 人物', '', ...people.map(n => {
    const b = bornOf(w, n), yomi = n.fields?.['よみ'];
    const fam = [
      ['親', ofKind('parent', 'b', n.id).map(l => l.a)], ['子', ofKind('parent', 'a', n.id).map(l => l.b)],
      ['配偶者', links.filter(l => l.kind === 'spouse' && (l.a === n.id || l.b === n.id)).map(l => (l.a === n.id ? l.b : l.a))],
    ].filter(([, ids]) => ids.length).map(([k, ids]) => `${k} ${names(ids)}`);
    for (const l of ofKind('ancestor', 'b', n.id)) fam.push(`遠い先祖 ${nm(l.a)}${l.gen ? `（${l.gen}代前）` : ''}`);
    for (const l of ofKind('ancestor', 'a', n.id)) fam.push(`遠い子孫 ${nm(l.b)}${l.gen ? `（${l.gen}代後）` : ''}`);
    const scs = scenariosOf(n);
    return card(`${nm(n.id)}${yomi ? `（${yomi}）` : ''}`, [
      fields(n),
      b ? `- 生年月日：${when(b)}${b.fromMap ? '（時系列の「誕生」から）' : ''}` : '- 生年月日：決めていない',
      at('いる所', n),
      ofKind('member', 'a', n.id).length ? `- 所属：${ofKind('member', 'a', n.id).map(l => `${nm(l.b)}${[l.label, period(l)].filter(Boolean).length ? `（${[l.label, period(l)].filter(Boolean).join('・')}）` : ''}`).join('、')}` : '',
      fam.length ? `- 家族：${fam.join('、')}` : '',
      ofKind('holds', 'a', n.id).length ? `- 持ち物：${ofKind('holds', 'a', n.id).map(l => `${nm(l.b)}${period(l) ? `（${period(l)}）` : ''}`).join('、')}` : '',
      scs.length ? `- 登場するシナリオ：${scs.map(s => { const a = ageText(ageAt(w, b, periodOf(w, w.notes[s]))); return `${nm(s)}${a ? `（${a}）` : ''}`; }).join('、')}` : '',
      n.legs?.length ? `- 時系列の道すじ：${n.legs.map(g => `${track(g.tr)?.name || '？'} ${formatTime(g.a, { track: track(g.tr), tz: w.settings?.tz }, w)}〜${formatTime(g.b, { track: track(g.tr), tz: w.settings?.tz }, w)}${g.ka ? `（${g.ka}周目から）` : ''}`).join(' → ')}` : '',
      n.origin && w.notes[n.origin] ? `- 分身の元：${nm(n.origin)}` : '',
      tags(n), memo(n)]);
  }));

  // アイテム
  const items = of('item');
  if (items.length) out.push('## アイテム', '', ...items.map(n => card(nm(n.id), [
    fields(n), at('ある所', n),
    ofKind('holds', 'b', n.id).length ? `- 持ち主の移り変わり：${ofKind('holds', 'b', n.id).map(l => `${nm(l.a)}${[l.label, period(l)].filter(Boolean).length ? `（${[l.label, period(l)].filter(Boolean).join('・')}）` : ''}`).join(' → ')}` : '',
    scenariosOf(n).length ? `- 登場するシナリオ：${names(scenariosOf(n))}` : '',
    tags(n), memo(n)])));

  // シナリオ：欄・舞台・時期・登場・出来事・ストーリーチャート
  const scens = of('scenario');
  if (scens.length) out.push('## シナリオ', '', ...scens.map(s => {
    const kids = childrenOf(w, s.id), p = periodOf(w, s);
    const cast = k => kids.filter(x => kindOf(x) === k);
    const lines = [fields(s), at('舞台', s), p ? `- 時期：${when(p)}${s.period ? '' : '（いちばん早い出来事から）'}` : '- 時期：決めていない',
      cast('person').length ? `- 登場人物：${cast('person').map(x => { const a = ageText(ageAt(w, bornOf(w, x), p)); return `${nm(x.id)}${a ? `（${a}）` : ''}`; }).join('、')}` : '',
      cast('group').length ? `- 集団：${names(cast('group').map(x => x.id))}` : '',
      cast('item').length ? `- アイテム：${names(cast('item').map(x => x.id))}` : '',
      kids.filter(x => x.when).length ? `- 出来事：${kids.filter(x => x.when).sort((a, b) => a.when.t.d - b.when.t.d || a.when.t.s - b.when.t.s).map(x => `${when(x.when)} ${nm(x.id)}`).join('、')}` : '',
      kids.filter(x => kindOf(x) === 'note' && !x.when).length ? `- 付箋：${names(kids.filter(x => kindOf(x) === 'note' && !x.when).map(x => x.id))}` : '',
      ...(s.sessions || []).map(x => `- 遊んだ記録：${[x.date, x.who && `参加者 ${x.who}`].filter(Boolean).join('・')}${x.memo ? `\n${indent(x.memo)}` : ''}`),
      tags(s), memo(s)];
    return card(nm(s.id), lines) + chartText(s.chart);
  }));

  // ストーリーチャート：上から順に P1, P2…
  function chartText(c) {
    const ids = Object.keys(c?.nodes || {});
    if (!ids.length) return '';
    const pos = layoutChart(c), order = ids.sort((a, b) => pos[a].y - pos[b].y || pos[a].x - pos[b].x), no = Object.fromEntries(order.map((id, i) => [id, `P${i + 1}`]));
    const edges = Object.values(c.edges).filter(e => c.nodes[e.from] && c.nodes[e.to]);
    const L = ['', `#### ストーリーチャート（点 ${order.length}・矢印 ${edges.length}）`, ''];
    for (const id of order) {
      const n = c.nodes[id], t = NODE_TYPES[n.type] || NODE_TYPES.memo, ins = edges.filter(e => e.to === id), outs = edges.filter(e => e.from === id);
      L.push(`- **${no[id]} ${n.title || '（題名なし）'}〔${t.label}〕**${ins.length ? '' : '（入ってくる矢印なし）'}`);
      if (n.time) L.push(`  - いつ：${n.time}`);
      if (n.place && w.notes[n.place]) L.push(`  - 場所：${path(n.place)}`);
      if (n.cast?.length) L.push(`  - 登場：${names(n.cast)}`);
      if (n.items?.length) L.push(`  - アイテム：${names(n.items)}`);
      if (n.refs?.length) L.push(`  - 結び付けたカード：${names(n.refs)}`);
      if (n.body?.trim()) L.push(`  - メモ：\n${indent(n.body.trim(), '    ')}`);
      L.push(`  - このあと：${outs.length ? outs.map(e => `${e.label ? `「${e.label}」` : '（そのまま）'}→ ${no[e.to]} ${c.nodes[e.to].title || '（題名なし）'}`).join('　／　') : 'なし'}`);
    }
    return L.join('\n') + '\n\n';
  }

  // 時系列：時系列マップに置いたもの（出来事など）を時間の順に
  const timed = notes.filter(n => n.when).sort((a, b) => a.when.t.d - b.when.t.d || a.when.t.s - b.when.t.s);
  if (timed.length) out.push('## 時系列（時系列マップの出来事など。時間の順）', '', ...timed.map(n => [
    `- ${when(n.when)}：${nm(n.id)}${n.at && w.notes[n.at] ? `　場所：${path(n.at)}` : ''}${scenariosOf(n).length ? `　シナリオ：${names(scenariosOf(n))}` : ''}${n.when.branch ? '　（ここで世界が分かれうる）' : ''}`,
    n.body?.trim() ? indent(n.body.trim()) : ''].filter(Boolean).join('\n')), '');

  // 付箋（時系列にないもの）
  const rest = of('note').filter(n => !n.when);
  if (rest.length) out.push('## 付箋', '', ...rest.map(n => card(nm(n.id), [n.parents.filter(p => w.notes[p]).length ? `- まとめ（中に入っている先）：${names(n.parents)}` : '', tags(n), memo(n)])));

  // タグ：説明と、付いているカード
  const tl = tagList(w);
  if (tl.length) out.push('## タグ', '', ...tl.map(t => `- #${t.tag}（${t.count}枚）${t.memo ? `：${t.memo.replace(/\n+/g, ' ')}` : ''}\n  - 付いているカード：${names(notes.filter(n => n.tags?.includes(t.tag)).sort(byTitle).map(n => n.id))}`), '');

  // つながり（家族・所属・持ち物のほかの線）
  const free = links.filter(l => (l.kind === 'link' || l.kind === 'order') && w.notes[l.a] && w.notes[l.b]);
  if (free.length) out.push('## つながり', '', ...free.map(l => `- ${nm(l.a)} ${l.kind === 'order' ? '→（この後に起きる）' : l.arrow === 'end' ? '→' : '—'} ${nm(l.b)}${l.label ? `「${l.label}」` : ''}`), '');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
