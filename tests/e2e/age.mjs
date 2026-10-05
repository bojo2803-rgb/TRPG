// 年齢：人物の生年月日と、シナリオの時期から、その時の年齢を出す
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
const setDate = async (y, m, d) => {
  await p.fill('#dlgBody .dinput input[aria-label="年"]', String(y));
  await p.fill('#dlgBody .dinput input[aria-label="月"]', String(m));
  await p.fill('#dlgBody .dinput input[aria-label="日"]', String(d));
  await p.click('#dlgOk'); await p.waitForTimeout(300);
};
const ids = await p.evaluate(() => ({ pc: __app.newNote({ kind: 'person', title: 'アーミテッジ' }, { open: false }), sc: __app.newNote({ kind: 'scenario', title: 'ダンウィッチの怪' }, { open: false }) }));
await p.evaluate(id => __app.openNote(id), ids.pc); await p.waitForTimeout(300);
await p.click('.ne [data-sec="born"] button'); await p.waitForTimeout(300);
await setDate(1890, 4, 1);
ok((await p.locator('.ne [data-sec="born"]').textContent()).includes('1890年4月1日'), 'birth date shown');
await p.evaluate(id => __app.openNote(id), ids.sc); await p.waitForTimeout(300);
await p.click('.ne [data-sec="period"] button'); await p.waitForTimeout(300);
await setDate(1928, 6, 1);
await p.click('.ne [data-sec="contents"] .row:has-text("登場") button'); await p.waitForTimeout(200);
await p.fill('#dlgBody input[type="search"]', 'アーミテッジ'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await p.waitForTimeout(300);
ok((await p.locator('.ne [data-sec="contents"]').textContent()).includes('38歳'), 'scenario cast shows the age then');
await p.evaluate(id => __app.openNote(id), ids.pc); await p.waitForTimeout(300);
ok((await p.locator('.ne [data-sec="scen"]').textContent()).includes('38歳'), 'person shows their age in the scenario');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
