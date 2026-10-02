# Mero copied browser exporter evidence

Recorded: 2026-08-24

## Workspace isolation and provenance

- Workspace: `L:\BoardModeMigrationSafety\2026-08-24-phase0\mero-migration-workspace`.
- Created with `git archive` from `https://github.com/24pfilms/Mero.git` commit `e543e17f9e21db9b68a976d8f85d3053c6f56c05`.
- The original `L:\_New_Projects_June_27_2026\Mero` received no exporter files or changes.
- The exporter uses browser standard APIs only. It adds no dependency, CDN, remote font, analytics, localhost API request, login, or secret read.
- `MIGRATION_PROVENANCE.md` records the copied source and authored files.

## Read-only controls

- The exporter checks `indexedDB.databases()` before opening `MeroCanvasDB`; it cannot create an absent source database.
- Any unexpected IndexedDB upgrade is aborted.
- Every object-store transaction is `readonly`.
- Only existing boards, folders, items, settings, image Blobs, the legacy board key, selected board ID, and toolbar position are read.
- Recursive sanitization removes password, auth token, API key, Gemini key, and absolute-path fields.
- Asset declared size must equal Blob size; each asset receives a SHA-256 hash before export. Any mismatch blocks the complete export.

## Verification

- **RUNTIME:** Node's built-in test runner passed 2/2 sanitizer and byte-encoding tests.
- **RUNTIME:** Vite 6.3.6 built the isolated exporter: 5 modules transformed, 1.19 kB HTML, 3.99 kB JavaScript.
- **RUNTIME:** `http://localhost:3001` smoke: folders 2, boards 4, items 22, assets 4, settings 1, asset bytes 10,154,365; every SHA-256 valid; no forbidden key found.
- **RUNTIME:** `http://127.0.0.1:3001` smoke: folders 2, boards 2, items 0, assets 0, settings 1; no forbidden key found.
- Smoke used only the complete copied v2 browser profile. Original browser files remained hash-identical afterward.
- Chrome emitted its own profile-level GCM deprecation request while headless; exporter code made no network call and the served build requested only its local HTML and JavaScript.
