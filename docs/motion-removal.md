# Orca Motion — turning it off, and removing it

Motion (video creation with HyperFrames, ported from upstream GG Framework) was added
in three separate steps so it can be undone at whatever level you want.

## Level 1 — hide it (no rebuild, 5 seconds)

Settings → **Motion on/off**. Off hides the Motion button on the home screen in every
window. Nothing else changes; turn it back on any time.

## Level 2 — build without it (smaller installer)

Motion is only built in when `VITE_MOTION_ENABLED=true` is set for the build. Leave it
out and the build has **no Motion button, no Motion bundle and no `hyperframes`
package** (about 70 MB smaller):

```bash
pnpm -r build
pnpm --filter gg-app prebundle                  # no VITE_MOTION_ENABLED = no Motion files
cd gg-app && VITE_BOARD_MODE_ENABLED=true pnpm tauri build
```

With the flag: prefix `VITE_MOTION_ENABLED=true` to both the `prebundle` and the
`tauri build` commands (and to the dev launcher).

## Level 3 — remove it from the code

Everything Motion added is in the commits on the `feat/motion` branch, in this order:

1. `chore(motion): add the Motion files from upstream` — the inert files
   (`packages/ggcoder/assets/motion`, `packages/ggcoder/src/motion-agent`, the Motion app
   files, the asset scripts).
2. `feat(motion): wire Motion into the engine` — the engine mode, session options,
   bundler and dependencies (`hyperframes`, `tslib`).
3. `feat(motion): Orca Motion on the home screen` — the app wiring, the switches and the
   Settings toggle.

To remove Motion completely: `git revert` those commits, newest first, then
`pnpm install` and rebuild. Every line Motion touches in a shared file is marked
`[motion]`, so `grep -rn "\[motion\]" gg-app packages` lists them all.

## What is deliberately not ported

The completion-review hook (Motion sets it to undefined upstream) and upstream's UI
overhaul. Motion's licences (MIT, Apache-2.0, SIL OFL, CC BY 4.0, CC0) are in
`packages/ggcoder/assets/motion/THIRD-PARTY.md`.
