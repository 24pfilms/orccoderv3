# Board Mode native dependency review

Snapshot date: 2026-08-24

This review freezes candidate versions and feature sets before they enter OrcaCoder. A dependency is added only in the phase where it has a direct production call site; exact resolved versions must then appear in `Cargo.lock` and pass the packaged Windows smoke.

## Verified toolchain baseline

- OrcaCoder: Tauri 2.11.2, Rust 2021.
- Local Windows compiler used for the probe: `rustc 1.97.1 (2026-07-14)`, MSVC target.
- The existing dependency graph contains no `libsqlite3-sys`, so the selected bundled SQLite does not collide with another SQLite linkage.

## Approved candidates

| Purpose | Exact candidate | Features | License | Add in |
|---|---|---|---|---|
| SQLite ownership, transactions, online backup | `rusqlite = 0.40.2` | `default-features = false`, `bundled`, `backup` | MIT | Step 15 |
| SHA-256 asset identity | `sha2 = 0.11.0` | `default-features = false` | MIT OR Apache-2.0 | Step 17 |
| Bounded raster validation/decoding | `image = 0.25.10` | `default-features = false`, `png`, `jpeg` | MIT OR Apache-2.0 | Step 17 |
| Portable archive reading/writing | `zip = 8.6.0` | `default-features = false`, `deflate-flate2-zlib-rs` | MIT | Step 25 |

All direct versions will use Cargo's exact `=version` syntax. Default features are disabled to exclude rusqlite's WASM backend, image's AVIF/EXR/GIF/TIFF/WebP/rayon graph, and zip's encryption plus bzip2/deflate64/LZMA/PPMd/Zstandard/XZ codecs. ZIP 9.0.0-pre3 was rejected because it is a prerelease; 8.6.0 is the current stable release returned by the registry.

`rusqlite`'s `bundled` feature compiles its vendored SQLite through `libsqlite3-sys 0.38.2`, avoiding dependence on an unknown system SQLite. The `load_extension` Rust API feature is not enabled. The native store must still apply `WAL`, `synchronous=FULL`, `busy_timeout=5000`, and `foreign_keys=ON` on every connection.

## Compatibility probe

A disposable project under `L:\BoardModeMigrationSafety\2026-08-24-phase0\dependency-probe` pinned the exact candidates and minimum feature sets. It compiled and ran twice, including once with `--locked`, on Windows/MSVC. The probe exercised:

- bundled in-memory SQLite initialization and a pragma;
- SHA-256 hashing;
- byte-signature raster format detection;
- opening a minimal empty ZIP archive.

The candidate graph resolves 43 registry packages. Its only custom build scripts are `crc32fast`, `libc`, `libsqlite3-sys`, and `num-traits`; source inspection found compiler/configuration probing and bundled SQLite compilation, with no runtime downloader. `libsqlite3-sys` compiles checked-in `sqlite3.c`; it does not fetch SQLite during the build.

## Advisory and license evidence

- **RUNTIME:** An OSV `querybatch` checked all 43 exact registry package/version pairs from the probe lockfile on 2026-08-24 and returned zero advisories. This is a dated scanner result, not a claim that defects are absent.
- `cargo-audit`, `cargo-deny`, and `cargo-license` are not installed, so no result from those tools is claimed.
- **CODE:** Cargo registry metadata reports only permissive terms across the graph: MIT, Apache-2.0, BSD-3-Clause, Zlib, 0BSD, and Unlicense alternatives. The direct crates are MIT or MIT/Apache-2.0.
- Re-run the exact-lock advisory and license review whenever a candidate or transitive lock entry changes.

## Rejected or deferred dependencies

- `infer`: rejected. `image::guess_format` plus decode validation covers the PNG/JPEG allowlist without another MIME-signature graph.
- Dexie, Express, Better SQLite, Tailwind runtime, Google AI, D3, PDF/Word parsers, browser auth, and Mero CDN/import-map packages: excluded from the first release.
- `html2canvas` and `jspdf`: not approved or added. Reconsider only if export characterization proves local native canvas/SVG export cannot meet parity.

## Direct call sites and removal paths

- `rusqlite`: sole call site boundary will be `src-tauri/src/boards.rs`; remove it by removing the native Board store module and migrations while the production feature remains off.
- `sha2` and `image`: call sites will be bounded asset import/verification in `boards.rs`; remove them with image asset import and the asset protocol.
- `zip`: call sites will be `.orcaboard` preview/export only; remove it with portable archive import/export while preserving the SQLite store.

`rusqlite 0.40.2` and `libsqlite3-sys 0.38.2` were locked in Step 15 with the direct `boards.rs` store call site. `sha2 0.11.0` and `image 0.25.10` were locked in Step 17 for content-addressed PNG/JPEG import and bounded native decoding. Fresh-store, migration, authorization, lease, malformed-image, size-limit, and atomic-asset tests passed. The remaining ZIP candidate is not added speculatively; it still requires an exact lockfile diff, targeted tests, an advisory rerun, and packaged Windows evidence in its landing phase.
