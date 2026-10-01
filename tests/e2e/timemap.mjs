// 時系列マップ：見本の世界を開いて、すべての視点を描く。試作品と同じ決まりを守る
import { launch, openApp, ok, done } from './lib.mjs';
import { readFileSync } from 'node:fs';
const b = await launch();
const { p, errors } = await openApp(b);
const proto = readFileSync(new URL('../../prototype/examples/sample.json', import.meta.url), 'utf8');
await p.evaluate(async d => { await __app.createWorld('browser', '見本', JSON.parse(d)); }, proto);
await p.waitForTimeout(800);
ok(await p.locator('#tm-map .pc').count() > 10, 'time map draws lines: ' + await p.locator('#tm-map .pc').count());
ok(await p.locator('#tm-views .chip').count() === 9, 'subject chips: ' + await p.locator('#tm-views .chip').count());
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-tm-main.png' });
for (const name of ['浦島太郎', 'ループする少女', '時間旅行者M']) {
  await p.locator('#tm-views .chip', { hasText: name }).first().click();
  await p.waitForTimeout(1700);
  await p.screenshot({ path: `/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-tm-${name}.png` });
}
// 出来事をクリック → 付箋の編集画面（時系列の欄）
await p.locator('#tm-views .chip', { hasText: '本線' }).first().click(); await p.waitForTimeout(1700);
const card = p.locator('#tm-map .card', { hasText: '亀を助ける' });
await card.click(); await p.waitForTimeout(400);
ok(await p.locator('.ne-title').inputValue() === '亀を助ける', 'card opens note editor');
ok((await p.locator('.when-shown').innerText()).includes('719年6月1日'), 'when shows date: ' + await p.locator('.when-shown').innerText());
// 付箋の名前を変えると、時系列マップにも出る
await p.fill('.ne-title', '亀を助ける（浜辺で）'); await p.locator('.ne-title').press('Tab'); await p.waitForTimeout(800);
ok(await p.locator('#tm-map .card', { hasText: '亀を助ける（浜辺で）' }).count() === 1, 'rename reflects on map');
// 元に戻す
await p.click('#undo'); await p.waitForTimeout(1700);
ok(await p.locator('#tm-map .card', { hasText: '亀を助ける（浜辺で）' }).count() === 0, 'undo reverts');
// 世界線を足す（時系列マップの入力画面）
await p.click('#tm-addTrack'); await p.waitForTimeout(300);
await p.fill('#k_name', 'テスト世界線');
await p.click('#dlgOk'); await p.waitForTimeout(1700);
ok(await p.evaluate(() => __app.world.tracks.some(t => t.name === 'テスト世界線' && Number.isInteger(t.from.d))), 'track added to world with {d,s}');
// ループの周回の付箋から開くと、その周だけ書き換えられる
await p.locator('#tm-views .chip', { hasText: 'ループする少女' }).first().click(); await p.waitForTimeout(1700);
const k2 = p.locator('#tm-map .card[data-k$="|2"]', { hasText: '夏祭り' }).first();
await k2.click(); await p.waitForTimeout(500);
ok(await p.locator('select[aria-label="2周目"]').inputValue() === 'iter', 'iteration 2 override shown');
await p.selectOption('select[aria-label="2周目"]', 'skip'); await p.waitForTimeout(1700);
ok(await p.evaluate(() => Object.values(__app.world.notes).find(n => n.title === '夏祭り' && n.when?.tr === 'loop1').when.per['2'] === null), 'skip saved');
// 長さ（体感時間）で世界線を作る
await p.click('#tm-addTrack'); await p.waitForTimeout(300);
await p.fill('#k_name', '竜宮の三年'); await p.check('#k_dur_on'); await p.fill('#k_dur', '3');
await p.click('#dlgOk'); await p.waitForTimeout(1700);
const len = await p.evaluate(() => { const t = __app.world.tracks.find(t => t.name === '竜宮の三年'); return t.to.d - t.from.d; });
ok(Math.abs(len - 3 * 365.2425) < 1, 'duration track length: ' + len);
// ＋ シナリオ：出来事を選んでシナリオにすると、もやで覆われる。名前を押すとたたむ・付箋を押すとひらく
await p.evaluate(() => __app.go('timemap')); await p.waitForTimeout(1700);
await p.click('#tm-addScen'); await p.waitForTimeout(300);
await p.fill('#dlgBody input[aria-label="シナリオの名前"]', '竜宮編');
const boxes = p.locator('#dlgBody .scen-pick input');
for (let i = 0; i < Math.min(2, await boxes.count()); i++) await boxes.nth(i).check();
await p.click('#dlgOk'); await p.waitForTimeout(1700);
const sc = await p.evaluate(() => Object.values(__app.world.notes).find(n => n.title === '竜宮編'));
ok(sc?.kind === 'scenario', 'scenario created from the time map');
const label = p.locator('.tm .cloud-l:has-text("竜宮編")'), folded = p.locator('.tm .card.grp:has-text("竜宮編")');
ok(await label.count() >= 1, 'scenario cloud drawn');
await label.first().click(); await p.waitForTimeout(1700);
ok(await label.count() === 0 && await folded.count() === 1, 'clicking the cloud name folds it');
await folded.first().click(); await p.waitForTimeout(1700);
ok(await label.count() >= 1, 'clicking the folded card opens it again');
ok(!errors.filter(e => !/404|drive\.js|settings/.test(e)).length, 'errors: ' + errors.join('\n'));
await b.close(); done();
