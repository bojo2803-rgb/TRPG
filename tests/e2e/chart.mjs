// ストーリーチャート：点を作る・＋次へ・つなぐ（合流）・ラベル・動かす・自動に並べる・手がかりの一覧・時系列に置く
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const wait = ms => p.waitForTimeout(ms);
const sid = await p.evaluate(() => __app.newNote({ kind: 'scenario', title: 'ダンウィッチの怪' }, { open: false }));
await p.evaluate(id => __app.openElement(id), sid); await wait(700);
ok(await p.locator('.el-head .seg button[aria-pressed="true"]').textContent() === 'チャート', 'scenario opens on the chart');
const chart = () => p.evaluate(id => __app.world.notes[id].chart, sid);
const node = t => p.locator(`.cnode:has(.cnode-t:text-is("${t}"))`);
const fill = async (title, { type, label, body } = {}) => {
  await p.fill('#cn_title', title);
  if (type) await p.selectOption('#cn_type', type);
  if (label) await p.fill('#cn_label', label);
  if (body) await p.fill('#cn_body', body);
  await p.click('#dlgOk'); await wait(300);
};
await p.click('button:has-text("＋ 最初の点")'); await wait(200);
await fill('導入：依頼が来る');
await node('導入：依頼が来る').locator('[data-act="next"]').click(); await wait(200);
await fill('図書館', { type: 'place', label: '図書館を調べる' });
await node('導入：依頼が来る').locator('[data-act="next"]').click(); await wait(200);
await fill('屋敷', { type: 'place', label: '屋敷へ行く' });
await node('図書館').locator('[data-act="next"]').click(); await wait(200);
await fill('古い日記', { type: 'info', label: '〈図書館〉成功', body: '儀式の日付がわかる' });
await node('図書館').locator('[data-act="next"]').click(); await wait(200);
await fill('対決', { type: 'ending' });
// 屋敷 → 対決（合流）
await node('屋敷').locator('[data-act="link"]').click(); await wait(200);
await node('対決').click(); await wait(300);
await p.fill('#ce_label', '夜まで待つ'); await p.click('#dlgOk'); await wait(300);
let c = await chart();
ok(Object.keys(c.nodes).length === 5 && Object.keys(c.edges).length === 5, 'five points, five arrows');
ok(Object.values(c.edges).some(e => e.label === '夜まで待つ'), 'arrow label saved');
const top = async t => parseFloat(await node(t).evaluate(el => el.style.top));
ok(await top('対決') > await top('図書館') && await top('対決') > await top('屋敷') && await top('図書館') === await top('屋敷'), 'merge sits below both branches');
ok(await p.locator('.cedge-l:text-is("図書館を調べる")').count() === 1, 'arrow label drawn');
await p.screenshot({ path: SHOT + 'chart.png' });
// 動かす → 位置が残る → 自動に並べる
const bb = await node('屋敷').boundingBox();
await p.mouse.move(bb.x + 20, bb.y + 10); await p.mouse.down(); await p.mouse.move(bb.x + 140, bb.y + 90, { steps: 5 }); await p.mouse.up(); await wait(300);
ok(!!(await chart()).nodes[Object.values(await chart()).length && Object.values((await chart()).nodes).find(n => n.title === '屋敷').id].pos, 'dragged point keeps its place');
await p.click('.bar button:has-text("自動に並べる")'); await wait(300);
ok(!Object.values((await chart()).nodes).some(n => n.pos), 'auto layout clears placed positions');
// 手がかりの一覧
await p.click('.bar button:has-text("手がかりの一覧")'); await wait(200);
ok((await p.locator('#dlgBody').textContent()).includes('「図書館」で「〈図書館〉成功」'), 'clue list shows where the diary is found');
await p.click('#dlgCancel'); await wait(100);
// 時系列に置く
await node('古い日記').locator('[data-act="menu"]').click(); await wait(100);
await p.click('#menu button:has-text("出来事として時系列に置く")'); await wait(400);
const ev = await p.evaluate(id => Object.values(__app.world.notes).find(n => n.title === '古い日記' && n.when && n.parents.includes(id)), sid);
ok(!!ev, 'point became an event in the scenario');
ok((await chart()).nodes[Object.values((await chart()).nodes).find(n => n.title === '古い日記').id].refs.includes(ev.id), 'point stays linked to the event');
ok(await node('古い日記').locator('.cnode-refs .chip').count() === 1, 'linked card chip shown on the point');
await p.keyboard.press('Control+z'); await wait(300);
ok(!(await p.evaluate(() => Object.values(__app.world.notes).some(n => n.title === '古い日記' && n.when))), 'undo removes the event');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
