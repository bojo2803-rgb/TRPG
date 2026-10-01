// 時系列マップの視点の切り替え：A→B の途中の絵と、B→A を同じだけ戻した絵が同じか（見本の世界すべて）
import { launch, openApp, ok, done } from './lib.mjs';
const b = await launch();
const { p, errors } = await openApp(b);
const files = await p.evaluate(async () => (await (await fetch('examples/index.json')).json()).map(x => x.file));
for (const f of files) {
  await p.evaluate(async f => { const d = await (await fetch('examples/' + f)).json(); await __app.createWorld('browser', f, d); }, f);
  await p.waitForTimeout(600);
  const res = await p.evaluate(() => {
    const D = () => __tm.__debug();
    const sig = html => {
      const d = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`, 'image/svg+xml'), out = {};
      for (const el of d.querySelectorAll('*')) {
        if (el.tagName === 'svg' || el.tagName === 'g' && !el.getAttribute('style') || /\b(old|hit)\b/.test(el.getAttribute('class') || '')) continue;
        const nums = [], key = [el.tagName, el.getAttribute('class') || '', el.getAttribute('data-k') || '', el.children.length ? '' : el.textContent].join('|');
        for (const a of el.attributes) if (a.name !== 'class' && a.name !== 'data-k') for (const m of a.value.matchAll(/-?\d+(\.\d+)?/g)) nums.push(+m[0]);
        (out[key] ||= []).push(nums);
      }
      for (const k in out) out[k].sort((x, y) => { for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; });
      return out;
    };
    const diff = (A, B) => { let bad = 0; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { const a = A[k] || [], b = B[k] || []; if (a.length !== b.length) { bad++; continue; } a.forEach((x, i) => { const y = b[i]; if (x.length !== y.length || x.some((v, j) => Math.abs(v - y[j]) > .35)) bad++; }); } return bad; };
    const views = [D().OBJECTIVE, ...D().subjects];
    let pairs = 0, bad = 0;
    for (let i = 0; i < views.length; i++) for (let j = 0; j < views.length; j++) {
      if (i === j) continue;
      pairs++;
      const go = v => { D().setView(D().subjects.find(s => s.id === v.id) || D().OBJECTIVE); };
      go(views[i]); D().finishAnim(); go(views[j]); D().cancel();
      const f = [.2, .49, .8].map(e => { D().draw(D().A.s0, D().A.s1, e, true); return sig(D().svg.innerHTML); });
      D().finishAnim(); go(views[i]); D().cancel();
      const r = [.8, .51, .2].map(e => { D().draw(D().A.s0, D().A.s1, e, true); return sig(D().svg.innerHTML); });
      D().finishAnim();
      bad += f.reduce((s, x, k) => s + diff(x, r[k]), 0) ? 1 : 0;
    }
    return { pairs, bad };
  });
  ok(res.bad === 0, `${f}: ${res.bad} of ${res.pairs} pairs asymmetric`);
  console.log(f, res.pairs, 'pairs');
}
ok(!errors.filter(e => !/404|drive\.js|settings/.test(e)).length, 'errors: ' + errors.join('\n'));
await b.close(); done();
