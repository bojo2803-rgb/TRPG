// 家系図：結婚していない2人の子 → 2人を点線で結ぶ。遠い先祖 → 代の数だけ離して「〇代前の先祖」
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
const ids = await p.evaluate(() => {
  const mk = t => __app.newNote({ kind: 'person', title: t }, { open: false });
  const o = { 父: mk('父'), 母: mk('母'), 子: mk('子'), 始祖: mk('始祖') };
  __app.commit(w => { for (const [a, c] of [['父', '子'], ['母', '子']]) { const id = 'l' + a; w.links[id] = { id, a: o[a], b: o[c], label: '', color: null, style: 'solid', arrow: 'none', kind: 'parent' }; } });
  return o;
});
// 遠い先祖は、子の画面の家族の欄から足す
await p.evaluate(id => __app.openNote(id), ids.子); await p.waitForTimeout(300);
await p.click('.ne [data-sec="family"] .row:has-text("遠い先祖") button'); await p.waitForTimeout(200);
await p.fill('#dlgBody input[type="search"]', '始祖'); await p.locator('#dlgBody input[type="search"]').press('Enter'); await p.waitForTimeout(300);
await p.fill('#anc_gen', '5'); await p.click('#dlgOk'); await p.waitForTimeout(300);
ok(await p.evaluate(() => Object.values(__app.world.links).some(l => l.kind === 'ancestor' && l.gen === 5)), 'ancestor link with 5 generations');
await p.evaluate(() => __app.go('people', { sub: 'family' })); await p.waitForTimeout(700);
ok(await p.locator('.fam-partner').count() === 1, 'unmarried parents are joined by a dotted line');
ok(await p.locator('.fam-anc-l').textContent() === '5代前の先祖', 'ancestor label');
const top = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.fam-node')].map(n => [n.querySelector('b').textContent, parseFloat(n.style.top)])));
ok(top['子'] - top['始祖'] === 5 * 130, 'ancestor sits five rows above: ' + JSON.stringify(top));
ok(top['父'] === top['母'] && top['子'] - top['父'] === 130, 'co-parents on the same row, right above the child');
await p.screenshot({ path: '/tmp/claude-0/-home-user-TRPG/d9632758-4ca0-5713-8fd6-526324b6f925/scratchpad/family-new.png' });
ok(!errors.length, 'errors: ' + errors.join('\n'));
await b.close(); done();
