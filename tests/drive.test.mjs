// Googleドライブの保存：本物のドライブの代わりに、同じ形で答える偽物を使って確かめる（2台の端末）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDriveBackend } from '../app/js/persist/drive.js';
import { newWorld, newNote } from '../app/js/model.js';
import { fakeDrive } from './fake-drive.mjs';

test('two devices: create, load, edit different notes, both edits survive; same note → two notes', async () => {
  const srv = fakeDrive();
  const A = createDriveBackend({ fetch: srv.fetch, token: async () => 'tA' }), B = createDriveBackend({ fetch: srv.fetch, token: async () => 'tB' });
  const w = newWorld('共有の世界');
  w.notes.a = newNote({ id: 'a', title: '甲' }); w.notes.b = newNote({ id: 'b', title: '乙' });
  await A.saveWorld(w);
  assert.deepEqual((await B.listWorlds()).map(x => x.name), ['共有の世界']);
  const wa = JSON.parse(JSON.stringify(w)), wb = await B.loadWorld(w.id);
  wa.notes.a.body = 'PCで書いた'; wb.notes.b.body = 'スマホで書いた';
  assert.equal(await A.saveWorld(wa), null); // 先に保存：取り込みなし
  const r = await B.saveWorld(wb); // あとから保存：PCの変更を取り込む
  assert.equal(r.world.notes.a.body, 'PCで書いた');
  assert.equal(r.world.notes.b.body, 'スマホで書いた');
  // PCがまた保存すると、スマホの変更を取り込む
  wa.name = '共有の世界（改）';
  const r2 = await A.saveWorld(wa);
  assert.equal(r2.world.notes.b.body, 'スマホで書いた');
  assert.equal([...srv.files.values()].find(f => f.appProperties?.trpgWorld).name, '共有の世界（改）');
  // 同じ付箋を両方で直す → 2枚
  const pa = r2.world, pb = JSON.parse(JSON.stringify(r.world));
  pa.notes.a.title = '甲（PC）'; pb.notes.a.title = '甲（スマホ）';
  await A.saveWorld(pa);
  const r3 = await B.saveWorld(pb);
  assert.equal(r3.conflicts.length, 1);
  assert.deepEqual(Object.values(r3.world.notes).map(n => n.title).filter(t => t.startsWith('甲')).sort(), ['甲（PC）', '甲（スマホ）（この端末の版）']);
});

test('expired token is refreshed once; delete moves folder to trash', async () => {
  const srv = fakeDrive();
  let calls = 0;
  const A = createDriveBackend({ fetch: async (u, o) => { calls++; if (calls === 1) return new Response('{}', { status: 401 }); return srv.fetch(u, o); }, token: async force => force ? 'fresh' : 'stale' });
  const w = newWorld('消す世界');
  await A.saveWorld(w);
  await A.deleteWorld(w.id);
  assert.equal((await A.listWorlds()).length, 0);
  assert.ok([...srv.files.values()].some(f => f.appProperties?.trpgWorld && f.trashed));
});

test('images are stored in the world folder', async () => {
  const srv = fakeDrive(), A = createDriveBackend({ fetch: srv.fetch, token: async () => 't' });
  const w = newWorld('画像の世界'); await A.saveWorld(w);
  await A.putImage(w.id, 'img1', new Blob(['PNGDATA'], { type: 'image/png' }));
  const blob = await A.getImage(w.id, 'img1');
  assert.equal(await blob.text(), 'PNGDATA');
});

// 保存中に打った文字が消えない：保存の通信を待っているあいだに入力し、そのあと保存が終わっても残る
async function savingWhileTyping(bump, at = 'version') {
  const { createStore } = await import('../app/js/store.js');
  const { createPersistence, registerBackend } = await import('../app/js/persist/index.js');
  const srv = fakeDrive();
  let during = null; // 保存の通信の途中で1回だけ呼ぶ（そのあいだに入力する）
  const hit = (url, m) => at === 'version' ? m === 'GET' && /fields=version/.test(url) : m === 'PATCH' && /\/upload\//.test(url);
  const slow = async (url, opt = {}) => { if (during && hit(url, opt.method || 'GET')) { const d = during; during = null; await d(); } return srv.fetch(url, opt); };
  const A = createDriveBackend({ fetch: slow, token: async () => 'tA' });
  registerBackend('drive', A);
  const w = newWorld('世界');
  w.notes.a = newNote({ id: 'a', title: '甲' }); w.notes.b = newNote({ id: 'b', title: '乙' });
  const store = createStore(JSON.parse(JSON.stringify(w)));
  const p = createPersistence(store);
  await p.create('drive', store.get());
  const file = [...srv.files.values()].find(f => f.appProperties?.trpgData);
  await bump(srv, file, w);
  const events = [];
  store.subscribe(e => events.push(e.type));
  store.commit(w => { w.notes.a.body = '保存する前の文字'; });
  during = () => { store.commit(w => { w.notes.a.title = '甲（保存中に打った）'; w.notes.c = newNote({ id: 'c', title: '保存中に作った付箋' }); }); };
  await p.save();
  return { store, events, srv, file };
}

test('typing during a save is kept when Drive only bumped the version (no real change)', async () => {
  const { store, events } = await savingWhileTyping(async (srv, file) => { file.version++; }); // ドライブの中だけで版が進む
  assert.equal(store.get().notes.a.title, '甲（保存中に打った）');
  assert.equal(store.get().notes.a.body, '保存する前の文字');
  assert.ok(!events.includes('replace'), 'no replace when nothing changed elsewhere: ' + events);
});

test('typing during a save is kept when the other device changed something', async () => {
  const { store, file } = await savingWhileTyping(async (srv, file, w) => {
    const other = JSON.parse(JSON.stringify(w)); other.notes.b.title = '乙（スマホで直した）';
    file.content = JSON.stringify(other); file.version++;
  });
  assert.equal(store.get().notes.a.title, '甲（保存中に打った）');
  assert.equal(store.get().notes.a.body, '保存する前の文字');
  assert.equal(store.get().notes.b.title, '乙（スマホで直した）');
});

test('typing during the upload itself is kept after merging the other device', async () => {
  const { store } = await savingWhileTyping(async (srv, file, w) => {
    const other = JSON.parse(JSON.stringify(w)); other.notes.b.title = '乙（スマホで直した）';
    file.content = JSON.stringify(other); file.version++;
  }, 'upload');
  assert.equal(store.get().notes.a.title, '甲（保存中に打った）');
  assert.equal(store.get().notes.c?.title, '保存中に作った付箋');
  assert.equal(store.get().notes.b.title, '乙（スマホで直した）');
});

test('sharing puts a public file that anyone with the key can read; update keeps the id; unshare removes it', async () => {
  const srv = fakeDrive();
  const A = createDriveBackend({ fetch: srv.fetch, token: async () => 'tA' });
  const w = newWorld('世界');
  await A.saveWorld(w);
  const id = await A.share(w.id, '共有-シナリオ.json', '{"v":1}');
  const read = async () => { const r = await srv.fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=K`); return r.ok ? r.text() : r.status; };
  assert.equal(await read(), '{"v":1}');
  assert.equal(await A.share(w.id, 'x', '{"v":2}', id), id);
  assert.equal(await read(), '{"v":2}');
  await A.unshare(id);
  assert.equal(await read(), 404);
});

test('an AI-readable summary of the whole world is kept next to the data, updated after saves', async () => {
  const srv = fakeDrive(), A = createDriveBackend({ fetch: srv.fetch, token: async () => 't', digestDelay: 0 });
  const tick = () => new Promise(r => setTimeout(r, 20));
  const w = newWorld('黄昏の世界');
  w.notes.a = newNote({ id: 'a', kind: 'person', title: '店主 葛城' });
  await A.saveWorld(w); await tick();
  const digests = () => [...srv.files.values()].filter(f => f.appProperties?.trpgDigest);
  assert.equal(digests().length, 1);
  assert.equal(digests()[0].name, 'AI用まとめ（黄昏の世界）.md');
  assert.equal(digests()[0].mimeType, 'text/markdown');
  assert.match(digests()[0].content, /^# 世界「黄昏の世界」[\s\S]*## AIへのお願い[\s\S]*店主 葛城/);
  const folder = [...srv.files.values()].find(f => f.appProperties?.trpgWorld).id;
  assert.ok(digests()[0].parents.includes(folder), 'in the world folder');
  // 直して保存 → 同じファイルが新しくなる。名前を変えれば、ファイルの名前も
  w.notes.b = newNote({ id: 'b', kind: 'person', title: '記者 三浦' }); w.name = '黄昏の世界（改）';
  await A.saveWorld(w); await tick();
  assert.equal(digests().length, 1, 'still one file');
  assert.match(digests()[0].content, /記者 三浦/);
  assert.equal(digests()[0].name, 'AI用まとめ（黄昏の世界（改））.md');
  // すぐ書く（AIに読ませる画面を開いたとき）
  w.notes.c = newNote({ id: 'c', kind: 'place', title: 'K村' });
  await A.writeDigest(w);
  assert.match(digests()[0].content, /K村/);
});
