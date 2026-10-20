// タグ：カードのタグを押す → そのタグの付いたカード（同じ種類で絞って）。タグの一覧・名前を変える／まとめる・全部から外す・タグのボード・スマホ
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const wait = ms => p.waitForTimeout(ms);
const W = () => p.evaluate(() => __app.world);
const ids = await p.evaluate(() => {
  const N = (k, t, tags) => __app.newNote({ kind: k, title: t, tags }, { open: false });
  return { key: N('item', '古い鍵', ['呪物', '鍵']), knife: N('item', '銀の短剣', ['呪物']), miko: N('person', '巫女', ['呪物']), book: N('item', '手帳', ['じゅぶつ']), rumor: N('note', '噂', ['噂']) };
});
// アイテムのページでタグを押す → タグの画面、アイテムで絞ってある
await p.evaluate(id => __app.openElement(id), ids.key); await wait(500);
await p.click('.ne.page [data-sec="misc"] button:has-text("#呪物")'); await wait(600);
ok(/^#\/tags\/%E5%91%AA%E7%89%A9\?sub=item$/.test(await p.evaluate(() => location.hash)), 'address: ' + await p.evaluate(() => location.hash));
ok((await p.locator('.tag-main h3').textContent()) === '# 呪物' && await p.locator('.tag-main .chip[aria-pressed="true"]').textContent() === 'アイテム 2', 'tag page filtered to items');
ok(await p.locator('.tag-cards .ncard').count() === 2 && !(await p.locator('.tag-cards').textContent()).includes('巫女'), 'only the items with the tag');
await p.click('.tag-main .chip:has-text("すべて")'); await wait(300);
ok(await p.locator('.tag-cards .ncard').count() === 3 && (await p.locator('.tag-cards h4').allTextContents()).join('|') === '人物（1）|アイテム（2）', 'all kinds, grouped');
await p.screenshot({ path: SHOT + 'tags-list.png' });
ok((await p.locator('.tag-list').textContent()).includes('# 噂'), 'every tag is listed on the left');
// 押すとそのカードへ。戻るでタグの画面に戻る
await p.click('.tag-cards .ncard:has-text("銀の短剣")'); await wait(500);
ok(await p.locator('.el-head h2').textContent() === '銀の短剣', 'card opens');
await p.goBack(); await wait(600);
ok((await p.locator('.tag-main h3').textContent()) === '# 呪物', 'back returns to the tag');
// タグのボード：付いているカードが並んでいる。書き留めた付箋・貼ったカードにはタグが付く
await p.click('.tag-head .seg button:has-text("ボード")'); await wait(800);
ok(await p.locator('.tag-board .bcard[data-id]').count() === 3, 'tag board shows the three cards');
await p.fill('.tag-board textarea.quick', '呪物の出どころ'); await p.locator('.tag-board textarea.quick').press('Enter'); await wait(400);
const memo = Object.values((await W()).notes).find(n => n.title === '呪物の出どころ');
ok(memo?.tags.includes('呪物') && await p.locator('.tag-board .bcard[data-id]').count() === 4, 'a note written on the tag board gets the tag');
await p.click('.tag-board button:has-text("タグを付けて貼る")'); await wait(200);
await p.fill('#dlgBody input[type="search"]', '手帳'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await wait(400);
ok((await W()).notes[ids.book].tags.includes('呪物'), 'a card pinned to the tag board gets the tag');
await p.screenshot({ path: SHOT + 'tags-board.png' });
// 名前を変える → 既にあるタグにまとめる
await p.click('.tag-head button:has-text("名前を変える")'); await wait(200);
await p.fill('#dlgBody input', 'じゅぶつ'); await wait(100);
ok((await p.locator('#dlgBody').textContent()).includes('まとめます'), 'merging is announced');
await p.click('#dlgOk'); await wait(600);
let w = await W();
ok(w.notes[ids.book].tags.filter(t => t === 'じゅぶつ').length === 1 && w.notes[ids.key].tags.includes('じゅぶつ') && !Object.values(w.notes).some(n => n.tags.includes('呪物')), 'merged into じゅぶつ, no duplicates');
ok(Object.values(w.boards).filter(x => x.tag).map(x => x.tag).join() === 'じゅぶつ', 'the tag board follows');
ok(decodeURIComponent(await p.evaluate(() => location.hash)).startsWith('#/tags/じゅぶつ'), 'address follows the new name');
// 全部から外す
await p.click('.tag-head button:has-text("全部から外す")'); await wait(200);
await p.click('#dlgOk'); await wait(500);
w = await W();
ok(!Object.values(w.notes).some(n => n.tags.includes('じゅぶつ')) && !Object.values(w.boards).some(x => x.tag), 'removed from all cards, board gone');
await p.keyboard.press('Control+z'); await wait(400);
ok(Object.values((await W()).notes).filter(n => n.tags.includes('じゅぶつ')).length === 5, 'one undo brings it back');
// 「…」から行ける
await p.evaluate(() => __app.go('people')); await wait(300);
await p.click('nav button[data-id="tags"]'); await wait(400);
ok(await p.evaluate(() => location.hash) === '#/tags' && await p.locator('.tag-row').count() === 3, 'タグ is in the other views on the left (呪物 was merged away)');
// タグの説明：書いて欄を離れると残る。AI用まとめにも入る
await p.evaluate(() => __app.openTag('じゅぶつ')); await wait(500);
await p.fill('.tag-memo', '持つと正気度が減る品'); await p.locator('.tag-memo').press('Tab'); await wait(300);
ok((await W()).tagInfo?.['じゅぶつ']?.memo === '持つと正気度が減る品', 'tag description saved');
ok((await p.evaluate(async () => (await import('./js/aiDigest.js')).worldDigest(__app.world))).includes('#じゅぶつ（5枚）：持つと正気度が減る品'), 'description is in the AI summary');
// 検索：「#じゅ」でタグが出て、Enter でタグの画面
await p.evaluate(() => __app.go('people')); await wait(300);
await p.click('#search'); await p.keyboard.type('#じゅ'); await wait(200);
ok((await p.locator('#searchList button').first().textContent()).includes('#じゅぶつ'), 'search lists the tag first');
await p.keyboard.press('Enter'); await wait(500);
ok((await p.locator('.tag-main h3').textContent()) === '# じゅぶつ', 'Enter opens the tag');
// まとめて外す：アイテムの一覧で2つ選んで「タグを外す」
await p.evaluate(() => __app.go('items')); await wait(400);
await p.click('.el-tools .seg button:has-text("表")'); await wait(200);
await p.locator('.tbl tbody tr:has-text("古い鍵") .csel').click(); await p.locator('.tbl tbody tr:has-text("銀の短剣") .csel').click(); await wait(200);
await p.click('.bulk button:has-text("タグを外す")'); await wait(200);
await p.selectOption('#dlgBody select', 'じゅぶつ'); await p.click('#dlgOk'); await wait(300);
let ww = await W();
ok(!ww.notes[ids.key].tags.includes('じゅぶつ') && !ww.notes[ids.knife].tags.includes('じゅぶつ') && ww.notes[ids.key].tags.includes('鍵'), 'removed one tag from the two chosen cards only');
await p.keyboard.press('Control+z'); await wait(300);
// グラフで目立たせる・これだけ
await p.evaluate(() => __app.openTag('じゅぶつ')); await wait(400);
await p.click('.tag-views button:has-text("グラフ")'); await wait(900);
ok(decodeURIComponent(await p.evaluate(() => location.hash)) === '#/graph?tag=じゅぶつ' && await p.locator('.g-node.tagged').count() === 5, 'graph highlights the five tagged cards (even without links)');
await p.click('.bar .seg button:has-text("これだけ")'); await wait(600);
ok(await p.locator('.g-node').count() === 5, 'graph shows only them');
await p.screenshot({ path: SHOT + 'tags-graph.png' });
// 時系列で目立たせる（時系列にある出来事にタグ）
await p.evaluate(id => { __app.commit(w => { const n = w.notes[id]; n.when = { tr: 'main', t: { d: 2460000, s: 0 }, prec: 'day', tz: 'Asia/Tokyo' }; }); }, ids.knife);
const ev2 = await p.evaluate(() => __app.newNote({ title: '別の出来事', when: { tr: 'main', t: { d: 2460100, s: 0 }, prec: 'day', tz: 'Asia/Tokyo' } }, { open: false }));
await p.evaluate(() => __app.openTag('じゅぶつ')); await wait(400);
await p.click('.tag-views button:has-text("時系列")'); await wait(1500);
ok((await p.locator('#tm-tags').textContent()).includes('じゅぶつ（目立たせる）'), 'time map tag chip set to highlight');
ok(await p.evaluate(() => [...document.querySelectorAll('#tm-map .card')].some(c => c.classList.contains('hl')) && [...document.querySelectorAll('#tm-map .card')].some(c => c.classList.contains('dim'))), 'tagged event stands out, others dim');
await p.screenshot({ path: SHOT + 'tags-timemap.png' });
ok(!errors.length, 'errors: ' + errors.join('\n'));
// スマホ：一覧 → えらぶとタグのページだけ → 「← タグの一覧」
const ph = await openApp(b, { width: 390, height: 800 });
await ph.p.evaluate(() => { __app.newNote({ kind: 'item', title: '鍵', tags: ['呪物'] }, { open: false }); __app.go('tags'); }); await ph.p.waitForTimeout(500);
await ph.p.click('.tag-row:has-text("呪物")'); await ph.p.waitForTimeout(400);
ok(await ph.p.locator('.tag-list').isHidden() && await ph.p.locator('.tag-cards .ncard').count() === 1, 'phone: tag page alone');
await ph.p.click('button:has-text("← タグの一覧")'); await ph.p.waitForTimeout(300);
ok(await ph.p.locator('.tag-list').isVisible(), 'phone: back to the list');
ok(await ph.p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'phone: no overflow');
ok(!ph.errors.length, 'phone errors: ' + ph.errors.join('\n'));
await b.close(); done();
