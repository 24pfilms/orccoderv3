# Board Mode frozen acceptance matrix

Proposed for approval: 2026-08-24

No threshold below may be loosened after a failure without separate approval. Measurements are Windows debug/local baselines; paid packaging/signing is not involved.

## Zero-tolerance invariants

| Area | Acceptance |
|---|---|
| Feature off | No Board control or visual/layout/accessibility-tree change; no board store path created, opened, migrated, backed up, or cleaned. |
| Session identity | Surface switching never creates, stops, replaces, reconnects, or duplicates the active Rust `WindowSession` or daemon session. |
| Agent state | Streaming output, cancellation, prompts, tool activity, scroll/input state, and errors remain intact through 100 toggles. |
| Workspace state | Existing code/chat state stays mounted; Board uses a separate `WindowSurface`, never `WorkspaceMode`. |
| Failure fallback | Any Board render/load/save/flush failure returns to Workspace without mutating the last committed store or stopping the session. |
| Source preservation | Original Mero SQLite, uploads, Chrome IndexedDB/Blob/Local Storage, source, counts, and hashes remain unchanged. |
| Data integrity | Any count/hash mismatch, stale revision, wrong project/window, missing lease, integrity failure, failed flush, or unexplained source blocks progression. |
| Network/secrets | Board runtime performs no network fetch and contains no CDN, remote font/media, telemetry, login, browser secret, or localhost dependency. |
| Test containment | Every destructive/fault test asserts an isolated temporary home/store before setup and fails closed otherwise. |

## OrcaCoder baseline envelope

Measured with the current dirty-but-preserved worktree, a unique Tauri identifier, isolated Windows `USERPROFILE`, existing pinned Rust toolchain, and frontend already ready. First Rust compilation time is excluded.

| Metric | Baseline | Frozen acceptance |
|---|---:|---:|
| Vite frontend ready | 288 ms | ≤ 1,000 ms |
| Rust window-session ready | 8,596 ms | ≤ 10,315 ms (baseline +20%) |
| Process-tree working set after ready | 690,872,320 bytes | ≤ 794,503,168 bytes (baseline +15%) with Board off |
| Process-tree private bytes after ready | 448,389,120 bytes | ≤ 515,647,488 bytes (baseline +15%) with Board off |
| Feature-off toggles | n/a | Board code not mounted and zero board I/O; therefore no toggle allocation/listener delta |
| Enabled 100-toggle growth | measured in Phase 1 | ≤ 10 MiB retained growth after GC/settle and zero listener/timer/session-count growth |

The process tree includes Tauri, WebView2, daemon/session Node processes, and consoles. Compare the same process classes in later measurements.

## Mero core parity fixture

| Behavior | Frozen acceptance |
|---|---|
| Render | All 9 deterministic items render with exact identity, geometry, rotation, z-order, colors, text, votes, frame children, raster pixels, and drawing overlay. |
| Viewport | Characterized fit transform and wheel anchor behavior remain coordinate-equivalent. One -120 wheel delta changed scale 1 → 1.12. |
| Selection | Sticky-note selection shows the focus/selection outline and contextual font/fill/layer actions. |
| History | Ctrl+D: 9→10; undo: 10→9; redo: 9→10; final undo: 10→9, with confirmed persistence before reload. |
| Minimum window | 900×600 has no document overflow, clipped controls, or unreachable canvas actions. This intentionally improves Mero's clipped-toolbar baseline. |
| Minimap | Reachable and synchronized. This intentionally activates the existing but currently unmounted Mero capability. |
| Accessibility | Keyboard operation, visible focus, text labels/accessible names for icon controls, and reduced-motion behavior pass targeted tests. |

## Mero 500-item envelope

Measured on a deterministic 25×20 isolated fixture after API/frontend readiness.

| Metric | Baseline | Frozen acceptance |
|---|---:|---:|
| Reload to 500 rendered items | 312.6 ms | ≤ 375.1 ms (baseline +20%) |
| Wheel zoom response | 123.1 ms | ≤ 147.8 ms (baseline +20%) |
| Selection response | 100.0 ms | ≤ 120.1 ms (baseline +20%) |
| JavaScript heap used | 38,901,440 bytes | ≤ 46,681,728 bytes (baseline +20%) |
| JavaScript heap total | 96,071,680 bytes | ≤ 115,286,016 bytes (baseline +20%) |
| DOM nodes | 6,522 | ≤ 7,827 (baseline +20%) until virtualization is separately approved |
| Full Mero process-tree working set | 967,196,672 bytes | Board Mode must remain below this legacy browser+Vite+API aggregate; per-window delta is measured in Phase 3. |

## Export baseline and acceptance

| Format | Mero baseline | Board Mode acceptance |
|---|---|---|
| PNG 1K | 1024×765, transparent, 120,168 bytes | 1024×765; all 9 items, arrowheads, image, and drawing visible |
| JPG 1K | 1024×765, dark background, 65,805 bytes | 1024×765; all 9 items, arrowheads, image, and drawing visible |
| PDF | 1 page, 1213.33×920 pt, PDF 1.3, unencrypted | One correctly oriented page with all 9 items, arrowheads, image, and drawing visible |
| CSV | 9 records, 11 characterized columns, 734 bytes | 9 records and the characterized columns or a versioned documented superset |

Exact image/PDF hashes are evidence, not acceptance, because Board Mode must fix Mero's observed omission of arrowheads and drawing overlays.

## Phase gates

1. Phase 1 cannot land until feature-off source/UI/store/session invariants pass and enabled 100-toggle evidence meets the frozen limits.
2. Phase 2 cannot land until migration, integrity, lease, authorization, asset, backup, interruption, and timed-restore tests pass in isolated homes.
3. Each Phase 3 item family must meet its fixture rows before the next family starts; performance is checked at 9 and 500 items.
4. Any failure stops the phase. Threshold changes require separate approval with the failed evidence retained.
5. Production remains off through the Windows pilot, timed final restore, paid-run approval, and separate go/no-go.
