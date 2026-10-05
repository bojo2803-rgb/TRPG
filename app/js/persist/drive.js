// Googleドライブに保存する。Googleでログインし、このアプリが作ったファイルだけを読み書きする（drive.file の権限）。
//   ドライブの「TRPG 世界設定」フォルダの中に、世界ごとのフォルダ。その中に world.json（世界のデータ）と画像。
//   保存するとき、もう一方の端末が先に保存していたら、その内容を取り込んでから保存する（merge.js）。同じ付箋を両方で直していたら2枚になる
// 使う前に、Google Cloud で「OAuth クライアント ID」を作り、設定に貼る（手順書：docs/google-drive-setup.md）
import { h } from '../util.js';
import { mergeWorlds } from '../merge.js';
import { registerBackend } from './index.js';

const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder', ROOT_NAME = 'TRPG 世界設定';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CONF = 'trpg-drive';
export const GUIDE_URL = 'https://github.com/bojo2803-rgb/TRPG/blob/claude/happy-fermat-d43t9j/docs/google-drive-setup.md';
const conf = {
  get() { try { return JSON.parse(localStorage.getItem(CONF)) || {}; } catch { return {}; } },
  set(p) { try { localStorage.setItem(CONF, JSON.stringify({ ...conf.get(), ...p })); } catch { /* なし */ } },
};

// ドライブとのやり取り。fetch と、アクセス用の鍵（トークン）を渡すと、自動確認でも使える
export function createDriveBackend({ fetch: f = (...a) => fetch(...a), token }) {
  const metas = new Map(); // 世界の id → { folderId, fileId, version, base（前に保存・読み込みした姿） }
  let rootId = null;
  async function api(method, url, { body, headers = {}, raw = false } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await token(attempt > 0);
      const r = await f(url, { method, headers: { Authorization: `Bearer ${t}`, ...headers }, body });
      if (r.status === 401 && attempt === 0) continue; // 鍵の期限切れ：取り直してもう一度
      if (!r.ok) { let msg = ''; try { msg = (await r.json()).error?.message || ''; } catch { /* なし */ } throw new Error(`Googleドライブ（${r.status}）${msg}`); }
      return raw ? r : r.status === 204 ? null : r.json();
    }
  }
  const q = s => encodeURIComponent(s);
  const list = async (query, fields = 'files(id,name,modifiedTime,version,appProperties)') => (await api('GET', `${API}/files?q=${q(query)}&fields=${q(fields)}&pageSize=1000&spaces=drive`)).files;
  async function root() {
    if (rootId) return rootId;
    const found = await list(`mimeType='${FOLDER}' and trashed=false and appProperties has { key='trpgRoot' and value='1' }`);
    rootId = found[0]?.id || (await api('POST', `${API}/files?fields=id`, { body: JSON.stringify({ name: ROOT_NAME, mimeType: FOLDER, appProperties: { trpgRoot: '1' } }), headers: { 'Content-Type': 'application/json' } })).id;
    return rootId;
  }
  async function folderOf(worldId) {
    if (metas.get(worldId)?.folderId) return metas.get(worldId).folderId;
    const r = await root();
    const found = await list(`'${r}' in parents and mimeType='${FOLDER}' and trashed=false and appProperties has { key='trpgWorld' and value='${worldId.replace(/'/g, '')}' }`);
    return found[0]?.id || null;
  }
  function multipart(meta, data, mime) {
    const B = 'trpg' + Math.random().toString(36).slice(2);
    return { body: new Blob([`--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${B}\r\nContent-Type: ${mime}\r\n\r\n`, data, `\r\n--${B}--`]), headers: { 'Content-Type': `multipart/related; boundary=${B}` } };
  }
  const download = async id => (await api('GET', `${API}/files/${id}?alt=media`, { raw: true }));
  return {
    name: 'drive', label: 'Googleドライブ',
    async listWorlds() {
      const r = await root();
      const fs = await list(`'${r}' in parents and mimeType='${FOLDER}' and trashed=false`);
      return fs.filter(x => x.appProperties?.trpgWorld).map(x => ({ id: x.appProperties.trpgWorld, name: x.name, updated: Date.parse(x.modifiedTime) || 0, folderId: x.id }));
    },
    async loadWorld(id) {
      const folderId = await folderOf(id);
      if (!folderId) return null;
      const files = await list(`'${folderId}' in parents and trashed=false and appProperties has { key='trpgData' and value='1' }`);
      if (!files[0]) return null;
      const text = await (await download(files[0].id)).text();
      metas.set(id, { folderId, fileId: files[0].id, version: files[0].version, base: text });
      return JSON.parse(text);
    },
    // 保存。もう一方の端末が先に保存していたら取り込む。取り込んだときは { world, conflicts } を返す
    async saveWorld(w) {
      let m = metas.get(w.id);
      if (!m) {
        const folderId = await folderOf(w.id) || (await api('POST', `${API}/files?fields=id`, { body: JSON.stringify({ name: w.name, mimeType: FOLDER, parents: [await root()], appProperties: { trpgWorld: w.id } }), headers: { 'Content-Type': 'application/json' } })).id;
        const text = JSON.stringify(w), mp = multipart({ name: 'world.json', parents: [folderId], mimeType: 'application/json', appProperties: { trpgData: '1' } }, text, 'application/json');
        const r = await api('POST', `${UP}/files?uploadType=multipart&fields=id,version`, mp);
        metas.set(w.id, { folderId, fileId: r.id, version: r.version, base: text, name: w.name });
        return null;
      }
      const now = await api('GET', `${API}/files/${m.fileId}?fields=version`);
      let out = w, conflicts = [];
      if (String(now.version) !== String(m.version)) {
        // ドライブは中身が同じでも版を進めることがある。中身が前に保存したときと同じなら、取り込まずにそのまま保存する
        const text = await (await download(m.fileId)).text();
        if (text !== m.base) ({ world: out, conflicts } = mergeWorlds(JSON.parse(m.base), w, JSON.parse(text)));
      }
      const text = JSON.stringify(out);
      const r = await api('PATCH', `${UP}/files/${m.fileId}?uploadType=media&fields=version`, { body: text, headers: { 'Content-Type': 'application/json' } });
      m.version = r.version; m.base = text;
      if (m.name !== out.name) { await api('PATCH', `${API}/files/${m.folderId}?fields=id`, { body: JSON.stringify({ name: out.name }), headers: { 'Content-Type': 'application/json' } }); m.name = out.name; }
      return out === w ? null : { world: out, conflicts };
    },
    // 削除：ドライブのゴミ箱へ（30日以内ならドライブから戻せる）
    async deleteWorld(id) {
      const folderId = await folderOf(id);
      if (folderId) await api('PATCH', `${API}/files/${folderId}?fields=id`, { body: JSON.stringify({ trashed: true }), headers: { 'Content-Type': 'application/json' } });
      metas.delete(id);
    },
    async putImage(worldId, imageId, blob) {
      const folderId = await folderOf(worldId);
      if (!folderId) throw new Error('世界のフォルダが見つかりません');
      const mp = multipart({ name: `画像-${imageId}`, parents: [folderId], appProperties: { trpgImage: imageId } }, blob, blob.type || 'application/octet-stream');
      await api('POST', `${UP}/files?uploadType=multipart&fields=id`, mp);
    },
    async getImage(worldId, imageId) {
      const folderId = await folderOf(worldId);
      if (!folderId) return null;
      const fs = await list(`'${folderId}' in parents and trashed=false and appProperties has { key='trpgImage' and value='${imageId}' }`);
      return fs[0] ? (await download(fs[0].id)).blob() : null;
    },
  };
}

// ===== Googleでログイン（Google Identity Services） =====
let tokenClient = null, accessToken = null, expires = 0, pending = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, ng) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => ng(new Error('Googleのログインの部品を読み込めませんでした（この画面ではつなげないか、通信できません）'));
    document.head.append(s);
  });
}
async function requestToken(prompt) {
  const { clientId } = conf.get();
  if (!clientId) throw new Error('クライアント ID が設定されていません');
  await loadGis();
  if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId, scope: SCOPE,
    callback: r => { const p = pending; pending = null; if (r.error) p?.ng(new Error(`Googleにつなげませんでした（${r.error}）`)); else { accessToken = r.access_token; expires = Date.now() + (Number(r.expires_in) - 60) * 1000; p?.ok(accessToken); } },
    error_callback: e => { const p = pending; pending = null; p?.ng(new Error(e?.message || 'Googleにつなげませんでした（ログインの画面が閉じられました）')); },
  });
  return new Promise((ok, ng) => { pending = { ok, ng }; tokenClient.requestAccessToken({ prompt }); });
}
const getToken = async force => (!force && accessToken && Date.now() < expires) ? accessToken : requestToken('');
const connected = () => !!accessToken;
const backend = createDriveBackend({ token: getToken });
backend.ready = connected;

let appCtx = null;
export async function init(ctx) {
  appCtx = ctx;
  // スマホ用のリンク（…#drive=クライアントID）で開いたら、クライアント ID を覚える
  const m = location.hash.match(/[#&]drive=([\w.-]+\.apps\.googleusercontent\.com)/);
  if (m) { if (m[1] !== conf.get().clientId) { conf.set({ clientId: m[1] }); tokenClient = null; } history.replaceState(null, '', location.pathname + location.search); }
  registerBackend('drive', backend);
}
// つなぐ（ボタンを押したときに呼ぶ。ログインの画面はボタンからでないと開けない）
export async function connect() {
  await requestToken(conf.get().connected ? '' : 'consent');
  conf.set({ connected: true });
}
export function disconnect() {
  if (accessToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null; expires = 0; conf.set({ connected: false });
}
export const wasConnected = () => !!conf.get().connected && !!conf.get().clientId;

// 設定の画面の「Googleドライブ」の欄
export function settingsSection(ctx, el) {
  if (!el) return;
  const c = conf.get();
  const id = h('input', { value: c.clientId || '', placeholder: '…….apps.googleusercontent.com', 'aria-label': 'OAuth クライアント ID', style: { width: '100%' } });
  const status = h('p', { class: 'note-text' }, connected() ? 'つながっています。' : c.clientId ? 'まだつないでいません。' : 'クライアント ID を貼ってから「つなぐ」を押してください。');
  const render = () => el.replaceChildren(
    h('p', { class: 'note-text' }, '世界をGoogleドライブに保存すると、PCとスマホの両方で同じ世界を開けます。最初に一度だけ、Google Cloud でクライアント ID を作る必要があります（無料）。', h('a', { href: GUIDE_URL, target: '_blank', rel: 'noopener' }, '手順書を開く')),
    h('label', {}, 'OAuth クライアント ID', id),
    h('div', { class: 'row' },
      connected()
        ? h('button', { type: 'button', class: 'btn', onclick: () => { disconnect(); status.textContent = '切りました。ドライブの世界は残っています。'; render(); } }, '切る')
        : h('button', { type: 'button', class: 'btn primary', onclick: async () => {
          const v = id.value.trim();
          if (!/\.apps\.googleusercontent\.com$/.test(v)) { status.textContent = 'クライアント ID は「…….apps.googleusercontent.com」の形です。手順書の 5. を見てください'; return; }
          if (v !== c.clientId) { conf.set({ clientId: v }); tokenClient = null; }
          status.textContent = 'Googleのログインの画面を開いています…';
          try { await connect(); status.textContent = 'つながりました。世界の一覧（世界の名前のボタン）に、ドライブの世界が出ます。'; render(); }
          catch (e) { status.textContent = e.message; }
        } }, 'つなぐ'),
      connected() ? h('button', { type: 'button', class: 'btn', onclick: async () => {
        const w = ctx.world;
        try { const copy = JSON.parse(JSON.stringify(w)); await ctx.createWorld('drive', `${w.name}`, copy); status.textContent = `「${w.name}」をGoogleドライブに写して、開きました。`; }
        catch (e) { status.textContent = `写せませんでした：${e.message}`; }
      } }, 'いまの世界をドライブに写す') : null,
      c.clientId ? h('button', { type: 'button', class: 'btn', title: 'このリンクをスマホで開くと、クライアント ID を貼らずに済みます', onclick: async () => {
        const url = `${location.origin}${location.pathname}#drive=${c.clientId}`;
        try { await navigator.clipboard.writeText(url); status.textContent = 'スマホ用のリンクをコピーしました。メモやメッセージでスマホに送って開き、「つなぐ」を押してください。'; }
        catch { status.textContent = `コピーできませんでした。このリンクをスマホで開いてください：${url}`; }
      } }, 'スマホ用のリンクをコピー') : null),
    status);
  render();
}
export { conf as driveConf, appCtx };
