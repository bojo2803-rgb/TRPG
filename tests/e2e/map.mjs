// 画像なしの地図：方眼の紙にピンを2つ留め、線で結び、ピンを外すと線も消える
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
await p.evaluate(() => { __app.newNote({ title: '地球' }, { open: false }); __app.newNote({ title: '火星' }, { open: false }); });
await p.click('nav button[data-id="map"]'); await p.waitForTimeout(400);
await p.click('.bar button:has-text("＋ 地図")'); await p.waitForTimeout(200);
await p.fill('#mp_name', '太陽系');
await p.check('input[name="mp_kind"][value="blank"]');
await p.click('#dlgOk'); await p.waitForTimeout(400);
ok(await p.locator('.map-sheet').count() === 1, 'blank grid sheet shown');
const sheet = await p.locator('.map-sheet').boundingBox();
for (const [t, fx] of [['地球', .3], ['火星', .7]]) {
  await p.click('.bar button:has-text("＋ ピン")'); await p.waitForTimeout(200);
  await p.fill('#dlgBody input[type="search"]', t); await p.locator('#dlgBody input[type="search"]').press('Enter'); await p.waitForTimeout(200);
  await p.mouse.click(sheet.x + sheet.width * fx, sheet.y + sheet.height * .5); await p.waitForTimeout(300);
}
ok(await p.locator('.map-pin').count() === 2, 'two pins');
await p.click('.bar button:has-text("＋ 線")'); await p.waitForTimeout(200);
await p.click('.map-pin:has-text("地球")'); await p.waitForTimeout(200);
await p.click('.map-pin:has-text("火星")'); await p.waitForTimeout(300);
await p.fill('#ml_label', '航路'); await p.click('#dlgOk'); await p.waitForTimeout(300);
const m = await p.evaluate(() => Object.values(__app.world.maps)[0]);
ok(m.image === null && m.lines.length === 1 && m.lines[0].label === '航路', 'line saved: ' + JSON.stringify(m.lines));
ok(await p.locator('.map-line-l').textContent() === '航路', 'line label drawn');
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-map-blank.png' });
await p.click('.map-pin:has-text("地球")', { button: 'right' }); await p.waitForTimeout(200);
await p.click('#menu button:has-text("ピンを外す")'); await p.waitForTimeout(300);
ok(await p.evaluate(() => Object.values(__app.world.maps)[0].lines.length) === 0, 'removing a pin removes its line');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
