# Phase 2 native store evidence

Date: 2026-08-24

## Implemented controls

- Production-off lazy initialization: constructing Tauri state performs no board filesystem or SQLite I/O.
- Bundled SQLite with one mutex-serialized connection, WAL, `synchronous=FULL`, five-second busy timeout, foreign keys, strict schema constraints, and forward-only migration records.
- Rust-owned canonical project scope, cross-project read/write denial, compare-and-swap revisions, fenced persistent editing leases, explicit expired-lease takeover, and post-commit change events.
- PNG/JPEG-only native picker import with byte, dimension, pixel, allocation, board-total, decode, MIME, and SHA-256 checks.
- Atomic content-addressed asset writes and project-authorized `board-asset` responses; range requests, unsupported media, malformed IDs, and inaccessible references fail closed.
- Soft board/item deletion; assets remain referenced and are never purged.
- SQLite online backup with copied verified assets, schema/count/database/asset-manifest hashes, app version, reason, and no automatic pruning.
- Window/project-bound, expiring, single-use restore preview tokens.
- Restore preview re-verifies database and every referenced asset. Apply blocks on any editing lease, creates a fresh pre-restore backup, preflights free space, stages a complete store, closes SQLite, atomically swaps directories on Windows, reopens and verifies, retains the previous store as rollback, and automatically swaps back if reopen fails.

## Runtime verification

`cargo test --manifest-path gg-app/src-tauri/Cargo.toml boards::tests --locked -- --nocapture` passed 15 tests after the final Step 19 fault cases.

Covered cases:

- fresh/reopened schema and required pragmas;
- migration transactional rollback;
- invalid rows and orphan foreign keys;
- canonical project aliases and cross-project denial;
- stale revision/lease fencing;
- malformed/non-raster and oversized images;
- atomic content-addressed asset persistence;
- online backup and separate-location restore verification;
- corrupted backup rejection before live mutation;
- active-lease restore blocking with the canary retained;
- verified live directory swap with the pre-restore version restored and rollback directory retained;
- preview-token wrong-window denial and single use;
- relative store path rejection before filesystem creation.

The focused restore drill completed in under one second on the local Windows test volume; this is test-fixture evidence, not the later large-store pilot RTO. Low-disk behavior is enforced by a native `GetDiskFreeSpaceExW` preflight and remains scheduled for the isolated large-store/fault-injection pilot.

## Remaining phase-gate coverage

Archive/import attack cases are not part of the native store yet and remain gated in Steps 25–27. Packaged protocol/picker smoke and deliberate low/full-disk injection remain required before production consideration in Steps 19 and 28–30.
