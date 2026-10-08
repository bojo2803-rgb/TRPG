// ストーリーチャート：点を作る・＋次へ・つなぐ（合流）・ラベル・動かす・自動に並べる・手がかりの一覧・時系列に置く
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const wait = ms => p.waitForTimeout(ms);
const sid = await p.evaluate(() => __app.newNote({ kind: 'scenario', title: 'ダンウィッチの怪' }, { open: false }));
await p.evaluate(id => __app.openElement(id), sid); await wait(700);
ok(await p.locator('.el-head .seg button[aria-pressed="true"]').textContent() === '情報', 'scenario opens on its information first');
await p.click('.el-head .seg button:has-text("チャート")'); await wait(500);
const chart = () => p.evaluate(id => __app.world.notes[id].chart, sid);
const node = t => p.locator(`.cnode:has(.cnode-t:text-is("${t}"))`);
// 点は右の欄で直す（ダイアログなし）。題名は打てばすぐ点に出て、ほかへ移ると記録される
const T = () => p.locator('.ce-panel .ce-title');
const sel = async t => { await p.click('.bar button[aria-label="全体を見る"]'); await wait(150); await node(t).locator('.cnode-t').click(); await wait(250); };
const next = async (from, title, { type, label, body } = {}) => {
  await sel(from);
  await p.click('.ce-next button:has-text("＋ 次の点")'); await wait(300);
  ok(await p.evaluate(() => document.activeElement.classList.contains('ce-title')), 'title is ready to type after ＋ 次の点');
  await p.keyboard.type(title);
  if (type) await p.selectOption('.ce-panel .ce-type', type);
  if (body) await p.fill('.ce-panel textarea', body);
  if (label) { const li = p.locator('.ce-panel .ce-in input').first(); await li.fill(label); await li.press('Enter'); }
  await wait(200);
};
await p.click('button:has-text("＋ 最初の点")'); await wait(300);
await p.keyboard.type('導入：依頼が来る'); await p.keyboard.press('Enter'); await wait(200);
ok((await node('導入：依頼が来る').count()) === 1, 'first point made and titled in place');
await next('導入：依頼が来る', '図書館', { type: 'place', label: '図書館を調べる' });
const at = t => node(t).evaluate(el => el.style.left + ',' + el.style.top);
const before = [await at('図書館'), await at('導入：依頼が来る')];
await next('導入：依頼が来る', '屋敷', { type: 'place', label: '屋敷へ行く' });
ok(JSON.stringify([await at('図書館'), await at('導入：依頼が来る')]) === JSON.stringify(before), 'adding a branch does not move the points already there');
await next('図書館', '古い日記', { type: 'info', label: '〈図書館〉成功', body: '儀式の日付がわかる' });
await next('図書館', '対決', { type: 'ending' });
// 屋敷 → 対決（合流）：「→ ほかの点へつなぐ」→ 相手を押す → 矢印に書く欄にすぐ打てる
await sel('屋敷');
await p.click('.ce-next button:has-text("ほかの点へつなぐ")'); await wait(200);
await p.click('.bar button[aria-label="全体を見る"]'); await wait(150);
await node('対決').locator('.cnode-t').click(); await wait(300);
await p.keyboard.type('夜まで待つ'); await p.keyboard.press('Enter'); await wait(300);
let c = await chart();
ok(Object.keys(c.nodes).length === 5 && Object.keys(c.edges).length === 5, 'five points, five arrows');
ok(Object.values(c.edges).some(e => e.label === '夜まで待つ'), 'arrow label saved');
const top = async t => parseFloat(await node(t).evaluate(el => el.style.top));
ok(await p.locator('.chart-stage').evaluate(el => getComputedStyle(el).userSelect === 'none'), 'dragging the chart never selects text');
ok(await top('対決') > await top('図書館') && await top('対決') > await top('屋敷') && await top('図書館') === await top('屋敷'), 'merge sits below both branches');
ok(await p.locator('.cedge-l:text-is("図書館を調べる")').count() === 1, 'arrow label drawn');
await p.screenshot({ path: SHOT + 'chart.png' });
// 動かす → 位置が残る → 自動に並べる
const bb = await node('屋敷').boundingBox();
await p.mouse.move(bb.x + 20, bb.y + 10); await p.mouse.down(); await p.mouse.move(bb.x + 140, bb.y + 90, { steps: 5 }); await p.mouse.up(); await wait(300);
ok(!!(await chart()).nodes[Object.values(await chart()).length && Object.values((await chart()).nodes).find(n => n.title === '屋敷').id].pos, 'dragged point keeps its place');
await p.click('.bar button:has-text("一覧・並べ方")'); await p.click('#menu button:has-text("自動に並べ直す")'); await wait(300);
ok(!Object.values((await chart()).nodes).some(n => n.pos), 'auto layout clears placed positions');
// 手がかりの一覧
await p.click('.bar button:has-text("一覧・並べ方")'); await p.click('#menu button:has-text("手がかりの一覧")'); await wait(200);
ok((await p.locator('#dlgBody').textContent()).includes('「図書館」で「〈図書館〉成功」'), 'clue list shows where the diary is found');
await p.click('#dlgCancel'); await wait(100);
// 時系列に置く
await sel('古い日記'); await p.click('.ce-panel button[aria-label="この点のメニュー"]'); await wait(100);
await p.click('#menu button:has-text("出来事として時系列に置く")'); await wait(400);
const ev = await p.evaluate(id => Object.values(__app.world.notes).find(n => n.title === '古い日記' && n.when && n.parents.includes(id)), sid);
ok(!!ev, 'point became an event in the scenario');
ok((await chart()).nodes[Object.values((await chart()).nodes).find(n => n.title === '古い日記').id].refs.includes(ev.id), 'point stays linked to the event');
ok(await node('古い日記').locator('.cnode-refs .chip').count() === 1, 'linked card chip shown on the point');
await p.keyboard.press('Control+z'); await wait(300);
ok(!(await p.evaluate(() => Object.values(__app.world.notes).some(n => n.title === '古い日記' && n.when))), 'undo removes the event');
// 場所・いつ・登場・アイテム
const pl = await p.evaluate(() => { const a = __app.newNote({ kind: 'place', title: 'アーカム' }, { open: false }); return { a, lib: __app.newNote({ kind: 'place', title: 'ミスカトニック大学図書館', parents: [a] }, { open: false }) }; });
const nid = t => p.evaluate(([id, t]) => Object.values(__app.world.notes[id].chart.nodes).find(n => n.title === t).id, [sid, t]);
await sel('図書館');
await p.fill('.ce-panel label:has-text("いつ") input', '1日目・昼'); await p.locator('.ce-panel label:has-text("いつ") input').press('Tab');
await p.locator('.ce-panel label:has-text("場所") input').fill('ミスカトニック大学図書館'); await p.locator('.ce-panel label:has-text("場所") input').press('Tab');
const castIn = p.locator('.ce-panel input[placeholder*="アーミテッジ"]'), itemIn = p.locator('.ce-panel input[placeholder*="古い鍵"]');
await castIn.fill('アーミテッジ'); await castIn.press('Enter'); await wait(200);
await itemIn.fill('古い鍵'); await itemIn.press('Enter'); await wait(300);
let lib = (await chart()).nodes[await nid('図書館')];
const W = () => p.evaluate(() => __app.world);
let w = await W();
ok(lib.place === pl.lib && lib.time === '1日目・昼', 'point keeps place (picked by name) and time');
ok(lib.cast.length === 1 && w.notes[lib.cast[0]].kind === 'person' && w.notes[lib.cast[0]].parents.includes(sid), 'new cast member is a person in the scenario');
ok(lib.items.length === 1 && w.notes[lib.items[0]].title === '古い鍵' && w.notes[lib.items[0]].kind === 'item', 'new item made');
ok((await node('図書館').textContent()).includes('📍 アーカム › ミスカトニック大学図書館'), 'point shows the place path');
ok((await node('図書館').textContent()).includes('🕒 1日目・昼'), 'point shows the time');
// 次の点は場所を引き継ぐ。ない場所の名前はロケーションを作る
await sel('屋敷');
await p.locator('.ce-panel label:has-text("場所") input').fill('ウェイトリー家'); await p.locator('.ce-panel label:has-text("場所") input').press('Tab'); await wait(300);
w = await W();
const wh = (await chart()).nodes[await nid('屋敷')].place;
ok(w.notes[wh]?.kind === 'place' && w.notes[wh].title === 'ウェイトリー家', 'unknown place name creates a location');
await sel('図書館'); await node('図書館').locator('.cnode-add').click(); await wait(300);
ok((await p.locator('.ce-panel label:has-text("場所") input').inputValue()) === 'アーカム › ミスカトニック大学図書館', 'next point starts in the same place (the ＋ under the point)');
await p.keyboard.press('Control+z'); await wait(300);
// 場所ごとの一覧
await p.click('.bar button:has-text("一覧・並べ方")'); await p.click('#menu button:has-text("場所ごとの一覧")'); await wait(200);
const sc = await p.locator('#dlgBody').textContent();
ok(sc.includes('📍 アーカム › ミスカトニック大学図書館') && sc.includes('📍 ウェイトリー家') && sc.includes('場所なし'), 'scenes grouped by place');
await p.screenshot({ path: SHOT + 'chart-scenes.png' });
await p.click('#dlgCancel'); await wait(100);
await p.screenshot({ path: SHOT + 'chart-place.png' });
// 時系列に置く → 出来事の場所になる
await sel('図書館'); await p.click('.ce-panel button[aria-label="この点のメニュー"]'); await wait(100);
await p.click('#menu button:has-text("出来事として時系列に置く")'); await wait(400);
ok(await p.evaluate(([id, at]) => Object.values(__app.world.notes).some(n => n.title === '図書館' && n.when && n.at === at && n.parents.includes(id)), [sid, pl.lib]), 'event made from the point is at its place');
// ロケーションの詳しい画面：ここで起きること（上のロケーションでも出る）
await p.evaluate(id => __app.openNote(id), pl.a); await wait(300);
ok((await p.locator('.ne [data-sec="here"]').textContent()).includes('ダンウィッチの怪 › 図書館（ミスカトニック大学図書館）'), 'location shows chart points inside it');
await p.click('.ne [data-sec="here"] a:has-text("ダンウィッチの怪 › 図書館")'); await wait(700);
ok(await p.locator('.ce-panel .ce-title').inputValue() === '図書館' && await p.locator('.cnode.sel .cnode-t').textContent() === '図書館', 'the link opens the chart with that point chosen');
// 人物を消すと、点からも消える
await p.evaluate(id => __app.deleteNote(id), lib.cast[0]); await wait(300);
ok(!(await chart()).nodes[await nid('図書館')].cast.length, 'deleted person leaves the point');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
