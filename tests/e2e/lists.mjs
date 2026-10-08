// 一覧：100人の表（並べ替え・空は最後）、まとまり、絵、複数選んでまとめて（元に戻すで1回）、シナリオで絞る（家系図にも効く）、スマホ
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const wait = ms => p.waitForTimeout(ms);
const W = () => p.evaluate(() => __app.world);
const ids = await p.evaluate(() => {
  const N = (k, t, x = {}) => __app.newNote({ kind: k, title: t, ...x }, { open: false });
  const tk = N('place', '東京'), os = N('place', '大阪');
  const sc = N('scenario', '黄昏の喫茶店'), sc2 = N('scenario', '雪山の山荘');
  const g = N('group', '星の智慧派'), pol = N('group', '警視庁');
  const ps = [];
  for (let i = 0; i < 100; i++) ps.push(N('person', `人物${String(i).padStart(3, '0')}`, { parents: i < 10 ? [sc] : i < 15 ? [sc2] : [], fields: i % 5 ? { 職業: ['探偵', '店主', '記者', '刑事'][i % 4] } : {} }));
  __app.commit(w => {
    for (let i = 0; i < 100; i += 7) { const id = 'm' + i; w.links[id] = { id, a: ps[i], b: i % 2 ? g : pol, kind: 'member', label: '', style: 'dashed', arrow: 'none', color: null }; }
    w.links.par = { id: 'par', a: ps[0], b: ps[1], kind: 'parent', label: '', style: 'solid', arrow: 'none', color: null };
    w.links.par2 = { id: 'par2', a: ps[50], b: ps[51], kind: 'parent', label: '', style: 'solid', arrow: 'none', color: null };
  }, 'x');
  return { tk, os, sc, sc2, g, pol, ps };
});
await p.evaluate(() => __app.go('people')); await wait(500);
ok(await p.locator('.tbl tbody tr').count() === 100, 'people open as a table of 100');
ok(await p.locator('.tbl tbody td >> nth=3').evaluate(el => getComputedStyle(el).whiteSpace === 'pre'), 'table cells never wrap in the middle');

// 並べ替え：職業の見出し。空は最後（どちらの向きでも）
await p.click('.th-sort:has-text("職業")'); await wait(200);
const col = () => p.locator('.tbl tbody tr td:nth-child(4)').allTextContents();
let c = await col();
ok(c[0] !== '' && c.at(-1) === '' && c.indexOf('') === 80, 'sorted by job, blanks last');
await p.click('.th-sort:has-text("職業")'); await wait(200);
c = await col();
ok(c[0] === '店主' || c[0] === '記者' || c[0] === '探偵', 'reversed: ' + c[0]);
ok(c.at(-1) === '', 'blanks still last when reversed');

// まとまり：所属
await p.click('.el-tools .seg button:has-text("まとまり")'); await wait(300);
const heads = await p.locator('.ngroup h3').allTextContents();
ok(heads.length === 3 && heads.at(-1).startsWith('なし'), 'grouped by membership with none last: ' + heads);
await p.click('.el-tools .seg button:has-text("表")'); await wait(300);

// 絵：付けた絵が表に出る
await p.evaluate(async id => {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  await __app.persist.putImage('i1', new Blob([png], { type: 'image/png' }));
  __app.commit(w => { w.images.i1 = { id: 'i1', name: 'face.png', mime: 'image/png' }; w.notes[id].pic = 'i1'; }, '絵');
}, ids.ps[3]); await wait(500);
ok(await p.locator('.tbl tbody tr:has-text("人物003") .pic img[src^="blob:"]').count() === 1, 'picture shows in the table');

// 複数選ぶ：1つ押して Shift で4つ目まで → シナリオに入れる → 元に戻す1回で全部戻る
await p.click('.th-sort:has-text("名前")'); await wait(200);
const rows = p.locator('.tbl tbody tr');
await rows.nth(20).locator('.csel').click();
await rows.nth(23).locator('.csel').click({ modifiers: ['Shift'] }); await wait(200);
ok((await p.locator('.bulk b').textContent()) === '4人を選んでいます', 'shift-click selects a range');
await p.screenshot({ path: SHOT + 'lists-select.png' });
await p.click('.bulk button:has-text("シナリオに入れる")'); await wait(200);
await p.fill('#dlgBody input[type="search"]', '雪山'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await wait(300);
const inSc2 = async () => Object.values((await W()).notes).filter(n => n.parents.includes(ids.sc2)).length;
ok(await inSc2() === 9, 'four people joined the scenario at once');
ok(await p.locator('.bulk').count() === 0, 'selection cleared after the action');
await p.keyboard.press('Control+z'); await wait(300);
ok(await inSc2() === 5, 'one undo takes all four back out');

// 場所を移す・所属に入れる・タグ・消す
const pick4 = async () => { await rows.nth(20).locator('.csel').click(); await rows.nth(23).locator('.csel').click({ modifiers: ['Shift'] }); await wait(200); };
await pick4();
await p.click('.bulk button:has-text("場所を移す")'); await wait(200);
await p.click('#dlgBody .move-opt:has-text("大阪")'); await wait(300);
ok(Object.values((await W()).notes).filter(n => n.at === ids.os).length === 4, 'moved four people to 大阪');
await pick4();
await p.click('.bulk button:has-text("所属に入れる")'); await wait(200);
await p.fill('#dlgBody label:has-text("集団") input', '銀の黄昏教団'); await p.fill('#dlgBody label:has-text("役職") input', '信者');
await p.click('#dlgOk'); await wait(300);
const w1 = await W(), cult = Object.values(w1.notes).find(n => n.title === '銀の黄昏教団');
ok(cult?.kind === 'group' && Object.values(w1.links).filter(l => l.kind === 'member' && l.b === cult.id && l.label === '信者').length === 4, 'four people joined a new group');
await pick4();
await p.click('.bulk button:has-text("タグを付ける")'); await wait(200);
await p.fill('#dlgBody input', '要確認'); await p.click('#dlgOk'); await wait(300);
ok(Object.values((await W()).notes).filter(n => n.tags.includes('要確認')).length === 4, 'tagged four people');
await pick4();
await p.click('.bulk button:has-text("消す")'); await wait(200);
await p.click('#dlgOk'); await wait(300);
ok(Object.values((await W()).notes).filter(n => n.kind === 'person').length === 96, 'deleted four people');
await p.keyboard.press('Control+z'); await wait(300);
ok(Object.values((await W()).notes).filter(n => n.kind === 'person').length === 100, 'undo brings them back');

// シナリオで絞る → 家系図でも同じ。× で戻す
await p.selectOption('.el-tools .scope-sel', { label: 'シナリオ：黄昏の喫茶店' }); await wait(300);
ok(await rows.count() === 10 && (await p.locator('.el-tools .scope-chip').textContent()).includes('10 / 100人'), 'table filtered by scenario with a count');
await p.click('.bar .seg button:has-text("家系図")'); await wait(600);
ok(await p.locator('.fam-node').count() === 2 && await p.locator('.bar .scope-chip').count() === 1, 'family tree is filtered by the same scenario');
await p.click('.bar .scope-chip .x'); await wait(500);
ok(await p.locator('.fam-node').count() === 4, 'clearing shows everyone again');
ok(!errors.length, 'errors: ' + errors.join('\n'));

// スマホ：はみ出さない。「…」からほかの見方へ
const ph = await openApp(b, { width: 390, height: 800 });
await ph.p.evaluate(() => __app.go('people')); await ph.p.waitForTimeout(400);
ok(await ph.p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'phone list does not overflow');
await ph.p.click('nav .nav-more'); await ph.p.waitForTimeout(200);
await ph.p.click('#menu button:has-text("時系列")'); await ph.p.waitForTimeout(800);
ok(await ph.p.evaluate(() => location.hash) === '#/timemap', 'phone reaches the other views from …');
await ph.p.screenshot({ path: SHOT + 'lists-phone.png' });
ok(!ph.errors.length, 'phone errors: ' + ph.errors.join('\n'));
await b.close(); done();
