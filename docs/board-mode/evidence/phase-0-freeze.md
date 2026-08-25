# Board Mode Phase 0 freeze

Recorded: 2026-08-24

## OrcaCoder baseline

- Repository: `L:\orcacoderv3`
- Branch: `test/updater-pipeline` tracking `origin/test/updater-pipeline`
- Commit: `40f535a6d792aac069731dae72fd0c0b825bf4d2`
- `CLAUDE.md`: absent at repository root; `AGENTS.md` was used as the available project context.
- Existing work is user-owned and must be preserved and excluded from Board Mode phase diffs.
- Existing modified files:
  - `README.md`
  - `gg-app/src/App.css`
  - `gg-app/src/App.tsx`
  - `gg-app/src/Markdown.collapse.test.tsx`
  - `gg-app/src/Markdown.tsx`
  - `gg-app/src/SettingsModal.tsx`
  - `gg-app/src/main.tsx`
  - `gg-app/src/orca/orca-theme.css`
  - `gg-app/src/orca/orca-theme.ts`
  - `packages/ggcoder/src/system-prompt.test.ts`
  - `packages/ggcoder/src/system-prompt.ts`
  - `pnpm-lock.yaml`
- Existing untracked paths:
  - `UI_Orca/`
  - `UpdaterPlan/`
  - `gg-app/src/orca/orca-theme.test.ts`
  - `your-chat-2026-08-21-1308.md`

## Mero source baseline

- Validated original: `L:\_New_Projects_June_27_2026\Mero`
- Repository: `https://github.com/24pfilms/Mero.git`
- Branch: `master` tracking `origin/master`
- Commit: `e543e17f9e21db9b68a976d8f85d3053c6f56c05`
- Existing untracked paths: `.gg/`, `dist-player/`, and `test-results/`; these are preserved.
- The similarly named `L:\_New_Projects_June_28_2026\Mero-master` is excluded: its origin is `24pfilms/gamebuilder_v1.git`, not Mero.
- Frontend origin configured by source: `http://localhost:3001`.
- API origin configured by source: `http://localhost:3000`.
- No listener was present on port 3000 or 3001 at freeze time.
- Active server database: `server/database.sqlite`, 57,344 bytes, modified 2026-06-28 08:13:20 +01:00.
- Database SHA-256 at freeze: `bb767a2d3a0526392e4eee34c938633425edb9e43a7b6cf7d969d66cdb3278bc`.
- Read-only SQLite `quick_check`: `ok`.
- Database row counts at freeze: users 0, boards 0, canvas_items 0, board_settings 0.
- Upload directory: `server/uploads`; no files observed at freeze time.

## Browser data baseline

- Browser: Google Chrome 151.0.7922.172, Default profile.
- Candidate Mero IndexedDB origins found:
  - `http://localhost:3001` (`MeroCanvasDB` expected by source), LevelDB directory 259,656 bytes at freeze.
  - `http://127.0.0.1:3001`, LevelDB directory 6,587 bytes at freeze.
- Candidate legacy local storage is the Default profile `Local Storage/leveldb`; the source key is `infinite-canvas-board`.
- Edge 151.0.4129.101 had no matching IndexedDB origin in its Default profile.
- Browser storage remains unmodified. Exact logical counts require the same-origin read-only exporter in the copied migration workspace.

## Runtime baseline

- Windows 10 Pro N, build 19045.
- Node.js 24.15.0.
- npm 11.12.1.
- pnpm 10.28.2.
- Rust 1.97.1.
- Cargo 1.97.1.
- A standalone `sqlite3` CLI is not installed; Python's standard-library SQLite binding is available.

## Frozen first-release scope

Board Mode is additive, production-off, local-first, Windows-first, project-scoped, human-controlled, and reversible. Initial parity includes boards, notes, text, shapes, frames, arrows, images, drawing, undo/redo, and export. AI, voice, YouTube, PDF/Word ingestion, Obsidian, cloud sync, agent-authored changes, Apple, and Linux runtime enablement remain excluded.
