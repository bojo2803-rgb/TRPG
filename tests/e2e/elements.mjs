// 要素：人物・アイテム・集団・シナリオを作る、開くとボード、付箋を貼る、所属・持ち主、組織図・相関図、要素のカードから移って戻る
import { launch, openApp, ok, done } from './lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/';
const b = await launch();
const { p, errors } = await openApp(b);
const W = () => p.evaluate(() => __app.world);
const byTitle = async t => Object.values((await W()).notes).find(n => n.title === t);
const tab = async id => { await p.click(`nav button[data-id="${id}"]`); await p.waitForTimeout(400); };
const add = async name => { await p.fill('input.add-name', name); await p.locator('input.add-name').press('Enter'); await p.waitForTimeout(300); };

await tab('people');
await add('アーミテッジ');
ok((await byTitle('アーミテッジ'))?.kind === 'person', 'person created');
ok(await p.locator('.ne [data-sec="tpl"] h3').first().textContent() === '人物の基本', 'person template shows');
// 所属：集団に入れる（ない集団は作られる）
await p.click('.ne [data-sec="member"] button:has-text("集団に入れる")'); await p.waitForTimeout(200);
await p.fill('#dlgBody label:has-text("集団") input', 'ミスカトニック大学');
await p.fill('#dlgBody label:has-text("役職") input', '図書館長');
await p.click('#dlgOk'); await p.waitForTimeout(300);
const uni = await byTitle('ミスカトニック大学');
ok(uni?.kind === 'group', 'group created from the member dialog');
ok(Object.values((await W()).links).some(l => l.kind === 'member' && l.b === uni.id && l.label === '図書館長'), 'member link with role');
// 開くと、まず情報のページ。ボードに切り替えると、書き留めた付箋はその人物のボードに貼られる
await p.click('.tbl-name:has-text("アーミテッジ")'); await p.waitForTimeout(500);
ok(await p.locator('.ne.page .ne-title').inputValue() === 'アーミテッジ', 'opening a person shows their information first');
ok(await p.locator('#panel').isHidden(), 'no side window for the same card');
await p.click('.el-head .seg button:has-text("ボード")'); await p.waitForTimeout(500);
ok(await p.locator('.el-head h2').textContent() === 'アーミテッジ', 'element header');
ok(await p.locator('.bcard.owner').count() === 1, 'element card on its own board');
await p.fill('.el-board .quick', '禁書庫の鍵を持っている'); await p.locator('.el-board .quick').press('Enter'); await p.waitForTimeout(300);
const armId = (await byTitle('アーミテッジ')).id, keyId = (await byTitle('禁書庫の鍵を持っている'))?.id;
const pb = Object.values((await W()).boards).find(x => x.owner === armId);
ok(pb && keyId && pb.items[keyId], 'quick note lands on the element board');
await p.screenshot({ path: SHOT + 'el-board.png' });
await p.click('.el-head button >> nth=0'); await p.waitForTimeout(300);
ok(await p.locator('.el-head .seg button[aria-pressed="true"]').textContent() === '情報', 'back goes to the information page first');
await p.click('.el-head button >> nth=0'); await p.waitForTimeout(300);
ok(await p.locator('.tbl-name').count() === 1, 'back to people list');

// アイテム：持ち主を変える → 持ち主の期間と、時系列の出来事
await tab('items');
await add('ネクロノミコン');
await p.click('.ne [data-sec="holders"] button:has-text("持ち主を変える")'); await p.waitForTimeout(300);
await p.fill('#dlgBody label:has-text("新しい持ち主") input', 'アーミテッジ');
await p.check('#dlgBody label:has-text("いつ渡ったか") input');
await p.fill('#dlgBody .dinput input[aria-label="年"]', '1928');
await p.click('#dlgOk'); await p.waitForTimeout(300);
const book = await byTitle('ネクロノミコン'), arm = await byTitle('アーミテッジ');
ok(Object.values((await W()).links).some(l => l.kind === 'holds' && l.a === arm.id && l.b === book.id && l.from), 'holds link with date');
ok((await byTitle('「ネクロノミコン」がアーミテッジの手に渡る'))?.when, 'hand-over event placed on the time map');
ok((await p.locator('.ne [data-sec="holders"]').textContent()).includes('いまの持ち主'), 'current holder marked');

// 集団：組織図と相関図
await tab('groups');
await p.click('.seg button:has-text("組織図")'); await p.waitForTimeout(400);
ok((await p.locator('.org-node').textContent()).includes('図書館長：アーミテッジ'), 'org chart lists member with role');
await p.click('.seg button:has-text("相関図")'); await p.waitForTimeout(400);
ok(await p.locator('.g-node').count() === 1, 'relation graph shows groups');

// シナリオ：登場させる・遊んだ記録
await tab('scenarios');
await add('ダンウィッチの怪');
await p.click('.ne [data-sec="contents"] .row:has-text("登場") button'); await p.waitForTimeout(200);
await p.fill('#dlgBody input[type="search"]', 'アーミテッジ'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await p.waitForTimeout(300);
ok((await byTitle('アーミテッジ')).parents.includes((await byTitle('ダンウィッチの怪')).id), 'person added to scenario');
await p.click('.ne [data-sec="sessions"] button:has-text("記録を足す")'); await p.waitForTimeout(200);
ok((await byTitle('ダンウィッチの怪')).sessions?.length === 1, 'session record added');

// ボードの要素のカードを押すと、右の小窓に開く（ボードから離れない）。「ページで開く」でそのページへ。戻ると元のボード
await tab('people');
await p.evaluate(id => __app.openElement(id, { mode: 'board' }), arm.id); await p.waitForTimeout(500);
await p.evaluate(id => { const w = __app.world; const b = Object.values(w.boards).find(x => x.owner === id); __app.commit(w => { w.boards[b.id].items[Object.values(w.notes).find(n => n.title === 'ネクロノミコン').id] = { x: 400, y: 60 }; }); }, arm.id);
await p.waitForTimeout(300);
await p.click('.bcard.el:not(.owner):has-text("ネクロノミコン")'); await p.waitForTimeout(500);
ok((await p.locator('.peek-crumbs').textContent()).includes('ネクロノミコン') && await p.locator('.el-head h2').textContent() === 'アーミテッジ', 'element card opens in the side window, board stays');
await p.click('.peek-head button:has-text("ページで開く")'); await p.waitForTimeout(500);
ok(await p.locator('.ne.page .ne-title').inputValue() === 'ネクロノミコン' && await p.locator('nav button[data-id="items"]').getAttribute('aria-current') === 'page' && await p.locator('#panel').isHidden(), 'open as page moves to its tab');
await p.click('.el-head button:has-text("戻る")'); await p.waitForTimeout(500);
ok(await p.locator('.el-head h2').textContent() === 'アーミテッジ', 'back returns to the previous element');
// 付箋を人物に変える
await tab('notes');
await p.click('.ncard:has-text("禁書庫の鍵")'); await p.waitForTimeout(300);
await p.evaluate(() => __app.setKind(Object.values(__app.world.notes).find(n => n.title.startsWith('禁書庫')).id, 'item'));
ok((await byTitle('禁書庫の鍵を持っている')).kind === 'item' && await p.locator('.ne [data-sec="holders"]').count() === 1, 'note turned into an item');
// シナリオのボード：登場するものを全部貼る（種類ごとの行。元に戻すで1回）
const scId = await p.evaluate(() => {
  const N = (k, t, x = {}) => __app.newNote({ kind: k, title: t, ...x }, { open: false });
  const sc = N('scenario', 'ダンウィッチの怪');
  for (const t of ['ウィルバー', 'ラヴィニア']) N('person', t, { parents: [sc] });
  N('item', 'ネクロノミコンの写し', { parents: [sc] });
  return sc;
});
await p.evaluate(id => __app.openElement(id, { mode: 'board' }), scId); await p.waitForTimeout(600);
const placeBtn = p.locator('.bar button:has-text("登場するものを全部貼る")');
ok((await placeBtn.textContent()).includes('（3）'), 'button says how many will be placed');
await placeBtn.click(); await p.waitForTimeout(400);
let items = Object.keys(Object.values((await W()).boards).find(x => x.owner === scId).items);
ok(items.length === 4 && await p.locator('.bcard[data-id]').count() === 4, 'all three placed next to the scenario card');
ok(await p.locator('.bar button:has-text("全部貼ってあります")').isDisabled(), 'nothing left to place');
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
items = Object.keys(Object.values((await W()).boards).find(x => x.owner === scId).items);
ok(items.length === 1, 'one undo takes them all off');
// 人物の表：年齢ではなく生年月日
await tab('people');
ok(await p.locator('.th-sort:has-text("生年月日")').count() === 1 && await p.locator('.th-sort:has-text("年齢")').count() === 0, 'people table has birth dates, not a fixed age');
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
