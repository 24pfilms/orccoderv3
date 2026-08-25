# Mero Phase 0 restore drill

Recorded: 2026-08-24

## Timed separate-location restore

- Source: read-only online backup `L:\BoardModeMigrationSafety\2026-08-24-phase0\mero-server\database.sqlite.backup`.
- Destination: new `L:\BoardModeMigrationSafety\2026-08-24-phase0\restore-drill-timed`; the live Mero store was never overwritten or repointed.
- **RUNTIME:** End-to-end restore RTO was 0.549 seconds from starting SQLite restore through HTTP-ready frontend and API.
- **RUNTIME:** Frontend returned HTTP 200 with the React root; API `/health` returned HTTP 200.
- **RUNTIME:** Restored database passed `quick_check`, `integrity_check`, and `foreign_key_check`.
- **RUNTIME:** Restored counts matched: users 0, boards 0, canvas_items 0, board_settings 0.
- **RUNTIME:** Source and restored SHA-256 both equal `b921c65b4f5ccb572e758158e09ceacf9c38852904d177c1933c705d8fa9e826`.
- This RTO covers the empty server SQLite source only. Browser-board import/restore timing remains unmeasured until the OrcaCoder native store exists.

## Untouched-original fallback check

- **RUNTIME:** The original June 27 Mero frontend returned HTTP 200 and its API returned `{"ok":true}`.
- **RUNTIME:** After launch, original SQLite SHA-256 remained `bb767a2d3a0526392e4eee34c938633425edb9e43a7b6cf7d969d66cdb3278bc`.
- **RUNTIME:** Every original localhost/127.0.0.1 IndexedDB LevelDB, localhost Blob, and shared Local Storage file still matched the complete v2 snapshot manifests.
- **RUNTIME:** The Mero Git worktree retained only its three pre-existing untracked paths: `.gg/`, `dist-player/`, and `test-results/`; no tracked source changed.
- Vite refreshed only its generated dependency cache during the original launch smoke; no source or user-data path changed.
- All smoke processes were stopped; ports 3000, 3001, and 9223 had no listeners afterward.

## Recovery objectives

- **Server migration RPO:** zero source rows lost at the recorded backup point.
- **Measured server restore RTO:** 0.549 seconds, below the 15-minute target.
- Same-disk copies remain local recovery artifacts, not device-loss disaster recovery.
