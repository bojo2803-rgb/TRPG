// 思いついたことをすぐ書き留める：1行目が題名、2行目からが本文。Enter で1枚（Shift+Enter で改行）
import { h } from '../util.js';
import { newNote } from '../model.js';

export function parseQuick(text) {
  const [first, ...rest] = text.trim().split('\n');
  return { title: first.trim(), body: rest.join('\n').trim() };
}

// place(w, id)：作った付箋をどこかに貼る（ボードなど）。同じ変更の中で呼ぶので、元に戻すと1回で消える
export function createQuick(ctx, text, place) {
  if (!text.trim()) return null;
  const n = newNote(parseQuick(text));
  ctx.commit(w => { w.notes[n.id] = n; place?.(w, n.id); }, '付箋を追加');
  return n.id;
}

// 入力欄。画面を描き直しても消えないよう、作り直さずに使い回す
export function quickInput(ctx, { placeholder = '思いついたことを書いて Enter（Shift+Enter で改行）', place, onCreate } = {}) {
  const ta = h('textarea', { class: 'quick', rows: 1, placeholder, 'aria-label': '新しい付箋' });
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return; // 229：日本語の変換を確定する Enter
    e.preventDefault();
    const id = createQuick(ctx, ta.value, place);
    if (!id) return;
    ta.value = ''; fit();
    onCreate?.(id);
  });
  return ta;
}

// 小さな窓（上の「＋ 付箋」とキーボードの N）。いまの画面がボードなら、そのボードに貼る
export function quickDialog(ctx, place) {
  const ta = h('textarea', { class: 'quick', rows: 4, placeholder: '思いついたことを書いて Enter（1行目が題名。Shift+Enter で改行）', 'aria-label': '新しい付箋' });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); document.getElementById('dlgOk').click(); }
  });
  ctx.openDialog({
    title: '付箋', ok: '貼る', body: ta,
    onSave: () => {
      const id = createQuick(ctx, ta.value, place);
      if (!id) throw '何か書いてください';
      ctx.toast(`「${ctx.world.notes[id].title}」を作りました${place ? '' : '（付箋の一覧の「どこにも貼っていない」にあります）'}`);
    },
  });
  setTimeout(() => ta.focus(), 0);
}
