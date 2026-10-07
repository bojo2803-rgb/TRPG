// シナリオの共有：偽物のGoogle（ログイン・ドライブ）で、リンクを作る → 読むページ → 更新 → 取り込む → やめる。ファイルでの書き出し・読み込み
import { launch, BASE, ok, done } from './lib.mjs';
import { fakeDrive } from '../fake-drive.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const srv = fakeDrive();
await ctx.route('https://www.googleapis.com/**', async route => {
  const r = route.request(), headers = r.headers();
  const res = await srv.fetch(r.url(), { method: r.method(), headers: { ...(headers.authorization && { Authorization: headers.authorization }), 'Content-Type': headers['content-type'] }, body: !r.postDataBuffer() ? undefined : /multipart/.test(headers['content-type'] || '') ? new Blob([r.postDataBuffer()]) : r.postDataBuffer().toString('utf8') });
  await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
});
await ctx.route('https://accounts.google.com/**', route => route.abort());
await ctx.addInitScript(() => { window.google = { accounts: { oauth2: { initTokenClient: o => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'tok', expires_in: '3600' }), 10) }), revoke: () => {} } } }; });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
const wait = ms => p.waitForTimeout(ms);
const ready = () => p.waitForFunction(() => window.__app && document.getElementById('worldName').textContent !== '…');
await p.goto(BASE);
await p.evaluate(async () => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('trpg-drive', JSON.stringify({ clientId: '1-test.apps.googleusercontent.com', apiKey: 'AIzaTEST' })); await new Promise(r => { const q = indexedDB.deleteDatabase('trpg-world-builder'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await p.reload(); await ready();
const sid = await p.evaluate(async () => {
  await (await import('./js/persist/drive.js')).connect();
  await __app.createWorld('drive', '共有テスト');
  const id = __app.newNote({ kind: 'scenario', title: 'ダンウィッチの怪', fields: { 概要: '丘の上の村で起きる怪事件', 真相: 'ヨグ＝ソトースの子' } }, { open: false });
  const place = __app.newNote({ kind: 'place', title: 'ダンウィッチ村' }, { open: false });
  __app.commit(w => {
    w.notes[id].at = place;
    w.notes[id].period = { tr: 'main', t: { d: 2425403, s: 0 }, prec: 'day', tz: 'Asia/Tokyo' };
    w.notes[id].sessions = [{ id: 's1', date: '2026-10-01', who: 'A・B', memo: '秘密の記録' }];
    w.notes[id].chart = { nodes: { a: { id: 'a', title: '導入', type: 'event', refs: [], body: '' }, b: { id: 'b', title: '図書館', type: 'place', refs: [place], body: '' } }, edges: { e: { id: 'e', from: 'a', to: 'b', label: '調べに行く' } } };
  });
  const pc = __app.newNote({ kind: 'person', title: 'アーミテッジ', parents: [id], born: { tr: 'main', t: { d: 2411094, s: 0 }, prec: 'day', tz: 'Asia/Tokyo' } }, { open: false });
  return id;
});
await p.evaluate(id => __app.openNote(id), sid); await wait(400);
await p.click('.ne [data-sec="share"] button:has-text("共有リンクを作る")'); await wait(1500);
const share = await p.evaluate(id => __app.world.notes[id].share, sid);
ok(!!share?.fileId, 'share link created');
const url = await p.evaluate(async id => (await import('./js/persist/drive.js')).shareUrl(__app.world.notes[id].share.fileId), sid);
ok(/share\.html#f=.+&k=AIzaTEST/.test(url), 'link points at the reading page with the key: ' + url);
// 読むページ（同じタブ：取り込むときにログインが残っているように）
await p.goto(url); await p.waitForSelector('.share h1'); await wait(500);
ok(await p.locator('.share h1').textContent() === 'ダンウィッチの怪', 'reading page shows the scenario');
ok(await p.locator('.share .cnode').count() === 2 && await p.locator('.share .cedge-l').textContent() === '調べに行く', 'chart drawn read-only');
ok((await p.locator('.share').textContent()).includes('アーミテッジ（39歳）'), 'person with age at the scenario time (born 1889-04-01, scenario 1928-06-05)');
ok((await p.locator('.share').textContent()).includes('ヨグ＝ソトースの子'), 'GM fields included');
ok(!(await p.locator('.share').textContent()).includes('秘密の記録'), 'play records left out');
await p.screenshot({ path: SHOT + 'share-page.png', fullPage: true });
// 取り込む → アプリに戻って、いまの世界にもう1つ入る
await p.click('a:has-text("自分のアプリに取り込む")'); await ready(); await wait(1500);
await p.waitForSelector('#dlg[open]'); await p.click('#dlgOk'); await wait(1000);
ok(await p.evaluate(() => Object.values(__app.world.notes).filter(n => n.title === 'ダンウィッチの怪' && n.kind === 'scenario').length) === 2, 'imported as a new scenario');
// 更新：名前を変えて「更新」→ 同じリンクで新しい中身
await p.evaluate(id => { __app.commit(w => { w.notes[id].title = 'ダンウィッチの怪（改）'; }); __app.go('scenarios'); __app.openNote(id); }, sid); await wait(500);
await p.click('.ne [data-sec="share"] button:has-text("更新")'); await wait(1500);
ok(await p.evaluate(id => __app.world.notes[id].share.fileId, sid) === share.fileId, 'update keeps the link');
const page2 = await ctx.newPage();
await page2.goto(url); await page2.waitForSelector('.share h1');
ok(await page2.locator('.share h1').textContent() === 'ダンウィッチの怪（改）', 'link shows the updated content');
const ph = await ctx.newPage(); await ph.setViewportSize({ width: 390, height: 780 });
await ph.goto(url); await ph.waitForSelector('.share h1'); await ph.waitForTimeout(300);
ok(await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'reading page fits a phone');
await ph.screenshot({ path: SHOT + 'share-phone.png', fullPage: true }); await ph.close();
// やめる → 読めない
await p.click('.ne [data-sec="share"] button:has-text("共有をやめる")'); await wait(1000);
await page2.reload(); await page2.waitForSelector('.share h1');
ok((await page2.locator('.share').textContent()).includes('共有がやめられた'), 'stopped share no longer readable');
// ファイルで渡す：書き出して、別の世界で読み込む
await p.evaluate(id => __app.openNote(id), sid); await wait(300);
await p.click('.ne [data-sec="share"] button:has-text("ファイルに書き出す")'); await wait(500);
const json = await p.locator('#dlgBody textarea').inputValue();
await p.click('#dlgCancel');
await p.evaluate(() => __app.createWorld('browser', '別の世界')); await wait(500);
await p.evaluate(() => document.getElementById('worldBtn').click()); await wait(200);
await p.click('#menu button:has-text("読み込む")'); await wait(200);
await p.fill('#im_text', json); await p.click('#dlgOk'); await wait(400);
await p.click('#dlgOk'); await wait(800);
ok(await p.evaluate(() => __app.world.name === '別の世界' && Object.values(__app.world.notes).some(n => n.title === 'ダンウィッチの怪（改）' && n.kind === 'scenario')), 'file import goes into the open world');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
