# Mero Phase 0 source inventory

Recorded: 2026-08-24

## Snapshot method

- **RUNTIME:** Google Chrome was fully closed before browser files were copied.
- **RUNTIME:** The two known Mero IndexedDB origins, the localhost Blob store, and Chrome Default-profile Local Storage LevelDB were copied to `L:\BoardModeMigrationSafety\2026-08-24-phase0\browser-raw-v2`.
- **RUNTIME:** Per-file SHA-256 manifests matched source and copy: localhost LevelDB 8 files/259,656 bytes; localhost Blob store 4 files/10,154,365 bytes; 127.0.0.1 LevelDB 6 files/6,587 bytes; shared Local Storage 44 files/81,941,374 bytes.
- **RUNTIME:** The complete v2 raw snapshot files are read-only. The safety root ACL grants access only to the current Windows user and SYSTEM.
- **RUNTIME:** Inventory and exporter validation ran against a separate writable v2 copy using Chrome 151 and read-only IndexedDB transactions. No original browser file was opened by the inspection profile.
- **RUNTIME:** Source hashes still matched the snapshot manifests after inspection. The temporary HTTP and DevTools listeners were stopped.
- The shared Local Storage LevelDB necessarily contains other origins. Its values were not emitted; the sanitized report records only presence and byte length for known Mero keys.

## Server SQLite backup

- SQLite library: 3.50.4 through Python's standard-library binding.
- Tables/counts: users 0, boards 0, canvas_items 0, board_settings 0.
- `quick_check`, `integrity_check`, and `foreign_key_check` passed with no rows reported.
- Indexes: `idx_boards_user_id`, `idx_canvas_items_board_id`, and `idx_canvas_items_user_id`, plus SQLite auto-indexes for unique columns.
- Users, password hashes, encrypted Gemini keys, and auth data are excluded from migration; all source tables currently contain zero rows.
- `boards.game_data` is schema drift from commit `7615979f3f282e4e808d1aa780ea42a926d5ff9d` on the repository's `game-layer` branch. It is explained provenance, unsupported in the first release, and contains no rows in this source.
- `server/uploads` contains zero files; missing uploads and orphan uploads are both zero.

## Chrome Default profile: `http://localhost:3001`

`MeroCanvasDB` reports IndexedDB version 20, corresponding to Dexie schema version 2.

| Store | Rows |
|---|---:|
| appSettings | 1 |
| boards | 4 |
| canvasItems | 22 |
| folders | 2 |
| imageData | 4 |

Item counts: FRAME 6, IMAGE 4, TEXT_BOX 2, SHAPE 7, STICKY_NOTE 3.

- Declared image bytes: 10,154,365; Blob bytes: 10,154,365.
- Duplicate board/item/folder IDs: 0/0/0.
- Missing board, folder, item, image, frame-child, current-board, and recent-board references: 0.
- Invalid item geometry: 0.
- Known local-storage state: current board ID present (value not recorded), toolbar position present, Obsidian vault display path present (value not recorded).
- Legacy `infinite-canvas-board`, migration flag, auth token, and auth user are absent.
- Other databases at this origin (`automa` and Firebase support stores) are unrelated and excluded.

## Chrome Default profile: `http://127.0.0.1:3001`

| Store | Rows |
|---|---:|
| appSettings | 1 |
| boards | 2 |
| canvasItems | 0 |
| folders | 2 |
| imageData | 0 |

- Duplicate IDs, invalid geometry, and broken references: 0.
- Known local-storage state: current board ID and toolbar position present; values are not recorded.
- Legacy board, Obsidian keys, auth token, and auth user are absent.
- Firebase support stores are unrelated and excluded.

## Sanitized evidence

- Inventory report: `L:\BoardModeMigrationSafety\2026-08-24-phase0\browser-inventory.json`.
- Report SHA-256: `e441340b1aa421bf0cd8e7fc749009166fbd9384a2b54e96b40fa6b15e937d2d`.
- No board names, text, source IDs, local paths, tokens, user objects, image bytes, or secrets are present in this repository evidence file.
