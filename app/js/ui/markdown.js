// 付箋の本文の書き方（よくある書き方のうち、必要なものだけ）
//   # 見出し / **太字** / *斜体* / ~~取り消し~~ / - 箇条書き / 1. 番号 / > 引用 / --- 区切り
//   [[付箋の名前]]・[[付箋の名前|表示する文字]]：別の付箋へのリンク / ![説明](img:画像id)：画像 / [文字](https://…)：外のページ
// 書かれた文字はすべて無害化してから、決まった形だけを要素にする
import { esc } from '../util.js';

export function renderMarkdown(src, { resolveLink = () => null, imageUrl = () => '' } = {}) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(l => inline(l, resolveLink, imageUrl)).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(renderList(list, resolveLink, imageUrl)); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${renderMarkdown(quote.join('\n'), { resolveLink, imageUrl })}</blockquote>`); quote = []; } };
  const flush = () => { flushPara(); flushList(); flushQuote(); };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    flushQuote();
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); out.push(`<h${m[1].length + 2}>${inline(m[2], resolveLink, imageUrl)}</h${m[1].length + 2}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
      flushPara();
      const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2), ordered = /\d/.test(m[2]);
      (list ||= []).push({ depth, ordered, text: m[3] });
      continue;
    }
    if (list && /^\s+\S/.test(raw)) { list[list.length - 1].text += ' ' + line.trim(); continue; }
    flushList();
    para.push(line);
  }
  flush();
  return out.join('');
}

function renderList(items, rl, iu) {
  let html = '', stack = [];
  for (const it of items) {
    while (stack.length && stack.at(-1).depth > it.depth) html += `</li></${stack.pop().tag}>`;
    const top = stack.at(-1);
    if (!top || it.depth > top.depth) { const tag = it.ordered ? 'ol' : 'ul'; stack.push({ depth: it.depth, tag }); html += `<${tag}><li>`; }
    else html += '</li><li>';
    html += inline(it.text, rl, iu);
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

function inline(text, resolveLink, imageUrl) {
  let s = esc(text);
  // 画像：![説明](img:id)
  s = s.replace(/!\[([^\]]*)\]\(img:([\w-]+)\)/g, (_, alt, id) => `<img class="md-img" data-img="${id}" alt="${alt}" src="${esc(imageUrl(id) || '')}">`);
  // 付箋へのリンク：[[名前]] / [[名前|表示]]
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, title, label) => {
    const t = title.trim(), n = resolveLink(unesc(t));
    return n ? `<a href="#" class="nlink" data-note="${esc(n.id)}">${label || t}</a>` : `<a href="#" class="nlink missing" data-new="${t}" title="まだないカード（押すと、種類を選んで作る）">${label || t}</a>`;
  });
  // 外のページ：[文字](https://…)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>').replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s;
}
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// 本文の中で使われている付箋のリンク先の名前
export const linkTitles = src => [...String(src ?? '').matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim());
export const imageIds = src => [...String(src ?? '').matchAll(/!\[[^\]]*\]\(img:([\w-]+)\)/g)].map(m => m[1]);
