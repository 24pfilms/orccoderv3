# Mero Phase 0 browser source exports

Recorded: 2026-08-24

Private artifact root: `L:\BoardModeMigrationSafety\2026-08-24-phase0\source-exports`.

## `http://localhost:3001`

- File: `mero-browser-localhost-3001-v1.json`
- Byte length: 13,588,711
- SHA-256: `e4611f3af7c5211dc1344dcbb2606487a8ee1e1eed2d00278725adf4d37a433e`
- Counts: folders 2, boards 4, items 22, assets 4, settings 1, legacy boards 0.
- Asset bytes: 10,154,365 across 4 records.
- Every decoded asset byte length and SHA-256 matched its export metadata.

## `http://127.0.0.1:3001`

- File: `mero-browser-127.0.0.1-3001-v1.json`
- Byte length: 2,233
- SHA-256: `7aeda0cae1bd655fb3b289f057f4cc66f602bd3fdf0a126b557b38a7ffcd6765`
- Counts: folders 2, boards 2, items 0, assets 0, settings 1, legacy boards 0.

## Exclusions and preservation

- Users, password hashes, auth tokens, auth user objects, API/Gemini keys, logs, caches, and absolute-path fields were not exported.
- Board names, source IDs, item text, and image bytes exist only in the ACL-restricted private artifacts, not repository evidence.
- Both source exports and `checksums.sha256` are read-only.
- The complete v2 raw browser snapshot remains separate and read-only; the original Chrome profile still matched every source manifest after export.
- No original Mero SQLite, upload, IndexedDB, Blob, or Local Storage file was edited, deleted, renamed, or repointed.
