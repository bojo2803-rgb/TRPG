// 小さな道具：DOMを組み立てる h()、文字の無害化、id、まとめて呼ぶ debounce、通知
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
export const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// h('div', { class: 'x', onclick: fn }, '文字', h('span')) → 要素
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : String(c)); };
  kids.forEach(add);
  return el;
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function emitter() {
  const subs = new Set();
  return { on: fn => (subs.add(fn), () => subs.delete(fn)), emit: (...a) => subs.forEach(fn => fn(...a)) };
}

// 日本語の並び順（あいうえお順）
export const collator = new Intl.Collator('ja');
export const byTitle = (a, b) => collator.compare(a.title || '', b.title || '');
