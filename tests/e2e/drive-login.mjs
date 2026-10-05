// Googleドライブ：読み込み直してもログインし直さない。鍵が切れていたら、どこかを押すとつなぎ直して前の世界を開く
// 本物のGoogleの代わりに、ログインの部品（GIS）と、ドライブ（fake-drive.mjs）の偽物を使う
import { launch, BASE, ok, done } from './lib.mjs';
import { fakeDrive } from '../fake-drive.mjs';
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const srv = fakeDrive();
await ctx.route('https://www.googleapis.com/**', async route => {
  const r = route.request(), headers = r.headers();
  const res = await srv.fetch(r.url(), { method: r.method(), headers: { Authorization: headers.authorization, 'Content-Type': headers['content-type'] }, body: !r.postDataBuffer() ? undefined : /multipart/.test(headers['content-type'] || '') ? new Blob([r.postDataBuffer()]) : r.postDataBuffer().toString('utf8') });
  await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
});
await ctx.route('https://accounts.google.com/**', route => route.abort());
// ログインの部品の偽物：窓を開いたことにして、すぐ鍵を返す（開いた回数を数える）
await ctx.addInitScript(() => {
  localStorage.setItem('trpg-tokens', localStorage.getItem('trpg-tokens') || '0');
  window.google = { accounts: { oauth2: {
    initTokenClient: o => ({ requestAccessToken: () => { localStorage.setItem('trpg-tokens', String(+localStorage.getItem('trpg-tokens') + 1)); setTimeout(() => o.callback({ access_token: 'tok' + Date.now(), expires_in: '3600' }), 10); } }),
    revoke: () => {},
  } } };
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE);
await p.evaluate(async () => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('trpg-tokens', '0'); localStorage.setItem('trpg-drive', JSON.stringify({ clientId: '1-test.apps.googleusercontent.com' })); await new Promise(r => { const q = indexedDB.deleteDatabase('trpg-world-builder'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await p.reload(); await p.waitForFunction(() => window.__app && document.getElementById('worldName').textContent !== '…');
const tokens = () => p.evaluate(() => +localStorage.getItem('trpg-tokens'));
await p.evaluate(async () => { await (await import('./js/persist/drive.js')).connect(); await __app.createWorld('drive', 'ドライブの世界'); __app.newNote({ title: 'ドライブの付箋' }, { open: false }); });
await p.waitForTimeout(2000); // 自動保存
ok(await tokens() === 1, 'logged in once');
// 読み込み直す：鍵はこのタブに残っているので、そのまま開く
await p.reload(); await p.waitForFunction(() => window.__app && document.getElementById('worldName').textContent !== '…'); await p.waitForTimeout(800);
ok(await p.locator('#worldName').textContent() === 'ドライブの世界', 'reload opens the Drive world without logging in again');
ok(await tokens() === 1, 'no new login after reload');
ok(await p.evaluate(() => Object.values(__app.world.notes).some(n => n.title === 'ドライブの付箋')), 'saved note is there');
// 鍵が切れた（1時間たった）：どこかを押すとつなぎ直して開く
await p.evaluate(() => { const t = JSON.parse(sessionStorage.getItem('trpg-drive-token')); t.expires = Date.now() - 1000; sessionStorage.setItem('trpg-drive-token', JSON.stringify(t)); });
await p.reload(); await p.waitForFunction(() => window.__app && document.getElementById('worldName').textContent !== '…'); await p.waitForTimeout(500);
ok(!(await p.locator('#toast').isHidden()) && (await p.locator('#toast').textContent()).includes('どこかを押す'), 'asks for a click when the key expired');
await p.mouse.click(640, 400); await p.waitForTimeout(1500);
ok(await p.locator('#worldName').textContent() === 'ドライブの世界', 'one click reconnects and opens the Drive world');
ok(await tokens() === 2, 'one new key after the click');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
