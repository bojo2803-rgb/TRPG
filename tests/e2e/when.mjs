// 付箋を時系列マップに置き、いろいろな暦で日時を入れる
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
await p.click('#newNote');
await p.fill('.ne-title', '本能寺の変');
await p.click('text=＋ 時系列マップに置く');
await p.waitForTimeout(300);
await p.selectOption('.dinput select[aria-label="暦"]', 'wareki');
await p.fill('.dinput input[aria-label="元号"]', '天正');
await p.fill('.dinput input[aria-label="年"]', '10');
await p.fill('.dinput input[aria-label="月"]', '6');
await p.fill('.dinput input[aria-label="日"]', '2');
await p.waitForTimeout(900);
const w = await p.evaluate(() => Object.values(__app.world.notes)[0].when);
ok(w.cals?.includes('wareki'), 'input calendar added: ' + JSON.stringify(w));
const shown = await p.locator('.when-shown').innerText();
ok(shown.includes('1582年6月21日（ユリウス暦）') && shown.includes('天正10年6月2日'), 'shown: ' + shown);
// あいまいな日付：年まで・〜頃
await p.selectOption('.dinput select[aria-label="精度"]', 'year');
await p.check('.dinput label:has-text("〜頃") input');
await p.waitForTimeout(900);
ok((await p.locator('.when-shown').innerText()).includes('天正10年頃'), 'approx year: ' + await p.locator('.when-shown').innerText());
// 存在しない日付は理由を出して保存しない
await p.selectOption('.dinput select[aria-label="精度"]', 'day');
await p.selectOption('.dinput select[aria-label="暦"]', 'west');
await p.fill('.dinput input[aria-label="年"] >> nth=0', '1582');
await p.fill('.dinput input[aria-label="月"] >> nth=0', '10');
await p.fill('.dinput input[aria-label="日"] >> nth=0', '10');
await p.waitForTimeout(900);
ok(await p.locator('.dpreview.err').count() === 1, 'gap day shows error');
ok(!(await p.locator('.when-shown').innerText()).includes('10月10日'), 'gap day not saved');
// 〜年前
await p.selectOption('.dinput select[aria-label="暦"]', 'ago');
await p.fill('.dinput input[aria-label="何年前"]', '1.38');
await p.selectOption('.dinput select[aria-label="単位"]', '100000000');
await p.waitForTimeout(900);
ok((await p.locator('.when-shown').innerText()).includes('約1.38億年前'), 'years ago: ' + await p.locator('.when-shown').innerText());
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-when.png' });
ok(!errors.filter(e => !/404|drive\.js|settings/.test(e)).length, 'errors: ' + errors.join('\n'));
await b.close(); done();
