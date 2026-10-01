// 時系列マップ（試作品 第7版の仕組みを、そのまま本体に持ってきたもの）。
// データはアプリの世界（付箋の「時系列」・主体の道筋・世界線）から host.load() で受け取り、変更は host.commit() で書き戻す。
// 中の決まり（長さ・配置・視点の切り替え・ループ・分身・分岐点）は試作品と同じ。設計メモ §4・§10 を参照
export const LEGEND_HTML = `<details class="legend-wrap" id="tm-legend" open><summary>凡例</summary><footer class="legend">
  <span><svg width="34" height="10"><line x1="3" y1="5" x2="31" y2="5" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>主体が体験した順につないだ線</span>
  <span><svg width="34" height="14"><path d="M2 3 H10 L20 12 H32" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>分かれた世界線・主体が通らなかった残り（斜めに分かれて、斜めに合流）</span>
  <span><svg width="34" height="10"><line x1="3" y1="5" x2="31" y2="5" stroke="currentColor" stroke-width="6" stroke-dasharray="7 6"/></svg>自分が重なる時間（同じ時間にもう一人の自分）</span>
  <span><svg width="14" height="12"><rect x="3" y="2" width="8" height="8" transform="rotate(45 7 6)" fill="none" stroke="currentColor" stroke-width="2"/></svg>主体の移り方（タイムトラベル・移動）</span>
  <span><svg width="22" height="14"><path d="M2 3 H20 M11 3 a5 5 0 1 0 .01 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>ループ（分かれて何周もくり返す世界線。通る主体を選ぶと周回ごとにほどけ、○で折り返す）</span>
  <span><svg width="16" height="14"><path d="M3 7 l9 -5 M3 7 l9 5" fill="none" stroke="var(--accent)" stroke-width="1.8"/></svg>分岐点の出来事（ここで世界が分かれうる）</span>
  <span><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="var(--accent)" stroke-width="1.5" stroke-opacity=".6"/></svg>いま焦点を当てている線</span>
  <span>線の長さ＝付箋の数 ＋ 重要な出来事の間の時間の桁。「≈」は目に見える印から次の印までの時間、「≈30年前へ」は跳んだ時間</span>
</footer></details>
`;

export function createTimeMap(root, host) {
// ===== 暦 =====
// 日時は「日の通し番号（ユリウス通日）＋日の中の割合」で持つ。整数部が暦日、小数部が時刻
const J2000 = 2451545, YEAR = 365.2425, GREG_START = 2299161; // GREG_START = 1582年10月15日
const fdiv = (a, b) => Math.floor(a / b);
function jdnGreg(y, m, d) {
  const a = fdiv(14 - m, 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - fdiv(yy, 100) + fdiv(yy, 400) - 32045;
}
function jdnJul(y, m, d) {
  const a = fdiv(14 - m, 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - 32083;
}
// 西暦：1582年10月15日以降はグレゴリオ暦、それより前はユリウス暦。y は天文式（紀元前1年 = 0）
function W(y, m = 1, d = 1, h = 0, mi = 0) {
  const g = jdnGreg(y, m, d);
  return (g >= GREG_START ? g : jdnJul(y, m, d)) + (h * 60 + mi) / 1440;
}
const ago = years => J2000 - years * YEAR;
function ymd(J) {
  const greg = J >= GREG_START;
  let shift = 0;
  if (J < 0) { const k = Math.ceil(-J / 1461); J += k * 1461; shift = 4 * k; } // ユリウス暦は4年で1461日
  let f = J + 1401;
  if (greg) f += fdiv(fdiv(4 * J + 274277, 146097) * 3, 4) - 38;
  const e = 4 * f + 3, g = fdiv(e % 1461, 4), h = 5 * g + 2;
  const M = (fdiv(h, 153) + 2) % 12 + 1;
  return [fdiv(e, 1461) - 4716 + fdiv(14 - M, 12) - shift, M, fdiv(h % 153, 5) + 1];
}
const sig = (v, n = 3) => +v.toPrecision(n);
function fmtAgo(y) {
  if (y >= 1e8) return `約${sig(y / 1e8)}億年前`;
  if (y >= 1e4) return `約${sig(y / 1e4)}万年前`;
  return `約${Math.round(y)}年前`;
}
function hm(t) { const m = Math.floor((t - Math.floor(t)) * 1440 + 1e-6); return ` ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; }
function fmtWest(t, name, prec) {
  const pre = name ? name + ' ' : '';
  const yearsAgo = (J2000 - t) / YEAR;
  if (yearsAgo > 12000) return pre + fmtAgo(yearsAgo);
  const n = Math.floor(t), [y, m, d] = ymd(n);
  const ys = y <= 0 ? `紀元前${1 - y}年` : `${y}年`;
  if (prec === 'year') return pre + ys;
  if (prec === 'month') return `${pre}${ys}${m}月`;
  const jul = n < GREG_START ? '（ユリウス暦）' : '';
  return `${pre}${ys}${m}月${d}日${prec === 'min' ? hm(t) : ''}${jul}`;
}
// 架空の暦（1年 = 12か月 × 30日）。月の名前は暦ごとに決められる
const DREAM_MONTHS = ['霧', '猫', '月獣', '翠玉', '黄昏', '星', '夜鬼', '琥珀', '銀鍵', '深淵', '夢見', '覚醒'];
const DR = (y, m = 1, d = 1) => (y - 1) * 360 + (m - 1) * 30 + (d - 1);
function fmtFict(t, prec, tr, withName = true) {
  const pre = withName ? tr.calName + ' ' : '';
  const n = Math.floor(t), y = fdiv(n, 360) + 1, r = n - (y - 1) * 360, m = fdiv(r, 30), d = r - m * 30 + 1;
  const mn = tr.months?.length === 12 ? `${tr.months[m]}の月` : `${m + 1}月`;
  if (prec === 'year') return `${pre}${y}年`;
  if (prec === 'month') return `${pre}${y}年 ${mn}`;
  return `${pre}${y}年 ${mn}${d}日${prec === 'min' ? hm(t) : ''}`;
}
function fmtDur(days, yearLen = YEAR) {
  const y = days / yearLen;
  if (y >= 1e8) return `${sig(y / 1e8)}億年`;
  if (y >= 1e4) return `${sig(y / 1e4)}万年`;
  if (y >= 1) return `${sig(y)}年`;
  if (days >= 1) return `${Math.round(days)}日`;
  const mins = Math.round(days * 1440);
  return mins >= 60 ? `${Math.floor(mins / 60)}時間${mins % 60 ? (mins % 60) + '分' : ''}` : `${mins}分`;
}
const precFor = span => span >= 100 * YEAR ? 'year' : span >= 2 * YEAR ? 'month' : span >= 3 ? 'day' : 'min';

// ===== 世界のデータ =====
// このプログラムは見せるだけ。世界のデータ（サンプル・作例の物語・自分で作った世界）はプログラムに書かず、ファイルやブラウザの保存から読み込む
// 世界線 { id, name, lane（本線より上は負・下は正）, color, cal（'west' 西暦系か 'fict' 架空の暦。calName・months）, from, to,
//   fork: [世界線, 日時, 何周目]（始まりでそこから分かれた）, merge: [世界線, 日時, 何周目]（終わりでそこに合流する）, loop: n（始まりから終わりまでを n 周くり返すループの世界線） }
//   分岐点・合流点は世界線の端と一緒に動く。何周目は、ループの世界線から分かれる・へ戻るときだけ
// 主体 { id, name, legs: [{ tr, a, b, ka, kb, jump }], origin }：区間を体験した順に並べる。ループの世界線の中で入る・出るときは ka / kb に何周目か。
//   jump：前の区間からの移り方（自動で決まり、名前・種類・パラドックスを書き足せる）。origin：分岐で現れた分身なら、分かれる前の本人の id
// 付箋 { tr, t, title, tags, group, branch（分岐点）, k（ループの k 周目だけの出来事）, per（周ごとの書き換え { 周: { title, tags } か null＝その周では起こらない }）}
let tracks = [], subjects = [], events = [], groups = {};

// ===== 時点 =====
const key = (tr, t) => tr + '|' + t;
const nodesIn = (tr, a, b) => nodeTimes[tr].filter(v => v >= a && v <= b);
// CLOCK：同じ時計の世界線は同じ値。CONNS：分岐・合流。JUMPS：主体の区間どうしの移り方。SYNC：「同じ瞬間」として結ばれた2点
let T = {}, nodeTimes = {}, IMPORTANT = new Set(), CLOCK = {}, CONNS = [], JUMPS = [], SYNC = [];
const OBJECTIVE = { id: null, name: '本線（客観）', legs: [], path: [] };
const JUMP_TYPES = { travel: ['タイムトラベル', 'タイムトラベル（過去や未来へ跳ぶ）'], move: ['移動', '移動（瞬間移動・世界線の出入り。同じ瞬間のまま）'] };
// 点 p＝[世界線, 日時, 何周目] が、その世界線・日時（・周）と同じか。周はどちらかが決まっていなければ問わない
const samePt = (p, tr, t, k) => !!p && p[0] === tr && p[1] === t && (!p[2] || !k || p[2] === k);
// ループの世界線なら、その周回の決まり
const loopOf = tr => T[tr]?.loop ? { id: tr, a: T[tr].from, b: T[tr].to, n: T[tr].loop } : null;
const loopsOn = tr => loopOf(tr) ? [loopOf(tr)] : [];
const kOf = (lp, k) => Math.min(lp.n, Math.max(1, Math.trunc(k) || 1));
// 区間1つを、ループの周回ごとに分けた破片の並びにする。k：何周目か（ループの外は0）。ret：この破片の前でループが始まりに戻った
//   ループの世界線の終わりまでいて出たなら、最後の周まで回ったことにする
function expandLeg(g, li) {
  const lp = loopOf(g.tr);
  if (!lp) return g.b > g.a ? [{ tr: g.tr, a: g.a, b: g.b, k: 0, lp: null, li, ret: false }] : [];
  const out = [];
  let t = g.a, k = kOf(lp, g.ka), ret = false;
  const kb = g.kb != null ? kOf(lp, g.kb) : g.b === lp.b ? lp.n : g.b > t ? k : Math.min(lp.n, k + 1);
  while (k < kb && out.length < 1e4) { out.push({ tr: g.tr, a: t, b: lp.b, k, lp, li, ret }); t = lp.a; k++; ret = true; }
  if (g.b > t) out.push({ tr: g.tr, a: t, b: g.b, k, lp, li, ret });
  return out;
}
// 主体の道筋を、体験した順の破片の並びにする。区間の切れ目で途切れていれば、そこが移動（jump）。
// 分身は、分かれる前の本人の人生（分岐点まで）を受け継ぐ（inh：受け継いだ破片、src：その持ち主）
function pathOf(sub, depth = 0) {
  const out = [], o = sub.origin && subjects.find(x => x.id === sub.origin), f = sub.legs[0] && T[sub.legs[0].tr]?.fork;
  if (o && o !== sub && f && depth < 8) {
    const op = pathOf(o, depth + 1), i = op.findIndex(q => q.tr === f[0] && q.a <= f[1] && f[1] <= q.b && (!f[2] || q.k === f[2]));
    if (i >= 0) for (const q of [...op.slice(0, i), { ...op[i], b: f[1] }]) out.push({ ...q, src: q.src || o.id, inh: true });
  }
  sub.legs.forEach((g, li) => {
    const es = expandLeg(g, li), p = out[out.length - 1], q = es[0];
    if (!q) return;
    const flows = p && p.tr === q.tr && p.b === q.a && (p.k === q.k || (!p.k && q.k === 1 && q.a === q.lp.a) || (!q.k && p.k === p.lp.n && p.b === p.lp.b));
    if (p && !flows) q.jump = true;
    out.push(...es);
  });
  return out;
}
// 移り方の自動判定：分岐・合流をたどる移動、または同じ時計で同じ瞬間なら「移動」、同じ時計で時間が違えば「タイムトラベル」。
// 時計を比べられない世界（夢など）への出入りは「移動」とみなす
function classify(A, B) {
  if (samePt(T[B.tr].fork, A.tr, A.b, A.k) && B.a === T[B.tr].from) return ['move', 'f|' + B.tr];
  if (samePt(T[A.tr].merge, B.tr, B.a, B.k) && A.b === T[A.tr].to) return ['move', 'm|' + A.tr];
  if (CLOCK[A.tr] === CLOCK[B.tr]) return [A.b === B.a && A.k === B.k ? 'move' : 'travel', null];
  return ['move', null];
}
// 跳んだ時間（同じ時計どうしのタイムトラベルだけ）。負なら過去へ
const jumpSpan = j => j.type === 'travel' && CLOCK[j.a.tr] === CLOCK[j.b.tr] ? j.b.t - j.a.t : null;
function jumpLabel(j) {
  if (j.meta.label) return j.meta.label;
  if (j.struct) return j.struct[0] === 'f' ? `${T[j.b.tr].name}へ` : `${T[j.b.tr].name}へ戻る`;
  if (j.type === 'move') return `${T[j.b.tr].name}へ移動`;
  const d = jumpSpan(j);
  return d == null ? 'タイムトラベル' : d < 0 || (d === 0 && j.b.k < j.a.k) ? '過去へ跳ぶ' : '未来へ跳ぶ';
}
const jumpDist = j => { const d = jumpSpan(j); return d ? `≈${fmtDur(Math.abs(d), T[j.a.tr].yearLen)}${d < 0 ? '前' : '後'}へ` : ''; };
// 世界線に表示のしかたを付け、時点・分岐・移り方を数え直す（編集のたびに呼ぶ）
function rebuild() {
  T = Object.fromEntries(tracks.map(t => [t.id, t]));
  for (const t of tracks) {
    t.fmt = (x, p) => host.fmt(t, x, p, true); t.short = (x, p) => host.fmt(t, x, p, false);
    if (t.cal === 'fict') t.yearLen = host.yearLen(t); else delete t.yearLen;
  }
  // 同じ時計：分岐・合流の両側の日時がそろっている、同じ種類の暦の世界線どうし（時の流れが違う異界のように、合流の日時がずれると別の時計）
  CLOCK = Object.fromEntries(tracks.map(t => [t.id, t.id]));
  for (let pass = 0; pass < tracks.length; pass++) for (const t of tracks) {
    const cs = [t.fork && [t.fork, t.from], t.merge && [t.merge, t.to]].filter(Boolean);
    if (cs.length && cs.every(([[u, ut], v]) => ut === v && T[u]?.cal === t.cal && (t.cal === 'west' || T[u].calId === t.calId))) CLOCK[t.id] = CLOCK[cs[0][0][0]];
  }
  CONNS = tracks.flatMap(t => [
    t.fork && T[t.fork[0]] && { id: 'f|' + t.id, tr: t.id, a: t.fork, b: [t.id, t.from], label: t.loop ? `${t.name}（ループ）が始まる` : `${t.name}が分かれる` },
    t.merge && T[t.merge[0]] && { id: 'm|' + t.id, tr: t.id, a: [t.id, t.to], b: t.merge, label: t.loop ? `${t.name}（ループ）が終わって戻る` : `${t.name}が合流する` },
  ].filter(Boolean));
  const s = Object.fromEntries(tracks.map(t => [t.id, new Set([t.from, t.to])]));
  for (const c of CONNS) { s[c.a[0]].add(c.a[1]); s[c.b[0]].add(c.b[1]); }
  for (const e of events) s[e.tr]?.add(e.t);
  for (const sub of subjects) Object.defineProperty(sub, 'path', { value: pathOf(sub), configurable: true, writable: true, enumerable: false });
  JUMPS = [];
  for (const sub of subjects) sub.path.forEach((q, i) => {
    s[q.tr].add(q.a); s[q.tr].add(q.b);
    if (!q.jump || q.inh) return;
    const A = sub.path[i - 1], meta = sub.legs[q.li].jump || {}, [auto, struct] = classify(A, q);
    const j = { id: `${sub.id}:${q.li}`, sub, li: q.li, a: { tr: A.tr, t: A.b, k: A.k }, b: { tr: q.tr, t: q.a, k: q.k }, type: meta.type || auto, auto, struct, paradox: !!meta.paradox, meta };
    j.label = jumpLabel(j);
    q.jump = j;
    JUMPS.push(j);
  });
  // 受け継いだ人生の中の移り方は、本人の移り方そのもの
  for (const sub of subjects) for (const q of sub.path) if (q.inh && q.jump) q.jump = JUMPS.find(j => j.sub.id === q.src && j.li === q.li) || null;
  nodeTimes = {};
  for (const id in s) nodeTimes[id] = [...s[id]].sort((a, b) => a - b);
  const pts = j => [[j.a.tr, j.a.t], [j.b.tr, j.b.t]];
  SYNC = [...CONNS.map(c => [c.a, c.b]), ...JUMPS.filter(j => j.type === 'move').map(pts)];
  // 重要な出来事：分岐・合流・移動の端（ループの世界線の端も含む）、主体の誕生、分岐点の出来事、シナリオ（まとめ）の最初と最後（世界線の端は offsets が区切りにする）
  IMPORTANT = new Set([...CONNS.map(c => [c.a, c.b]), ...JUMPS.map(pts)].flat().map(q => key(q[0], q[1])));
  for (const sub of subjects) { const q = sub.path.find(q => !q.inh); if (q) IMPORTANT.add(key(q.tr, q.a)); }
  for (const e of events) if (e.branch) IMPORTANT.add(key(e.tr, e.t));
  for (const g in groups) for (const tr of tracks) {
    const ts = events.filter(e => e.group === g && e.tr === tr.id).map(e => e.t);
    if (ts.length) { IMPORTANT.add(key(tr.id, Math.min(...ts))); IMPORTANT.add(key(tr.id, Math.max(...ts))); }
  }
  OBJECTIVE.legs = [{ tr: 'main', a: T.main.from, b: T.main.to }];
  OBJECTIVE.path = [{ tr: 'main', a: T.main.from, b: T.main.to, k: 0, li: 0 }];
}
// 分岐の瞬間に対になる出来事（分岐元の出来事と、分岐先で同じ瞬間に起きた別バージョン）
function versionsOf(e) {
  const out = [];
  for (const c of CONNS) {
    if (c.id[0] !== 'f') continue;
    const [p, q] = samePt(c.a, e.tr, e.t) ? [c.a, c.b] : samePt(c.b, e.tr, e.t) ? [c.b, c.a] : [];
    if (p) events.forEach((o, i) => { if (o !== e && samePt(q, o.tr, o.t)) out.push(i); });
  }
  return out;
}
// ある瞬間に、ある世界線で生きている主体（分岐・ループで影響を受けうる人）。受け継いだ人生は本人の方で数える
const aliveAt = (tr, t) => subjects.filter(s => s.path.some(q => !q.inh && q.tr === tr && q.a <= t && t < q.b));
// ループの周回ごとの付箋の見え方：k 周目に出るか、出るならその名前とタグ（1周目のコピー、またはその周だけの書き換え）
function evIn(e, k) {
  if (!k) return e.k ? null : e;
  if (e.k) return e.k === k ? e : null;
  const o = e.per?.[k];
  return o === null ? null : o ? { ...e, ...o, over: true } : e;
}

// ===== 状態 =====
let activeSub = OBJECTIVE;
const tagState = {};  // 0: 通常, 1: 除外, 2: これだけ
const hiddenTracks = new Set();
let query = '', onlySub = false;

// ===== 表示中の付箋（まとめをたたむと1枚になる） =====
function eventVisible(e) {
  if (hiddenTracks.has(e.tr)) return false;
  const only = Object.keys(tagState).filter(k => tagState[k] === 2);
  if (only.length && !e.tags.some(t => only.includes(t))) return false;
  if (e.tags.some(t => tagState[t] === 1)) return false;
  if (onlySub && activeSub.id && !activeSub.path.some(q => q.tr === e.tr && e.t >= q.a && e.t <= q.b)) return false;
  return true;
}
let cards = [], cardCount = {};
function refreshCards() {
  cards = [];
  const firstOf = {};
  events.forEach((e, i) => {
    if (!eventVisible(e)) return;
    if (e.group && groups[e.group]) {
      if (!(e.group in firstOf) || e.t < events[firstOf[e.group]].t) firstOf[e.group] = i;
      if (!groups[e.group].open) return;
    }
    cards.push({ k: 'c|' + i, e, title: e.title });
  });
  for (const sub of subjects) {
    const q = sub.path.find(q => !q.inh);
    if (!q) continue;
    const e = { tr: q.tr, t: q.a, title: `${sub.name} ${sub.origin ? '分かれて現れる' : '誕生'}`, tags: ['誕生'] };
    if (eventVisible(e)) cards.push({ k: 'b|' + sub.id, e, title: e.title, birth: true });
  }
  for (const gid in firstOf) {
    const g = groups[gid];
    cards.push({ k: 'g|' + gid, e: events[firstOf[gid]], title: `${g.open ? '▾' : '▸'} ${g.title}`, grp: true, open: g.open });
  }
  cardCount = {};
  for (const c of cards) if (!c.open) { const kk = key(c.e.tr, c.e.t); cardCount[kk] = (cardCount[kk] || 0) + 1; }
}

// ===== 長さ =====
// 重要な出来事（誕生・分岐・合流・出入り・時間移動・ループ・シナリオの端）から次の重要な出来事までを1区切りとし、
// 区切りの長さ = 最小の幅 + 区切りの中の付箋の数 + 区切りの時間の桁（1日を単位に、10倍になるごとに1）。
// ふつうの付箋は区切りを作らない。区切りの中では、時間の流れに比例した位置に置く
const G0 = 0.3, LANE = 100, RMAX = 60;
// すき間（分岐・合流・移り方の斜めの線や◆を置く、時間の流れないところ）の幅：もとの長さの4.5%（最小0.8）
const GAPF = .045, GAPMIN = .8;
const timeLen = days => G0 + Math.log10(1 + days);
function offsets(tr, a, b, curled) {
  const ns = nodesIn(tr, a, b), c = ns.map(t => cardCount[key(tr, t)] || 0), o = [0];
  let s0 = 0; // いまの区切りの始まり
  for (let i = 1; i < ns.length; i++) {
    let s1 = i; // この時点を含む区切りの終わり
    while (s1 < ns.length - 1 && !IMPORTANT.has(key(tr, ns[s1]))) s1++;
    const D = ns[s1] - ns[s0];
    o.push(o[i - 1] + (c[i - 1] + c[i]) / 2 + timeLen(D) * (ns[i] - ns[i - 1]) / D);
    if (i === s1) s0 = i;
  }
  return { nodes: ns.map((t, i) => ({ t, o: o[i] })), loops: ringsOf(tr, ns, o, curled) };
}
// ループの世界線を始まりから終わりまで見せる破片は、輪として描く（周回をほどく視点では輪にしない）。輪にしても横の長さは変えない
function ringsOf(tr, ts, xs, curled) {
  const lp = loopOf(tr), n = ts.length;
  if (!lp || !curled.has(tr) || ts[0] !== lp.a || ts[n - 1] !== lp.b || n < 2) return [];
  return [{ loop: lp, i0: 0, i1: n - 1, L: xs[n - 1] - xs[0], s: xs.map(v => v - xs[0]), curled: curled.has(tr) }];
}
// 区間 [a, b] を「すでに通った部分」と「初めての部分」に分ける
function splitCovered(ivs, a, b) {
  const cov = mergeIv(ivs.map(([p, q]) => [Math.max(p, a), Math.min(q, b)]).filter(([p, q]) => q > p));
  const out = []; let cur = a;
  for (const [p, q] of cov) { if (p > cur) out.push({ a: cur, b: p, dup: false }); out.push({ a: p, b: q, dup: true }); cur = q; }
  if (cur < b) out.push({ a: cur, b, dup: false });
  return out;
}
function mergeIv(ivs) {
  const s = [...ivs].sort((p, q) => p[0] - q[0]), out = [];
  for (const iv of s) { const last = out[out.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); }
  return out;
}

// ===== 配置 =====
// 本線（客観）の視点：すべての世界線を、同じ瞬間どうしがそろうように並べる。分岐と合流のあいだは、そのあいだに入るものがいちばん長い世界線に長さを合わせる。
// 主体の視点：世界線を切り分けて、主体が体験した順に中央の1本につなぐ。通らなかった部分は上下に退く。
// どちらも、分岐・合流・移り方の斜めの線と◆は「すき間」（時間の流れないところ）に置く。斜めの線の上では時間が進まない
function computeLayout(sub) { return sub.id ? subjectLayout(sub) : objectiveLayout(); }

function objectiveLayout() {
  const curled = new Set(tracks.filter(t => t.loop).map(t => t.id));
  const off = Object.fromEntries(tracks.map(t => [t.id, offsets(t.id, t.from, t.to, curled)]));
  const G = Math.max(GAPMIN, off.main.nodes[off.main.nodes.length - 1].o * GAPF);
  const ownO = (tr, t) => { const ns = off[tr].nodes; let i = 0; while (i < ns.length - 2 && ns[i + 1].t < t) i++; const A = ns[i], B = ns[i + 1] || A; return B.t === A.t ? A.o : A.o + (B.o - A.o) * (t - A.t) / (B.t - A.t); };
  // 1. 時点：同じ時計の世界線どうしは互いの時点を足してそろえる。子が分かれる・合流する時点には、すき間の後の時点（^）を足す
  const gapAt = Object.fromEntries(tracks.map(t => [t.id, new Set()]));
  for (const c of CONNS) { const [P, t] = c.id[0] === 'f' ? c.a : c.b; gapAt[P].add(t); }
  const nodes = {}, byT = {};
  for (const t of tracks) {
    const set = new Set(off[t.id].nodes.map(n => n.t));
    for (const u of tracks) if (u !== t && CLOCK[u.id] === CLOCK[t.id]) for (const n of off[u.id].nodes) if (n.t > t.from && n.t < t.to) set.add(n.t);
    nodes[t.id] = [...set].sort((a, b) => a - b).flatMap(v => gapAt[t.id].has(v) ? [{ t: v, id: `${t.id}|${v}` }, { t: v, gap: true, id: `${t.id}|${v}^` }] : [{ t: v, id: `${t.id}|${v}` }]);
    byT[t.id] = new Map(nodes[t.id].map(n => [n.t + (n.gap ? '^' : ''), n.id]));
  }
  // 2. 世界線に沿った長さ（すき間は G）と、「同じ位置」にする節点どうし
  const edges = [];
  for (const t of tracks) { const ns = nodes[t.id]; for (let i = 1; i < ns.length; i++) edges.push([ns[i - 1].id, ns[i].id, ns[i].gap ? G : ownO(t.id, ns[i].t) - ownO(t.id, ns[i - 1].t)]); }
  const par = {};
  const find = x => { while (par[x] && par[x] !== x) x = par[x]; return x; };
  const reach = (a, b) => {
    const adj = {};
    for (const [u, v] of edges) (adj[find(u)] ||= []).push(find(v));
    const seen = new Set([a]), st = [a];
    while (st.length) { const u = st.pop(); if (u === b) return true; for (const v of adj[u] || []) if (!seen.has(v)) { seen.add(v); st.push(v); } }
    return false;
  };
  // 矛盾する（前後が逆になる）ものは結ばない
  const same = (a, b) => { if (!a || !b) return; const ra = find(a), rb = find(b); if (ra !== rb && !reach(ra, rb) && !reach(rb, ra)) par[ra] = rb; };
  for (const c of tracks) {
    if (c.fork && byT[c.fork[0]]) same(byT[c.id].get(c.from + ''), byT[c.fork[0]].get(c.fork[1] + '^'));
    if (c.merge && byT[c.merge[0]]) same(byT[c.id].get(c.to + ''), byT[c.merge[0]].get(c.merge[1] + ''));
  }
  for (const u of tracks) for (const v of tracks) {
    if (u.id >= v.id || CLOCK[u.id] !== CLOCK[v.id]) continue;
    const forks = (c, P, t) => c.fork?.[0] === P.id && c.from === t;
    for (const n of nodes[u.id]) {
      if (!n.gap && (forks(u, v, n.t) || forks(v, u, n.t))) continue;
      same(n.id, byT[v.id].get(n.t + (n.gap ? '^' : '')));
    }
  }
  for (const j of JUMPS) if (j.type === 'move' && !j.struct) same(byT[j.a.tr]?.get(j.a.t + ''), byT[j.b.tr]?.get(j.b.t + ''));
  // 3. いちばん長い道のり（左から順に、前の節点＋長さのうち最大）
  const all = tracks.flatMap(t => nodes[t.id].map(n => n.id)), roots = [...new Set(all.map(find))];
  const adj = Object.fromEntries(roots.map(r => [r, []])), indeg = Object.fromEntries(roots.map(r => [r, 0])), X = Object.fromEntries(roots.map(r => [r, 0]));
  for (const [u, v, w] of edges) { const a = find(u), b = find(v); if (a !== b) { adj[a].push([b, w]); indeg[b]++; } }
  const q = roots.filter(r => !indeg[r]);
  while (q.length) { const u = q.pop(); for (const [v, w] of adj[u]) { X[v] = Math.max(X[v], X[u] + w); if (!--indeg[v]) q.push(v); } }
  const members = {};
  for (const id of all) members[find(id)] = (members[find(id)] || 0) + 1;
  // 4. ほかの世界線とそろえる節点のあいだは、自分の長さの割合で並べ直す。最初・最後の節点より外は自分の長さで
  const pieces = tracks.map(t => {
    const ns = nodes[t.id], o = [0];
    for (let i = 1; i < ns.length; i++) o.push(o[i - 1] + (ns[i].gap ? G : ownO(t.id, ns[i].t) - ownO(t.id, ns[i - 1].t)));
    const x = ns.map(n => X[find(n.id)]), anc = ns.map((n, i) => members[find(n.id)] > 1 ? i : -1).filter(i => i >= 0);
    if (anc.length) {
      for (let i = anc[0] - 1; i >= 0; i--) x[i] = x[anc[0]] - (o[anc[0]] - o[i]);
      for (let a = 0; a < anc.length - 1; a++) {
        const i = anc[a], j = anc[a + 1];
        for (let m = i + 1; m < j; m++) x[m] = x[i] + (x[j] - x[i]) * (o[j] > o[i] ? (o[m] - o[i]) / (o[j] - o[i]) : (m - i) / (j - i));
      }
      const l = anc[anc.length - 1];
      for (let i = l + 1; i < ns.length; i++) x[i] = x[l] + (o[i] - o[l]);
    } else for (let i = 0; i < ns.length; i++) x[i] = o[i];
    const p = { tr: t.id, a: t.from, b: t.to, center: t.id === 'main', whole: true, nodes: ns.map((n, i) => ({ t: n.t, x: x[i], gap: !!n.gap, y: 0 })), loops: ringsOf(t.id, ns.map(n => n.t), x, curled) };
    if (t.fork && gapAt[t.fork[0]]?.has(t.fork[1])) { p.fromPt = { gapSeg: `${t.fork[0]}|${t.fork[1]}^`, side: 's' }; p.fromC = 'f|' + t.id; }
    if (t.merge && gapAt[t.merge[0]]?.has(t.merge[1])) { p.toPt = { gapSeg: `${t.merge[0]}|${t.merge[1]}^`, side: 'e' }; p.toC = 'm|' + t.id; }
    return p;
  });
  const lane = pieces.filter(p => !p.center);
  laneRows(lane, new Set());
  return finish(OBJECTIVE, pieces, [], curled);
}

function subjectLayout(sub) {
  // 主体が通るループの世界線は周回ごとにほどく。それ以外は輪のまま
  const unrolled = new Set(sub.path.filter(q => q.k).map(q => q.tr));
  const curled = new Set(tracks.filter(t => t.loop && !unrolled.has(t.id)).map(t => t.id));
  const nat = sub.path.reduce((v, q) => { const ns = offsets(q.tr, q.a, q.b, curled).nodes; return v + ns[ns.length - 1].o; }, 0);
  const G = Math.max(GAPMIN, nat * GAPF);
  const pieces = [], cover = {}, coverTr = {};
  let x = 0, tau = 0;
  // 1. 中央の線：体験した順に並べる。移り方（◆）とループの折り返し（○）の所にはすき間。
  //    ループの周回はそれぞれ別の場所。同じ場所・同じ時間をもう一度通るのは「自分が重なる」時間（dup）
  sub.path.forEach((q, i) => {
    if (i && (q.jump || q.ret)) x += G;
    const place = q.k ? `${q.tr}@${q.k}` : q.tr;
    for (const s of splitCovered(cover[place] || [], q.a, q.b)) {
      const off = offsets(q.tr, s.a, s.b, curled);
      const nodes = off.nodes.map(({ t, o }) => ({ t, x: x + o, y: 0 }));
      x = nodes[nodes.length - 1].x;
      pieces.push({ tr: q.tr, a: s.a, b: s.b, k: q.k, center: true, dup: s.dup, pi: i, tau0: tau + (s.a - q.a), nodes, loops: off.loops });
    }
    (cover[place] ||= []).push([q.a, q.b]);
    (coverTr[q.tr] ||= []).push([q.a, q.b]);
    tau += q.b - q.a;
  });
  const centerAt = {};
  for (const p of pieces) if (!p.dup) for (const n of p.nodes) { centerAt[key(p.tr, n.t)] ??= n.x; if (p.k) centerAt[`${p.tr}|${n.t}@${p.k}`] ??= n.x; }
  const cAt = pt => pt && (pt[2] && centerAt[`${pt[0]}|${pt[1]}@${pt[2]}`] !== undefined ? centerAt[`${pt[0]}|${pt[1]}@${pt[2]}`] : centerAt[key(pt[0], pt[1])]);
  // 2. 通らなかった残り：両側の切れ目（または分岐点・合流点）のあいだに収め、切れ目から斜めに分かれて斜めに戻る
  const lane = [], cuts = [];
  for (const tr of tracks) {
    const cov = mergeIv(coverTr[tr.id] || []);
    if (!cov.length) continue;
    let prev = tr.from;
    const rest = [];
    for (const [ca, cb] of cov) { if (ca > prev) rest.push([prev, ca]); prev = Math.max(prev, cb); }
    if (prev < tr.to) rest.push([prev, tr.to]);
    for (const [a, b] of rest) {
      const off = offsets(tr.id, a, b, curled), L = off.nodes[off.nodes.length - 1].o;
      const lp = a !== tr.from ? [tr.id, a] : tr.fork && cAt(tr.fork) !== undefined ? tr.fork : null;
      const rp = b !== tr.to ? [tr.id, b] : tr.merge && cAt(tr.merge) !== undefined ? tr.merge : null;
      // すき間は、両側の切れ目のあいだに収まる大きさまで縮める（体験の順が時間の順と同じなら、必ず両側とも斜めの線になる）
      const L0 = lp ? cAt(lp) : null, R0 = rp ? cAt(rp) : null, g = L0 != null && R0 != null && R0 > L0 ? Math.min(G, (R0 - L0) / 3) : G;
      const lx = L0 != null ? L0 + g : null, rx = R0 != null ? R0 - g : null;
      const fits = lx != null && rx != null && rx > lx;
      const map = fits ? o => lx + (rx - lx) * o / (L || 1) : lx != null ? o => lx + o : rx != null ? o => rx - L + o : o => o;
      const p = { tr: tr.id, a, b, loops: off.loops, nodes: off.nodes.map(({ t, o }) => ({ t, x: map(o) })) };
      if (lp) { p.fromPt = lp; if (a === tr.from) p.fromC = 'f|' + tr.id; }
      if (rp && (fits || lx == null)) { p.toPt = rp; if (b === tr.to) p.toC = 'm|' + tr.id; }
      else if (rp && b !== tr.to) p.farTo = rp; // 体験の順が時間の順と違うときは、細い点線で結ぶ
      lane.push(p);
    }
  }
  // 3. 主体が一度も通らない世界線
  //   同じ時計の世界線は、相手の同じ日時の位置にそろえる。時計が違う世界線（時の流れが違う異界・夢など）は「同じ瞬間」の点を相手の位置に合わせ、そのあいだに収める。
  //   分かれる所・合流する所は、すき間 G の分だけ離して斜めの線を置く
  const placed = new Set(Object.keys(coverTr));
  // k：ループの世界線なら何周目の位置か（決まっていなければどの周でも）
  const xAtTime = (tr, t, k) => {
    for (const p of [...pieces.filter(q => !q.dup), ...lane]) {
      if (p.tr !== tr || t < p.a || t > p.b || (k && p.k && p.k !== k)) continue;
      const ns = p.nodes; let i = 0;
      while (i < ns.length - 2 && ns[i + 1].t < t) i++;
      const f = Math.min(1, Math.max(0, (t - ns[i].t) / ((ns[i + 1].t - ns[i].t) || 1)));
      return ns[i].x + (ns[i + 1].x - ns[i].x) * f;
    }
    return null;
  };
  for (let pass = 0; pass <= tracks.length; pass++) for (const tr of tracks) {
    if (placed.has(tr.id)) continue;
    const off = offsets(tr.id, tr.from, tr.to, curled), o = off.nodes.map(n => n.o), n = o.length, last = pass === tracks.length;
    let xs = null;
    const partner = [...placed].find(u => CLOCK[u] === CLOCK[tr.id]);
    if (partner) xs = off.nodes.map(v => xAtTime(partner, v.t));
    else {
      // 同じ瞬間の点を錨にする（左から右の順を崩す錨は使わない）
      const anchors = [];
      for (const [P, Q] of SYNC) {
        const [mine, other] = P[0] === tr.id ? [P, Q] : Q[0] === tr.id ? [Q, P] : [];
        if (!mine || !placed.has(other[0])) continue;
        const ax = xAtTime(other[0], other[1]), i = off.nodes.findIndex(v => v.t === mine[1]);
        if (ax != null && i >= 0) anchors.push({ i, x: ax + (i === 0 && tr.fork ? G : i === n - 1 && tr.merge ? -G : 0) });
      }
      anchors.sort((p, q) => p.i - q.i || p.x - q.x);
      const keep = [];
      for (const an of anchors) if (!keep.length || (an.i > keep[keep.length - 1].i && an.x > keep[keep.length - 1].x)) keep.push(an);
      if (keep.length) xs = o.map((v, i) => {
        if (i <= keep[0].i) return keep[0].x - (o[keep[0].i] - v);
        const lastA = keep[keep.length - 1];
        if (i >= lastA.i) return lastA.x + (v - o[lastA.i]);
        const k = keep.findIndex(an => an.i >= i), A = keep[k - 1], B = keep[k];
        return A.x + (B.x - A.x) * (v - o[A.i]) / (o[B.i] - o[A.i]);
      });
    }
    if (!xs || xs.every(v => v == null)) { if (!last) continue; xs = o.slice(); }
    // そろえられない時点は、自分の長さで前後から補う。左から右の順は必ず守る
    const k0 = xs.findIndex(v => v != null);
    for (let i = k0 - 1; i >= 0; i--) xs[i] = xs[i + 1] - (o[i + 1] - o[i]);
    for (let i = k0 + 1; i < n; i++) if (xs[i] == null || !(xs[i] > xs[i - 1])) xs[i] = xs[i - 1] + Math.max(o[i] - o[i - 1], 1e-3);
    // 分かれる・合流する所：すき間 G だけ離す（その線の時間はすき間の後から始まり、前で終わる）
    const fx = tr.fork ? xAtTime(...tr.fork) : null, mx = tr.merge ? xAtTime(...tr.merge) : null;
    const g = fx != null && mx != null && mx > fx ? Math.min(G, (mx - fx) / 3) : G; // 短い世界線でも両側に斜めの線が入るよう、すき間を縮める
    if (fx != null && mx != null && mx - g > fx + g) { const a0 = xs[0], a1 = xs[n - 1], A = fx + g, B = mx - g; for (let i = 0; i < n; i++) xs[i] = a1 > a0 ? A + (B - A) * (xs[i] - a0) / (a1 - a0) : A + (B - A) * i / Math.max(1, n - 1); }
    else if (fx != null) { xs[0] = fx + G; for (let i = 1; i < n; i++) if (!(xs[i] > xs[i - 1])) xs[i] = xs[i - 1] + 1e-3; }
    else if (mx != null) { xs[n - 1] = mx - G; for (let i = n - 2; i >= 0; i--) if (!(xs[i] < xs[i + 1])) xs[i] = xs[i + 1] - 1e-3; }
    const p = { tr: tr.id, a: tr.from, b: tr.to, whole: true, loops: ringsOf(tr.id, off.nodes.map(v => v.t), xs, curled), nodes: off.nodes.map((v, i) => ({ t: v.t, x: xs[i] })) };
    if (fx != null) { p.fromPt = tr.fork; p.fromC = 'f|' + tr.id; }
    if (mx != null) { p.toPt = tr.merge; p.toC = 'm|' + tr.id; }
    lane.push(p);
    placed.add(tr.id);
  }
  laneRows(lane, new Set(Object.keys(coverTr)));
  pieces.push(...lane);
  return finish(sub, pieces, cuts, curled);
}

// 段：「本線の上」の世界線は上、それ以外は下。主体が通った世界線の残りを中央の線のすぐ隣に。
// 横に重ならなければ、ほかの世界線と同じ段に入れる（分岐元より外側の段に置く）
function laneRows(lane, near) {
  let most = 0;
  const assign = (list, sign) => {
    const rows = [], rowOf = {};
    for (const tr of list) {
      const ps = lane.filter(p => p.tr === tr.id).sort((p, q) => p.nodes[0].x - q.nodes[0].x);
      const min = tr.fork && rowOf[tr.fork[0]] != null ? rowOf[tr.fork[0]] + 1 : 0;
      for (const p of ps) {
        const s = p.nodes[0].x, e = p.nodes[p.nodes.length - 1].x;
        let r = min;
        while (rows[r]?.some(([a, b]) => s < b + .6 && a < e + .6)) r++;
        (rows[r] ||= []).push([s, e]);
        rowOf[tr.id] = Math.max(rowOf[tr.id] ?? 0, r);
        p.y = sign * (r + 1);
      }
    }
    most += rows.length;
  };
  const nr = t => near.has(t.id) ? 0 : 1;
  assign(tracks.filter(t => t.lane < 0).sort((p, q) => nr(p) - nr(q) || q.lane - p.lane), -1);
  assign(tracks.filter(t => t.lane >= 0).sort((p, q) => nr(p) - nr(q) || p.lane - q.lane), 1);
  // 段が多いときは、画面の高さに収まるよう段の間を詰める（付箋が入る分は残す）
  const lanePx = Math.max(60, Math.min(LANE, ((svg.clientHeight || 600) - 170) / Math.max(1, most)));
  for (const p of lane) { p.y *= lanePx; for (const n of p.nodes) n.y = p.y; }
}

// 仕上げ：各時点の本来の位置、区切りの名前（アニメーションで同じものを追うため）、斜めの線・つなぎ目・点線の行き先
function finish(sub, pieces, _cuts, curled) {
  const where = {}, owner = {}, ownerK = {};
  pieces.forEach((p, pi) => {
    if (p.dup) return;
    p.nodes.forEach((n, ni) => {
      const k = key(p.tr, n.t);
      if (!where[k]) { where[k] = { x: n.x, y: n.y }; owner[k] = { pi, ni }; }
      if (p.k) ownerK[`${k}@${p.k}`] ??= { pi, ni };
    });
  });
  // 区切り（隣り合う時点どうし）とループの輪に、何回目の登場かを付けた名前。すき間の区切りは「^」
  const cnt = {};
  const nth = b => `${b}#${cnt[b] = (cnt[b] ?? -1) + 1}`;
  for (const p of pieces) {
    p.seg = p.nodes.slice(0, -1).map((n, j) => nth(`${p.tr}|${n.t}${p.nodes[j + 1].gap && p.nodes[j + 1].t === n.t ? '^' : ''}`));
    for (const lp of p.loops) lp.id = nth('L' + lp.loop.id);
  }
  const nodeRef = (pi, ni) => { const q = pieces[pi]; return ni > 0 ? [q.seg[ni - 1], 'e'] : [q.seg[0], 's']; };
  const refAt = (tr, t, k) => { const o = (k && ownerK[`${key(tr, t)}@${k}`]) || owner[key(tr, t)]; return o ? nodeRef(o.pi, o.ni) : null; };
  const ptRef = pt => pt.gapSeg ? [`${pt.gapSeg}#0`, pt.side] : refAt(pt[0], pt[1], pt[2]);
  const cuts = [];
  for (const p of pieces) {
    if (p.fromPt) p.from = ptRef(p.fromPt);
    if (p.toPt) p.to = ptRef(p.toPt);
    if (p.farTo) { const r = refAt(p.farTo[0], p.farTo[1]); if (r) cuts.push({ tr: p.tr, a: [p.seg[p.seg.length - 1], 'e'], b: r }); }
    if (!p.from) delete p.fromC;
    if (!p.to) delete p.toC;
  }
  // 重なった自分から、1回目の同じ時間へ
  const dupArcs = pieces.filter(p => p.dup).map(p => ({ tr: p.tr, a: [p.seg[0], 's'], b: [`${p.tr}|${p.a}#0`, 's'] }));
  // つなぎ目：◆ = 主体の移り方、○ = ループの折り返し
  const joints = [];
  sub.path.forEach((q, i) => {
    if (!i || !(q.jump || q.ret)) return;
    const pa = pieces.filter(p => p.center && p.pi === i - 1).pop(), pb = pieces.find(p => p.center && p.pi === i);
    if (pa && pb) joints.push({ i, id: q.jump ? q.jump.id : `L${q.lp.id}:${q.k}`, jump: q.jump || null, loop: q.jump ? null : q.lp, k: q.k, a: [pa.seg[pa.seg.length - 1], 'e'], b: [pb.seg[0], 's'] });
  });
  return { sub, pieces, where, owner, ownerK, curled, dupArcs, joints, cuts, nodeRef, refAt };
}

// ===== アニメーション =====
// どの視点からどの視点へ移るときも、同じ決まりで動く：
//   動く前の場面と動いた後の場面を、部品（区切り・輪・付箋・文字・斜めの線・◆など）ごとに名前で突き合わせる。
//   両方にある部品は、画面上の位置から位置へまっすぐ動く（線の太さや付箋の段も少しずつ変わる）。
//   片方にしかない部品は、同じ速さで薄れる・現れる（2回目以降の複製は、1回目の所から出てきて、1回目の所へ戻る）。
//   だから A→B の途中の絵と、B→A の同じだけ戻った途中の絵は同じになる
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = s => s <= 0 ? 0 : s >= 1 ? 1 : s < .5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
let cur = null, prog = 1, camTo = null, A = null, revealNext = null, lastScene = null;
let cam = { zoom: 20, panX: 0, panY: 0 };
const DURATION = 1500;
function fitCam(layout, all = false) {
  const W = svg.clientWidth || 800;
  let lo = Infinity, hi = -Infinity;
  for (const p of layout.pieces) if (all || p.center) for (const n of p.nodes) { lo = Math.min(lo, n.x); hi = Math.max(hi, n.x); }
  const pad = (hi - lo) * .06;
  lo -= pad; hi += pad;
  const zoom = (W - 60 - Math.min(160, W * .2)) / Math.max(1e-9, hi - lo); // 右端の付箋が切れないよう余白を取る
  // 縦：焦点の線を画面の縦の真ん中に置く。上下の段（と、その上の付箋）がはみ出すときだけ、はみ出さないようにずらす
  const H = svg.clientHeight || 600, ys = layout.pieces.map(p => p.nodes[0].y);
  const lo2 = -H / 2 - (Math.min(0, ...ys) - 130), hi2 = H / 2 - (Math.max(0, ...ys) + 40);
  const panY = lo2 <= hi2 ? Math.min(hi2, Math.max(lo2, 0)) : (lo2 + hi2) / 2;
  return { zoom, panX: 30 - lo * zoom, panY };
}
function setView(sub, refit = true) {
  finishAnim();
  // 動く前の場面：いま画面に出ている絵そのもの（編集で消えた世界線があっても、そのまま使える）
  const s0 = cur ? (lastScene?.lay === cur ? lastScene : buildScene(cur, cam)) : null;
  activeSub = sub;
  refreshCards();
  cur = computeLayout(sub);
  camTo = refit || !s0 ? fitCam(cur) : { ...cam };
  // 編集で中央の線が画面から外れた・細くなりすぎたら、映し直す
  if (!refit) {
    const Wd = svg.clientWidth || 800, xs = cur.pieces.filter(p => p.center).flatMap(p => p.nodes.map(n => n.x * camTo.zoom + camTo.panX));
    const lo = Math.max(0, Math.min(...xs)), hi = Math.min(Wd, Math.max(...xs));
    if (hi - lo < Wd * .25) camTo = fitCam(cur);
  }
  // 編集で足したものが画面の外なら、そこが真ん中に来るまで横に動かす
  const w = revealNext && cur.where[key(...revealNext)];
  revealNext = null;
  if (w) { const Wd = svg.clientWidth || 800, sx = w.x * camTo.zoom + camTo.panX; if (sx < 60 || sx > Wd - 60) camTo.panX = Wd / 2 - w.x * camTo.zoom; }
  A = s0 ? { s0, s1: buildScene(cur, camTo) } : null;
  if (!A) Object.assign(cam, camTo);
  const t0 = performance.now(), dur = reduced || !A ? 0 : DURATION;
  prog = dur ? 0 : 1;
  cancelAnimationFrame(setView.raf);
  const step = now => {
    prog = dur ? Math.min(1, (now - t0) / dur) : 1;
    if (prog >= 1) Object.assign(cam, camTo);
    render();
    if (prog < 1) setView.raf = requestAnimationFrame(step);
  };
  setView.raf = requestAnimationFrame(step);
  updateChips();
}
// 動いている途中に操作されたら、動きを終わらせてから操作を受け付ける
function finishAnim() { if (prog < 1) { cancelAnimationFrame(setView.raf); prog = 1; Object.assign(cam, camTo); render(); } }

// ===== 描画 =====
const svg = root.querySelector('#tm-map'), stage = root.querySelector('#tm-stage');
const tip = root.querySelector('#tm-tip');
const ctx2d = document.createElement('canvas').getContext('2d');
let uiFont = '12px sans-serif';
const textW = s => { ctx2d.font = uiFont; return ctx2d.measureText(s).width; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => Math.round(v * 10) / 10;
const P = q => `${f1(q[0])},${f1(q[1])}`;
let focusTrack = null; // カーソルを合わせた（タップした）世界線。その破片をすべて光らせる
let moreCards = []; // 重なりすぎて出せなかった付箋のまとまり（画面上の位置と名前）
const firstOf = id => id.slice(0, id.lastIndexOf('#')) + '#0';
const mix = (a, b, e) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
const lerp = (a, b, e) => a + (b - a) * e;
const trOfRef = ref => ref[0].slice(0, ref[0].indexOf('|'));
const ptText = (tr, t, k, prec = 'min') => `${T[tr].fmt(t, prec)}${k ? `（ループ${k}周目）` : ''}`;
// 目に見える印（付箋・分岐や移動の端・破片の端）のある時点
const isMark = (tr, t) => cardCount[key(tr, t)] > 0 || IMPORTANT.has(key(tr, t));

// ループの輪：P0 から P1 への線の真ん中に、輪をひとつ下げた形。k（1 = 輪、0 = まっすぐ）で輪の大きさが変わる。
// 割合 f（ループの1周の時間のうちの割合）の位置を返す。線の長さ（＝時間の長さ）は変えず、輪は目印として足す
function arcPoint(P0, P1, k, f) {
  const dx = P1[0] - P0[0], dy = P1[1] - P0[1], D = Math.hypot(dx, dy) || 1e-9, u = [dx / D, dy / D], n = [-u[1], u[0]];
  const r = Math.min(RMAX / 2, Math.max(10, D * .12)) * k, wf = 2 * Math.PI * r / (D + 2 * Math.PI * r), f1 = (1 - wf) / 2;
  if (r < 1e-3 || f <= f1 || f >= 1 - f1) { const g = f <= f1 ? f / (1 - wf) : (f - wf) / (1 - wf); return [P0[0] + dx * g, P0[1] + dy * g]; }
  const th = 2 * Math.PI * (f - f1) / wf, M = [P0[0] + dx / 2, P0[1] + dy / 2];
  return [M[0] + r * (Math.sin(th) * u[0] + (1 - Math.cos(th)) * n[0]), M[1] + r * (Math.sin(th) * u[1] + (1 - Math.cos(th)) * n[1])];
}
// 形（区切りと輪）の上の点：{ seg, side } は区切りの始まりか終わり、{ ring, f } は輪の上の割合 f の所
function resolve(ref, G) {
  if (!ref) return null;
  const onRing = (id, f) => { const r = G.rings[id]; return r ? arcPoint(r.P0, r.P1, r.k, f) : null; };
  if (ref.ring) return onRing(ref.ring, ref.f);
  const s = G.segs[ref.seg];
  if (!s) return null;
  // 輪の中の区切りなら、輪の上の位置（rw：輪がほどける・巻かれる途中は、まっすぐな位置とのあいだ）
  const q = s[ref.side === 'e' ? 'e' : 's'], rp = s.ring && s.rf && onRing(s.ring, s.rf[ref.side === 'e' ? 1 : 0]);
  return rp ? (s.rw >= 1 ? rp : mix(q, rp, s.rw)) : q;
}
const R = a => a && { seg: a[0], side: a[1] };
// その配置で、斜めの線やつなぎ目（◆）として描かれている分岐・合流・移動
function represented(lay) {
  const s = new Set();
  for (const p of lay.pieces) { if (p.fromC) s.add(p.fromC); if (p.toC) s.add(p.toC); }
  for (const j of lay.joints) if (j.jump) { s.add(j.jump.id); if (j.jump.struct) s.add(j.jump.struct); }
  return s;
}
// 付箋を置く所：本来の位置に1枚。重なった自分の時間には薄い複製。
// ループの世界線の付箋は、周回ごとに置く（2周目以降は1周目のコピーを薄く。その周だけ書き換えたものは濃く）
function cardPlaces(lay, c) {
  const e = c.e, out = [];
  // tag：視点が変わっても同じ付箋を追うための名前（h＝本来の位置・1周目、k2…＝その周、d1…＝重なった自分の時間の複製）
  const seen = {}, tag = t => t + ((seen[t] = (seen[t] ?? -1) + 1) || '');
  if (T[e.tr]?.loop && !c.grp && !c.birth) {
    lay.pieces.forEach((p, pi) => {
      if (p.tr !== e.tr) return;
      const ni = p.nodes.findIndex(n => n.t === e.t && !n.gap), v = ni >= 0 && (p.k ? evIn(e, p.k) : e);
      if (v) out.push({ pi, ni, again: !!p.dup || (p.k > 1 && !v.over && !e.k), title: v.title, k: p.k, tag: tag(p.dup ? 'd' : p.k > 1 ? 'k' + p.k : 'h') });
    });
    return out;
  }
  const ow = lay.owner[key(e.tr, e.t)];
  if (!ow) return out;
  out.push({ pi: ow.pi, ni: ow.ni, again: false, title: c.title, tag: 'h' });
  if (c.grp) return out;
  const home = lay.pieces[ow.pi].nodes[ow.ni];
  lay.pieces.forEach((p, pi) => {
    if (pi === ow.pi || !(p.dup || p.k)) return;
    const ni = p.nodes.findIndex(n => n.t === e.t);
    if (ni >= 0 && !(p.nodes[ni].x === home.x && p.nodes[ni].y === home.y)) out.push({ pi, ni, again: true, title: c.title, tag: tag('d') });
  });
  return out;
}
// 付箋の段：ほかの付箋と重なるときは上に積む（4段まで。あふれたものは「＋N」にまとめる）。
// 別の高さの線の付箋とも重ならないよう、画面の上の四角どうしで確かめる。中央の線に近い付箋から先に置く
function assignRows(spots) {
  const rows = {}, placed = [];
  for (const s of [...spots].sort((a, b) => Math.abs(a.row) - Math.abs(b.row) || a.row - b.row || a.x - b.x || (a.c.grp ? -1 : 1))) {
    const left = s.x - 8, top = k => s.row - 38 - k * 25;
    let k = 0;
    while (k < 4 && placed.some(p => left < p.r + 6 && p.l < left + s.w + 6 && top(k) < p.b && p.t < top(k) + 20)) k++;
    if (k >= 4) { rows[s.id] = -1; continue; }
    placed.push({ l: left, r: left + s.w, t: top(k), b: top(k) + 20 });
    rows[s.id] = k;
  }
  return rows;
}

// 場面：ある配置を、あるカメラで見たときの部品。どの部品にも、視点が変わっても同じになる名前を付ける
function buildScene(lay, cm) {
  const H = svg.clientHeight || 600, Wd = svg.clientWidth || 800;
  const SX = x => x * cm.zoom + cm.panX, SY = y => y + H / 2 + cm.panY;
  const sc = { lay, cm, segs: {}, rings: {}, els: {}, hits: [], more: [] };
  const vis = lay.pieces.map(p => !!T[p.tr] && !hiddenTracks.has(p.tr));
  const hid = ref => !ref || hiddenTracks.has(trOfRef(ref)) || !T[trOfRef(ref)];
  // 形：区切り（隣り合う時点どうし）と、ループの輪
  lay.pieces.forEach((p, pi) => {
    if (!vis[pi]) return;
    const w = p.center ? 7 : 3, rings = p.loops, ringAt = j => rings.find(r => j >= r.i0 && j < r.i1);
    for (let j = 0; j < p.nodes.length - 1; j++)
      sc.segs[p.seg[j]] = { s: [SX(p.nodes[j].x), SY(p.nodes[j].y)], e: [SX(p.nodes[j + 1].x), SY(p.nodes[j + 1].y)], tr: p.tr, w, dash: p.dup ? 1 : 0, ring: ringAt(j)?.id || null };
    for (const r of rings) {
      // P0・P1：輪の両端（視点によって輪の中の時点の数が違っても、両端は同じ所を指す）
      const P0 = sc.segs[p.seg[r.i0]].s, P1 = sc.segs[p.seg[r.i1 - 1]].e, at = j => arcPoint(P0, P1, r.curled ? 1 : 0, r.s[j - r.i0] / (r.L || 1e-9));
      sc.rings[r.id] = { a: p.seg[r.i0], b: p.seg[r.i1 - 1], P0, P1, k: r.curled ? 1 : 0, tr: p.tr, w, dash: p.dup ? 1 : 0 };
      // 輪の中の区切りが実際に描かれている位置（輪から出てくる・輪へ戻る部品のため）
      for (let j = r.i0; j < r.i1; j++) Object.assign(sc.segs[p.seg[j]], { rs: at(j), re: at(j + 1), rf: [r.s[j - r.i0] / (r.L || 1e-9), r.s[j + 1 - r.i0] / (r.L || 1e-9)], rw: 1 });
    }
  });
  const pos = ref => resolve(ref, sc);
  const nref = (p, j) => { const r = p.loops.find(r => j > r.i0 && j < r.i1); return r ? { ring: r.id, f: r.s[j - r.i0] / (r.L || 1e-9) } : j < p.nodes.length - 1 ? { seg: p.seg[j], side: 's' } : { seg: p.seg[j - 1], side: 'e' }; };
  const bref = (p, j) => { const r = p.loops.find(r => j > r.i0 && j < r.i1); return r ? { seg: p.seg[r.i0], side: 's' } : nref(p, j); };
  const lref = (tr, t) => R(lay.refAt(tr, t));
  // 線の名前と「≈」（目に見える印から次の印までの時間。文字が入るときだけ）
  const labelEnds = {};
  lay.pieces.forEach((p, pi) => {
    if (!vis[pi]) return;
    const tr = T[p.tr], n = p.nodes.length, x1 = SX(p.nodes[0].x), x2 = SX(p.nodes[n - 1].x), pr = precFor(p.b - p.a), id = `${p.tr}|${p.a}|${p.b}|${p.k || 0}|${p.dup ? 1 : 0}`;
    const name = `${p.dup ? '重なり・' : ''}${p.k ? `${p.k}周目・` : ''}${tr.loop ? '↻' : ''}${tr.name} ${tr.short(p.a, pr)}〜${tr.short(p.b, pr)}（${fmtDur(p.b - p.a, tr.yearLen)}）`;
    const lx = Math.max(x1, 6), lw = textW(name) * .92, row = p.nodes[0].y;
    if ((x2 - x1 > lw + 8 || !p.center) && x2 > 40 && x1 < Wd && lx > (labelEnds[row] ?? -Infinity) + 10) {
      labelEnds[row] = lx + lw;
      sc.els[`pl|${id}`] = { kind: 'plabel', ref: nref(p, 0), dy: p.center ? 22 : 18, text: name, color: tr.color };
    }
    const curledRing = j => p.loops.some(r => r.curled && j >= r.i0 && j < r.i1);
    let m0 = 0;
    for (let i = 1; i < n; i++) {
      if (i < n - 1 && !isMark(p.tr, p.nodes[i].t)) continue;
      const txt = `≈${fmtDur(p.nodes[i].t - p.nodes[m0].t, tr.yearLen)}`, gx1 = SX(p.nodes[m0].x), gx2 = SX(p.nodes[i].x);
      let inRing = false;
      for (let j = m0; j < i; j++) if (curledRing(j)) inRing = true;
      if (!inRing && p.nodes[i].t > p.nodes[m0].t && gx2 - gx1 > textW(txt) * .85 + 12)
        sc.els[`gl|${id}|${p.nodes[m0].t}|${p.nodes[i].t}`] = { kind: 'glabel', r1: nref(p, m0), r2: nref(p, i), base: bref(p, m0), dy: p.center ? 36 : 32, text: txt };
      m0 = i;
    }
  });
  // 斜めの線（分岐・合流・切れ目。すき間をまたぐだけで、時間は進まない）
  lay.pieces.forEach((p, pi) => {
    if (!vis[pi]) return;
    if (p.from && !hid(p.from)) sc.els[`dg|<${p.seg[0]}`] = { kind: 'diag', a: R(p.from), b: nref(p, 0), tr: p.tr };
    if (p.to && !hid(p.to)) sc.els[`dg|>${p.seg[p.seg.length - 1]}`] = { kind: 'diag', a: nref(p, p.nodes.length - 1), b: R(p.to), tr: p.tr };
  });
  // 細い点線：遠い切れ目、重なった自分から1回目の同じ時間へ
  for (const c of lay.cuts) if (!hid(c.a) && !hid(c.b)) sc.els[`ct|${c.a.join()}|${c.b.join()}`] = { kind: 'cut', a: R(c.a), b: R(c.b), tr: c.tr };
  for (const c of lay.dupArcs) if (!hid(c.a) && !hid(c.b)) sc.els[`du|${c.a.join()}|${c.b.join()}`] = { kind: 'dup', a: R(c.a), b: R(c.b), tr: c.tr };
  // 跳んだ時間の文字は、ほかの文字と重ならない高さを探す（見つからなければ出さない。カーソルを合わせると出る）
  const boxes = [];
  const slot = (txt, at, dys) => { if (!at) return null; const w = textW(txt) * .85 + 6; const dy = dys.find(dy => !boxes.some(b => Math.abs(b.x - at[0]) < (b.w + w) / 2 && Math.abs(b.y - (at[1] + dy)) < 12)); if (dy == null) return null; boxes.push({ x: at[0], y: at[1] + dy, w }); return dy; };
  // つなぎ目（◆ = 移り方、○ = ループの折り返し）
  for (const j of lay.joints) {
    if (hid(j.a) || hid(j.b)) continue;
    sc.els[`jt|${j.id}`] = { kind: 'joint', a: R(j.a), b: R(j.b), loop: !!j.loop, par: !!j.jump?.paradox, hit: `j|${j.i}` };
    const txt = j.jump ? (T[j.jump.a.tr] && T[j.jump.b.tr] ? jumpDist(j.jump) : '') : `${j.k}周目へ`, pa = pos(R(j.a)), pb = pos(R(j.b));
    const dy = txt && pa && pb && slot(txt, mix(pa, pb, .5), j.loop ? [-10, 50, 62] : [50, 62, 74]);
    if (dy != null && txt) sc.els[`jl|${j.id}`] = { kind: 'jlabel', a: R(j.a), b: R(j.b), dy, text: txt, par: !!j.jump?.paradox };
  }
  // 斜めの線やつなぎ目で表せていない分岐・合流・移動は、点線で結ぶ
  const rep = represented(lay);
  const lines = [
    ...CONNS.map(c => ({ id: c.id, a: c.a, b: c.b, conn: true, color: T[c.tr].color, k: 's|' + c.id })),
    ...JUMPS.filter(j => !j.struct).map(j => ({ id: j.id, a: [j.a.tr, j.a.t], b: [j.b.tr, j.b.t], par: j.paradox, k: 'x|' + j.id, dist: T[j.a.tr] && T[j.b.tr] ? jumpDist(j) : '' })),
  ];
  for (const l of lines) {
    if (rep.has(l.id) || !T[l.a[0]] || !T[l.b[0]] || hiddenTracks.has(l.a[0]) || hiddenTracks.has(l.b[0])) continue;
    const a = lref(l.a[0], l.a[1]), b = lref(l.b[0], l.b[1]);
    if (!a || !b || !pos(a) || !pos(b)) continue;
    sc.els[`lk|${l.id}`] = { kind: 'link', a, b, conn: !!l.conn, color: l.color, par: !!l.par, hit: l.k };
    const pa = pos(a), pb = pos(b), dy = l.dist && slot(l.dist, curveMid(pa[0], pa[1], pb[0], pb[1]), [14, 26, 38, 2]);
    if (dy != null && l.dist) sc.els[`ll|${l.id}`] = { kind: 'llabel', a, b, dy, text: l.dist, par: !!l.par };
  }
  // 付箋
  const q = query.trim().toLowerCase(), spots = [];
  for (const c of cards) for (const pl of cardPlaces(lay, c)) {
    if (!vis[pl.pi]) continue;
    const p = lay.pieces[pl.pi], ref = nref(p, pl.ni), at = pos(ref);
    if (!at) continue;
    const idx = c.k.startsWith('c|') ? c.k.slice(2) : null;
    spots.push({ id: `cd|${c.k}|${pl.tag}`, c, ref, base: bref(p, pl.ni), x: at[0], row: p.nodes[pl.ni].y, again: pl.again, title: pl.title, w: textW(pl.title) + 18 + (c.e.branch ? 10 : 0),
      dk: idx != null && pl.k ? `c|${idx}|${pl.k}` : c.k });
  }
  const rows = assignRows(spots);
  for (const s of spots) {
    const r = rows[s.id];
    if (r == null) continue;
    if (r < 0) { const g = sc.more[sc.more.length - 1]; if (g && g.row === s.row && s.x - g.x < 60) g.titles.push(s.title); else sc.more.push({ x: s.x, row: s.row, ref: s.ref, base: s.base, titles: [s.title] }); continue; }
    const match = q && (s.title.toLowerCase().includes(q) || s.c.e.tags.some(t => t.toLowerCase().includes(q)));
    const cls = `card${s.c.grp ? ' grp' : ''}${s.again ? ' again' : ''}${s.c.e.branch ? ' bp' : ''}${q ? (match ? ' hl' : ' dim') : ''}${focusTrack && focusTrack !== s.c.e.tr ? ' dim' : ''}`;
    sc.els[s.id] = { kind: 'card', ref: s.ref, base: s.base, row: r, title: s.title, cls, color: s.c.grp ? null : T[s.c.e.tr].color, w: s.w, dk: s.dk, bp: !!s.c.e.branch };
  }
  sc.more.forEach((g, i) => { sc.els[`mo|${i}`] = { kind: 'more', ref: g.ref, base: g.base, text: `＋${g.titles.length}`, i }; });
  // いまの視点（画面の左上）
  sc.els[`hd|${lay.sub.id}`] = { kind: 'head', text: lay.sub.id ? `視点：${lay.sub.name}${Wd < 560 ? '' : '（体験した順に並べています）'}` : '視点：本線（客観）' };
  // 線の当たり判定（止まっているときだけ使う）
  lay.pieces.forEach((p, pi) => {
    if (!vis[pi]) return;
    const pts = [];
    for (let j = 0; j < p.nodes.length - 1; j++) {
      const r = p.loops.find(r => r.i0 === j && r.curled);
      if (r) { const R = sc.rings[r.id]; for (let m = 0; m <= 48; m++) pts.push(arcPoint(R.P0, R.P1, 1, m / 48)); j = r.i1 - 1; continue; }
      pts.push(sc.segs[p.seg[j]].s, sc.segs[p.seg[j]].e);
    }
    sc.hits.push({ k: `p|${pi}`, d: 'M' + pts.map(P).join(' L') });
  });
  return sc;
}

// 2つの場面を e（0〜1）の割合で混ぜて描く。s0 がなければ s1 をそのまま描く
function draw(s0, s1, e, anim) {
  const Wd = svg.clientWidth, H = svg.clientHeight;
  const tone = tr => T[tr] ? `t-c${T[tr].color}` : '';
  const hi = tr => focusTrack ? (focusTrack === tr ? 2 : 0) : 0, fade = tr => focusTrack && focusTrack !== tr ? .22 : 1;
  const sty = (op, extra = '') => `${extra}${op < .995 ? `opacity:${f1(op * 100) / 100};` : ''}`;
  // 形を混ぜる
  const G = { segs: {}, rings: {} };
  // 片方の場面にしかない区切りは、もう片方の場面の「1回目の同じ区切り」（輪の中なら輪の上の位置）から出てきて、そこへ戻る。
  // すき間の区切り（^）は、すき間の後ろの区切りの始まりへ縮む
  const ghost = (id, S, own) => {
    const f = S?.segs[firstOf(id)];
    if (f) return { s: f.rs || f.s, e: f.re || f.e };
    const n = S?.segs[id.replace('^', '')];
    return n ? { s: n.rs || n.s, e: n.rs || n.s } : own;
  };
  const ids = [...new Set([...Object.keys(s1.segs), ...Object.keys(s0?.segs || {})])].sort();
  for (const id of ids) {
    const a = s0?.segs[id], b = s1.segs[id];
    if (a && b) G.segs[id] = { s: mix(a.s, b.s, e), e: mix(a.e, b.e, e), w: lerp(a.w, b.w, e), dash: e < .5 ? a.dash : b.dash, tr: b.tr, ring: a.ring || b.ring, op: 1,
      rf: a.rf && b.rf ? [lerp(a.rf[0], b.rf[0], e), lerp(a.rf[1], b.rf[1], e)] : a.rf || b.rf, rw: a.rf && b.rf ? 1 : a.rf ? 1 - e : b.rf ? e : 0 };
    else if (b) { const f = ghost(id, s0, b); G.segs[id] = { s: mix(f.s, b.s, e), e: mix(f.e, b.e, e), w: b.w, dash: b.dash, tr: b.tr, ring: b.ring, rf: b.rf, rw: 1, op: e }; }
    else { const t = ghost(id, s1, a); G.segs[id] = { s: mix(a.s, t.s, e), e: mix(a.e, t.e, e), w: a.w, dash: a.dash, tr: a.tr, ring: a.ring, rf: a.rf, rw: 1, op: 1 - e }; }
  }
  // 輪：両方の場面にあれば形を混ぜる。片方にしかなければ、もう片方の場面のまっすぐな線へほどける（線がなければ薄れる）
  const rids = [...new Set([...Object.keys(s1.rings), ...Object.keys(s0?.rings || {})])].sort();
  for (const id of rids) {
    const a = s0?.rings[id], b = s1.rings[id];
    if (a && b) { G.rings[id] = { ...b, P0: mix(a.P0, b.P0, e), P1: mix(a.P1, b.P1, e), k: lerp(a.k, b.k, e), w: lerp(a.w, b.w, e), dash: e < .5 ? a.dash : b.dash, op: 1 }; continue; }
    const r = a || b, O = a ? s1 : s0, p = O?.segs[r.a], q = O?.segs[r.b], f = a ? e : 1 - e; // f：0＝輪のある場面、1＝ない場面
    G.rings[id] = p && q ? { ...r, P0: mix(r.P0, p.s, f), P1: mix(r.P1, q.e, f), k: r.k * (1 - f), op: 1 } : { ...r, op: 1 - f };
    if (G.rings[id].k < 1e-6) delete G.rings[id]; // ほどけきった輪は、ただの線（区切りをそのまま描く）
  }
  let back = '', mid = '', front = '';
  // いま焦点を当てている線の高さに、左右を貫く横線
  const fy = H / 2 + lerp(s0 ? s0.cm.panY : s1.cm.panY, s1.cm.panY, e);
  back += `<line class="focus" x1="0" y1="${f1(fy)}" x2="${Wd}" y2="${f1(fy)}"/>`;
  // 動いている間は、動く前と動いた後の位置に薄い跡
  if (anim) for (const [sc, op] of [[s0, .35 * (1 - e)], [s1, .35 * e]]) for (const id of Object.keys(sc.segs).sort()) {
    const g = sc.segs[id];
    if (op > .01) back += `<path class="pc old ${tone(g.tr)}" style="${sty(op)}" d="M${P(g.s)} L${P(g.e)}"/>`;
  }
  // 線：区切りごと（輪の中の区切りは輪として）
  for (const id of ids) {
    const g = G.segs[id];
    if (g.ring && G.rings[g.ring] || g.op <= .005) continue;
    mid += `<path class="pc ${tone(g.tr)}${g.dash ? ' dup' : ''}" style="${sty(g.op * fade(g.tr), `stroke-width:${f1(g.w + hi(g.tr))};`)}" d="M${P(g.s)} L${P(g.e)}"/>`;
  }
  for (const id of rids) {
    const r = G.rings[id];
    if (!r || r.op <= .005) continue;
    let d = `M${P(r.P0)}`;
    for (let q = 1; q <= 64; q++) d += ` L${P(arcPoint(r.P0, r.P1, r.k, q / 64))}`;
    mid += `<path class="pc ${tone(r.tr)}${r.dash ? ' dup' : ''}" style="${sty(r.op * fade(r.tr), `stroke-width:${f1(r.w + hi(r.tr))};`)}" d="${d}"/>`;
  }
  // 部品：名前で突き合わせて、両方にあれば位置を混ぜ、片方にしかなければ薄れる・現れる
  const keys = [...new Set([...Object.keys(s1.els), ...Object.keys(s0?.els || {})])].sort();
  for (const k of keys) {
    const a = s0?.els[k], b = s1.els[k], op = a && b ? 1 : b ? e : 1 - e;
    if (op <= .005) continue;
    const el = a && b ? (e < .5 ? a : b) : (a || b);
    const at = f => { const pa = a && resolve(a[f], G), pb = b && resolve(b[f], G); return pa && pb ? mix(pa, pb, e) : pa || pb; };
    const num = f => a && b ? lerp(a[f], b[f], e) : el[f];
    const A0 = el.a !== undefined ? at('a') : null, B0 = el.b !== undefined ? at('b') : null;
    switch (el.kind) {
      case 'plabel': { const p = at('ref'); if (p) mid += `<text class="lbl tr" style="${sty(op, `fill:var(--c-c${el.color});`)}" x="${f1(Math.max(p[0], 6))}" y="${f1(p[1] + num('dy'))}">${esc(el.text)}</text>`; break; }
      case 'glabel': { const p1 = at('r1'), p2 = at('r2'), pb = at('base'); if (p1 && p2 && pb) mid += `<text class="gapl" style="${sty(op)}" x="${f1((p1[0] + p2[0]) / 2)}" y="${f1(pb[1] + num('dy'))}" text-anchor="middle">${esc(el.text)}</text>`; break; }
      case 'diag': if (A0 && B0) mid += `<path class="pc ${tone(el.tr)}" style="${sty(op * fade(el.tr), `stroke-width:${3 + hi(el.tr)};`)}" d="M${P(A0)} L${P(B0)}"/>`; break;
      case 'cut': if (A0 && B0) back += `<path class="cut ${tone(el.tr)}" style="${sty(op * fade(el.tr))}" d="${curvePath(A0[0], A0[1], B0[0], B0[1])}"/>`; break;
      case 'dup': if (A0 && B0) { const h = 40 + Math.min(70, Math.abs(A0[0] - B0[0]) * .15); back += `<path class="cut ${tone(el.tr)}" style="${sty(op * fade(el.tr))}" d="M${P(A0)} C${f1(A0[0])},${f1(A0[1] - h)} ${f1(B0[0])},${f1(Math.min(A0[1], B0[1]) - h)} ${P(B0)}"/>`; } break;
      case 'link': if (A0 && B0) { const d = curvePath(A0[0], A0[1], B0[0], B0[1]); back += `<path class="lk${el.conn ? ' conn' : ''}${el.par ? ' k-paradox' : ''}" style="${sty(op, el.conn ? `stroke:var(--c-c${el.color});` : '')}" d="${d}"/>` + (!anim ? `<path class="hit" data-k="${el.hit}" d="${d}"/>` : ''); } break;
      case 'llabel': if (A0 && B0) { const m = curveMid(A0[0], A0[1], B0[0], B0[1]); front += `<text class="jlbl${el.par ? ' k-paradox' : ''}" style="${sty(op)}" x="${f1(m[0])}" y="${f1(m[1] + num('dy'))}" text-anchor="middle">${esc(el.text)}</text>`; } break;
      case 'joint': if (A0 && B0) {
        const m = mix(A0, B0, .5);
        front += el.loop ? `<circle class="jt loopj" style="${sty(op)}" cx="${f1(m[0])}" cy="${f1(m[1])}" r="5"/>` : `<rect class="jt${el.par ? ' k-paradox' : ''}" style="${sty(op)}" x="${f1(m[0] - 6)}" y="${f1(m[1] - 6)}" width="12" height="12" transform="rotate(45 ${P(m)})"/>`;
        if (!anim) front += `<line class="hit" data-k="${el.hit}" x1="${f1(m[0] - 8)}" y1="${f1(m[1])}" x2="${f1(m[0] + 8)}" y2="${f1(m[1])}"/>`;
      } break;
      case 'jlabel': if (A0 && B0) { const m = mix(A0, B0, .5); front += `<text class="jlbl${el.par ? ' k-paradox' : ''}" style="${sty(op)}" x="${f1(m[0])}" y="${f1(m[1] + num('dy'))}" text-anchor="middle">${esc(el.text)}</text>`; } break;
      case 'card': {
        const p = at('ref'), pb = at('base');
        if (!p || !pb || p[0] < -300 || p[0] > Wd + 20) break;
        const left = p[0] - 8, top = pb[1] - 18 - num('row') * 25 - 20, w = num('w');
        front += `<g style="${sty(op)}"><line class="stem" x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(p[0])}" y2="${f1(top + 20)}"/>`;
        front += `<g class="${el.cls}" data-k="${el.dk}"><rect class="bg" x="${f1(left)}" y="${f1(top)}" width="${f1(w)}" height="20" rx="4"/>` +
          (el.color == null ? '' : `<rect class="f-c${el.color}" x="${f1(left)}" y="${f1(top)}" width="3" height="20" rx="1"/>`) +
          (el.bp ? `<path class="bpi" d="M${f1(left + 7)},${f1(top + 10)} l6,-5 M${f1(left + 7)},${f1(top + 10)} l6,5"/>` : '') +
          `<text x="${f1(left + (el.bp ? 18 : 10))}" y="${f1(top + 14)}">${esc(el.title)}</text></g></g>`;
        break;
      }
      case 'more': { const p = at('ref'), pb = at('base'); if (!p || !pb) break; const w = textW(el.text) + 12, top = pb[1] - 18 - 4 * 25 - 20; front += `<g class="more" style="${sty(op)}" data-k="m|${el.i}"><rect x="${f1(p[0] - 8)}" y="${f1(top)}" width="${f1(w)}" height="20" rx="10"/><text x="${f1(p[0] - 2)}" y="${f1(top + 14)}">${el.text}</text></g>`; break; }
      case 'head': front += `<text class="lbl head" style="${sty(op)}" x="14" y="24">${esc(el.text)}</text>`; break;
    }
  }
  // 止まっているときだけ、線の当たり判定
  if (!anim) for (const h of s1.hits) mid += `<path class="hit" data-k="${h.k}" d="${h.d}"/>`;
  // つなぐ途中：出発点から、カーソルまで点線を引く
  if (pick?.a) {
    const ax = pick.a.x * cam.zoom + cam.panX, ay = pick.a.y + H / 2 + cam.panY;
    if (pick.mouse) front += `<line class="pick" x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(pick.mouse[0])}" y2="${f1(pick.mouse[1])}"/>`;
    front += `<circle class="pickdot" cx="${f1(ax)}" cy="${f1(ay)}" r="5"/>`;
  }
  svg.innerHTML = back + mid + front;
}
function render() {
  if (!cur) return;
  if (prog < 1 && A) return draw(A.s0, A.s1, ease(prog), true);
  lastScene = buildScene(cur, cam);
  moreCards = lastScene.more;
  draw(null, lastScene, 1, false);
}
function curvePath(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 1) { const h = 26 + Math.min(80, Math.abs(x2 - x1) * .25); return `M${f1(x1)},${f1(y1)} C${f1(x1)},${f1(y1 + h)} ${f1(x2)},${f1(y1 + h)} ${f1(x2)},${f1(y2)}`; }
  const my = (y1 + y2) / 2;
  return `M${f1(x1)},${f1(y1)} C${f1(x1)},${f1(my)} ${f1(x2)},${f1(my)} ${f1(x2)},${f1(y2)}`;
}
// curvePath の真ん中の点
function curveMid(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 1) return [(x1 + x2) / 2, y1 + .75 * (26 + Math.min(80, Math.abs(x2 - x1) * .25))];
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

// ===== 日時の読み取り（カーソル・タップ） =====
function pieceTimeAt(p, X) {
  const ns = p.nodes;
  let i = 0; while (i < ns.length - 2 && ns[i + 1].x < X) i++;
  const f = Math.min(1, Math.max(0, (X - ns[i].x) / ((ns[i + 1]?.x - ns[i].x) || 1)));
  const a = ns[i].t, b = ns[i + 1]?.t ?? a;
  return { t: a + (b - a) * f, a, b };
}
const jumpHTML = j => `<b>${esc(j.label)}</b><div class="m">${esc(j.sub.name)}・${JUMP_TYPES[j.type][0]}${j.meta.type ? '' : '（自動）'}${j.paradox ? '・パラドックス' : ''}${jumpDist(j) ? '・' + esc(jumpDist(j)) : ''}</div>` +
  `<div class="d">${esc(ptText(j.a.tr, j.a.t, j.a.k))}</div><div class="d">→ ${esc(ptText(j.b.tr, j.b.t, j.b.k))}</div><div class="m">クリック（タップ）で主体の区間を編集</div>`;
function describe(k, px) {
  const parts = k.split('|');
  const X = (px - cam.panX) / cam.zoom;
  if (parts[0] === 'p') {
    const p = cur.pieces[+parts[1]], { t, a, b } = pieceTimeAt(p, X), tr = T[p.tr], ns = p.nodes;
    const role = !p.center ? `${esc(activeSub.name)}が通らなかった部分` : !activeSub.id ? '' :
      `${esc(activeSub.name)}の体感 ${fmtDur(p.tau0 + (t - p.a))}の時点${p.k ? `（ループ${p.k}周目）` : ''}${p.dup ? '<br>この時間には、もう一人の自分がいる（重なり）' : ''}`;
    // カーソルの前後の印（付箋・分岐や移動の端など）と、そのあいだの時間
    let i0 = 0, i1 = ns.length - 1;
    ns.forEach((n, i) => { if (n.t <= t && isMark(p.tr, n.t)) i0 = i; });
    for (let i = ns.length - 1; i >= 0; i--) if (ns[i].t >= t && isMark(p.tr, ns[i].t)) i1 = i;
    const pr = precFor(ns[i1].t - ns[i0].t);
    return `<b>${esc(tr.name)}</b><div class="d">${esc(tr.fmt(t, precFor(b - a)))}</div>` +
      `<div class="m">前後の印のあいだ：≈${fmtDur(ns[i1].t - ns[i0].t, tr.yearLen)}（${esc(tr.short(ns[i0].t, pr))}〜${esc(tr.short(ns[i1].t, pr))}）` +
      `<br>この破片：${esc(tr.short(p.a, precFor(p.b - p.a)))}〜${esc(tr.short(p.b, precFor(p.b - p.a)))}${role ? '<br>' + role : ''}</div>`;
  }
  if (parts[0] === 'j') {
    const j = cur.joints.find(z => z.i === +parts[1]);
    if (!j) return '';
    if (j.jump) return jumpHTML(j.jump);
    const L = T[j.loop.id];
    return `<b>${esc(L.name)}</b><div class="m">${j.k - 1}周目の終わり → ${j.k}周目の始まり（全${L.loop}周）</div>` +
      `<div class="d">${esc(ptText(L.id, L.to, j.k - 1))}</div><div class="d">→ ${esc(ptText(L.id, L.from, j.k))}</div><div class="m">クリック（タップ）でループを編集</div>`;
  }
  if (parts[0] === 'x') { const j = JUMPS.find(z => z.id === parts[1]); return j ? jumpHTML(j) : ''; }
  if (parts[0] === 's') {
    const c = CONNS.find(z => z.id === parts[1] + '|' + parts[2]);
    return c ? `<b>${esc(c.label)}</b><div class="d">${esc(ptText(...c.a))}</div><div class="d">→ ${esc(ptText(...c.b))}</div><div class="m">クリック（タップ）で世界線を編集</div>` : '';
  }
  if (parts[0] === 'c') {
    const e = events[+parts[1]], prec = e.t % 1 ? 'min' : 'day', vs = versionsOf(e), k = +parts[2] || 0, v = (k && evIn(e, k)) || e;
    const it = k ? `<br>ループ${k}周目${v.over ? '（この周だけ書き換え）' : e.k ? '（この周だけの出来事）' : k > 1 ? '（1周目のコピー）' : ''}` : '';
    return `<b>${esc(v.title)}</b><div class="d">${esc(T[e.tr].fmt(e.t, prec))}</div><div class="m">${esc(T[e.tr].name)}・タグ：${v.tags.map(esc).join('、')}${e.branch ? '<br>分岐点（ここで世界が分かれうる）' : ''}${it}` +
      vs.map(i => `<br>別バージョン：${esc(events[i].title)}（${esc(T[events[i].tr].name)}）`).join('') + '<br>クリックで編集、引っぱると延ばせます</div>';
  }
  if (parts[0] === 'b') {
    const sub = subjects.find(x => x.id === parts[1]), { tr, a: t } = sub.path.find(q => !q.inh);
    return `<b>${esc(sub.name)} ${sub.origin ? '分かれて現れる' : '誕生'}</b><div class="d">${esc(T[tr].fmt(t, t % 1 ? 'min' : 'day'))}</div><div class="m">${sub.origin ? '分岐で現れた分身' : '主体の誕生'}。クリック（タップ）で主体を編集</div>`;
  }
  if (parts[0] === 'm') {
    const g = moreCards[+parts[1]];
    return g ? `<b>重なって見えない付箋が${g.titles.length}枚</b><div class="m">${g.titles.map(esc).join('<br>')}<br>クリック（タップ）でこのあたりを拡大</div>` : '';
  }
  if (parts[0] === 'g') {
    const g = groups[parts[1]], n = events.filter(e => e.group === parts[1]).length;
    return `<b>${esc(g.title)}</b><div class="m">${n}件の出来事をまとめたもの。クリック（タップ）で${g.open ? 'たたむ' : 'ひらく'}</div>`;
  }
  return '';
}
function showTip(target, clientX, clientY) {
  const k = target && target.closest?.('[data-k]')?.dataset.k;
  if (!k) { tip.hidden = true; return; }
  const r = stage.getBoundingClientRect();
  tip.innerHTML = describe(k, clientX - r.left);
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = clientX - r.left + 14, y = clientY - r.top + 14;
  if (x + w > r.width - 8) x = clientX - r.left - w - 14;
  if (y + h > r.height - 8) y = clientY - r.top - h - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
function trackOf(target) {
  const k = target?.closest?.('[data-k]')?.dataset.k;
  return k?.startsWith('p|') ? cur.pieces[+k.split('|')[1]].tr : null;
}
function setFocus(tr) { if (focusTrack !== tr) { focusTrack = tr; render(); } }

// ===== 操作：ドラッグで移動、ホイール・ピンチ・ボタンで拡大縮小 =====
const pointers = new Map();
let dragMoved = 0, pinch = null;
function zoomAt(factor, sx) {
  finishAnim();
  const z = Math.min(1e5, Math.max(.2, cam.zoom * factor));
  cam.panX = sx - (sx - cam.panX) * (z / cam.zoom); cam.zoom = z; render();
}
// 付箋を引っぱる：そこから延ばす（何もない所で離すと分岐、別の点で離すと主体の移動・ループ・合流する分岐）
let ext = null;
svg.addEventListener('pointerdown', e => {
  e.preventDefault(); // ドラッグで文字が選択されないように
  hideMenu();
  finishAnim(); // 動いている途中に押したら、動き終えた位置で受け付ける（押した日時がずれないように）
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target });
  dragMoved = 0;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; ext = null; }
  const k = e.target.closest?.('[data-k]')?.dataset.k || '';
  if (pointers.size === 1 && !pick && /^[cb]\|/.test(k)) ext = { a: pointAt(e.target, e.clientX), sx: e.clientX, sy: e.clientY, on: false };
  svg.classList.add('drag');
});
svg.addEventListener('pointermove', e => {
  const p0 = pointers.get(e.pointerId);
  if (!p0) {
    if (e.pointerType === 'mouse') { showTip(e.target, e.clientX, e.clientY); setFocus(trackOf(e.target)); }
    if (pick?.a) { const r = stage.getBoundingClientRect(); pick.mouse = [e.clientX - r.left, e.clientY - r.top]; render(); }
    return;
  }
  if (ext && pointers.size === 1) {
    if (!ext.on && Math.hypot(e.clientX - ext.sx, e.clientY - ext.sy) > 6) { ext.on = true; finishAnim(); tip.hidden = true; pick = { a: ext.a, drag: true }; }
    if (ext.on) { const r = stage.getBoundingClientRect(); pick.mouse = [e.clientX - r.left, e.clientY - r.top]; dragMoved = 99; render(); }
    return;
  }
  const dx = e.clientX - p0.x, dy = e.clientY - p0.y;
  p0.x = e.clientX; p0.y = e.clientY;
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const rect = svg.getBoundingClientRect();
    zoomAt(d / (pinch.d || d), (a.x + b.x) / 2 - rect.left); pinch.d = d; return;
  }
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (dragMoved > 4) { finishAnim(); tip.hidden = true; cam.panX += dx; cam.panY += dy; render(); }
});
function endPointer(e) {
  const p0 = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) svg.classList.remove('drag');
  const x = ext; ext = null;
  if (x?.on) { endPick(); if (e.type === 'pointerup') dropExtend(x.a, e.clientX, e.clientY); return; }
  if (p0 && dragMoved <= 4 && e.type === 'pointerup') {
    const k = p0.target.closest?.('[data-k]')?.dataset.k || '', parts = k.split('|'), id = parts[1];
    if (pick) {
      const pt = pointAt(p0.target, e.clientX);
      if (!pt) return;
      if (!pick.a) { pick.a = pt; pickHint.textContent = '行き先をクリック（Escでやめる）'; render(); return; }
      const a = pick.a;
      endPick();
      return connectMenu(a, pt, e.clientX, e.clientY);
    }
    if (k.startsWith('b|')) return subjectForm(id);
    if (k.startsWith('g|')) { commit(() => { groups[id].open = !groups[id].open; }, groups[id].open ? 'まとめをたたむ' : 'まとめをひらく'); return; }
    if (k.startsWith('m|')) { const g = moreCards[+id]; if (g) zoomAt(2.5, g.x); return; }
    if (k.startsWith('c|')) return cardForm(+id, { k: +parts[2] || 0 });
    if (k.startsWith('x|')) { const j = JUMPS.find(z => z.id === id); return j && subjectForm(j.sub.id, { focus: j.li }); }
    if (k.startsWith('s|')) return trackForm(parts[2]);
    if (k.startsWith('j|')) { const j = cur.joints.find(z => z.i === +id); if (j?.jump) subjectForm(j.jump.sub.id, { focus: j.jump.li }); else if (j) loopForm(j.loop.id); return; }
    if (e.pointerType !== 'mouse') setFocus(trackOf(p0.target));
    if (k.startsWith('p|')) { tip.hidden = true; return openMenu(+id, e.clientX, e.clientY); }
    showTip(p0.target, e.clientX, e.clientY);
  }
}
// 引っぱって離した所：点の上なら「つなぐ」メニュー、何もない所なら、そこから分かれる世界線（離した高さで上か下か）
function dropExtend(a, cx, cy) {
  const el = document.elementFromPoint(cx, cy), b = el && svg.contains(el) ? pointAt(el, cx) : null;
  if (b) { if (b.tr !== a.tr || b.t !== a.t || b.k !== a.k) connectMenu(a, b, cx, cy); return; }
  const r = stage.getBoundingClientRect();
  trackForm(null, { fork: a.k ? [a.tr, a.t, a.k] : [a.tr, a.t], up: cy - r.top < a.y + svg.clientHeight / 2 + cam.panY, from: a.ev });
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pointers.size) { tip.hidden = true; setFocus(null); } });
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = svg.getBoundingClientRect();
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { finishAnim(); cam.panX -= e.deltaX; render(); return; }
  zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)), e.clientX - rect.left);
}, { passive: false });
root.querySelector('#tm-zin').onclick = () => zoomAt(1.6, svg.clientWidth / 2);
root.querySelector('#tm-zout').onclick = () => zoomAt(1 / 1.6, svg.clientWidth / 2);
root.querySelector('#tm-fit').onclick = () => { finishAnim(); Object.assign(cam, fitCam(cur, true)); render(); };
const onResize = () => { if (!cur) return; finishAnim(); Object.assign(cam, fitCam(cur)); render(); };
addEventListener('resize', onResize);

// ===== 設定パネル（編集のたびに作り直す） =====
const viewsEl = root.querySelector('#tm-views'), tagsEl = root.querySelector('#tm-tags');
const tracksEl = root.querySelector('#tm-tracks'), linkListEl = root.querySelector('#tm-linkList');
const chip = (text, onclick, title = '') => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = text; b.title = title; b.onclick = onclick; return b; };
function renderChips() {
  viewsEl.replaceChildren(...[OBJECTIVE, ...subjects].map(v => { const b = chip(v.name, () => { setView(v); egg(v); }); b.dataset.id = v.id ?? ''; return b; }));
  tagsEl.replaceChildren(...[...new Set(events.flatMap(e => e.tags))].map(t => {
    tagState[t] ??= 0;
    const b = chip(t + (tagState[t] === 1 ? '（除外）' : tagState[t] === 2 ? '（これだけ）' : ''), () => { tagState[t] = (tagState[t] + 1) % 3; renderChips(); setView(activeSub, false); }, 'クリックで「除外」→「これだけ表示」→「元に戻す」');
    b.classList.toggle('ex', tagState[t] === 1); b.classList.toggle('only', tagState[t] === 2);
    return b;
  }));
  tracksEl.replaceChildren(...tracks.map(tr => {
    const b = chip(tr.name, () => { hiddenTracks.has(tr.id) ? hiddenTracks.delete(tr.id) : hiddenTracks.add(tr.id); renderChips(); setView(activeSub, false); });
    b.setAttribute('aria-pressed', String(!hiddenTracks.has(tr.id)));
    return b;
  }));
  linkListEl.replaceChildren(...tracks.filter(t => t.loop).map(l => chip(`${l.name}（${l.loop}周）`, () => loopForm(l.id), 'クリックで編集')),
    ...JUMPS.map(j => chip(`${j.sub.name}：${j.label}`, () => subjectForm(j.sub.id, { focus: j.li }), 'クリックで編集')));
  updateChips();
}
function updateChips() {
  for (const b of viewsEl.children) b.setAttribute('aria-pressed', String((b.dataset.id || null) === activeSub.id));
  root.querySelector('#tm-editSub').disabled = !activeSub.id; // 隠さずに無効にする（ボタンの列の折り返しが変わって、地図の高さが動かないように）
}
root.querySelector('#tm-q').addEventListener('input', e => { query = e.target.value; render(); });
root.querySelector('#tm-onlySub').addEventListener('change', e => { onlySub = e.target.checked; setView(activeSub, false); });

// ===== 編集 =====
// 変更はアプリの世界に書き戻す（保存と「元に戻す」はアプリが受け持つ）。書き戻すと、アプリが時系列マップを描き直す
const uid = () => Math.random().toString(36).slice(2, 8);
function commit(mutate, label = '時系列マップを編集') { host.commit(mutate, label, () => ({ tracks, subjects, events, groups })); }
const dlg = document.getElementById('dlg'), dlgBody = document.getElementById('dlgBody');
function openDlg(title, html, onSave, onDelete, onChange = null, onClick = null, okLabel = '保存') {
  tip.hidden = true;
  host.openDialog({ title, body: html, onSave, onDelete: onDelete || null, onChange, onClick, ok: okLabel });
  mountDateSlots();
}
const $ = id => document.getElementById(id);
const val = id => $(id).value;
const trackSel = (id, sel, skip) => `<select id="${id}">${tracks.filter(t => t.id !== skip).map(t => `<option value="${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
const splitList = s => s.split(/[、,，]/).map(x => x.trim()).filter(Boolean);
function inRange(tr, t) {
  const s = T[tr];
  if (t < s.from || t > s.to) throw `「${s.name}」の範囲外の日時です（${s.short(s.from, 'day')}〜${s.short(s.to, 'day')}）`;
}

// 日時の入力欄：アプリの暦の入力欄（どの暦でも入れられる）を、入力画面の中の枠に差し込む。spec は世界線（または { cal, calId }）
const slots = new Map();
const dateFld = (label, p, spec, t) => { slots.set(p, { spec, t }); return `<div class="fld"><span>${label}</span><div id="${p}Box" class="tm-dslot"></div></div>`; };
function mountDateSlots() {
  for (const [p, s] of slots) { const box = document.getElementById(`${p}Box`); if (!box) { slots.delete(p); continue; } if (box.dataset.mounted) continue; s.w = host.dateInput(s.spec, s.t); box.replaceChildren(s.w.el); box.dataset.mounted = '1'; }
}
const slotHere = (p, spec, t) => { slots.set(p, { spec, t }); return ''; };
function readDate(p) { const s = slots.get(p); if (!s?.w) throw '日時の欄がありません'; return host.toFloat(s.w.read().t); }
const redate = (p, spec, t) => { slots.set(p, { spec, t }); const box = document.getElementById(`${p}Box`); if (box) { delete box.dataset.mounted; mountDateSlots(); } };

// 付箋：アプリの付箋の編集画面で開く（ループの周回から開いたときは、その周の書き換えができる）
function cardForm(i, preset = {}) {
  if (i != null) return host.openNote(events[i]._id, { k: preset.k || 0 });
  host.newEvent({ tr: preset.tr || 'main', t: preset.t ?? null, k: preset.k || 0, title: preset.title || '', tags: preset.tags || [] });
}


// 世界線
// この世界線の上にあって、範囲に入っていなければならない時点（付箋・ほかの世界線やループの分岐元・合流先）
function refTimes(id, evs = events) {
  return [...evs.filter(e => e.tr === id).map(e => e.t), ...tracks.flatMap(t => [t.fork, t.merge]).filter(q => q && q[0] === id).map(q => q[1])];
}
// preset：fork / merge（[世界線, 日時]）、up（本線の上に置く）、from（分岐のきっかけの付箋の番号）
function trackForm(id, preset = {}) {
  if (id && T[id].loop) return loopForm(id);
  const tr = id ? T[id] : null, isMain = id === 'main';
  const spec = () => tr || (val('k_cal') !== 'west' ? { cal: 'fict', calId: val('k_cal') } : { cal: 'west' });
  const fork0 = tr ? tr.fork : preset.fork, merge0 = tr ? tr.merge : preset.merge;
  const from0 = tr ? tr.from : fork0 && T[fork0[0]].cal === 'west' ? fork0[1] : W(2000);
  const to0 = tr ? tr.to : merge0 && T[merge0[0]].cal === 'west' && merge0[1] > from0 ? merge0[1] : Math.max(T.main.to, from0 + YEAR);
  const fTr = fork0?.[0] || 'main', mTr = merge0?.[0] || 'main', src = preset.from != null ? events[preset.from] : null;
  openDlg(tr ? '世界線を編集' : '世界線を追加', `
    <label>名前<input id="k_name" value="${esc(tr ? tr.name : '')}" autocomplete="off"></label>
    ${tr ? `<p class="note">暦：${tr.cal === 'fict' ? esc(host.calName(tr)) + '（架空の暦）' : isMain ? '西暦' : `西暦系（「西暦;${esc(tr.name)}」と表示）`}</p>` : `
    <label>暦<select id="k_cal"><option value="west">西暦系（分岐した時間など。「西暦;名前」と表示）</option>${host.calendars().map(c => `<option value="${c.id}">${esc(c.name)}（架空の暦）</option>`).join('')}</select></label>
    <p class="note">架空の暦（月の名前・日数・曜日・紀元）は、右上の「設定」の「架空の暦」で作れます。</p>`}
    ${isMain ? '' : `<label>置き場所<select id="k_side"><option value="down">本線の下</option><option value="up"${(tr ? tr.lane < 0 : preset.up) ? ' selected' : ''}>本線の上</option></select></label>`}
    ${dateFld('始まり', 'k_from', tr || { cal: 'west' }, from0)}
    ${dateFld('終わり', 'k_to', tr || { cal: 'west' }, to0)}
    <label class="cb"><input type="checkbox" id="k_dur_on">終わりの代わりに、長さ（体感時間）で入れる</label>
    <div id="k_durRow" class="row" hidden><input type="number" id="k_dur" min="0" step="any" value="3" style="width:7em" aria-label="長さ"><select id="k_durU" aria-label="単位"><option value="year">年</option><option value="month">か月</option><option value="day">日</option><option value="hour">時間</option></select></div>
    ${isMain ? '' : `
    <label class="cb"><input type="checkbox" id="k_fork_on"${fork0 ? ' checked' : ''}>始まりで、別の世界線から分かれる</label>
    <div id="k_forkRow" class="sub"${fork0 ? '' : ' hidden'}><label>分かれる元${trackSel('k_forkTr', fTr, id)}</label>${dateFld('分かれる日時', 'k_fork', T[fTr], fork0 ? fork0[1] : from0)}</div>
    <label class="cb"><input type="checkbox" id="k_merge_on"${merge0 ? ' checked' : ''}>終わりで、別の世界線に合流する</label>
    <div id="k_mergeRow" class="sub"${merge0 ? '' : ' hidden'}><label>合流先${trackSel('k_mergeTr', mTr, id)}</label>${dateFld('合流する日時', 'k_merge', T[mTr], merge0 ? merge0[1] : T[mTr].to)}</div>
    <p class="note">分岐点・合流点は、この世界線の始まり・終わりと一緒に動きます。始まり・終わりにいた主体の区間と付箋も一緒に動きます。</p>`}
    ${tr ? '' : `<label>分かれた瞬間に、この世界線で起きた出来事（別バージョン。空なら作らない）<input id="k_alt" value="${src ? esc(src.title + '（別バージョン）') : ''}" autocomplete="off"></label>
    <div class="alt" id="k_dbl"${fork0 ? '' : ' hidden'}>${dblHTML(fork0)}</div>`}`,
    () => {
      const name = val('k_name').trim(); if (!name) throw '名前を入れてください';
      const s = spec(), from = readDate('k_from');
      // 長さで入れたとき：始まりからその長さだけ後を終わりにする（架空の暦なら、その暦の1年・1か月で数える）
      const to = $('k_dur_on').checked ? (() => { const n = +val('k_dur'); if (!(n > 0)) throw '長さには正の数を入れてください'; return host.toFloat(host.addDuration(s, host.fromFloat(from), n, val('k_durU'))); })() : readDate('k_to');
      if (!(from < to)) throw '終わりは始まりより後にしてください';
      let fork = null, merge = null;
      // ループの世界線から分かれる・へ戻るときは、何周目かを引き継ぐ
      const withK = (q, old) => old?.[2] && old[0] === q[0] ? [...q, old[2]] : q;
      if (!isMain && $('k_fork_on').checked) { const ft = val('k_forkTr'), t = readDate('k_fork'); inRange(ft, t); fork = withK([ft, t], fork0); }
      if (!isMain && $('k_merge_on').checked) { const mt = val('k_mergeTr'), t = readDate('k_merge'); inRange(mt, t); merge = withK([mt, t], merge0); }
      const dbls = !tr && fork ? [...dlgBody.querySelectorAll('[data-dbl]:checked')].map(x => x.dataset.dbl) : [];
      const up = !isMain && val('k_side') === 'up', alt = tr ? '' : val('k_alt').trim();
      if (alt && !fork) throw '別バージョンを書くには「始まりで、別の世界線から分かれる」を選んでください';
      let subs = subjects, evs = events;
      if (tr) {
        // 端にいた主体の区間と付箋は、端と一緒に動く。分岐元・合流先を通って移る区間は、分岐元・合流先と一緒に動く
        subs = subjects.map(x => ({ ...x, legs: x.legs.map(g => ({ ...g })) }));
        for (const x of subs) x.legs.forEach((g, i) => {
          const nx = x.legs[i + 1], pv = x.legs[i - 1];
          if (tr.fork && fork && fork[0] === g.tr && nx?.tr === id && nx.a === tr.from && samePt(tr.fork, g.tr, g.b)) g.b = fork[1];
          if (tr.merge && merge && merge[0] === g.tr && pv?.tr === id && (pv.b === tr.to || pv.b === to) && samePt(tr.merge, g.tr, g.a)) g.a = merge[1];
          if (g.tr === id) { if (g.a === tr.from) g.a = from; if (g.b === tr.to) g.b = to; }
        });
        evs = events.map(e => e.tr !== id ? e : e.t === tr.from ? { ...e, t: from } : e.t === tr.to ? { ...e, t: to } : e);
        const bad = subs.find(x => x.legs.some(g => !(g.a < g.b) && !loopsOn(g.tr).some(l => l.a <= g.b && g.a <= l.b)));
        if (bad) throw `「${bad.name}」の区間の始まりと終わりが逆になります。先に主体の区間を直してください`;
        const refs = [...refTimes(id, evs), ...subs.flatMap(x => x.legs).filter(g => g.tr === id).flatMap(g => [g.a, g.b])];
        if (refs.length && (from > Math.min(...refs) || to < Math.max(...refs)))
          throw `付箋・ループ・主体の区間などが範囲からはみ出します（${tr.short(Math.min(...refs), 'day')}〜${tr.short(Math.max(...refs), 'day')} を含めてください）`;
      }
      commit(() => {
        if (tr) {
          subjects = subs; events = evs;
          const t = tracks.find(x => x.id === id), mag = Math.abs(t.lane) || 1;
          Object.assign(t, { name, from, to });
          if (!isMain) {
            t.lane = up ? -mag : mag;
            if (fork) t.fork = fork; else delete t.fork;
            if (merge) t.merge = merge; else delete t.merge;
          }
          return;
        }
        const nid = 't' + uid(), mag = Math.max(...tracks.map(x => Math.abs(x.lane))) + 1;
        const t = { id: nid, name, lane: up ? -mag : mag, color: tracks.length % 6, cal: s.cal, from, to };
        if (s.cal === 'fict') t.calId = s.calId;
        if (fork) t.fork = fork;
        if (merge) t.merge = merge;
        tracks.push(t);
        if (alt) events.push({ tr: nid, t: from, title: alt, tags: src ? [...src.tags] : [] });
        // 分岐で2人に分かれる人物：元の人物はそのまま続き、分身がこの世界線に現れる（分かれる前の人生は元の人物と同じ）
        for (const sid of dbls) { const o = subjects.find(x => x.id === sid); subjects.push({ id: 's' + uid(), name: `${o.name}（${name}）`, origin: o.id, legs: [{ tr: nid, a: from, b: to }] }); }
        revealNext = [nid, from];
      });
    },
    tr && !isMain ? () => {
      const n = { e: events.filter(e => e.tr === id).length, l: tracks.filter(t => t.fork?.[0] === id || t.merge?.[0] === id).length, s: subjects.filter(x => x.legs.some(g => g.tr === id)).length };
      if (n.e || n.l || n.s) throw `この世界線を使っているものがあるので削除できません（付箋${n.e}・ループや分岐${n.l}・主体${n.s}）`;
      commit(() => { tracks = tracks.filter(t => t.id !== id); });
    } : null,
    ev => {
      const i = ev.target.id, v = ev.target.value;
      if (i === 'k_cal') { const s = spec(); redate('k_from', s, s.cal === 'fict' ? 0 : from0); redate('k_to', s, s.cal === 'fict' ? host.fictYears(s, 1000) : to0); }
      // 暦の名前は表示だけ直す（入力欄を作り直すと、次にクリックした欄が消えて入力が迷子になる）
      if (i === 'k_forkTr') redate('k_fork', T[v], T[v].from);
      if (i === 'k_mergeTr') redate('k_merge', T[v], T[v].to);
      if (i === 'k_fork_on') $('k_forkRow').hidden = !ev.target.checked;
      if (i === 'k_dur_on') { $('k_durRow').hidden = !ev.target.checked; $('k_toBox').closest('.fld').hidden = ev.target.checked; }
      // 分身の候補：分かれる瞬間に、分かれる元の世界線にいる主体
      if ($('k_dbl') && i.startsWith('k_fork')) {
        const on = new Set([...dlgBody.querySelectorAll('[data-dbl]:checked')].map(x => x.dataset.dbl)), ft = val('k_forkTr'), t = readDateSafe('k_fork', T[ft], null);
        $('k_dbl').hidden = !$('k_fork_on').checked;
        $('k_dbl').innerHTML = dblHTML(t == null ? null : [ft, t], on);
      }
      if (i === 'k_merge_on') $('k_mergeRow').hidden = !ev.target.checked;
    });
  $('k_name').focus();
}
function dblHTML(fork, on = new Set()) {
  const who = fork ? aliveAt(fork[0], fork[1]) : [];
  return `<span>分岐で2人に分かれる人物（元の人物はそのまま続き、分身がこの世界線に現れる）</span>` + (who.length
    ? who.map(s => `<label class="cb"><input type="checkbox" data-dbl="${s.id}"${on.has(s.id) ? ' checked' : ''}>${esc(s.name)}</label>`).join('')
    : '<p class="note">分かれる瞬間に、分かれる元の世界線にいる主体はいません</p>');
}
function readDateSafe(p, spec, fallback) { try { return readDate(p, spec); } catch { return fallback; } }

// ループ：元の世界線から分かれて、同じ期間を何周もくり返し、終わりで元の世界線に戻る世界線。
// 影響される人物だけがループに入り、ほかの人物は元の世界線をそのまま進む。ループの中でさらにループを作ることもできる（何周目から分かれるかを持つ）
// 1周目の出来事は、作ったときの元の世界線（ループの中なら、その周）の出来事のコピー。2周目以降は1周目のコピーで、周ごとに書き換えられる
const legTouches = (s, tr, a, b, k) => s.path.some(q => !q.inh && q.tr === tr && q.a < b && q.b > a && (!k || q.k === k));
// 主体の区間のうち、元の世界線でループの期間を通るものを「元の世界線 → ループ → 元の世界線」に分ける
function routeIn(s, L) {
  if (s.legs.some(g => g.tr === L.id)) return;
  const [tr, , K = 0] = L.fork, a = L.from, b = L.to;
  s.legs = s.legs.flatMap(g => {
    const es = g.tr === tr ? expandLeg(g, 0) : [], q = es.find(q => q.k === K && q.a < b && q.b > a);
    if (!q) return [g];
    const lk = x => K ? x : {}, out = [], { jump, ...base } = g, last = es[es.length - 1];
    if (q !== es[0] || q.a < a) out.push({ ...base, b: a, ...lk({ kb: K }), ...(jump && { jump }) });
    out.push({ tr: L.id, a: Math.max(q.a, a), b: Math.min(q.b, b), ...(!out.length && jump && { jump }) });
    if (q !== last || q.b > b) { const post = { ...base, a: b, ...lk({ ka: K, kb: last.k }) }; if (!K) { delete post.ka; delete post.kb; } out.push(post); }
    return out;
  });
}
// ループを通る区間を元の世界線に戻し、流れがつながる区間どうしを1本にまとめる
function routeOut(s, L) {
  if (!s.legs.some(g => g.tr === L.id)) return;
  const [tr, , K = 0] = L.fork, out = [];
  for (const g0 of s.legs) {
    const g = g0.tr === L.id ? { tr, a: g0.a, b: g0.b, ...(K && { ka: K, kb: K }), ...(g0.jump && { jump: g0.jump }) } : { ...g0 }, p = out[out.length - 1];
    if (p && p.tr === tr && g.tr === tr && p.b === g.a && !g.jump && (g0.tr === L.id || p.fromL) && (p.kb ?? K) === (g.ka ?? K)) {
      p.b = g.b; if (g.kb != null) p.kb = g.kb; else delete p.kb; p.fromL = g0.tr === L.id; continue;
    }
    if (g0.tr === L.id) g.fromL = true;
    out.push(g);
  }
  for (const g of out) delete g.fromL;
  s.legs = out;
}
function loopForm(id, preset = {}) {
  const L = id ? T[id] : null;
  const tr0 = L ? L.fork[0] : preset.tr || 'main', k0 = L ? L.fork[2] || 0 : T[tr0].loop ? preset.k || 1 : 0;
  const a0 = L ? L.from : preset.a ?? W(2000), b0 = L ? L.to : preset.b ?? Math.min(T[tr0].to, a0 + 14);
  // ループに入る人物の候補：その期間に元の世界線にいる主体（と、すでにループに入っている主体）
  const whoHTML = (tr, a, b, on) => {
    const who = subjects.filter(s => (L && s.legs.some(g => g.tr === L.id)) || (a != null && b != null && legTouches(s, tr, a, b, tr === tr0 ? k0 : 0)));
    return '<span>ループに入る人物（チェックしない人物は、元の世界線をそのまま進む）</span>' + (who.length
      ? who.map(s => `<label class="cb"><input type="checkbox" data-who="${s.id}"${on.has(s.id) ? ' checked' : ''}>${esc(s.name)}</label>`).join('')
      : '<p class="note">この期間に元の世界線にいる主体はいません</p>');
  };
  const on0 = new Set(L ? subjects.filter(s => s.legs.some(g => g.tr === L.id)).map(s => s.id) : []);
  openDlg(L ? 'ループを編集' : 'ループを追加', `
    <label>名前<input id="lp_kind" value="${esc(L ? L.name : '')}" placeholder="ループ" autocomplete="off"></label>
    <p class="note">元の世界線から分かれて、同じ期間を何周もくり返し、終わりで元の世界線に戻る世界線です。ループに入る人物は周回を順に全部体験し、入らない人物は元の世界線をそのまま進みます。途中の周に跳んで入る・途中の周で出るときは、主体の区間で「何周目」を入れます。</p>
    ${L ? `<p class="note">元の世界線：${esc(T[tr0].name)}${k0 ? `（${k0}周目）` : ''}</p>` : `<label>元の世界線${trackSel('lp_tr', tr0)}</label>`}
    ${T[tr0].loop && !L ? `<label>元のループの何周目から分かれるか<input type="number" id="lp_k" min="1" max="${T[tr0].loop}" value="${k0}"></label>` : ''}
    ${dateFld('ループの始まり', 'lp_a', T[tr0], a0)}${dateFld('ループの終わり（ここから始まりに戻る）', 'lp_b', T[tr0], b0)}
    <label>何周くり返すか<input type="number" id="lp_n" min="1" max="99" value="${L ? L.loop : 2}"></label>
    <div class="alt" id="lp_who">${whoHTML(tr0, a0, b0, on0)}</div>`,
    () => {
      const tr = L ? tr0 : val('lp_tr'), a = readDate('lp_a'), b = readDate('lp_b'), n = Math.trunc(+val('lp_n'));
      const k = L ? k0 : T[tr].loop ? Math.trunc(+($('lp_k')?.value || 1)) : 0;
      inRange(tr, a); inRange(tr, b);
      if (!(a < b)) throw 'ループの終わりは始まりより後にしてください';
      // ponytail: 99周まで。周回ごとに線を描くので、それ以上は重くなる。多い回数は「残りn周」のようにまとめて描くのが次の手
      if (!(n >= 1 && n <= 99)) throw '回数は1〜99にしてください';
      if (T[tr].loop && !(k >= 1 && k <= T[tr].loop)) throw `元のループは1〜${T[tr].loop}周目です`;
      if (L) {
        const refs = refTimes(L.id);
        if (refs.some(t => t < a || t > b)) throw 'ループの中の付箋や、ループから分かれた世界線が範囲からはみ出します';
      }
      const name = val('lp_kind').trim() || 'ループ', on = new Set([...dlgBody.querySelectorAll('[data-who]:checked')].map(x => x.dataset.who));
      commit(() => {
        let lp = L && tracks.find(t => t.id === L.id);
        if (lp) {
          // 端が動いたら、端にいた主体の区間も一緒に動く
          const [f0, t0] = [lp.from, lp.to];
          for (const s of subjects) s.legs.forEach((g, i) => {
            const nx = s.legs[i + 1], pv = s.legs[i - 1];
            if (g.tr === lp.id) { if (g.a === f0) g.a = a; if (g.b === t0) g.b = b; }
            else if (g.tr === tr && nx?.tr === lp.id && g.b === f0) g.b = a;
            else if (g.tr === tr && pv?.tr === lp.id && g.a === t0) g.a = b;
          });
          Object.assign(lp, { name, from: a, to: b, loop: n, fork: k ? [tr, a, k] : [tr, a], merge: k ? [tr, b, k] : [tr, b] });
        } else {
          const par = T[tr], mag = Math.max(...tracks.map(x => Math.abs(x.lane))) + 1;
          lp = { id: 't' + uid(), name, lane: -mag, color: tracks.length % 6, cal: par.cal, from: a, to: b, fork: k ? [tr, a, k] : [tr, a], merge: k ? [tr, b, k] : [tr, b], loop: n };
          if (par.cal === 'fict') lp.calId = par.calId;
          tracks.push(lp);
          for (const e of events.filter(e => e.tr === tr && e.t >= a && e.t <= b)) {
            const v = evIn(e, k);
            if (v) events.push({ tr: lp.id, t: e.t, title: v.title, tags: [...v.tags], ...(e.group && { group: e.group }), ...(e.branch && { branch: true }) });
          }
          revealNext = [lp.id, a];
        }
        rebuild(); // 区間を分けるのに、新しいループの世界線の周回を使う
        for (const s of subjects) { if (on.has(s.id)) routeIn(s, lp); else routeOut(s, lp); }
      });
    },
    L ? () => {
      if (tracks.some(t => t.fork?.[0] === L.id || t.merge?.[0] === L.id)) throw 'このループから分かれた世界線があるので削除できません。先にそちらを削除してください';
      commit(() => { for (const s of subjects) routeOut(s, L); events = events.filter(e => e.tr !== L.id); tracks = tracks.filter(t => t.id !== L.id); });
    } : null,
    ev => {
      const i = ev.target.id;
      if (i === 'lp_tr') { const t = T[ev.target.value]; redate('lp_a', t, t.from); redate('lp_b', t, Math.min(t.to, t.from + 14)); }
      if (i === 'lp_tr' || i.startsWith('lp_a') || i.startsWith('lp_b') || i === 'lp_k') {
        const tr = L ? tr0 : val('lp_tr'), on = new Set([...dlgBody.querySelectorAll('[data-who]:checked')].map(x => x.dataset.who));
        $('lp_who').innerHTML = whoHTML(tr, readDateSafe('lp_a', T[tr], null), readDateSafe('lp_b', T[tr], null), on);
      }
    });
  $('lp_kind').focus();
}

// 主体。opts.legs：保存前の区間（つなぐ操作で仮に作ったもの）。opts.focus：開いたときに見せる区間の番号
function subjectForm(id, opts = {}) {
  const s = id ? subjects.find(x => x.id === id) : { name: opts.name || '', legs: [{ tr: 'main', a: W(2000), b: W(2050) }] };
  const legs0 = opts.legs || s.legs;
  let next = legs0.length;
  const kFld = (p, tr, k) => `<label class="kk"${loopsOn(tr).length ? '' : ' hidden'}>ループの中なら<input type="number" id="${p}" min="1" value="${k ?? ''}" placeholder="1" aria-label="何周目">周目</label>`;
  const row = (r, g) => {
    const j = g.jump || {};
    return `<div class="leg" data-r="${r}"><div class="leg-h"><b></b><button type="button" class="mini" data-del="${r}">この区間を削除</button></div>` +
      `<div class="jmp"><span>前の区間からの移り方</span><div class="row"><select id="s_jt_${r}" aria-label="移り方"><option value="">自動で決める</option>` +
      Object.entries(JUMP_TYPES).map(([k, [, long]]) => `<option value="${k}"${j.type === k ? ' selected' : ''}>${long}</option>`).join('') + `</select>` +
      `<input id="s_jl_${r}" value="${esc(j.label || '')}" placeholder="名前（空なら自動）" aria-label="移り方の名前" autocomplete="off">` +
      `<label class="cb"><input type="checkbox" id="s_jp_${r}"${j.paradox ? ' checked' : ''}>パラドックスが起きた</label></div></div>` +
      `<label>世界線${trackSel(`s_tr_${r}`, g.tr)}</label>` +
      `<div class="fld"><span class="lbl-in"></span><div class="row"><div id="s_a_${r}Box" class="tm-dslot">${slotHere(`s_a_${r}`, T[g.tr], g.a)}</div>${kFld(`s_ka_${r}`, g.tr, g.ka)}</div></div>` +
      `<div class="fld"><span>出た</span><div class="row"><div id="s_b_${r}Box" class="tm-dslot">${slotHere(`s_b_${r}`, T[g.tr], g.b)}</div>${kFld(`s_kb_${r}`, g.tr, g.kb)}</div></div></div>`;
  };
  openDlg(id ? '主体を編集' : '主体を追加', `
    <label>名前<input id="s_name" value="${esc(s.name)}" autocomplete="off"></label>
    ${s.origin ? `<p class="note">分岐で現れた分身です（元の人物：${esc(subjects.find(x => x.id === s.origin)?.name || '？')}）。分かれる前の人生は元の人物と同じで、最初の区間の始まりが分かれて現れた時点です。</p>` : ''}
    <p class="note">本人が体験した順に区間を並べます。最初の区間の始まりが誕生です。区間と区間のあいだの移り方（タイムトラベル、または瞬間移動・世界線の出入りなどの移動）は自動で決まり、◆で表示されます。ループの期間を通ると、ループの周回を全部体験します。ループの途中の周に入る・出るときは「何周目」を入れます。世界線の範囲の外まで区間を延ばすと、世界線も延びます（合流点も一緒に動きます）。</p>
    <div id="s_legs">${legs0.map((g, r) => row(r, g)).join('')}</div>
    <button type="button" class="mini" id="s_add">＋ 区間を追加</button>`,
    () => {
      const name = val('s_name').trim(); if (!name) throw '名前を入れてください';
      const grow = {}; // 区間に合わせて延ばす世界線の範囲
      const legs = [...dlgBody.querySelectorAll('.leg')].map((el, n) => {
        const r = el.dataset.r, tr = val(`s_tr_${r}`), a = readDate(`s_a_${r}`), b = readDate(`s_b_${r}`), g = { tr, a, b };
        const lps = loopsOn(tr), inA = lps.find(l => l.a <= a && a < l.b), inB = lps.find(l => l.a < b && b <= l.b);
        const kIn = (fid, lp) => {
          const v = $(fid).closest('label').hidden ? '' : val(fid).trim();
          if (!lp || v === '') return null;
          const k = Math.trunc(+v);
          if (!(k >= 1 && k <= lp.n)) throw `区間${n + 1}：「${T[lp.id].name}」は1〜${lp.n}周目です`;
          return k;
        };
        const ka = kIn(`s_ka_${r}`, inA), kb = kIn(`s_kb_${r}`, inB);
        if (ka) g.ka = ka;
        if (kb) g.kb = kb;
        if (inA && inA === inB) {
          const K0 = ka ?? 1, K1 = kb ?? (b > a ? K0 : K0 + 1);
          if (!(K1 > K0 || (K1 === K0 && b > a)) || K1 > inA.n) throw `区間${n + 1}：出た時点（何周目も含めて）は、入った時点より後にしてください`;
        } else if (!(a < b)) throw `区間${n + 1}：出た日時は、入った日時より後にしてください`;
        if (n > 0) {
          const jt = val(`s_jt_${r}`), jl = val(`s_jl_${r}`).trim(), jp = $(`s_jp_${r}`).checked;
          if (jt || jl || jp) g.jump = { ...(jt && { type: jt }), ...(jl && { label: jl }), ...(jp && { paradox: true }) };
        }
        const t = T[tr], gw = grow[tr] ||= { from: t.from, to: t.to };
        gw.from = Math.min(gw.from, a); gw.to = Math.max(gw.to, b);
        return g;
      });
      if (!legs.length) throw '区間を1つ以上入れてください';
      commit(() => {
        for (const t of tracks) if (grow[t.id]) Object.assign(t, grow[t.id]);
        if (id) { const i = subjects.findIndex(x => x.id === id); subjects[i] = { ...subjects[i], name, legs }; }
        else { const nid = opts.asNote || 's' + uid(); subjects.push({ id: nid, name, legs }); activeSub = { id: nid }; }
      });
    },
    id ? () => commit(() => { subjects = subjects.filter(x => x.id !== id); }) : null,
    ev => {
      const m = ev.target.id.match(/^s_tr_(\d+)$/);
      if (m) {
        const tr = T[ev.target.value];
        redate(`s_a_${m[1]}`, tr, tr.from); redate(`s_b_${m[1]}`, tr, tr.to);
        for (const w of ['a', 'b']) $(`s_k${w}_${m[1]}`).closest('label').hidden = !loopsOn(tr.id).length;
      }
    },
    ev => {
      if (ev.target.id === 's_add') {
        const last = [...dlgBody.querySelectorAll('.leg')].pop();
        const tr = last ? val(`s_tr_${last.dataset.r}`) : 'main';
        const a = last ? readDateSafe(`s_b_${last.dataset.r}`, T[tr], T[tr].from) : T[tr].from;
        $('s_legs').insertAdjacentHTML('beforeend', row(next++, { tr, a, b: Math.min(T[tr].to, a + 3650) }));
        mountDateSlots();
      }
      if (ev.target.dataset.del) ev.target.closest('.leg').remove();
    });
  const f = opts.focus != null && dlgBody.querySelector(`.leg[data-r="${opts.focus}"]`);
  if (f) { f.scrollIntoView({ block: 'center' }); (f.querySelector('select') || f).focus(); } else $('s_name').focus();
}

// メニュー（線をクリックしたとき・つなぐとき）。items：[表示, 実行する関数]
function hideMenu() { /* アプリのメニューが受け持つ */ }
function showMenu(head, items, clientX, clientY) { host.showMenu(head, items, clientX, clientY); }
function openMenu(pi, clientX, clientY) {
  const r = stage.getBoundingClientRect(), p = cur.pieces[pi], X = (clientX - r.left - cam.panX) / cam.zoom;
  const t = Math.round(pieceTimeAt(p, X).t * 1440) / 1440, pt = { tr: p.tr, t, k: p.k || 0, x: X, y: p.nodes[0].y };
  showMenu(`${esc(T[p.tr].name)}<br><span>${esc(ptText(p.tr, t, p.k))}</span>`, [
    ['＋ ここに付箋', () => cardForm(null, pt)],
    ['＋ ここから分かれる世界線', () => trackForm(null, { fork: p.k ? [p.tr, t, p.k] : [p.tr, t], up: p.nodes[0].y < 0 })],
    ['＋ ここからつなぐ（行き先をクリック）', () => startPick(pt)],
    [T[p.tr].loop ? `ループ「${T[p.tr].name}」を編集` : 'この世界線を編集', () => trackForm(p.tr)],
  ], clientX, clientY);
}
// 2点をつなぐ：主体がそこから跳ぶ／その期間をループにする／そこで分かれて行き先で合流する世界線
function connectMenu(a, b, clientX, clientY) {
  const items = [];
  for (const s of [activeSub, ...subjects.filter(x => x !== activeSub)]) {
    if (!s.id) continue;
    const q = s.path.find(q => q.tr === a.tr && q.a <= a.t && a.t <= q.b && (!a.k || q.k === a.k));
    if (q) items.push([`${s.name}がここから行き先へ移る`, () => jumpFrom(s, q, a, b)]);
  }
  if (a.tr === b.tr && a.t !== b.t && (a.k || 0) === (b.k || 0)) items.push(['このあいだをループにする', () => loopForm(null, { tr: a.tr, a: Math.min(a.t, b.t), b: Math.max(a.t, b.t), k: a.k })]);
  items.push(['ここで分かれて、行き先で合流する世界線', () => trackForm(null, { fork: a.k ? [a.tr, a.t, a.k] : [a.tr, a.t], merge: b.k ? [b.tr, b.t, b.k] : [b.tr, b.t], from: a.ev })]);
  showMenu(`${esc(ptText(a.tr, a.t, a.k))}<br>→ ${esc(ptText(b.tr, b.t, b.k))}`, items, clientX, clientY);
}
// 主体の区間を a で切り、b から始まる区間を足した案を、主体の編集画面で見せる（保存するまで変わらない）
function jumpFrom(s, q, a, b) {
  const legs = s.legs.map(g => ({ ...g })), g = legs[q.li], rest = g.b > a.t ? g.b - a.t : YEAR;
  const head = { ...g, b: a.t }; delete head.kb;
  if (q.k) head.kb = q.k;
  const end = Math.min(T[b.tr].to, b.t + rest), nw = { tr: b.tr, a: b.t, b: end > b.t ? end : T[b.tr].to };
  if (b.k) nw.ka = b.k;
  legs.splice(q.li, 1, head, nw);
  subjectForm(s.id, { legs, focus: q.li + 1 });
}

// つなぐ：出発点と行き先を順にクリックすると、「つなぐ」メニューが出る
let pick = null;
const pickHint = root.querySelector('#tm-pickHint');
function startPick(a = null) {
  hideMenu(); tip.hidden = true;
  pick = { a, mouse: null };
  pickHint.textContent = a ? '行き先をクリック（Escでやめる）' : '出発点をクリック（Escでやめる）';
  pickHint.hidden = false;
  render();
}
function endPick() { pick = null; pickHint.hidden = true; render(); }
// クリックした所の世界線と日時（線ならその位置の日時、付箋ならその付箋の日時）。k：ループの何周目か。ev：付箋の番号
function pointAt(target, clientX) {
  const k = target.closest?.('[data-k]')?.dataset.k || '', id = k.split('|')[1];
  const r = stage.getBoundingClientRect(), X = (clientX - r.left - cam.panX) / cam.zoom;
  if (k.startsWith('p|')) { const p = cur.pieces[+id]; return { tr: p.tr, t: Math.round(pieceTimeAt(p, X).t * 1440) / 1440, k: p.k || 0, x: X, y: p.nodes[0].y }; }
  let tr, t, ev, kk = 0;
  if (k.startsWith('c|')) { ({ tr, t } = events[ev = +id]); kk = +k.split('|')[2] || 0; }
  else if (k.startsWith('b|')) ({ tr, a: t } = subjects.find(x => x.id === id).path.find(q => !q.inh));
  else return null;
  const o = (kk && cur.ownerK[`${key(tr, t)}@${kk}`]) || cur.owner[key(tr, t)];
  if (!o) return null;
  const n = cur.pieces[o.pi].nodes[o.ni];
  return { tr, t, k: cur.pieces[o.pi].k || 0, x: n.x, y: n.y, ev };
}

// 一覧：すべての出来事を世界線ごとに時系列順で
const listEl = root.querySelector('#tm-list'), listBody = root.querySelector('#tm-listBody'), listBtn = root.querySelector('#tm-listBtn');
function renderList() {
  if (listEl.hidden) return;
  const rows = {};
  const add = (tr, t, title, kind, imp, open) => (rows[tr] ||= []).push({ t, title, kind, imp, open });
  events.forEach((e, i) => {
    const vs = versionsOf(e).map(v => `別バージョン：${events[v].title}`);
    const loopNote = e.k ? `${e.k}周目だけ` : e.per && Object.keys(e.per).length ? `周ごとの書き換え：${Object.keys(e.per).map(k => k + '周目').join('・')}` : '';
    add(e.tr, e.t, e.title, [e.branch ? '分岐点' : '', loopNote, e.group && groups[e.group] ? groups[e.group].title : '', ...vs].filter(Boolean).join('・'), !!e.branch, () => cardForm(i));
  });
  for (const sub of subjects) { const q = sub.path.find(q => !q.inh); if (q) add(q.tr, q.a, `${sub.name} ${sub.origin ? '分かれて現れる' : '誕生'}`, sub.origin ? '分身' : '主体の誕生', true, () => subjectForm(sub.id)); }
  for (const c of CONNS) { add(c.a[0], c.a[1], c.label, `→ ${T[c.b[0]].name}`, true, () => trackForm(c.tr)); add(c.b[0], c.b[1], c.label, `${T[c.a[0]].name} →`, true, () => trackForm(c.tr)); }
  for (const j of JUMPS) {
    const open = () => subjectForm(j.sub.id, { focus: j.li }), what = `${JUMP_TYPES[j.type][0]}${jumpDist(j) ? ' ' + jumpDist(j) : ''}`;
    add(j.a.tr, j.a.t, `${j.sub.name}：${j.label}`, `${what}：${T[j.b.tr].name}${j.b.k ? `（${j.b.k}周目）` : ''}へ`, true, open);
    add(j.b.tr, j.b.t, `${j.sub.name}：${j.label}`, `${what}：${T[j.a.tr].name}${j.a.k ? `（${j.a.k}周目）` : ''}から`, true, open);
  }
  listBody.replaceChildren();
  for (const tr of tracks) {
    const h = document.createElement('h3'), ol = document.createElement('ol');
    h.innerHTML = `<span class="sw" style="background:var(--c-c${tr.color})"></span>${esc(tr.name)}<span class="kind">${esc(tr.short(tr.from, 'year'))}〜${esc(tr.short(tr.to, 'year'))}</span>`;
    const list = (rows[tr.id] || []).sort((p, q) => p.t - q.t);
    for (const r of list) {
      const li = document.createElement('li'), b = document.createElement('button');
      if (r.imp) li.className = 'imp';
      b.innerHTML = `<span class="when">${esc(tr.short(r.t, r.t % 1 ? 'min' : 'day'))}</span><span><span class="ttl">${esc(r.title)}</span>${r.kind ? `<span class="kind">${esc(r.kind)}</span>` : ''}</span>`;
      b.onclick = r.open;
      li.append(b); ol.append(li);
    }
    if (!list.length) ol.innerHTML = '<li class="kind">まだ出来事がありません</li>';
    listBody.append(h, ol);
  }
}
listBtn.onclick = () => { listEl.hidden = !listEl.hidden; listBtn.setAttribute('aria-pressed', String(!listEl.hidden)); renderList(); };
root.querySelector('#tm-listClose').onclick = () => { listEl.hidden = true; listBtn.setAttribute('aria-pressed', 'false'); };

// 編集のボタン
root.querySelector('#tm-addCard').onclick = () => cardForm(null);
root.querySelector('#tm-addTrack').onclick = () => trackForm(null);
root.querySelector('#tm-addLink').onclick = () => startPick();
root.querySelector('#tm-addSub').onclick = () => subjectForm(null);
root.querySelector('#tm-editSub').onclick = () => activeSub.id && subjectForm(activeSub.id);
const onKey = e => { if (e.key === 'Escape' && pick) endPick(); };
addEventListener('keydown', onKey);

// ===== イースターエッグ =====
function egg(sub) {
  if (!sub.id) return;
  const kind = JUMPS.some(j => j.sub === sub && j.paradox) ? 'paradox' : cur.pieces.some(p => p.dup) ? 'self' : sub.path.some(q => q.k) ? 'loop' : null;
  const msg = {
    paradox: '気をつけろ、マーティー！ 過去をいじったせいで、世界線が分かれちまったぞ！',
    self: 'グレート・スコット！ 同じ時刻に、もう一人の自分がいるぞ！ 鉢合わせだけはするなよ！',
    loop: 'この夏休み、もう何度目だ……？ エル・プサイ・コングルゥ。',
  }[kind];
  if (msg) say(msg);
}
function say(msg) { host.toast(msg); }


// ===== 開始 =====
uiFont = '12px ' + getComputedStyle(document.body).fontFamily;
if (innerWidth < 560) root.querySelector('#tm-legend').open = false; // スマホでは凡例をたたんで地図を広く
function load() { ({ tracks, subjects, events, groups } = host.load()); }
return {
  // 世界が変わったら描き直す（変わる前の絵から、変わった後の絵へ動く）
  refresh(refit = false) {
    finishAnim();
    load(); rebuild(); renderChips(); renderList();
    const next = subjects.find(s => s.id === activeSub.id) || OBJECTIVE;
    setView(next, refit || next.id !== cur?.sub.id);
  },
  // 付箋の出来事が画面の外なら、真ん中へ
  focusNote(id) {
    const e = events.find(e => e._id === id);
    if (!e) return false;
    revealNext = [e.tr, e.t]; setView(activeSub, false);
    return true;
  },
  viewSubject(id) { const s = subjects.find(s => s.id === id); if (s) { setView(s); egg(s); } },
  subjectForm(id, name) { subjects.some(s => s.id === id) ? subjectForm(id) : subjectForm(null, { asNote: id, name }); },
  branchFrom(id) { const i = events.findIndex(e => e._id === id); if (i < 0) return; const e = events[i]; trackForm(null, { fork: e.k ? [e.tr, e.t, e.k] : [e.tr, e.t], from: i }); },
  render: () => render(),
  // 自動確認用（視点の切り替えが向きによらず同じ動きか）
  __debug: () => ({ draw, setView, finishAnim, A, OBJECTIVE, subjects, svg, cancel: () => cancelAnimationFrame(setView.raf) }),
  destroy() { removeEventListener('resize', onResize); removeEventListener('keydown', onKey); cancelAnimationFrame(setView.raf); },
};
}
