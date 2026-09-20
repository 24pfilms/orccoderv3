# Decorative UI effects (thinking orbs · working beams · metal buttons)

Optional eye-candy, **on by default**, with a single on/off switch in
**Settings → Effects → "Effects on/off"** (persisted in `localStorage` as
`gg-ui-enabled`). Every window respects the app's focus-pause policy, so
background windows never animate.

Everything for these effects lives in this folder plus a handful of clearly
marked one-line hooks. Search the codebase for `[effects]` to find them all.

## Turn them off (no code change)
Settings → Effects → toggle **Effects off**. That's it.

## Delete them completely
1. **Delete this folder:** `gg-app/src/effects/`.
2. **Remove the three deps** from `gg-app/package.json`:
   `border-beam`, `metal-fx`, `thinking-orbs`.
3. **Remove the two patch entries** from the root `package.json`
   `pnpm.patchedDependencies` (`border-beam@1.3.0`, `metal-fx@2.0.10`) and
   delete `patches/border-beam@1.3.0.patch` + `patches/metal-fx@2.0.10.patch`.
4. **Revert the `// [effects]` hooks** (all one line or one small block each):
   - `gg-app/src/App.tsx` — the imports, `const ggUiEnabled`, the
     `<WorkingBeam …/>` in `.inputwrap`, the `<MetalButton …>` wrapping the
     attach button (change it back to a plain `<button …>`), and the
     `import "./effects/effects.css"`.
   - `gg-app/src/ActivityBar.tsx` — the `ThinkingOrbGlyph` import; replace
     `<ThinkingOrbGlyph fallback={X} />` with just `X`.
   - `gg-app/src/SettingsModal.tsx` — the `EffectsButton` import + usage.
   - `gg-app/index.html` — the `id="app-style-nonce"` on the inline `<style>`
     is harmless to keep, but can be removed.
5. `pnpm install`, then rebuild.
