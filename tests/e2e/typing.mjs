// もう一方の端末の変更を取り込んでも（store.replace）、いま打っている付箋の欄は作り直さない：打ちかけの文字が消えない
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
await p.evaluate(() => { __app.newNote({ title: 'ほかの付箋' }, { open: false }); __app.newNote({ title: '書いている付箋' }); });
await p.waitForTimeout(300);
await p.locator('.ne-body').click();
await p.keyboard.type('最初の行');
await p.waitForTimeout(800); // ここまでは保存済み
await p.keyboard.type('、打ちかけ');
// 打ちかけのうちに、もう一方の端末の変更を取り込む（ほかの付箋の名前が変わった）
await p.evaluate(() => { const w = JSON.parse(JSON.stringify(__app.world)); Object.values(w.notes).find(n => n.title === 'ほかの付箋').title = 'スマホで直した'; __app.store.replace(w, { keepHistory: true }); });
await p.keyboard.type('の続き');
await p.waitForTimeout(800);
ok(await p.locator('.ne-body').evaluate(el => el === document.activeElement), 'the field keeps focus');
const n = await p.evaluate(() => Object.values(__app.world.notes).find(n => n.title === '書いている付箋'));
ok(n.body === '最初の行、打ちかけの続き', 'nothing typed is lost: ' + n.body);
ok(await p.evaluate(() => Object.values(__app.world.notes).some(n => n.title === 'スマホで直した')), 'the other change arrived');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
