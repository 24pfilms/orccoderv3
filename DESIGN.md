# OrcaCoder Design Direction

## Direction Contract

- **Intent:** A pod-minded coding shell for deep-work agents: technically precise, unmistakably Orca, and calm during long missions.
- **Composition:** Preserve the operational shell. The home screen uses the established two-column Scarlet deck: hero card left, fixed Mission Controls right.
- **Depth:** Near-black oxblood canvas (`#0A0605`) with radial warmth, translucent Scarlet cards, one-pixel hairlines, inset gloss, and colored glow instead of hard shadows.
- **Surfaces:** Window radius 14px, cards 18px, controls 14px, and full-radius status pills/icon controls.
- **Typography:** Space Grotesk for display/interface text and JetBrains Mono for labels, versions, metadata, and code.
- **Color:** Scarlet `#EF4444` is primary; ember-orange `#FF7A6B` is the requested highlight; deep press is `#DC2626`. White opacity creates hierarchy.
- **Signature:** The molten-glass Scarlet Orca, `OrcaCoder` wordmark, `Pod Command Deck` eyebrow, and SquareCircleLabs credit.
- **Motion:** One brief deck reveal, calm ocean currents/bubbles, and ten six-second rotating lines per workspace mode. Reduced-motion users receive a static invitation; hover never moves layout.

## Canonical Source

Canonical repository sources:

- [`gg-app/THEMING.md`](gg-app/THEMING.md) — integration and maintenance guide.
- [`gg-app/src/orca/`](gg-app/src/orca/) — palettes, appearance control, and Scarlet skin.
- [`gg-app/src/assets/orca-scarlet.png`](gg-app/src/assets/orca-scarlet.png) — transparent hero artwork.
- [`gg-app/src/assets/orca-scarlet-icon.png`](gg-app/src/assets/orca-scarlet-icon.png) — square icon-generation source.
- [`gg-app/src-tauri/icons/`](gg-app/src-tauri/icons/) — complete native icon set.

The original OneDrive/L-drive files are provenance only. Builds and runtime behavior have no dependency on those external locations. Integrated files remain isolated under `gg-app/src/orca/` so upstream UI changes can merge around them.

## Accessibility Floor

- Keyboard-operable appearance menu with visible focus states.
- Dialog semantics and explicit labels for palette choices and sliders.
- Text uses existing high-contrast neutral tokens; saturated colors are accents, not body text.
- Wallpaper is decorative and excluded from assistive technology.
- Reduced-motion users receive no looping identity animation.
