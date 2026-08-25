# Phase 3 core item evidence — Step 22

Date: 2026-08-24

## Implemented slices

- Sticky notes and text: plain-text editing, read-only lease state, debounced repository persistence.
- Shapes, arrows, and frames: local SVG/CSS rendering; editable frame titles; no HTML rendering.
- Images: native PNG/JPEG picker and validated `board-asset://` identifiers only.
- Drawings: pointer-authored SVG polylines persisted as bounded numeric points.
- Toolbar: keyboard-accessible creation controls for all seven first-release item families.

## Verification

- Frontend focused suite: 14 tests passed across toolbar, item rendering, hostile-text handling, authorized asset URLs, drawing persistence, canvas, document persistence, surface, and save queue.
- Native payload boundary: one focused Rust test passed for supported payloads and rejection of active-content fields, CSS URLs, malformed asset IDs, and malformed drawing points.
- TypeScript: `pnpm --filter gg-app check` passed.
- ESLint: explicit changed-file invocation passed. The package wrapper remains Windows-incompatible because its single-quoted glob is passed literally.
- Whitespace: `git diff --check` passed.

## Visual evidence

Generated from the checked-in Board CSS and representative Step 22 fixture markup:

- Desktop, 1440×900: `L:\BoardModeMigrationSafety\2026-08-24-phase0\step22-desktop.png`
- Mobile, 390×844: `L:\BoardModeMigrationSafety\2026-08-24-phase0\step22-mobile.png`

Desktop shows every item family, toolbar, selection, frame containment, minimap, and zoom state. Mobile confirms the toolbar remains reachable and the infinite canvas clips rather than compressing world coordinates.

## Boundary controls checked

Rust validates payloads by item family, allows only bounded known fields plus inert `_provenance`, requires hex colors, validates asset IDs, and caps drawing point count and coordinates. React renders user text through controlled inputs, never HTML; image sources are constructed only from native-issued asset IDs.
