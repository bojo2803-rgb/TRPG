// 見本の世界を作る：時系列マップの試作品の見本（prototype/examples）を、本体の形に直して app/examples に置く
// 使い方：node tools/make-examples.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { migrateWorld } from '../app/js/model.js';
const src = new URL('../prototype/examples/', import.meta.url), dst = new URL('../app/examples/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', src)));
const out = [];
for (const x of index) {
  const w = migrateWorld(JSON.parse(readFileSync(new URL(x.file, src))));
  w.name = x.name.replace(/：.*/, '');
  // ボードが空にならないよう、主体と、まとめを貼っておく
  const b = Object.values(w.boards)[0];
  const people = Object.values(w.notes).filter(n => n.legs), groups = Object.values(w.notes).filter(n => Object.values(w.notes).some(o => o.parents.includes(n.id)));
  [...people, ...groups].forEach((n, i) => { b.items[n.id] = { x: 40 + (i % 5) * 230, y: 40 + Math.floor(i / 5) * 150 }; });
  w.id = 'w-example-' + x.file.replace('.json', '');
  writeFileSync(new URL(x.file, dst), JSON.stringify(w, null, 1));
  out.push({ name: x.name, file: x.file });
}
writeFileSync(new URL('index.json', dst), JSON.stringify(out, null, 1));
console.log('wrote', out.length, 'examples');
