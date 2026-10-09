// ランダムなキャラクター（発想のきっかけ）：名前・能力値・メモまで、すべてガチランダム。
// 名前と文章はマルコフ連鎖（前の2文字から次の1文字を選ぶ）。文章は、この世界の付箋の本文も材料にする
import { h } from '../util.js';
import { newNote } from '../model.js';

const SURNAMES = '佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 斎藤 清水 山崎 森 池田 橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 斉藤 福田 太田 西村 藤井 金子 岡本 藤原 三浦 中野 中川 原田 松田 竹内 小野 田村 中山 和田 石田 森田 上田 原 柴田 酒井 工藤 横山 宮崎 宮本 内田 高木 安藤 島田 谷口 大野 高田 丸山 今井 河野 藤本 村田 武田 上野 杉山 増田 小山 大塚 平野 菅原 久保 松井 千葉 岩崎 桜井 木下 野口 松尾 菊地 野村 新井 渡部'.split(' ');
const GIVEN = '一郎 健太 翔太 大輔 誠 直樹 拓也 亮 雄一 和也 浩二 隆 修 進 茂 清 博 勝 実 豊 正男 秀夫 英雄 春夫 次郎 三郎 銀次 源蔵 喜八 弥助 花子 美咲 陽子 恵子 由美 久美子 千代 春子 桜 菊 静 雪 綾 薫 文 葵 結衣 芽衣 楓 凛 栞 澪 琴音 千尋 小夜 冬子 夏美 秋子 鶴 亀代'.split(' ');
const WEST_FIRST = 'Arthur Howard Randolph Herbert Wilbur Walter Robert Henry Edward Charles George Thomas William Albert Harvey Samuel Nathaniel Jeremiah Ezekiel Abigail Lavinia Asenath Marceline Eleanor Dorothy Margaret Ruth Edith Florence Clara Mildred Agnes Beatrice Harriet Prudence Cordelia'.split(' ');
const WEST_LAST = 'Carter Pickman Peaslee Armitage Whateley Gilman Marsh Olmstead Derby Upton Wilmarth Akeley Danforth Dyer Lake Ward Curwen Allen Wilcox Thurston Legrasse Johansen Angell Castro Blake Halsey Morgan Rice Waite Phillips'.split(' ');
const OCCUPATIONS = ['医師', '記者', '私立探偵', '大学教授', '作家', '警官', '古物商', '芸術家', '弁護士', '聖職者', '学生', '冒険家', '技師', '看護師', '船乗り', '農家', '写真家', '音楽家', '図書館員', '考古学者', '軍人', '神秘学者', '無職', '詐欺師', '貴族', '商人', '運転手', '教師'];
const SEED_TEXT = [
  '古い屋敷の地下室で、誰も知らない日記を見つけたことがある。', '夜になると、窓の外から自分の名前を呼ぶ声が聞こえるという。', '幼いころに一度だけ、海の向こうに沈んだ街を見た。',
  '左手の小指に、生まれつき奇妙な形のあざがある。', '月に一度、決まって同じ夢を見る。夢の中では、星の並びが少しだけ違う。', '祖父の遺した鍵が、どの扉にも合わないことを気にしている。',
  '雨の日には決して外に出ない。理由を聞かれると黙ってしまう。', '大学の図書館で、閲覧を禁じられた本を一度だけ開いたことがある。', '港町の酒場では、誰もがその人の昔の名前を知っている。',
  '時計の針が逆に回る音を聞いたことがあると言う。', '見知らぬ手紙が毎年同じ日に届く。差出人の名前はいつも違う。', '誰にも言っていないが、自分の影が少し遅れて動くことに気づいている。',
];

const roll = (n, s, plus = 0) => { let t = plus; for (let i = 0; i < n; i++) t += 1 + Math.floor(Math.random() * s); return t; };
const pick = a => a[Math.floor(Math.random() * a.length)];

// 2文字の並びから次の文字を選ぶマルコフ連鎖
export function markov(corpus, order = 2) {
  const table = new Map(), BEGIN = '\u0002', END = '\u0003';
  for (const s of corpus) {
    const t = BEGIN.repeat(order) + s + END;
    for (let i = 0; i + order < t.length; i++) { const k = t.slice(i, i + order); if (!table.has(k)) table.set(k, []); table.get(k).push(t[i + order]); }
  }
  return (maxLen = 40) => {
    let k = BEGIN.repeat(order), out = '';
    while (out.length < maxLen) { const next = table.get(k); if (!next) break; const c = pick(next); if (c === END) break; out += c; k = (k + c).slice(-order); }
    return out;
  };
}
export function randomCharacter(world) {
  const western = Math.random() < 0.5;
  const name = western
    ? `${markov(WEST_FIRST)(12) || pick(WEST_FIRST)}・${markov(WEST_LAST)(12) || pick(WEST_LAST)}`
    : `${markov(SURNAMES, 1)(4) || pick(SURNAMES)} ${markov(GIVEN, 1)(4) || pick(GIVEN)}`;
  const st = { STR: roll(3, 6), CON: roll(3, 6), POW: roll(3, 6), DEX: roll(3, 6), APP: roll(3, 6), SIZ: roll(2, 6, 6), INT: roll(2, 6, 6), EDU: roll(3, 6, 3) };
  const db = st.STR + st.SIZ <= 12 ? '-1D6' : st.STR + st.SIZ <= 16 ? '-1D4' : st.STR + st.SIZ <= 24 ? '0' : st.STR + st.SIZ <= 32 ? '+1D4' : '+1D6';
  const fields = { ...st, 職業: pick(OCCUPATIONS), SAN: st.POW * 5, 幸運: st.POW * 5, アイデア: st.INT * 5, 知識: Math.min(99, st.EDU * 5), 耐久力: Math.ceil((st.CON + st.SIZ) / 2), 'マジック・ポイント': st.POW, 'ダメージ・ボーナス': db };
  // メモ：この世界の付箋の本文と、手元の短い文章から作る
  const texts = [...SEED_TEXT, ...Object.values(world.notes).map(n => n.body.replace(/[#*>\-[\]!()]/g, '')).filter(t => t.length > 10)]
    .flatMap(t => t.split(/(?<=[。！？])/)).map(s => s.trim()).filter(s => s.length >= 6);
  const gen = markov(texts, 2), memo = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => gen(80)).filter(Boolean).join('');
  return { name, fields, memo, color: Math.floor(Math.random() * 8) };
}

export function open(ctx) {
  let c = randomCharacter(ctx.world);
  const show = () => h('div', { class: 'fields rnd' },
    h('p', { class: 'note-text' }, '名前・能力値・メモまで、すべてでたらめです（発想のきっかけ用）。気に入ったら人物として作れます。'),
    h('h3', { class: 'rnd-name' }, c.name),
    h('div', { class: 'tpl-grid' }, ...Object.entries(c.fields).map(([k, v]) => h('label', {}, h('span', {}, k), h('b', { class: 'data' }, String(v))))),
    h('p', {}, c.memo || '（メモの材料が足りませんでした）'),
    h('button', { type: 'button', class: 'btn', id: 'rnd_again' }, 'もう一度振る'));
  ctx.openDialog({
    title: 'ランダムなキャラクター', ok: '人物にする', body: show(),
    onClick: e => { if (e.target.id === 'rnd_again') { c = randomCharacter(ctx.world); document.getElementById('dlgBody').replaceChildren(show()); } },
    onSave: () => {
      const n = newNote({ kind: 'person', title: c.name, tags: ['NPC', 'ランダム'], fields: c.fields, body: c.memo, color: c.color });
      ctx.commit(w => { w.notes[n.id] = n; }, 'ランダムなキャラクターを追加');
      setTimeout(() => ctx.openNote(n.id), 0);
    },
  });
}
