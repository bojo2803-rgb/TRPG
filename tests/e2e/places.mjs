// ロケーション：木で 日本 › 東京都 › 新宿 を作る、日本の地図に東京都を置く、ピンから東京都の地図へ入って戻る、人物の「いる所」
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const byTitle = t => p.evaluate(t => Object.values(__app.world.notes).find(n => n.title === t), t);
const wait = ms => p.waitForTimeout(ms);
await p.click('nav button[data-id="places"]'); await wait(400);
await p.fill('input.add-name', '日本'); await p.locator('input.add-name').press('Enter'); await wait(300);
ok((await byTitle('日本'))?.kind === 'place', 'place created');
// 木の「＋」は、マウスを乗せた行に出る
const addIn = async (parent, name) => { const row = p.locator(`.tree-row:has(.tree-name:text-is("${parent}"))`); await row.hover(); await row.locator('button[aria-label$="の中に作る"]').click(); await wait(200); await p.fill('#dlgBody input', name); await p.click('#dlgOk'); await wait(300); };
await addIn('日本', '東京都'); await addIn('東京都', '新宿');
ok((await p.locator('.tree-row:not(.root)').count()) === 3, 'tree shows three places');
ok((await byTitle('新宿')).parents[0] === (await byTitle('東京都')).id, 'nested under 東京都');
await p.click('.tree-row:has(.tree-name:text-is("日本")) .tree-fold'); await wait(200);
ok((await p.locator('.tree-row:not(.root)').count()) === 1, 'folding hides the inside');
await p.click('.tree-row:has(.tree-name:text-is("日本")) .tree-fold'); await wait(200);

// 東京都に画像なしの地図を作る
await p.dblclick('.tree-name:text-is("東京都")'); await wait(600);
ok(await p.locator('.el-head .crumbs').textContent() === '日本›', 'breadcrumb shows 日本');
await p.click('.el-head .seg button:has-text("地図")'); await wait(400);
await p.click('button:has-text("画像なし（方眼の紙）で作る")'); await wait(200);
await p.click('#dlgOk'); await wait(500);
ok(await p.locator('.el-board .map-sheet').count() === 1, '東京都 has a blank map');
ok(await p.locator('.unplaced button:has-text("新宿")').count() === 1, '新宿 waits to be placed');
// 道しるべで日本へ。日本の地図を作り、東京都を置く
await p.click('.el-head .crumbs button:has-text("日本")'); await wait(600);
ok(await p.locator('.ne.page .ne-title').inputValue() === '日本', 'breadcrumb opens 日本');
await p.click('.el-head .seg button:has-text("地図")'); await wait(400);
await p.click('button:has-text("画像なし（方眼の紙）で作る")'); await wait(200);
await p.click('#dlgOk'); await wait(500);
await p.click('.unplaced button:has-text("東京都")'); await wait(200);
const sh = await p.locator('.el-board .map-sheet').boundingBox();
await p.mouse.click(sh.x + sh.width * .6, sh.y + sh.height * .5); await wait(400);
ok(await p.locator('.map-pin.place:has-text("東京都") .pin-in').count() === 1, '東京都 pin shows it has an inner map');
// 人物の「いる所」を新宿に → 日本の画面と、東京都のピンの数に出る
await p.evaluate(() => __app.newNote({ kind: 'person', title: 'アーミテッジ' }, { open: true })); await wait(400);
await p.click('.ne [data-sec="at"] button:has-text("決める")'); await wait(200);
await p.fill('#dlgBody input[type="search"]', '新宿'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await wait(400);
ok((await byTitle('アーミテッジ')).at === (await byTitle('新宿')).id, 'person placed in 新宿');
ok((await p.locator('.ne [data-sec="at"]').textContent()).includes('日本 › 東京都 › 新宿'), 'place path shown');
ok(await p.locator('.map-pin:has-text("東京都") .pin-n').textContent() === '1', 'pin counts people inside');
await p.evaluate(() => __app.openNote(Object.values(__app.world.notes).find(n => n.title === '日本').id)); await wait(300);
ok((await p.locator('.ne [data-sec="here"]').textContent()).replace(/\s/g, '').includes('アーミテッジ（新宿）'), '日本 lists who is inside');
await p.screenshot({ path: SHOT + 'places-japan.png' });
// ピンから東京都の中へ入り、戻る
await p.click('.map-pin:has-text("東京都")'); await wait(700);
ok(await p.locator('.el-head h2').textContent() === '東京都' && await p.locator('.el-board .map-sheet').count() === 1, 'pin opens 東京都 with its map');
await p.click('.el-head button:has-text("戻る")'); await wait(600);
ok(await p.locator('.el-head h2').textContent() === '日本', 'back returns to 日本');
// 地図の画面：ロケーションの地図を選ぶと道しるべ、ピンで中へ
await p.evaluate(() => __app.go('map')); await wait(600);
await p.selectOption('select[aria-label="地図を選ぶ"]', { label: '日本（ロケーション）' }); await wait(400);
await p.click('.map-pin:has-text("東京都")'); await wait(500);
ok((await p.locator('.bar .crumbs').textContent()).replace(/\s/g, '') === '日本›東京都', 'map screen drills into 東京都 with breadcrumb');
// ディレクトリのように移す：大阪を作って新宿を引っぱって入れる → 中のビル・人も一緒。自分の中へは移せない
await p.click('nav button[data-id="places"]'); await wait(500);
await p.click('.bar .seg button:has-text("木")'); await wait(300);
await p.evaluate(() => { const j = Object.values(__app.world.notes).find(n => n.title === '日本').id; __app.commit(w => { w.notes.osaka = { id: 'osaka', kind: 'place', title: '大阪', body: '', tags: [], fields: {}, parents: [j] }; }); }); await wait(300);
await p.click('.tree-name:text-is("東京都")'); await wait(300);
ok(await p.locator('.explorer-main .tile.place:has-text("新宿")').count() === 1, 'selecting 東京都 lists 新宿 on the right');
await p.locator('.explorer-main .tile.place:has-text("新宿")').dragTo(p.locator('.tree-row:has(.tree-name:text-is("大阪"))')); await wait(400);
ok(JSON.stringify(await p.evaluate(() => { const w = __app.world, n = Object.values(w.notes).find(x => x.title === 'アーミテッジ'); const path = []; for (let x = n.at; x; x = w.notes[x].parents.find(p => w.notes[p]?.kind === 'place')) path.unshift(w.notes[x].title); return path; })) === JSON.stringify(['日本', '大阪', '新宿']), 'dragging 新宿 into 大阪 carries the person along');
await p.locator('.tree-row:has(.tree-name:text-is("日本"))').dragTo(p.locator('.tree-row:has(.tree-name:text-is("新宿"))')); await wait(300);
ok((await p.locator('#toast').textContent()).includes('自分の中へは移せません') && !(await byTitle('日本')).parents.length, 'moving into itself is refused');
// 「移す」ボタン（スマホ用）：新宿を一番上へ
await p.click('.tree-name:text-is("大阪")'); await wait(300);
await p.click('.explorer-main .tile.place:has-text("新宿") button:has-text("移す")'); await wait(300);
await p.click('#dlgBody .move-opt:has-text("一番上")'); await wait(400);
ok(!(await byTitle('新宿')).parents.some(x => x), 'move dialog sends 新宿 to the top');
// カードを引っぱってロケーションへ：人物の場所が変わる
await p.click('.tree-name:text-is("新宿")'); await wait(300);
await p.locator('.explorer-main .tile:has-text("アーミテッジ")').dragTo(p.locator('.tree-row:has(.tree-name:text-is("大阪"))')); await wait(400);
ok((await byTitle('アーミテッジ')).at === 'osaka', 'dragging a person onto 大阪 changes where they are');
await p.click('.tree-row.root .tree-name'); await wait(300);
await p.screenshot({ path: SHOT + 'places-explorer.png' });
// 付箋をロケーションにする
await p.evaluate(() => { const id = __app.newNote({ title: '禁書庫' }, { open: false }); __app.setKind(id, 'place'); });
ok((await byTitle('禁書庫')).kind === 'place', 'note turned into a place');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
