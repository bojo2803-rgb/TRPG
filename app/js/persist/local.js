// このブラウザの中に世界を保存する（IndexedDB）。Googleドライブにつなぐ前や、ドライブを使わない場合の保存先
const DB = 'trpg-world-builder', VER = 1;
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, ng) => {
    let r;
    try { r = indexedDB.open(DB, VER); } catch (e) { ng(e); return; }
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => {
  const d = await db();
  return new Promise((ok, ng) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => ok(out);
    t.onerror = () => ng(t.error);
    t.onabort = () => ng(t.error);
  });
};
const req = r => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });

export const local = {
  name: 'browser',
  label: 'このブラウザ',
  async listWorlds() {
    const all = await tx('worlds', 'readonly', s => req(s.getAll()));
    return all.map(r => ({ id: r.id, name: r.name, updated: r.updated })).sort((a, b) => b.updated - a.updated);
  },
  async loadWorld(id) {
    const r = await tx('worlds', 'readonly', s => req(s.get(id)));
    return r ? JSON.parse(r.json) : null;
  },
  async saveWorld(w) {
    await tx('worlds', 'readwrite', s => req(s.put({ id: w.id, name: w.name, updated: Date.now(), json: JSON.stringify(w) })));
  },
  async deleteWorld(id) {
    await tx('worlds', 'readwrite', s => req(s.delete(id)));
    const keys = await tx('images', 'readonly', s => req(s.getAllKeys()));
    await tx('images', 'readwrite', s => Promise.all(keys.filter(k => k.startsWith(id + '/')).map(k => req(s.delete(k)))));
  },
  async putImage(worldId, imageId, blob) { await tx('images', 'readwrite', s => req(s.put(blob, `${worldId}/${imageId}`))); },
  async getImage(worldId, imageId) { return tx('images', 'readonly', s => req(s.get(`${worldId}/${imageId}`))); },
};

// IndexedDB が使えるか（プライベートウィンドウなどでは使えないことがある）
export async function localAvailable() {
  try { await db(); return true; } catch { return false; }
}
