# Board parity with Mero — build plan

Source of truth: `L:/BoardModeMigrationSafety/2026-08-24-phase0/mero-migration-workspace`
Constraint: no Tailwind, no CDN, no network. OrcaCoder tokens + lucide-react only.
All writes go through the existing SQLite/lease/CAS layer — no schema changes.

## Phase 1 — Right-click context menu  (S/M)
- [ ] `BoardContextMenu.tsx`: menu at pointer, viewport-edge aware, Escape/outside closes
- [ ] Wire existing actions: bring to front, send to back, duplicate, delete
- [ ] Replace `onContextMenu={preventDefault}` in BoardCanvas
- [ ] Tests: opens at point, actions fire, closes
Exit: right-click a selected item, every wired action works.

## Phase 2 — Votes  (S)
- [ ] `addVote` in useBoardInteraction (payload.votes + 1, via history)
- [ ] Menu entry; renderer already draws the badge
Exit: vote badge appears and persists.

## Phase 3 — File drop  (M)
- [ ] Board-scoped drop handler bypassing the global suppressor
- [ ] Rust: import dropped bytes through existing asset pipeline (MIME sniff, raster limits, CAS)
- [ ] Create image item at drop point
Exit: drag an image onto the board, it lands at the cursor and persists.

## Phase 4 — Resize scales text  (S)
- [ ] Track originalFontSize/originalWidth like Mero; scale fontSize on resize
Exit: resizing a text box scales its text.

## Phase 5 — Font size semantics  (S)
- [ ] Delta +/- control, clamp 8..200 (Mero parity) alongside/replacing the fixed list
Exit: any size 8-200 reachable.

## Phase 6 — Right-drag marquee  (S)
- [ ] Right-button marquee with 2px didMove threshold, suppress context menu after drag
Exit: right-drag selects; right-click still opens the menu.

## Phase 7 — Image tools  (M/L)
- [ ] Maximize / minimize / download item
- [ ] Crop: start, cancel, apply
Exit: each works on an image item and persists.

## Phase 8 — Board utilities  (S)
- [ ] Clear board (guarded), center content below toolbar
Exit: both work.

## Out of scope (documented deferral)
AI generation, edit-with-AI, image->video, regenerate — Gemini-backed; migration
excluded Gemini keys and deferred those dependencies.
