// 画面の自動確認の道具：アプリを開く（ブラウザの保存は毎回まっさら）
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
export const BASE = process.env.APP_URL || 'http://127.0.0.1:8770/';
let fails = 0;
export const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else if (process.env.VERBOSE) console.log('ok', msg); };
export const done = () => { console.log(fails ? `${fails} failed` : 'all passed'); process.exitCode = fails ? 1 : 0; };
export async function launch() { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
export async function openApp(b, { width = 1280, height = 800, fresh = true, dark = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.stack || e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.goto(BASE);
  if (fresh) {
    await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('trpg-world-builder'); q.onsuccess = q.onerror = q.onblocked = r; }); });
    await p.reload();
  }
  await p.waitForFunction(() => window.__app && document.getElementById('worldName').textContent !== '…');
  await p.waitForTimeout(300);
  return { p, errors, ctx };
}
