// 入力画面・メニュー・お知らせ
import { h, esc } from '../util.js';

const $ = id => document.getElementById(id);
let cur = null;

// body：要素か HTML 文字列。onSave() が文字列を投げたら、その理由を出して閉じない
export function openDialog({ title, body, onSave, onDelete, onChange, onInput, onClick, ok = '保存', cancel = 'やめる', wide = false }) {
  hideMenu();
  const dlg = $('dlg');
  if (dlg.open) dlg.close();
  $('dlgTitle').textContent = title;
  const b = $('dlgBody');
  b.replaceChildren();
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body);
  $('dlgErr').hidden = true;
  $('dlgOk').textContent = ok;
  $('dlgOk').hidden = !onSave;
  $('dlgCancel').textContent = onSave ? cancel : '閉じる';
  const del = $('dlgDel');
  del.hidden = !onDelete; del.textContent = '削除'; delete del.dataset.armed;
  dlg.style.width = wide ? 'min(760px, calc(100vw - 32px))' : '';
  cur = { onSave, onDelete, onChange, onInput, onClick };
  dlg.showModal();
  const first = b.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  first?.focus();
  return b;
}
export const closeDialog = () => { const d = $('dlg'); if (d.open) d.close(); };
export const dialogBody = () => $('dlgBody');
function showErr(e) {
  if (typeof e !== 'string') { console.error(e); e = `うまくいきませんでした（${e?.message || e}）`; }
  $('dlgErr').textContent = e; $('dlgErr').hidden = false;
}
export function initDialog() {
  $('dlgForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await cur?.onSave?.(); closeDialog(); } catch (err) { showErr(err); }
  });
  $('dlgCancel').onclick = closeDialog;
  $('dlgDel').onclick = async () => {
    const del = $('dlgDel');
    if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'もう一度押すと削除'; return; }
    try { await cur?.onDelete?.(); closeDialog(); } catch (err) { showErr(err); }
  };
  $('dlgBody').addEventListener('change', e => cur?.onChange?.(e));
  $('dlgBody').addEventListener('input', e => cur?.onInput?.(e));
  $('dlgBody').addEventListener('click', e => cur?.onClick?.(e));
  document.addEventListener('pointerdown', e => { const m = $('menu'); if (!m.hidden && !m.contains(e.target)) hideMenu(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') hideMenu(); });
}

// メニュー：items = [[表示, 実行する関数, { danger }] | '-' ]
export function showMenu(head, items, x, y) {
  const m = $('menu');
  m.replaceChildren(
    ...(head ? [h('div', { class: 'm-h', html: head })] : []),
    ...items.filter(Boolean).map(it => it === '-' ? h('hr') : h('button', { role: 'menuitem', class: it[2]?.danger ? 'danger' : '', onclick: () => { hideMenu(); it[1](); } }, it[0])),
  );
  m.hidden = false;
  const w = m.offsetWidth, hh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - hh - 8)) + 'px';
  m.querySelector('button')?.focus();
}
export const hideMenu = () => { $('menu').hidden = true; };
export function menuAt(el, head, items) { const r = el.getBoundingClientRect(); showMenu(head, items, r.left, r.bottom + 4); }

// action：{ label, onClick }（お知らせの中のボタン。例：作ったカードを［書く］）
export function toast(msg, ms = 5000, action = null) {
  const t = $('toast');
  t.replaceChildren(msg, ...(action ? [' ', h('button', { type: 'button', class: 'toast-act', onclick: () => { t.hidden = true; action.onClick(); } }, action.label)] : []));
  t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
export { esc };
