# Phase 3 export evidence — Step 23

Date: 2026-08-24

## Implementation

- PNG and JPG use the browser's local canvas encoder.
- PDF embeds the local JPEG canvas output in a dependency-free, one-page PDF.
- CSV serializes active item identity, type, geometry, ordering, and payload with RFC-style quote escaping.
- Raster rendering covers notes, text, rectangles/ellipses, frames, arrows, drawings, rotation, background color, and authorized local images.
- Export dimensions are bounded to 16,384 pixels per edge and 32 million pixels total.
- Images resolve only through validated `board-asset://<asset-id>` URLs; export performs no network fetch.
- Rust verifies project ownership, format signatures, UTF-8 CSV content, matching extensions, and a 64 MiB byte limit before atomically replacing the user-selected destination.
- No package, crate, worker, CDN, import map, localhost service, login, or browser secret was added.

## Automated evidence

- Frontend focused suite: 8 tests passed for PNG/JPG encoder selection, CSV round-trip escaping, PDF structure/JPEG embedding, export-menu accessibility, and Board surface integration.
- Native focused suite: 1 test passed for accepted PNG/JPG/PDF/CSV signatures and rejected mismatched, unsupported, and NUL-containing data.
- `pnpm --filter gg-app check`: passed.
- Explicit changed-file ESLint: passed.
- `git diff --check`: passed.

## Visual evidence

The format menu was checked open at both target sizes using the Board CSS and representative core-item fixture:

- Desktop, 1440×900: `L:\BoardModeMigrationSafety\2026-08-24-phase0\step23-desktop.png`
- Mobile, 390×844: `L:\BoardModeMigrationSafety\2026-08-24-phase0\step23-mobile.png`

All four formats remain visible and selectable without expanding the canvas or hiding the shared project controls.
