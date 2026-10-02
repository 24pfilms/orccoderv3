# OrcaCoder Theme and Artwork

**Repository source of truth — 25 August 2026**

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

---

# Theming methodology

Everything below is the working method for theming any surface in this app — the workspace,
the board, or something new. It exists because three separate defects in one day came from
styling written against a vocabulary and a layer model that were never checked.

## 1. The layer model

Paint order, back to front. Get this wrong and colour disappears with no error.

| Layer | What it is | Rule |
| --- | --- | --- |
| `body` | Base colour (`--bg`) | The floor. Always opaque. |
| `.orca-wallpaper` | Eight stacked radial gradients from the palette | `z-index: -1`, first child of an isolated stacking context |
| `.app` | The shell | `isolation: isolate` **and `background: transparent`** |
| Glass surfaces | Cards, bars, popovers | Translucent + `backdrop-filter`, so the wallpaper reads through |
| Content | Text, items, controls | Opaque only where legibility demands it |

**The trap that cost the most time.** `.app` once carried `isolation: isolate` *and*
`background: var(--bg)`. Those cancel each other: the isolation traps the wallpaper at
`z-index: -1` inside `.app`, and the opaque background then paints over it. The gradients
render perfectly and are never seen. If a palette looks dead, check for an opaque background
on the isolating element before anything else.

## 2. The token vocabulary

**Use these. They are the only ones that exist.**

| Purpose | Token | Never write |
| --- | --- | --- |
| Base canvas | `--bg` | `--surface-0` |
| Raised surface | `--surface-1`, `--surface-2` | — |
| Hairlines | `--border`, `--border-strong` | `--line` |
| Text | `--text`, `--text-secondary`, `--text-muted`, `--text-dim` | — |
| Accent | `--primary`, `--secondary` | `--accent` |
| States | `--success`, `--warning`, `--error`, `--info` | `--danger` |
| Type | `--sans`, `--mono` | `--font-sans`, `--font-mono` |
| Radii | `--radius-button`, `--radius-card`, `--radius-pill` | — |
| Glass | `--orca-glass`, `--orca-glass-solid`, `--orca-glass-hover` | hand-mixed copies |
| Accent glow | `--orca-accent-glow` | hand-mixed copies |
| Wallpaper | `--orca-wp-1` … `--orca-wp-8` | — |
| Filters | `--orca-brightness`, `--orca-saturation` | — |

`--primary`, `--secondary`, the `--orca-glass*` set, `--orca-accent-glow`, and `--orca-wp-*`
are written **at runtime** by `orca-theme.ts` from the active palette. The rest are static in
`App.css`. All are on `:root`, so any stylesheet may use them.

**Why this matters more than it looks.** An undefined custom property invalidates its entire
declaration, silently. `--font-sans` does not exist, so `font-family: var(--font-sans)` fell
back to the browser default and every board label rendered in Times. `--accent`, `--line`,
`--surface-0` and `--danger` do not exist either, so 79 declarations — borders, glows, hover
tints, focus rings — were dropped without a single warning. Nothing errors. It just looks bad,
and it reads as a design problem rather than a bug.

## 3. Adding a themed surface — the checklist

1. **Pick the material.** Floating chrome (bars, popovers, menus, cards) → glass. Content that
   must stay legible over any palette → opaque, but prefer `--surface-1` over a literal colour.
2. **Use the app's glass, not your own:**
   ```css
   background: var(--orca-glass);        /* or --orca-glass-solid for modals */
   backdrop-filter: blur(24px) saturate(180%);
   -webkit-backdrop-filter: blur(24px) saturate(180%);
   ```
   The board once used `blur(22px) saturate(150%)` with a hand-mixed background. It looked
   close and never actually followed the theme.
3. **Borders and glow come from tokens, but not at full strength.** `--orca-accent-glow` is
   `rgba(239,68,68,0.3)`; applied whole to every panel edge it produces a red bloom. Mix it:
   ```css
   box-shadow: 0 0 22px color-mix(in srgb, var(--orca-accent-glow) 28%, transparent);
   ```
   Adopting a token's *name* is right; adopting its *intensity* unchanged is not — it was
   authored for a different context.
4. **Never put an opaque background on a stacking-context ancestor** of anything that should
   show the wallpaper.
5. **Screen-reader-only text needs a real `.sr-only`.** The app defines it only under
   `.memory-table`. Any new area needs its own, or hidden labels render on screen.
6. **Check both themes.** Nine palettes ship; a colour that works on Scarlet can vanish on
   Twilight. Switch palettes before calling it done.

## 4. Verify before claiming it works

Run this after any styling work. It finds tokens referenced but never defined — the failure
mode that produces no error and no warning:

```bash
python - <<'PY'
import re, io, glob, os
os.chdir("gg-app/src")
target = "board/board.css"                      # the file you changed
used = {m.group(1) for m in re.finditer(r"var\(\s*(--[A-Za-z0-9-]+)", io.open(target, encoding="utf-8").read())}
defined = set()
for path in glob.glob("**/*.css", recursive=True):
    defined |= {m.group(1) for m in re.finditer(r"^\s*(--[A-Za-z0-9-]+)\s*:", io.open(path, encoding="utf-8").read(), re.M)}
runtime = {"--primary","--secondary","--orca-glass","--orca-glass-solid","--orca-glass-hover",
           "--orca-accent-glow","--orca-brightness","--orca-saturation"} | {f"--orca-wp-{i}" for i in range(1,9)}
missing = sorted(used - defined - runtime)
print("UNDEFINED:", missing or "none")
PY
```

Anything listed is one of three things, and it is worth knowing which:

1. **A typo or an invented name** — the bug this catches. Fix it.
2. **Deliberately fallback-only** — `var(--board-sheen-top, 0.41)`. The fallback is the real
   value and the token exists so it can be overridden. Fine.
3. **Written at runtime by a component**, not by the theme — `--project-accent`
   (`WorkspaceHeader.tsx`), `--image-preview-width` (`Markdown.tsx`). Also fine.

Confirm which before acting: `grep -c -- "var(--name," App.css` shows fallback use, and
`grep -rl -- '"--name"' --include=*.ts --include=*.tsx .` shows a component writing it. Only
case 1 is a defect.

## 5. Reusing this elsewhere

The system is four files and moves as a unit:

| File | Role |
| --- | --- |
| `src/orca/orca-theme.css` | Wallpaper, glass, selector CSS |
| `src/orca/orca-theme.ts` | `THEMES` palettes, runtime token writing, localStorage |
| `src/orca/OrcaAppearance.tsx` | Palette dots + brightness / saturation / glass sliders |
| `src/App.css` `:root` | Static tokens the palettes do not own |

To theme another project: copy those four, render `<div class="orca-wallpaper" />` as the first
child of a container with `isolation: isolate` **and a transparent background**, call the theme
restore before first paint (see `main.tsx`, which prevents a wrong-colour flash), then style
surfaces with the tokens in §2 and the checklist in §3.

To add a palette, add one entry to `THEMES` in `orca-theme.ts`: eight wallpaper stops darkest to
lightest, an accent, a bright accent, and a glass tint as `"r,g,b"`. Nothing else needs touching —
every themed surface picks it up.

## 6. Consumers

Surfaces already on this system, useful as worked examples:

- `src/App.css` — shell, transcript card, composer, message bubbles
- `src/board/board.css` — board chrome, glass toolbars, menus, dialogs, the grid light pass
- `src/orca/scarlet.css` — the default skin
