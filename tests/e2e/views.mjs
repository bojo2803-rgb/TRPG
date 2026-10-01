// 家系図・グラフ・地図・テンプレート
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
// 人物と家族を作る
await p.evaluate(() => {
  const mk = t => __app.newNote({ title: t, tags: ['NPC'] }, { open: false });
  const [gf, gm, f, m, me, sis] = ['祖父', '祖母', '父', '母', '私', '妹'].map(mk);
  __app.commit(w => {
    const L = (a, b, kind) => { const id = 'l' + Math.random().toString(36).slice(2, 8); w.links[id] = { id, a, b, label: '', color: null, style: 'solid', arrow: 'none', kind }; };
    L(gf, gm, 'spouse'); L(f, m, 'spouse'); L(gf, f, 'parent'); L(gm, f, 'parent'); L(f, me, 'parent'); L(m, me, 'parent'); L(f, sis, 'parent'); L(m, sis, 'parent');
    w.notes[me].body = '[[妹]]と[[父]]の話'; w.notes[sis].parents = [f];
  });
});
await p.evaluate(() => __app.go('people', { sub: 'family' })); await p.waitForTimeout(700);
ok(await p.locator('.fam-node').count() === 6, 'family nodes');
const y = await p.evaluate(() => [...document.querySelectorAll('.fam-node')].map(n => [n.textContent, parseFloat(n.style.top)]));
const top = Object.fromEntries(y.map(([t, v]) => [t.replace(/[^一-龠ぁ-んァ-ン]/g, ''), v]));
ok(top['祖父'] < top['父'] && top['父'] < top['私'] && top['父'] === top['母'], 'generations: ' + JSON.stringify(top));
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-family.png' });
await p.locator('.fam-node', { hasText: '私' }).click(); await p.waitForTimeout(300);
ok(await p.locator('.ne-title').inputValue() === '私', 'clicking node opens note');
await p.click('.ne button[aria-label="閉じる"]');
await p.click('nav button[data-id="graph"]'); await p.waitForTimeout(600);
ok(await p.locator('.g-node').count() === 6, 'graph nodes: ' + await p.locator('.g-node').count());
ok(await p.locator('.g-body').count() === 2 && await p.locator('.g-group').count() === 1, 'graph body/group edges');
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-graph.png' });
// 地図
await p.evaluate(() => __app.go('map')); await p.waitForTimeout(500);
await p.click('text=＋ 地図');
await p.setInputFiles('#mp_file', { name: 'arkham.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#cdb"/><path d="M0,300 C200,250 600,350 800,300" stroke="#58a" stroke-width="30" fill="none"/></svg>') });
await p.fill('#mp_name', 'アーカム');
await p.click('#dlgOk'); await p.waitForTimeout(600);
ok(await p.locator('.map-layer img').count() === 1, 'map image shown');
await p.click('.bar button:has-text("＋ ピン")');
await p.locator('.pick-list button', { hasText: '私' }).click();
const ib = await p.locator('.map-layer img').boundingBox();
await p.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2); await p.waitForTimeout(300);
ok(await p.locator('.map-pin').count() === 1, 'pin placed');
const pin = await p.evaluate(() => Object.values(__app.world.maps)[0].pins[0]);
ok(Math.abs(pin.x - 400) < 5 && Math.abs(pin.y - 300) < 5, 'pin at clicked spot: ' + JSON.stringify(pin));
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/app-map.png' });
// テンプレート：項目を足す → 付箋に出る
await p.click('nav button[data-id="templates"]'); await p.waitForTimeout(300);
await p.click('.tpl-item:has-text("クトゥルフ")'); await p.waitForTimeout(200);
await p.click('text=＋ 項目'); await p.waitForTimeout(200);
await p.fill('.tpl-row:last-child input', '好きな神話生物'); await p.locator('.tpl-row:last-child input').press('Tab'); await p.waitForTimeout(200);
await p.evaluate(() => __app.openNote(Object.values(__app.world.notes).find(n => n.title === '私').id)); await p.waitForTimeout(300);
ok(await p.locator('.tpl-grid label', { hasText: '好きな神話生物' }).count() === 1, 'new template field shows on note');
ok(!errors.filter(e => !/404|drive\.js|settings/.test(e)).length, 'errors: ' + errors.join('\n'));
await b.close(); done();
