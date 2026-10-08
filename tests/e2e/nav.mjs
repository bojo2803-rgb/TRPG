// 行き来：戻る・進む、最近、どこからでも探す、開いたら情報、小窓に重ねる、[[ の候補、その場で作る、シナリオの中で選ぶ
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const wait = ms => p.waitForTimeout(ms);
const byTitle = t => p.evaluate(t => Object.values(__app.world.notes).find(n => n.title === t), t);
const ids = await p.evaluate(() => {
  const N = (k, t, x = {}) => __app.newNote({ kind: k, title: t, ...x }, { open: false });
  const cafe = N('place', '喫茶「黄昏」'), sc = N('scenario', '黄昏の喫茶店', { at: cafe });
  const g = N('group', '星の智慧派', { fields: { 種類: '教団' } });
  const kat = N('person', '店主 葛城', { parents: [sc], at: cafe, fields: { 職業: '店主' } });
  const mur = N('person', '記者 三浦', { fields: { 職業: '記者' } });
  N('person', '店員 佐藤', { fields: { 職業: '店員' } });
  __app.commit(w => { w.links.m1 = { id: 'm1', a: kat, b: g, kind: 'member', label: '信者', style: 'dashed', arrow: 'none', color: null }; }, 'x');
  return { cafe, sc, g, kat, mur };
});
await p.evaluate(() => __app.go('people')); await wait(400);

// 開いたら情報（ボードではない）。空の長い欄は「＋」にたたまれている
await p.click('.tbl-name:has-text("店主 葛城")'); await wait(500);
ok(await p.locator('.ne.page .ne-title').inputValue() === '店主 葛城', 'person opens on the information page');
ok(await p.locator('.ne.page .add-field:has-text("外見")').count() === 1 && await p.locator('.ne.page textarea[data-field="外見"]').count() === 0, 'empty long fields are folded');
await p.click('.ne.page .add-field:has-text("外見")'); await wait(200);
ok(await p.locator('.ne.page textarea[data-field="外見"]').count() === 1, 'folded field opens on click');
ok(/#\/people\/[\w]+$/.test(await p.evaluate(() => location.hash)), 'address shows the page: ' + await p.evaluate(() => location.hash));

// 戻る・進む
await p.click('.el-head .seg button:has-text("ボード")'); await wait(500);
ok(await p.locator('.bcard.owner').count() === 1, 'board mode');
await p.goBack(); await wait(500);
ok(await p.locator('.ne.page .ne-title').count() === 1, 'browser back returns to the information page');
await p.goBack(); await wait(500);
ok(await p.locator('.tbl').count() === 1, 'second back returns to the list');
await p.goForward(); await wait(500);
ok(await p.locator('.ne.page .ne-title').inputValue() === '店主 葛城', 'forward returns to the page');

// 最近
ok((await p.locator('#navRecent').textContent()).includes('店主 葛城'), 'recent list shows the opened card');

// どこからでも探す：付箋の画面から人物が見つかる
await p.evaluate(() => __app.go('notes')); await wait(300);
await p.keyboard.press('Control+k');
ok(await p.evaluate(() => document.activeElement.id === 'search'), 'Ctrl+K focuses the search box');
await p.keyboard.type('記者'); await wait(200);
ok((await p.locator('#searchList').textContent()).includes('記者 三浦'), 'search finds a person from the notes screen');
await p.keyboard.press('Enter'); await wait(500);
ok(await p.locator('.ne.page .ne-title').inputValue() === '記者 三浦' && await p.locator('nav button[data-id="people"]').getAttribute('aria-current') === 'page', 'Enter opens the person page');
ok(!(await p.locator('#view').textContent()).includes('null'), 'no stray null text');

// シナリオのページ：登場人物を押すと小窓、その中の所属を押すと重なる、道すじで戻る、× で閉じる
await p.evaluate(id => __app.openElement(id), ids.sc); await wait(500);
await p.click('.ne.page [data-sec="contents"] a:has-text("店主 葛城")'); await wait(400);
ok(await p.locator('#panel').isVisible() && (await p.locator('.peek-crumbs').textContent()).includes('店主 葛城'), 'cast name opens in the side window');
await p.click('#panel [data-sec="member"] a:has-text("星の智慧派")'); await wait(400);
ok((await p.locator('.peek-crumbs').textContent()).replace(/\s/g, '') === '店主葛城›星の智慧派', 'second card stacks on top: ' + await p.locator('.peek-crumbs').textContent());
await p.screenshot({ path: SHOT + 'nav-peek.png' });
await p.click('.peek-crumbs button:has-text("店主 葛城")'); await wait(300);
ok(await p.locator('#panel .ne-title').inputValue() === '店主 葛城', 'breadcrumb goes back down the stack');
await p.click('#panel .peek-head button[aria-label="閉じる"]'); await wait(200);
ok(await p.locator('#panel').isHidden(), '× closes the side window');
await p.click('.ne.page [data-sec="contents"] a:has-text("店主 葛城")'); await wait(300);
await p.click('nav button[data-id="groups"]'); await wait(400);
ok(await p.locator('#panel').isHidden(), 'moving with the left tabs closes the side window');

// 検索：シナリオのページでは、そのシナリオに出るものが先に「このシナリオ」の印つき
await p.evaluate(id => __app.openElement(id), ids.sc); await wait(500);
await p.click('#search'); await p.keyboard.type('店'); await wait(200);
const first = p.locator('#searchList button').first();
ok((await first.textContent()).includes('店主 葛城') && await first.locator('.scope-mark').count() === 1, 'scenario cast comes first with a mark');
await p.keyboard.press('Escape');

// メモの [[：候補と、その場で人物として作る
await p.click('.ne.page [data-sec="body"] button:has-text("編集")'); await wait(200);
const ta = p.locator('.ne.page .ne-body');
await ta.click(); await ta.type('会うのは [[記'); await wait(200);
ok((await p.locator('.lsug').textContent()).includes('記者 三浦'), '[[ suggests names');
await ta.press('Enter'); await wait(200);
ok((await ta.inputValue()).includes('[[記者 三浦]]'), 'Enter inserts the link');
await ta.type(' と [[老人 ウィルバー'); await wait(200);
await p.click('.lsug button:has-text("人物として作る")'); await wait(300);
ok((await byTitle('老人 ウィルバー'))?.kind === 'person' && (await ta.inputValue()).includes('[[老人 ウィルバー]]'), 'unknown name is created as a person and linked');
ok((await p.locator('#toast').textContent()).includes('人物として作りました'), 'creation is announced');
await p.click('#toast .toast-act'); await wait(300);
ok((await p.locator('.peek-crumbs').textContent()).includes('老人 ウィルバー'), '［書く］ opens it in the side window');
await p.click('#panel .peek-head button[aria-label="閉じる"]');

// 名前の欄で作る → お知らせ
await p.evaluate(id => __app.openElement(id), ids.mur); await wait(500);
await p.click('.ne.page [data-sec="at"] button:has-text("決める")'); await wait(200);
await p.fill('#dlgBody input[type="search"]', 'ミスカトニック大学'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await wait(300);
ok((await p.locator('#toast').textContent()).includes('「ミスカトニック大学」をロケーションとして作りました'), 'picker announces a new card');

// チャートの登場：候補はシナリオの登場人物だけ。「ほかから選ぶ」で選んだ人は登場に入る
await p.evaluate(id => __app.openElement(id, { mode: 'chart' }), ids.sc); await wait(600);
await p.click('button:has-text("＋ 最初の点")'); await wait(300);
await p.keyboard.type('導入');
const opts = await p.locator('#cn-person option').evaluateAll(os => os.map(o => o.value));
ok(opts.includes('店主 葛城') && !opts.includes('記者 三浦'), 'cast choices are the scenario cast: ' + opts);
await p.click('.ce-panel button:has-text("ほかから選ぶ")');
ok((await p.locator('#cn-person option').evaluateAll(os => os.map(o => o.value))).includes('記者 三浦'), 'widened to everyone');
const castIn = p.locator('.ce-panel input[placeholder*="アーミテッジ"]');
await castIn.fill('記者 三浦'); await castIn.press('Enter'); await wait(400);
ok((await byTitle('記者 三浦')).parents.includes(ids.sc), 'outside pick joins the scenario cast');
ok(await p.evaluate(() => Object.values(__app.world.notes).filter(n => n.title === '記者 三浦').length) === 1, 'no duplicate person made');
ok(await p.evaluate(id => Object.values(__app.world.notes[id].chart.nodes)[0].title, ids.sc) === '導入', 'title typed in the panel is kept');

// 読み込み直しても、アドレスの画面が開く
await wait(1200);
await p.reload(); await p.waitForFunction(() => window.__app && document.getElementById('worldName').textContent !== '…'); await wait(800);
ok(await p.locator('.el-head .seg button[aria-pressed="true"]').textContent() === 'チャート', 'reload opens the same page and mode');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
