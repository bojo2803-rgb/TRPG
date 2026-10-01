// いま開いている世界。変更はすべて commit() を通す。commit の前の姿を覚えておき、元に戻す（Ctrl+Z）・やり直す（Ctrl+Y）ができる
import { emitter } from './util.js';

export function createStore(world, { limit = 100 } = {}) {
  let w = world, undoStack = [], redoStack = [];
  const ev = emitter();
  const api = {
    get: () => w,
    // fn(world) で直接書き換える。label は「元に戻す」のボタンに出す説明
    commit(fn, label = '') {
      const before = JSON.stringify(w);
      const r = fn(w);
      if (JSON.stringify(w) === before) return r; // 何も変わらなかった
      undoStack.push({ json: before, label });
      if (undoStack.length > limit) undoStack.shift();
      redoStack = [];
      ev.emit({ type: 'change', label });
      return r;
    },
    undo() {
      const u = undoStack.pop();
      if (!u) return;
      redoStack.push({ json: JSON.stringify(w), label: u.label });
      w = JSON.parse(u.json);
      ev.emit({ type: 'undo', label: u.label });
    },
    redo() {
      const r = redoStack.pop();
      if (!r) return;
      undoStack.push({ json: JSON.stringify(w), label: r.label });
      w = JSON.parse(r.json);
      ev.emit({ type: 'redo', label: r.label });
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undoLabel: () => undoStack.at(-1)?.label || '',
    // 別の世界に入れ替える（元に戻す履歴は捨てる）。remote：ドライブから取り込んだ変更（履歴は残す）
    replace(nw, { keepHistory = false } = {}) {
      w = nw;
      if (!keepHistory) { undoStack = []; redoStack = []; }
      ev.emit({ type: 'replace' });
    },
    subscribe: ev.on,
  };
  return api;
}
