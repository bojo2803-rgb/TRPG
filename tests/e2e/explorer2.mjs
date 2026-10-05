// ロケーションの木：選んでもスクロールが戻らない・右の詳しい画面も切り替わる・ここに置く。詳しい画面を大きくする
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b, { height: 600 });
await p.evaluate(() => __app.commit(w => {
  const mk = (id, title, parents = []) => { w.notes[id] = { id, kind: 'place', title, body: '', tags: [], fields: {}, parents }; };
  mk('j', '日本');
  for (let i = 0; i < 40; i++) mk('c' + i, `街${String(i).padStart(2, '0')}`, ['j']);
  w.notes.pc = { id: 'pc', kind: 'person', title: 'アーミテッジ', body: '', tags: [], fields: {}, parents: [] };
}));
await p.evaluate(() => __app.go('places', { sub: 'list' })); await p.waitForTimeout(500);
await p.click('.tree-name:text-is("日本")'); await p.waitForTimeout(400);
ok(await p.locator('.ne-title').inputValue() === '日本', 'selecting shows its details on the right');
// 右の欄を下までスクロールして、下のほうの街を押す → 中へ入っても位置はそのまま
await p.locator('.explorer-main').evaluate(el => { el.scrollTop = el.scrollHeight; });
await p.locator('.explorer-tree').evaluate(el => { el.scrollTop = el.scrollHeight; });
const before = await p.evaluate(() => [document.querySelector('.explorer-tree').scrollTop, document.querySelector('.explorer-main').scrollTop]);
await p.click('.tree-name:text-is("街39")'); await p.waitForTimeout(400);
const after = await p.evaluate(() => [document.querySelector('.explorer-tree').scrollTop, document.querySelector('.explorer-main').scrollTop]);
ok(before[0] > 0 && after[0] === before[0], 'tree keeps its scroll: ' + before + ' → ' + after);
ok(await p.locator('.ne-title').inputValue() === '街39', 'details follow the selection');
// ＋ ここに置く
await p.click('.explorer-main button:has-text("ここに置く")'); await p.waitForTimeout(200);
await p.fill('#dlgBody input[type="search"]', 'アーミテッジ'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await p.waitForTimeout(300);
ok(await p.evaluate(() => __app.world.notes.pc.at) === 'c39', 'put a person here');
ok(await p.locator('.explorer-main .tile:has-text("アーミテッジ")').count() === 1, 'listed in ここにあるもの');
// 詳しい画面だけを大きく → 戻す。開き直しても覚えている
await p.click('.ne button:has-text("大きく")'); await p.waitForTimeout(200);
ok(await p.locator('#view').isHidden() && (await p.locator('#panel').boundingBox()).width > 900, 'details take the whole width');
await p.evaluate(() => { __app.closeNote(); __app.openNote('j'); }); await p.waitForTimeout(200);
ok(await p.locator('#view').isHidden(), 'stays wide when another card opens');
await p.evaluate(() => __app.closeNote()); await p.waitForTimeout(100);
ok(await p.locator('#view').isVisible(), 'closing the details shows the view again');
await p.evaluate(() => __app.openNote('j')); await p.waitForTimeout(200);
await p.click('.ne button:has-text("戻す")'); await p.waitForTimeout(200);
ok(await p.locator('#view').isVisible(), 'back to normal size');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
