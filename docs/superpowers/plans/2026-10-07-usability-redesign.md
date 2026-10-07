# 使いやすさの作り直し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut tab-hopping and make 100+ cards findable: routes with back/forward, recent items, search across everything, info-first pages, stacked side windows, table/picture/grouped lists with multi-select, create-in-place, scenario-scoped picking and filtering.

**Architecture:** Pure helpers in new modules (`route.js`, `search.js`, `listing.js`, `bulk.js`) with unit tests. The note editor becomes a factory so one instance renders the page (main area, two columns) and one renders the peek stack (right panel). `main.js` owns routing, recent items, peek and the search box. `kindView.js` gains list modes, selection and the info page.

**Tech Stack:** Static ES modules; node:test; Playwright e2e (`tests/e2e`).

**Spec:** `docs/superpowers/specs/2026-10-07-usability-redesign-design.md`

## Global Constraints

- UI text in Japanese. No world data in program files. Phone width 390px with no horizontal page overflow.
- Data stays compatible: the only new field is optional `note.pic` (image id). World `VERSION` unchanged.
- Hashes `#import&…` and `#drive=…` keep working; only `#/…` is a route.
- Each bulk action is one `store.commit` (one undo step).

## Review Focus

- Back/forward after deleting the opened card lands on the list, not an error.
- A route to a card id that no longer exists (old bookmark) opens the list.
- Picking an existing person by exact name in the chart cast field never creates a duplicate.
- Typing Japanese with IME in the `[[` suggest and search box: Enter while composing does not choose.
- Selection survives re-render (store update) but clears on view change.

---

### Task 1: Pure helpers

**Files:** Create `app/js/route.js`, `app/js/search.js`, `app/js/listing.js`, `app/js/bulk.js`; Test `tests/ux.test.mjs`

**Interfaces (Produces):**
- `parseRoute(hash) → { view, open?, mode?, sub? } | null`; `formatRoute(view, arg) → '#/…'`; `pushRecent(list, id, max = 10) → list`
- `searchAll(w, q, { recent = [], scope = null, limit = 30 }) → [{ id, kind, title, hint, inScope }]`; `hintOf(w, n) → string`; `linkQuery(text, caret) → { start, q } | null`
- `COLUMNS[kind] = [{ key, label, value(w, n) }]`; `sortRows(w, list, kind, key, dir)`; `GROUPS[kind] = [[key, label]]`; `groupCards(w, list, by) → [{ key, label, items }]`; `inScenario(w, sid) → Set`; `scenarioGroups(w, sid) → Set`; `picOf(w, n) → id | null`
- `addToScenario(w, ids, sid)`, `removeFromScenario(w, ids, sid)`, `setPlace(w, ids, pid)`, `addMember(w, ids, gid, role)`, `addTag(w, ids, tag)`, `deleteMany(w, ids)` — each returns the number changed

- [ ] Tests: route round-trip (`#/people/ID/board`, `#/people?sub=family`), `#import…` → null; recent dedupe/cap/newest-first; search order (starts > contains > fields/body; recent breaks ties; scope first, flagged); `linkQuery` (inside `[[…`, not after `]]`, not across newline); columns (所属 current only, いる所 last two, 持ち主); sort with blanks last both directions; grouping (two groups → twice, なし last); inScenario (children + chart node cards); bulk ops incl. no duplicate membership and one-pass delete.
- [ ] Implement; `npm run -s check` passes.

### Task 2: Editor factory, page and peek

**Files:** `app/js/ui/noteEditor.js`, `app/js/ui/peek.js` (new), `app/js/ui/kindView.js`, `app/js/ui/elements.js`, `app/js/main.js`, `app/css/app.css`

- `createEditor(ctx, root, { layout: 'page' | 'peek', onClose })` with per-instance state; `editLink`, `freeSpot` stay exported.
- Page layout: two columns ≥1100px (main: head with picture, templates, memo; side: relation sections); footer そのほか (色・タグ・ボード地図リンク・削除) for elements. Notes keep tags at top.
- Long template fields hidden when empty → `＋ 外見` buttons; short fields always shown.
- Peek: header with breadcrumb stack (max 8), ‹, ページで開く (elements), 大きく, ×. `ctx.openNote(id)` replaces the stack; `ctx.openRelated(id)` pushes (used by chips/links inside editors and chart refs).
- `ctx.openElement(id)` → route to the page; open modes: info first, remembered per kind; scenario adds チャート, place adds 地図.
- Picture: page head slot (choose/remove image → `pic`), small in peek.

### Task 3: Routing, recent, navigation

**Files:** `app/js/main.js`, `app/index.html`, `app/css/app.css`

- `history.pushState` on view/page/sub/mode changes with `{ i }` index; `popstate` re-mounts; `ctx.back()` = `history.back()` when index > start, else the kind list. Start from `#/…` if valid, else saved view. Capture boot hash before anything for `#import`.
- Nav: main 6 (人物・シナリオ・ロケーション・集団・アイテム・付箋), ほかの見方 4, 最近 10 (PC). Phone: main 6 + 「…」 menu.
- Nav click closes the peek; popstate closes the peek.

### Task 4: Search everywhere

**Files:** `app/js/ui/searchBox.js` (new), `app/js/main.js`, `app/js/ui/kindView.js`, `app/js/ui/notesView.js`, `app/js/ui/graph.js`

- Top box drops down results (kind badge, title, hint, このシナリオ). ↑↓ Enter Esc, IME-safe. Empty query → recent. Ctrl/⌘+K and `/` focus it.
- Lists, notes list and the place tree get their own 「この一覧を絞る」 input; remove `ctx.query`.

### Task 5: Lists, multi-select, scenario filter

**Files:** `app/js/ui/kindView.js`, `app/js/ui/notesView.js`, `app/js/ui/scope.js` (new), `app/js/ui/familyView.js`, `app/js/ui/graph.js`, `app/css/app.css`

- 表／カード／まとまり per kind (localStorage; person defaults to 表). Header sort, picture thumbnails, hints; no 「ボードはまだ空」.
- Selection (checkbox, Shift range, select-all in table) and bulk bar: シナリオに入れる・外す, 場所を移す, 所属に入れる (person), タグ, 消す (confirm). Toast after each.
- Shared `scope.sid` (memory only) select + chip with counts in person/item/group lists, family tree, 相関図, graph.

### Task 6: Create in place, `[[` suggest, chart cast scope

**Files:** `app/js/ui/dialog.js` (toast action), `app/js/main.js`, `app/js/ui/picker.js`, `app/js/ui/elements.js`, `app/js/ui/noteEditor.js`, `app/js/ui/chartView.js`

- `toast(msg, ms, action)`; `ctx.created(ids)` shows 「「X」を人物として作りました［書く］」 → `openRelated`. Called from picker new, name fields (memberDialog/holderDialog via diff), chart fields.
- Memo `[[` suggest (search results + create-as-kind), missing link click asks the kind.
- Chart cast: candidates = scenario cast; 「ほかから選ぶ」 widens; outside picks join the cast; exact outside name never duplicates.

### Task 7: Words, settings, small fixes, share picture

**Files:** many UI files, `app/js/ui/settings.js`, `app/js/share.js`, `app/js/sharePage.js`

- 付箋 only for idea notes; generic → カード; undo labels by kind.
- Settings: Googleドライブ, 見た目, 暦のくわしい設定 (details), 架空の暦.
- Fix `null` text (replaceChildren with nulls). Package includes `pic` images; share page shows them.

### Task 8: Verify, docs, ship

- Update existing e2e scripts to the new layout; add `tests/e2e/nav.mjs` and `tests/e2e/lists.mjs` covering the spec's browser checks; all unit + e2e pass; screenshots PC and phone reviewed.
- Requirements review rows H20–H21; commit; push; republish the artifact (all changed files).
