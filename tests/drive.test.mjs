// Googleドライブの保存：本物のドライブの代わりに、同じ形で答える偽物を使って確かめる（2台の端末）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDriveBackend } from '../app/js/persist/drive.js';
import { newWorld, newNote } from '../app/js/model.js';

function fakeDrive() {
  const files = new Map(); let n = 0;
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const match = (f, q) => q.replace(/ and value=/g, ' AND value=').split(' and ').every(c => {
    c = c.trim();
    let m;
    if ((m = /^mimeType='(.+)'$/.exec(c))) return f.mimeType === m[1];
    if (c === 'trashed=false') return !f.trashed;
    if ((m = /^'(.+)' in parents$/.exec(c))) return (f.parents || []).includes(m[1]);
    if ((m = /^appProperties has \{ key='(.+)' AND value='(.*)' \}$/.exec(c))) return f.appProperties?.[m[1]] === m[2];
    throw new Error('unknown query ' + c);
  });
  async function parseMultipart(body, type) {
    const B = /boundary=(.+)$/.exec(type)[1], text = await body.text();
    const parts = text.split(`--${B}`).slice(1, -1).map(p => p.replace(/^\r\n/, '').replace(/\r\n$/, ''));
    const [meta, data] = parts.map(p => p.slice(p.indexOf('\r\n\r\n') + 4));
    return { meta: JSON.parse(meta), data };
  }
  const fetch = async (url, opt = {}) => {
    const u = new URL(url), method = opt.method || 'GET';
    if (!opt.headers?.Authorization?.startsWith('Bearer ')) return json({ error: { message: 'no auth' } }, 401);
    const idm = /\/files\/([^/?]+)/.exec(u.pathname);
    if (method === 'GET' && !idm) return json({ files: [...files.values()].filter(f => match(f, u.searchParams.get('q'))).map(({ content, ...f }) => f) });
    if (method === 'POST' && u.pathname.startsWith('/drive')) { const meta = JSON.parse(opt.body), id = 'f' + (++n); files.set(id, { id, version: 1, modifiedTime: new Date().toISOString(), ...meta }); return json({ id }); }
    if (method === 'POST' && u.pathname.startsWith('/upload')) { const { meta, data } = await parseMultipart(opt.body, opt.headers['Content-Type']); const id = 'f' + (++n); files.set(id, { id, version: 1, ...meta, content: data }); return json({ id, version: 1 }); }
    const f = files.get(idm[1]);
    if (!f) return json({ error: { message: 'not found' } }, 404);
    if (method === 'GET' && u.searchParams.get('alt') === 'media') return new Response(f.content);
    if (method === 'GET') return json({ version: f.version });
    if (method === 'PATCH' && u.pathname.startsWith('/upload')) { f.content = opt.body; f.version++; return json({ version: f.version }); }
    if (method === 'PATCH') { Object.assign(f, JSON.parse(opt.body)); return json({ id: f.id }); }
    return json({ error: { message: 'unsupported' } }, 400);
  };
  return { fetch, files };
}

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
