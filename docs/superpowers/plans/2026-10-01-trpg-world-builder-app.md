# TRPG世界設定アプリ（本体）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full world-building web app described in the design memo: notes with templates, cork boards, family trees, graph view, image maps, the time map (ported from the prototype), every calendar the memo lists with selectable schools, Google Drive storage with conflict merge, undo, and a random-character generator.

**Architecture:** Static site, no build step: `app/index.html` loads native ES modules from `app/js/`. One world = one JSON document held in a store with snapshot undo; views (notes, board, family tree, graph, map, time map) render from the store and write back through `store.commit()`. Persistence is pluggable: IndexedDB in the browser (works with no setup, also inside a claude.ai Artifact) or Google Drive (`drive.file` scope) with a three-way merge on save. Pure logic (calendars, merge, markdown, layout) lives in modules that run under `node --test`; UI is checked with Playwright.

**Tech Stack:** Vanilla JS (ES2022 modules), SVG for boards/graph/time map, IndexedDB, Google Identity Services + Drive REST v3, vendored `ya-wareki` (BSD-2, 日本暦日原典 based lunisolar table 445–1872) and `ya-kansuji` (MIT), Umm al-Qura month table from `hijri-converter` (MIT). Tests: `node --test`, Playwright (global install, Chromium at `/opt/pw-browsers`).

**Spec:** `docs/superpowers/specs/2026-09-29-trpg-world-builder-design.md` (+ decisions in `2026-09-30-requirements-review.md`, time map behaviour in `prototype/timemap.html` v7).

## Global Constraints

- UI language: Japanese only. Plain words a non-programmer understands (the user does not write code).
- Hosting: GitHub Pages (public repo OK). Deploy via GitHub Actions from `app/`.
- Storage: Google Drive, one folder per world, auto-save, online only; plus browser storage so the app works before Drive is set up.
- Two devices editing the same note → the note appears twice ("同じ付箋が2枚現れる").
- Ctrl+Z undo. No change-history feature.
- Time: stored as day number (integer) + seconds of day (integer), UTC; from the start of the universe (≈13.8 billion years ago); UI at minute precision.
- Calendars: Western, 和暦（元号＋旧暦）, ヒジュラ暦, 架空の暦; every school listed in §5.5 selectable, ordered most common first, ★ as default.
- Time zones: default Asia/Tokyo, per event; historical offsets from the browser's tz database; fixed offset outside its range.
- CoC 6th edition template: item names and empty value slots only, no rulebook text.
- Random character: names, stats, memo, fully random ("ガチランダム").
- Time map: keep every v7 prototype behaviour (loops as worldlines, doubles, branch points, time-free diagonals, symmetric transitions).
- No world data hard-coded in the program; samples live in `app/examples/`.

## Review Focus

- A Drive save racing a save from the other device → both edits survive (merge), conflicting note duplicated, never silent loss. (Task 9 tests)
- Dates before year 1, near −13.8e9 years, and around 1582-10-05..14, 明治5年12月3日..31日 → rejected or shown correctly, never shifted. (Task 2 tests)
- Opening a world saved by an older app version or a prototype export → migrated, not crashed. (Task 1, Task 7 tests)
- Deleting a note that is on boards, maps, the time map, or is a parent/origin → references cleaned, nothing renders broken. (Task 3 tests)
- Phone width (390px) → every view usable for reading and light edits, no horizontal page scroll. (Task 10 e2e)

---

## File map

```
app/index.html                 shell; loads js/main.js
app/css/app.css                tokens (light/dark), layout
app/examples/                  sample world(s) as JSON
app/vendor/ya-wareki.js        vendored (import path + extra export patched; see vendor/README.md)
app/vendor/ya-kansuji.js
app/js/util.js                 h(), esc(), uid(), debounce, emitter
app/js/model.js                newWorld(), migrateWorld(), note/link/board helpers, deleteNote()
app/js/store.js                createStore(): get(), commit(fn,label), undo(), redo(), subscribe()
app/js/merge.js                mergeWorlds(base, local, remote) -> {world, conflicts}
app/js/persist/local.js        IndexedDB worlds + image blobs
app/js/persist/drive.js        GIS auth, Drive folder/world/image CRUD, saveWithMerge()
app/js/persist/index.js        backend selection, autosave loop, status
app/js/cal/time.js             {d,s} <-> float days, tz offsets (Intl), add/compare
app/js/cal/western.js          Julian/Gregorian with schools
app/js/cal/astro.js            sun longitude, new moons (Meeus, low precision)
app/js/cal/kyureki.js          modern lunisolar (Tenpō rules), 2033 problem
app/js/cal/wareki.js           ya-wareki wrapper: both courts, 改元 B, 皇紀, 干支
app/js/cal/hijri.js            Umm al-Qura table + 8 tabular variants + crescent approximations
app/js/cal/fict.js             user-defined calendars
app/js/cal/index.js            CALENDARS registry, formatTime(), fuzzy text
app/js/ui/*.js                 shell, dialog, dateInput, noteEditor, markdown, notesList,
                               templates, board, familyTree, graph, mapView, random, settings
app/js/timemap/*.js            prototype engine as modules + adapter to the store
tests/*.test.mjs               node --test
tests/e2e/*.mjs                Playwright
.github/workflows/pages.yml    deploy app/ to GitHub Pages
docs/google-drive-setup.md     手順書 (Google Cloud setup, screen by screen)
```

## Task 1: Shell, model, store, browser storage

**Interfaces (produced):**
- `newWorld(name) -> World` with `{version:1, id, name, settings, notes:{}, links:{}, boards:{}, templates:{}, tracks:[main], maps:{}, calendars:{}, images:{}}`
- `migrateWorld(any) -> World` (accepts prototype v5–v7 exports: tracks/subjects/events/groups → notes)
- `createStore(world) -> {get, commit(fn, label), undo, redo, canUndo, subscribe(fn), replace(world)}`
- `deleteNote(world, id)` removes links, board items, map pins, parents, origins, time-map references
- `local.listWorlds()`, `local.loadWorld(id)`, `local.saveWorld(world)`, `local.deleteWorld(id)`, `local.putImage(id, blob)`, `local.getImage(id)`

Tests: undo/redo restores exact JSON; commit outside fn throws nothing; deleteNote cleans all references; migrate prototype `sample.json` gives notes with `when`/`legs`; IndexedDB round trip in Playwright.

## Task 2: Calendars and date input

**Interfaces:**
- `time.js`: `T(d, s=0)`, `toDays(t) -> float`, `fromDays(x)`, `offsetMinutes(tz, t)` (Intl; fixed LMT-free fallback outside ±270k years), `wallToUtc(tz, d, s)`.
- `western.js`: `toJDN(y,m,d,opts)`, `fromJDN(jdn,opts) -> {y,m,d,cal:'J'|'G'}`, opts `{switch:'1582'|'country:<code>'|'gregorian'|'julian', era:'historical'|'astronomical', yearStart:'jan1'|'local'}`
- `wareki.js`: `fromJDN(jdn, opts) -> [{era, year, month, leap, day, court:'south'|'north'|null, note}]`, `toJDN({era,year,month,leap,day})`, opts `{nanboku:'both'|'north'|'south', kaigen:'both'|'actual'|'retro', legend:'note'|'hide'}`
- `kyureki.js`: `fromJDN(jdn) -> {year, month, leap, day, undecided?:[...]}` for 1873+, `option2033:'undecided'|'11'|'7'|'1'`
- `hijri.js`: `fromJDN(jdn, opts)`, `toJDN({y,m,d}, opts)`, opts `{method:'uaq'|'tabular'|'turkey'|'mabims', leap:'16'|'15'|'indian'|'habash', epoch:'civil'|'astronomical', dayStart:'midnight'|'sunset'}`
- `fict.js`: calendar def `{id, name, months:[{name, days}], weekdays:[...], epochName, epochOffset}`
- `cal/index.js`: `CALENDARS` ordered list, `formatTime(t, {cal, tz, prec, approx, until})`, `parseInput(fields, cal) -> T`
- `ui/dateInput.js`: `dateInput(prefix, {cal, tz, value, prec, approx, until}) -> {el, read() -> value}`

Tests (values): JDN(2000-01-01 G)=2451545; 1582-10-04 J + 1 day = 1582-10-15 G; historical 1 BC = astronomical 0; 天正10年6月2日 = Julian 1582-06-21; 元仁元年閏7月1日 JD 2168353; 明治5年12月2日 → 明治6年1月1日 = 1873-01-01; 2025 旧正月 = 2025-01-29; leap months 2012閏3 2014閏9 2017閏5 2020閏4 2023閏2 2025閏6; 2033 → undecided; UAQ 1445-09-01 = 2024-03-11; tabular 16-type civil 1 Muharram 1 AH = Julian 622-07-16; tz Asia/Tokyo 1880 offset = +09:18:59 → 559 min (LMT) and 2020 = 540.

## Task 3: Notes, markdown, templates

**Interfaces:** `renderMarkdown(src, {resolveLink, imageUrl}) -> html` (headings, bold, italic, lists, links `[[title]]`, images `![](img:id)`, escapes everything else); `openNote(id)`; note editor sections: title, tags, color, template fields, body, images, parents (まとめ), relations (家族), time (when), links list, backlinks, delete. Templates editor; built-in CoC6 template (names only).

Tests: markdown escapes `<script>`; `[[タイトル]]` resolves to note link, unresolved shows as creatable; template fields appear when tag added; deleting note via editor cleans references.

## Task 4: Boards (cork) and family tree

**Interfaces:** `mountBoard(el, boardId)`; board items `{[noteId]: {x,y}}`; links drawn with label/color/style/arrow; collapse of まとめ notes hides descendants unless also under an open まとめ (cycle-safe); each note can own a board (`note.board`). Family board: `layoutFamily(notes, links) -> {[id]:{x,y}}` generations by parent links, spouses adjacent.

Tests: layoutFamily places children below parents and spouses side by side, survives cycles; collapse rule unit test; drag/link e2e.

## Task 5: Graph view and image maps

**Interfaces:** `forceLayout(nodes, edges, iterations) -> positions` (deterministic seed); `mountGraph(el)`; `mountMap(el, mapId)` image + pins.

## Task 6: Time map

Port prototype v7 engine into `app/js/timemap/` modules; adapter maps notes with `when` → events, notes with `legs` → subjects, まとめ parents → groups, `world.tracks` → tracks; prototype forms kept (track/loop/subject), card click opens note editor; dates via cal modules (tz, all calendars, fuzzy); duration input for branches.

Tests: reuse prototype invariants (`check7` subset) against the app; symmetric transitions; note edits reflect on map.

## Task 7: Settings, search, random character

Settings dialog (calendar schools, default tz, Drive client id), global search, Markov random character (names corpus, CoC6 rolls: STR CON POW DEX APP 3D6, SIZ INT 2D6+6, EDU 3D6+3; memo from world text).

## Task 8: Google Drive

GIS token client (`drive.file`), root folder, world folders (appProperties), `world.json`, images; `saveWithMerge`: compare `version`, download, `mergeWorlds(base, local, remote)`, upload; autosave debounce 2s; status indicator.

Tests: `mergeWorlds` unit tests (both edit same note → two notes; edit vs delete → keep edit; different notes → both); Drive module against a mock fetch.

## Task 9: Mobile, polish, deploy, docs, publish

Responsive layout, Pages workflow, `docs/google-drive-setup.md`, update design memo §10, publish trial Artifact (browser storage mode).
