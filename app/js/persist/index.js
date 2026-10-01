// 保存先の切り替えと自動保存。保存先は「このブラウザ」か「Googleドライブ」。どちらも同じ形の関数を持つ
import { debounce, emitter } from '../util.js';
import { local } from './local.js';

const backends = { browser: local };
export const registerBackend = (name, b) => { backends[name] = b; };
export const backendOf = name => backends[name];
export const backendNames = () => Object.keys(backends);

export function createPersistence(store) {
  const ev = emitter();
  let cur = null; // { backend, id }
  let saving = false, again = false, status = { state: 'idle', text: '' };
  const setStatus = (state, text) => { status = { state, text }; ev.emit(status); };
  const urlCache = new Map();

  async function save() {
    if (!cur) return;
    if (saving) { again = true; return; }
    saving = true;
    setStatus('saving', '保存しています…');
    try {
      const b = backends[cur.backend];
      const w = store.get();
      const merged = await b.saveWorld(w);
      // ドライブで、もう一方の端末の変更を取り込んだときは、その結果に入れ替える（元に戻す履歴は残す）
      if (merged?.world && merged.world !== w) store.replace(merged.world, { keepHistory: true });
      if (merged?.conflicts?.length) ev.emit({ state: 'conflict', conflicts: merged.conflicts });
      setStatus('saved', `${b.label}に保存しました`);
    } catch (e) {
      console.error(e);
      setStatus('error', `保存できませんでした：${e.message || e}`);
    } finally {
      saving = false;
      if (again) { again = false; save(); }
    }
  }
  const autosave = debounce(save, 1200);
  store.subscribe(e => { if (cur && e.type !== 'replace') { setStatus('dirty', '保存待ち'); autosave(); } });

  return {
    onStatus: ev.on,
    status: () => status,
    current: () => cur,
    async listAll() {
      const out = [];
      for (const [name, b] of Object.entries(backends)) {
        if (b.ready && !b.ready()) continue;
        try { for (const w of await b.listWorlds()) out.push({ ...w, backend: name, backendLabel: b.label }); }
        catch (e) { console.warn(name, e); }
      }
      return out;
    },
    async open(backend, id) {
      const w = await backends[backend].loadWorld(id);
      if (!w) throw new Error('世界が見つかりません');
      cur = { backend, id };
      return w;
    },
    // 新しい世界を作って保存する（world は呼ぶ側が作る）
    async create(backend, w) {
      cur = { backend, id: w.id };
      await backends[backend].saveWorld(w);
      return w;
    },
    async remove(backend, id) {
      await backends[backend].deleteWorld(id);
      if (cur?.backend === backend && cur.id === id) cur = null;
    },
    attach(backend, id) { cur = { backend, id }; },
    save, flush: () => autosave.flush(),
    // 画像：保存先に置き、表示用のURLを返す
    async putImage(id, blob) {
      await local.putImage(store.get().id, id, blob); // 手元にも置いておく（表示が速い）
      if (cur && cur.backend !== 'browser') await backends[cur.backend].putImage(store.get().id, id, blob);
    },
    async imageUrl(id) {
      const key = store.get().id + '/' + id;
      if (urlCache.has(key)) return urlCache.get(key);
      let blob = await local.getImage(store.get().id, id).catch(() => null);
      if (!blob && cur && cur.backend !== 'browser') {
        blob = await backends[cur.backend].getImage(store.get().id, id).catch(() => null);
        if (blob) await local.putImage(store.get().id, id, blob).catch(() => {});
      }
      const url = blob ? URL.createObjectURL(blob) : null;
      if (url) urlCache.set(key, url);
      return url;
    },
  };
}
