# Upstream Provenance and Sync Policy

OrcaCoderV3 is derived from the MIT-licensed GG Framework:

- **Upstream repository:** <https://github.com/KenKaiii/gg-framework>
- **Upstream remote:** `upstream`
- **Imported branch:** `main`
- **Imported commit:** `16f551e7651ece856e2b51863048c889c32a31d7`
- **Orca integration branch:** `orca-main`
- **License:** MIT; see [`LICENSE`](LICENSE)

The original copyright and license notice remain intact. OrcaCoderV3 is an independent fork
and does not imply affiliation with or endorsement by Ken Kai.

## Compatibility Policy

- Keep upstream package names, agent protocol names, and legacy `.ggcoder` storage paths until
  a tested migration provides backward compatibility.
- Isolate Orca UI additions under `gg-app/src/orca/` and keep product-level edits narrow.
- Never consume upstream updater releases or signing keys from an Orca-branded binary.
- Pull changes from `upstream/main`, review the diff, merge into `orca-main`, then rerun the
  workspace and Tauri build checks.

## Suggested Sync Commands

```bash
git fetch upstream main
git merge --no-commit upstream/main
pnpm install --frozen-lockfile
pnpm build
pnpm --dir gg-app tauri build --debug --no-bundle
```

Resolve conflicts in favor of upstream behavior unless an Orca-specific decision is recorded
in `PRODUCT.md` or `DESIGN.md`.

## Synced upstream commits (Batch A, 2026-10-02)

Branch `feat/upstream-batch-a`, cherry-picked with `-x` onto `17302358`. Each line is
upstream hash(es) → V3 commit.

| Item | Upstream | V3 commit | Status |
|------|----------|-----------|--------|
| 1. Safety bundle v0.73.3 | `946c4597` | `231d7f06` | Ported (sandbox-runtime 0.0.78; lockfile regenerated) |
| 2a. Verification gate | `990e7b0f` `312a609b` `a8ad3bbb` `d0de302e` `9000cf37` `7a1a27f5` `d3786e38` `2311e4c7` + `8dbf5d1a` (agent-session part) | `d03b9740` | Ported, partial (see below) |
| 6. Background tasks | `7ab7fe8c` `2b0c8f5a` `3fc19964` | `1b6345ca` | Ported, adapted |
| 2b. Verification gate | `b9114712` `8c74789f` `b5833186` (core fix only) | `e54454b6` | Ported, partial |
| 3. Sub-agents | `caab18ed` `7d010a4a` | `cd4be690` | Ported |
| 4. Command guards | `f6b906c4` (guard files only) | `d14b0e34` | Partial by design |
| 5. Login cache | `7ff84e8a` | `c0a7b3a9` | Ported |
| 7. Tauri 2.11.5 | `5a5b5ed8` `a075c886` `378d54e7` | `6ea14672` | Ported (lock regenerated to match upstream v0.64.2) |
| 8. App fixes | `32dee6ec` | `352538b3` | Ported |
| 8. App fixes | `9510f2a7` | — | Skipped |
| Test hardening | `8e2f3c19` (teardown retry only) | `531f4c87` | Ported (Windows EBUSY flake hit in the full run) |

Prerequisites pulled in because V3 never had them: `990e7b0f`, `312a609b`, and the
agent-session/test part of `8dbf5d1a`. Item 6 is committed between the two verification
commits because `b9114712` builds on `3fc19964`.

Skipped or adapted, with reasons:

- **Agent Steroids copy** (`a8ad3bbb`): V3 uses kencode-search. Kept V3's system-prompt,
  Ken prompt and tests; removed the Steroids sentences from `IDEAL_REVIEW_PROMPT`. The
  `corpus_unverified` verdict plumbing is kept but nothing prompts for it.
- **env-delta** (`7a1a27f5` context): V3 has no env-delta feature; its import/field dropped.
- **Edit telemetry** (`3fc19964`): V3 lacks upstream `bf3ac64a`, so queued LSP diagnostics
  carry no `EditSource` / regression attribution; the two attribution tests were dropped.
- **`__golden__/system-prompt-prefix.md`**: not in V3; upstream edits dropped.
- **`b5833186`**: only the "stuck Unverified" fix; critter-floor split, chip animations and
  App.css redesign skipped (upstream-only UI).
- **`f6b906c4`**: only destructive-git / shell-threat / package-install guards (+ task_send
  hook). Keep-awake, stream rules, ask_user deadlines, plan-step compaction, session summary
  index, Settings, lib.rs, App.tsx, motion-check, hyperframes patch left for a later batch.
- **`9510f2a7`**: V3 has no `.app > *` stacking rule (the root cause) and no `--z-menu`
  token, so the fix is a no-op here. Needs a visual check in the running app.
- **`.changeset/` file** from `946c4597`: upstream release copy, dropped.

### Batch A decisions (Taylor, 2026-10-02)

- **Package malware check stays on**: package names (only) are checked against api.osv.dev before an install; if the service can't be reached the install proceeds.
- **Loop checker and independent reviewer stay on** (from upstream 7a1a27f5): extra model calls on large runs, accepted.
