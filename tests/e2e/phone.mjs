// スマホの幅：どの画面も横にはみ出さず、付箋を開いて少し書ける
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b, { width: 390, height: 780, blank: false });
for (const v of ['notes', 'people', 'scenarios', 'items', 'groups', 'places', 'map', 'board', 'timemap', 'graph', 'templates']) {
  await p.evaluate(v => __app.go(v), v); await p.waitForTimeout(900);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 0, `${v}: page overflows by ${over}px`);
  await p.screenshot({ path: `${SHOT}phone-${v}.png` });
}
await p.evaluate(() => __app.go('notes')); await p.waitForTimeout(400);
await p.locator('.ncard').first().click(); await p.waitForTimeout(400);
ok(await p.evaluate(() => { const r = document.getElementById('panel').getBoundingClientRect(); return r.width >= 380 && r.left <= 1; }), 'editor covers screen on phone');
await p.screenshot({ path: `${SHOT}phone-editor.png` });
await p.click('#panel button[aria-label="閉じる"]');
ok(await p.evaluate(() => document.getElementById('panel').hidden), 'editor closes');
// スマホ用のリンク：クライアント ID を覚えて、アドレスから消す
await p.goto(p.url().split('#')[0] + '#drive=123-abc.apps.googleusercontent.com'); await p.reload(); await p.waitForTimeout(800);
ok(await p.evaluate(() => JSON.parse(localStorage.getItem('trpg-drive') || '{}').clientId === '123-abc.apps.googleusercontent.com'), 'phone link stores client id');
ok(!(await p.evaluate(() => location.hash)).includes('drive='), 'phone link hash cleared');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
