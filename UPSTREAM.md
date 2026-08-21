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
