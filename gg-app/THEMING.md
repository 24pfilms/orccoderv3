# OrcaCoder Theme and Artwork

**Repository source of truth — 21 August 2026**

OrcaCoder is self-contained. The desktop build does not read theme files, artwork, fonts, or
icons from OneDrive, the L-drive archive, or `.gg/uploads`.

## Runtime integration

| Purpose                                | Repository path                    |
| -------------------------------------- | ---------------------------------- |
| Palette tokens and persistence         | `src/orca/orca-theme.ts`           |
| Base Orca wallpaper/glass/selector CSS | `src/orca/orca-theme.css`          |
| Scarlet application skin               | `src/orca/scarlet.css`             |
| Appearance selector                    | `src/orca/OrcaAppearance.tsx`      |
| Scarlet hero artwork                   | `src/assets/orca-scarlet.png`      |
| Square icon source                     | `src/assets/orca-scarlet-icon.png` |
| Alternate blue Orca artwork            | `src/assets/orca-logo.png`         |
| Browser/favicon artwork                | `public/orca-logo.png`             |
| Windows/macOS/native icons             | `src-tauri/icons/`                 |

`src/App.tsx` imports the base app stylesheet, Orca theme stylesheet, and Scarlet stylesheet in
that order. `src/main.tsx` restores the saved palette before the first React render, preventing
a wrong-color flash.

## Identity

- Product display name: **OrcaCoder**
- Repository generation: **OrcaCoder V3**
- Current application version: **0.53.0** (kept aligned with the imported GG Framework release)
- Bundle identifier: `com.orcacoder.desktop`
- Default palette: **Scarlet**, with ember-orange highlights
- Display font: Space Grotesk
- Mono font: JetBrains Mono

The internal `ken_*`, `ggcoder`, package names, and legacy storage paths remain unchanged for
protocol, history, and upstream compatibility. Public mentor labels and prompts render as
**Orca / @Orca**.

## Scarlet tokens

- Canvas: `#0A0605`
- Card: `#160C0A`
- Primary Scarlet: `#EF4444`
- Ember highlight: `#FF7A6B`
- Deep press: `#DC2626`
- Text: white with opacity-based hierarchy
- Card radius: 18px
- Control radius: 14px

## Appearance behavior

The appearance selector lives beside **Autopilot** in Code mode and beside **New** in Chat
mode. It controls palette, brightness, saturation, and glass opacity. State is stored under the
versioned local-storage key defined in `src/orca/orca-theme.ts`.

## Regenerating native icons

Use the repository's square source; never depend on an external drive:

```bash
pnpm --dir gg-app tauri icon src/assets/orca-scarlet-icon.png
```

The handcrafted dark-backed icon set stored under `src-tauri/icons/` is the
canonical shipped set. Regeneration may produce a flatter transparent variant, so review the
output before accepting it.

## Maintenance rule

Keep Orca-specific visual changes inside `src/orca/` where possible. When upstream changes a
shared component, preserve behavior first, then reapply only the smallest Orca class/import
hook. Update this file and the root `README.md` whenever artwork ownership, palette defaults,
versioning, or build status changes.
