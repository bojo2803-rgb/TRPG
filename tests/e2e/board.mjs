// コルクボード：付箋を置く・動かす・●を引っぱってつなぐ・何もない所で離して新しい付箋・まとめをたたむ
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
await p.click('nav button[data-id="board"]');
await p.waitForSelector('.board-stage');
for (const t of ['探索者', 'アーカム']) {
  await p.click('text=＋ 新しい付箋'); await p.fill('.ne-title', t); await p.locator('.ne-title').press('Tab'); await p.waitForTimeout(700);
}
await p.click('.ne button[aria-label="閉じる"]');
await p.waitForTimeout(300);
const cards = p.locator('.bcard[data-id]');
ok(await cards.count() === 2, 'two cards');
// 2枚目を右へ動かす
const c2 = cards.nth(1), bb = await c2.boundingBox();
const before = await p.evaluate(() => Object.values(Object.values(__app.world.boards)[0].items)[1].x);
await p.mouse.move(bb.x + 40, bb.y + 15); await p.mouse.down(); await p.mouse.move(bb.x + 300, bb.y + 160, { steps: 8 }); await p.mouse.up();
await p.waitForTimeout(300);
const moved = await p.evaluate(() => { const b = Object.values(__app.world.boards)[0]; return Object.values(b.items).map(i => [i.x, i.y]); });
ok(moved[1][0] - before > 150, 'card moved: ' + JSON.stringify(moved) + ' from ' + before);
ok(await p.evaluate(() => document.getElementById('panel').hidden), 'drag does not open editor');
// ●を引っぱってつなぐ
const h1 = await p.locator('.bcard[data-id] .bcard-handle').nth(0).boundingBox(), t2 = await cards.nth(1).boundingBox();
await p.mouse.move(h1.x + 6, h1.y + 6); await p.mouse.down(); await p.mouse.move(t2.x + 60, t2.y + 20, { steps: 10 }); await p.mouse.up();
await p.waitForTimeout(300);
ok(await p.evaluate(() => Object.keys(__app.world.links).length) === 1, 'link created by handle drag');
ok(await p.locator('.board-links line[stroke]').count() === 1, 'link drawn');
// 何もない所で離す → 新しい付箋
const h2 = await p.locator('.bcard[data-id] .bcard-handle').nth(1).boundingBox();
await p.mouse.move(h2.x + 6, h2.y + 6); await p.mouse.down(); await p.mouse.move(h2.x + 260, h2.y + 200, { steps: 10 }); await p.mouse.up();
await p.waitForTimeout(400);
ok(await p.evaluate(() => Object.keys(__app.world.notes).length === 3 && Object.keys(__app.world.links).length === 2), 'drop on empty creates linked note');
await p.fill('.ne-title', '新しい手がかり'); await p.locator('.ne-title').press('Tab'); await p.waitForTimeout(600);
// まとめ：アーカムを「探索者」の中身にしてたたむ
await p.evaluate(() => { const w = __app.world, a = Object.values(w.notes).find(n => n.title === '探索者'); __app.commit(w => { Object.values(w.notes).find(n => n.title === 'アーカム').parents = [a.id]; }); });
await p.waitForTimeout(200);
await p.click('.bcard-fold');
await p.waitForTimeout(300);
ok(await p.locator('.bcard[data-id]').count() === 2 && (await p.locator('.bcard-fold').innerText()).includes('1枚'), 'collapsed group hides child');
// リンクをクリックで編集
await p.click('.bcard-fold'); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-board.png' });
await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
ok(!errors.filter(e => !/404|drive\.js|settings/.test(e)).length, 'errors: ' + errors.join('\n'));
await b.close(); done();
