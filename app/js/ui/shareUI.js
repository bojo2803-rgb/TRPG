// シナリオの共有：共有リンク（Googleドライブ）を作る・更新・やめる、ファイルに書き出す。取り込み（ファイル・リンク）
import { h } from '../util.js';
import { scenarioPackage, importPackage, PKG } from '../share.js';

// 包みを作る（画像は文字にして入れる）
export async function buildPackage(ctx, sid, opts) {
  const pkg = scenarioPackage(ctx.world, sid, opts);
  for (const id of pkg.imageIds) {
    const url = await ctx.imageUrl(id).catch(() => null);
    if (!url) continue;
    const blob = await (await fetch(url)).blob();
    const data = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    pkg.images[id] = { name: ctx.world.images[id]?.name || id, mime: blob.type, data };
  }
  return pkg;
}
// いま開いている世界に取り込む。戻り値：取り込んだシナリオの id
export async function importInto(ctx, pkg) {
  let r;
  ctx.commit(w => { r = importPackage(w, pkg); }, `シナリオ「${pkg.title}」を取り込む`);
  for (const [id, im] of Object.entries(r.images)) {
    try { await ctx.persist.putImage(id, await (await fetch(im.data)).blob()); } catch (e) { console.warn('image', id, e); }
  }
  return r.scenarioId;
}
export const isScenarioPackage = d => d?.format === PKG;

// 取り込むか確かめる窓
export function confirmImport(ctx, pkg) {
  ctx.openDialog({
    title: 'シナリオを取り込む', ok: '取り込む',
    body: h('div', { class: 'fields' }, h('p', {}, `シナリオ「${pkg.title}」を、いま開いている世界「${ctx.world.name}」に取り込みます。`),
      h('p', { class: 'note-text' }, `カード ${Object.keys(pkg.notes).length}枚。どれも新しいカードとして入るので、いまの世界のカードは変わりません。別の世界に入れたいときは、先にその世界を開いてから取り込んでください。`)),
    onSave: async () => { const id = await importInto(ctx, pkg); ctx.toast(`「${pkg.title}」を取り込みました`); setTimeout(() => ctx.openElement(id), 0); },
  });
}

// シナリオの詳しい画面の「共有」の欄
export function shareSec(ctx, w, n) {
  const box = h('div', { class: 'fields' });
  const sessions = h('input', { type: 'checkbox', checked: !!n.share?.sessions });
  const status = h('p', { class: 'note-text', role: 'status' });
  const btn = (label, fn, cls = 'btn small') => h('button', { type: 'button', class: cls, onclick: async e => { e.target.disabled = true; try { await fn(); } catch (err) { status.textContent = err.message || String(err); } finally { e.target.disabled = false; } } }, label);
  const publish = async (fileId = null) => {
    const drive = await import('../persist/drive.js');
    if (!drive.isConnected()) throw new Error('Googleドライブにつないでから使えます（設定 → Googleドライブ）');
    if (!drive.hasApiKey()) throw new Error('共有リンクには API キーが要ります（設定 → Googleドライブ。手順書の 8.）');
    status.textContent = 'ドライブに置いています…';
    const pkg = await buildPackage(ctx, n.id, { sessions: sessions.checked });
    let id;
    try { id = await drive.shareFile(ctx.world.id, `共有-${n.title || 'シナリオ'}.json`, JSON.stringify(pkg), fileId); }
    catch (e) { if (!fileId || !/404/.test(e.message)) throw e; id = await drive.shareFile(ctx.world.id, `共有-${n.title || 'シナリオ'}.json`, JSON.stringify(pkg)); ctx.toast('前のリンクのファイルが見つからなかったので、新しいリンクを作りました'); }
    ctx.commit(w => { w.notes[n.id].share = { fileId: id, at: pkg.sharedAt, sessions: sessions.checked }; }, fileId ? '共有を更新' : '共有リンクを作る');
    status.textContent = '';
  };
  const s = n.share;
  const link = async () => (await import('../persist/drive.js')).shareUrl(s.fileId);
  box.append(
    h('p', { class: 'note-text' }, 'リンクを開くだけで、このシナリオ（欄・チャート・登場人物・場所・出来事など）を読めるページを作ります。読む人はアプリもログインも要りません。ほかのGMは、そのページから自分のアプリに取り込めます。'),
    s?.fileId
      ? h('div', { class: 'fields' },
        h('p', {}, `共有中（${new Date(s.at).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}の内容）`),
        h('div', { class: 'row' },
          btn('リンクをコピー', async () => { const u = await link(); try { await navigator.clipboard.writeText(u); status.textContent = 'コピーしました'; } catch { status.textContent = u; } }),
          btn('ページを開く', async () => { window.open(await link(), '_blank', 'noopener'); }),
          btn('更新（いまの内容にする）', () => publish(s.fileId)),
          btn('共有をやめる', async () => { const d = await import('../persist/drive.js'); if (d.isConnected()) await d.unshareFile(s.fileId).catch(e => { if (!/404/.test(e.message)) throw e; }); else throw new Error('Googleドライブにつないでから押してください'); ctx.commit(w => { delete w.notes[n.id].share; }, '共有をやめる'); }, 'btn small danger')))
      : h('div', { class: 'row' }, btn('共有リンクを作る', () => publish(), 'btn small primary')),
    h('label', { class: 'cb' }, sessions, '遊んだ記録も入れる'),
    h('div', { class: 'row' }, btn('ファイルに書き出す', async () => exportFile(ctx, await buildPackage(ctx, n.id, { sessions: sessions.checked }))),
      h('span', { class: 'note-text' }, 'ドライブを使わない人には、ファイルで渡せます（受け取った人は「世界 → 読み込む」）')),
    status);
  return box;
}
function exportFile(ctx, pkg) {
  const json = JSON.stringify(pkg);
  ctx.openDialog({
    title: 'シナリオをファイルに書き出す',
    body: h('div', { class: 'fields' },
      h('p', { class: 'note-text' }, '受け取った人は、左上の世界の名前 →「読み込む」でこのファイルを選ぶと、開いている世界に取り込めます。'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: () => { try { const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: `シナリオ-${pkg.title}.json` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch { ctx.toast('この環境ではファイルに保存できません。コピーしてください'); } } }, 'ファイルに保存'),
        h('button', { type: 'button', class: 'btn', onclick: e => navigator.clipboard?.writeText(json).then(() => { e.target.textContent = 'コピーしました'; }, () => { e.target.textContent = '下の文字を選んでコピーしてください'; }) }, 'コピー')),
      h('textarea', { readOnly: true, rows: 6, class: 'data', 'aria-label': 'シナリオ' }, json)),
  });
}

// リンクから取り込む：アプリを …#import&f=ファイルid&k=APIキー で開いたとき
export async function importFromLink(ctx, hash) {
  const q = new URLSearchParams(hash.replace(/^#/, '').replace(/^import&?/, ''));
  const f = q.get('f'), k = q.get('k');
  if (!f || !k) return;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f)}?alt=media&key=${encodeURIComponent(k)}`);
    if (!r.ok) throw new Error(`読み込めませんでした（${r.status}）。共有がやめられたか、リンクがまちがっています`);
    const pkg = await r.json();
    if (!isScenarioPackage(pkg)) throw new Error('シナリオのファイルではありません');
    confirmImport(ctx, pkg);
  } catch (e) { ctx.toast(e.message, 10000); }
}
