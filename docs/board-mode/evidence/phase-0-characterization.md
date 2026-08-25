# Mero core behavior characterization

Recorded: 2026-08-24

## Isolation

- The reproducible fixture is under `docs/board-mode/fixtures/mero-core-v1/`.
- Runtime used a fresh Chrome profile on origin `http://localhost:3011` and a fresh SQLite server store under the ACL-restricted safety root.
- The fixture account, JWT signing secret, database, token, and downloads are disposable and never touched the original Mero profile/store.
- Screenshots: `screenshots/mero-core-1440x900.png` and `screenshots/mero-core-900x600.png`.

## Render baseline

- **RUNTIME:** All 9 expected items rendered at 1440×900 and 900×600: nested frames, sticky note, text, rounded rectangle, circle, diamond, bidirectional arrow, and image with drawing overlay.
- **RUNTIME:** Initial fit transform was `translate(205px, 100px) scale(1)`.
- **RUNTIME:** One -120 wheel delta at canvas point (720,450) changed it to `translate(229.6px, 112px) scale(1.12)`.
- **RUNTIME:** Selecting the sticky note added the blue outline and exposed font size, fill, bring-front, and send-back contextual actions.
- **RUNTIME:** At 900×600 the document reported no horizontal overflow, but the top toolbar and right-side canvas content were visibly clipped; this is the Mero baseline, not a Board Mode acceptance target.
- **RUNTIME:** No minimap rendered. `components/Minimap.tsx` exists but has no caller in current source.

## History and keyboard baseline

- **RUNTIME:** Ctrl+D changed 9 items to 10; Ctrl+Z returned to 9; Ctrl+Shift+Z returned to 10; final Ctrl+Z returned to 9.
- **CODE:** Escape cancels a pending tool, exits editing/cropping/interactive mode, or clears selection.
- **CODE:** Ctrl+Z performs undo; Ctrl+Y and Ctrl+Shift+Z perform redo; Ctrl+D duplicates selected items by (20,20).
- **CODE:** Delete/Backspace removes selected items when not editing. F11 toggles fullscreen. Voice and background-test shortcuts are deferred features.
- **CODE:** Undo/redo key handlers are registered independently in both `App.tsx` and `useBoard.ts`; Board Mode must use one scoped handler.
- **RUNTIME:** Client undo reached 9 before the server autosave briefly exposed the prior 10-item state to an immediate reload; the isolated server converged back to 9 shortly afterward. Board Mode's required flush/confirmed-save state must remove this ambiguity.

## Export baseline

Exports are private fixture artifacts under `L:\BoardModeMigrationSafety\2026-08-24-phase0\characterization-exports`.

- **RUNTIME PNG:** 1024×765, 120,168 bytes, SHA-256 `1b653e9c44a4de393b0a8ec0e9f422e975cdb6320d84d1e3b9799b609247e8a9`.
- **RUNTIME JPG:** 1024×765, 65,805 bytes, SHA-256 `54d1765f181d3eafb556e5b8fcc8526cf92bfd4ddcf3e12e6dc39b7fa882f359`.
- **RUNTIME PDF:** one unencrypted PDF 1.3 page, 1213.33×920 pt, 153,606 bytes, SHA-256 `7f07d36293597ff3617e35388f6df02adc6ea098bb1bf20ce293addef8b41f77`.
- **RUNTIME CSV:** header plus 9 records and 11 columns, 734 bytes, SHA-256 `a41c79e72cc89f22b219c5ae265f4aa042303449ec6987990782ddd3ef0643ec`.
- PNG preserves transparency; JPG and PDF use the dark background.
- **RUNTIME defects:** the compositor export omitted arrowheads and the per-item drawing overlay, although both render on screen. Board Mode must not treat these omissions as desired parity; export content must include them.

## First-release acceptance derived from characterization

- Preserve world geometry, rotation, z-order, colors, text, votes, frame children, image pixels, drawing overlay, and the shown viewport transform.
- Preserve duplicate/undo/redo counts without delayed-save ambiguity.
- Render the same fixture without toolbar clipping at minimum size and with a reachable minimap.
- PNG/JPG/PDF must contain arrowheads and drawing; CSV must retain 9 records and the characterized columns or a versioned documented superset.
- Malformed fixture preview must block duplicate IDs, invalid zoom/dimensions, and broken children; report remote dependencies; preserve unsupported metadata without executing it; remove the fixture absolute path.
