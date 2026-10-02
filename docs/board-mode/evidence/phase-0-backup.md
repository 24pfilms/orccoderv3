# Mero Phase 0 backup and fallback evidence

Recorded: 2026-08-24

## SQLite online backup

- **RUNTIME:** Ports 3000 and 3001 had no listeners and no Mero Node process was running before backup.
- **RUNTIME:** Python's standard-library SQLite backup API copied the read-only source connection to `L:\BoardModeMigrationSafety\2026-08-24-phase0\mero-server\database.sqlite.backup`; no live database file copy was used.
- **RUNTIME:** The backup is marked read-only on Windows.
- **RUNTIME:** Source and backup both passed `quick_check` and `integrity_check`.
- **RUNTIME:** Source and backup counts matched: users 0, boards 0, canvas_items 0, board_settings 0.
- **RUNTIME:** Source SHA-256: `bb767a2d3a0526392e4eee34c938633425edb9e43a7b6cf7d969d66cdb3278bc`.
- **RUNTIME:** Backup SHA-256: `b921c65b4f5ccb572e758158e09ceacf9c38852904d177c1933c705d8fa9e826`.
- Different SQLite file hashes are expected from the online backup API's page reconstruction; logical counts and both integrity checks are the required equivalence evidence.
- **RUNTIME:** `server/uploads` contained zero files; its checksum manifest is empty and read-only.
- The original Mero database and uploads were not edited, renamed, deleted, repointed, or migrated.

## Launch-tested fallback

- Location: `L:\BoardModeMigrationSafety\2026-08-24-phase0\mero-fallback`.
- Source was produced with `git archive` at Mero commit `e543e17f9e21db9b68a976d8f85d3053c6f56c05`; the verified backup database was installed only in the fallback.
- No `.env`, API key, auth token, or browser profile is included.
- A clean install exposed pre-existing package drift: source imports undeclared `pdfjs-dist@4.4.168`.
- Node 24 could not load pinned `better-sqlite3@9.6.0`; the original native binary targets ABI 127.
- The fallback therefore includes official Node.js 22.23.2 Windows x64 from `nodejs.org`. Its ZIP SHA-256 matched the official manifest: `1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97`.
- Original native `bcrypt` and `better-sqlite3` binaries were copied into the fallback only and hash-checked; no install script changed the original.
- **RUNTIME:** Fallback frontend returned HTTP 200 and contained the React root.
- **RUNTIME:** Fallback API returned HTTP 200 with `{"ok":true}` from `/health`.
- **RUNTIME:** Fallback database retained matching counts and passed `quick_check` after launch.
- **RUNTIME:** Both fallback processes were stopped and ports 3000/3001 were closed after the smoke.
- Launch and rollback instructions are in the artifact's `FALLBACK.md`.
- `mero-fallback-checksums.sha256` records 12,237 packaged files. Total safety-artifact size at recording was 353,119,391 bytes.

## Recovery status

- **RPO:** zero source SQLite rows at backup time; browser-origin data is not yet included.
- **RTO:** unverified until the separate-location restore drill in Step 6.
- Same-disk artifacts are local recovery copies, not device-loss disaster recovery.
