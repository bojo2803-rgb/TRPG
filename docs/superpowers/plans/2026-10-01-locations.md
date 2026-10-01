# ロケーション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the location kind with nested places, per-location maps you can drill into, and a 場所 field on other cards.

**Architecture:** `place` joins `KINDS`; nesting reuses `parents`; a map gets `owner`; cards get `at`. The places tab reuses `kindView.js` (tree list, open mode with map/board) and `mapView.js` (owner mode, drill-down, counts).

**Tech Stack:** Static ES modules; node:test; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-01-locations-design.md`

## Global Constraints

- No world data in program files. UI text Japanese. Phone width 390px without horizontal overflow.
- Existing worlds open unchanged (free maps stay; version stays 2; `tpl-place` added if missing).

## Review Focus

- Cycles in place parents never hang the tree, breadcrumb or counts.
- Deleting a place removes its map and every `at` pointing to it; merge cleanup matches.
- Old `map` view id and saved preference still open the map screen.
- A pin for a place without a map opens its details, not a dead end.
- Search in the tree keeps ancestors of matches visible.

---

### Task 1: Model

**Files:** `app/js/model.js`, `app/js/merge.js`, `tests/core.test.mjs`

**Produces:** `KINDS.place`; `placePath(w, id)` → ids root→id (cycle-safe); `placeKids(w, id)`; `inPlace(w, id)` → set of id and descendants; `mapOf(w, placeId)`; `deleteNote` drops owned maps and `at`; `fill` adds missing builtin templates by id for every world.

- [ ] Tests (path with cycle, descendants, delete cleanup), implement, check, commit.

### Task 2: Editor sections and tree

**Files:** `app/js/ui/elements.js` (`atSec`, `placeSecs`), `app/js/ui/noteEditor.js`, `app/js/ui/kindView.js` (tree list for `place`, open mode with 地図／ボード and breadcrumb), `app/js/main.js` (tab, `map` → places), `app/css/app.css`.

- [ ] Implement; e2e `tests/e2e/places.mjs`; commit.

### Task 3: Maps

**Files:** `app/js/ui/mapView.js` (owner mode, create map for a place, unplaced children, drill-down, counts, breadcrumb).

- [ ] Implement; extend `places.mjs` and `map.mjs`; all tests; docs; push; republish.
