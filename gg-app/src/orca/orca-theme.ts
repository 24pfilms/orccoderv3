/**
 * OrcaCoder theme engine — an isolated overlay inspired by OrcaScribe's
 * mc-theme.js. It writes a small set of Orca-prefixed CSS variables plus the
 * GG Framework's existing accent tokens (so glossy buttons recolor live),
 * and persists the user's choice to localStorage. Designed to be easy to
 * merge with upstream GG updates: no component-level inline-style churn.
 *
 * Scope of the first pass:
 *  - Wallpaper gradient (radial-gradient stack) behind app content
 *  - Accent colors (--primary / --secondary / button gloss)
 *  - Brightness + saturation filters on the wallpaper
 *  - Glass surface translucency (where .orca-glass is used)
 */

export interface OrcaPalette {
  /** 8 wallpaper colors, dark → bright. */
  wp: readonly [string, string, string, string, string, string, string, string];
  /** Primary accent (maps to GG's --primary). */
  accent: string;
  /** Brighter accent (maps to GG's --secondary). */
  accentBright: string;
  /** RGB triplet "r,g,b" for glass surface tints. */
  glassTint: string;
}

export const THEMES = {
  twilight: {
    wp: ["#0f0a1a", "#1e1145", "#4a1a6b", "#8b2a5e", "#c44b3f", "#e87d4a", "#f4a55a", "#fcd49a"],
    accent: "#c4b5fd",
    accentBright: "#a78bfa",
    glassTint: "22,16,36",
  },
  ocean: {
    wp: ["#040d1a", "#0a1e3d", "#0c3555", "#1a6b8a", "#2ca5a5", "#45c4b0", "#6ee7c8", "#a7f3d0"],
    accent: "#67e8f9",
    accentBright: "#22d3ee",
    glassTint: "8,18,32",
  },
  ember: {
    wp: ["#1a0800", "#3b1106", "#6b2410", "#9a3412", "#c2410c", "#ea580c", "#f59e0b", "#fcd34d"],
    accent: "#fbbf24",
    accentBright: "#f59e0b",
    glassTint: "30,14,8",
  },
  scarlet: {
    wp: ["#0a0605", "#160b09", "#2b0c08", "#4b110c", "#7f1d1d", "#dc2626", "#ef4444", "#ff7a6b"],
    accent: "#ef4444",
    accentBright: "#ff7a6b",
    glassTint: "22,12,10",
  },
  forest: {
    wp: ["#020f05", "#052e16", "#0a4a25", "#15803d", "#22994e", "#34d399", "#6ee7a8", "#bbf7d0"],
    accent: "#86efac",
    accentBright: "#34d399",
    glassTint: "8,22,14",
  },
  arctic: {
    wp: ["#050a18", "#0c1929", "#152e52", "#1e40af", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"],
    accent: "#93c5fd",
    accentBright: "#60a5fa",
    glassTint: "10,14,30",
  },
  solar: {
    wp: ["#1a0f00", "#422006", "#6b3410", "#92400e", "#b45309", "#ca8a04", "#eab308", "#fef08a"],
    accent: "#fde047",
    accentBright: "#eab308",
    glassTint: "30,22,8",
  },
  sakura: {
    wp: ["#1a0510", "#3b0626", "#6b1048", "#9d174d", "#be185d", "#db2777", "#ec4899", "#fbcfe8"],
    accent: "#f9a8d4",
    accentBright: "#ec4899",
    glassTint: "30,10,22",
  },
  obsidian: {
    wp: ["#09090b", "#111113", "#18181b", "#27272a", "#3f3f46", "#52525b", "#71717a", "#a1a1aa"],
    accent: "#a1a1aa",
    accentBright: "#71717a",
    glassTint: "20,20,22",
  },
} as const satisfies Record<string, OrcaPalette>;

export type ThemeName = keyof typeof THEMES;
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export interface OrcaThemeState {
  theme: ThemeName;
  /** 30..100 → CSS brightness() multiplier. */
  brightness: number;
  /** 0..200 → CSS saturate() multiplier. */
  saturation: number;
  /** 15..80 → glass rgba opacity percentage. */
  glass: number;
  /** Temporarily override the palette when this window needs the user's next task. */
  attentionEnabled: boolean;
  attentionTheme: ThemeName;
}

export const DEFAULT_STATE: OrcaThemeState = {
  // Scarlet keeps the requested orange glow through its ember highlights.
  theme: "scarlet",
  brightness: 72,
  saturation: 115,
  glass: 42,
  attentionEnabled: true,
  attentionTheme: "scarlet",
};

// The versioned key intentionally starts fresh from the upstream theme-kit default.
const STORAGE_KEY = "orcacoder-v3-appearance-scarlet-v1";
const ROOT = (): HTMLElement => document.documentElement;
let attentionRequested = false;

/** #rrggbb → rgba(r,g,b,a) */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Read saved appearance from localStorage; falls back to defaults. */
export function loadState(): OrcaThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<OrcaThemeState>;
    return {
      theme: parsed.theme && THEMES[parsed.theme] ? parsed.theme : DEFAULT_STATE.theme,
      brightness:
        typeof parsed.brightness === "number"
          ? clamp(parsed.brightness, 30, 100)
          : DEFAULT_STATE.brightness,
      saturation:
        typeof parsed.saturation === "number"
          ? clamp(parsed.saturation, 0, 200)
          : DEFAULT_STATE.saturation,
      glass: typeof parsed.glass === "number" ? clamp(parsed.glass, 15, 80) : DEFAULT_STATE.glass,
      attentionEnabled:
        typeof parsed.attentionEnabled === "boolean"
          ? parsed.attentionEnabled
          : DEFAULT_STATE.attentionEnabled,
      attentionTheme:
        parsed.attentionTheme && THEMES[parsed.attentionTheme]
          ? parsed.attentionTheme
          : DEFAULT_STATE.attentionTheme,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Persist appearance to localStorage. */
export function saveState(state: OrcaThemeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable/private mode — keep in-memory for the session.
  }
}

/** Wallpaper colors → --orca-wp-1..8, plus accent → --primary/--secondary. */
export function applyTheme(theme: ThemeName, state: OrcaThemeState): void {
  const palette =
    THEMES[attentionRequested && state.attentionEnabled ? state.attentionTheme : theme];
  const r = ROOT().style;

  // Wallpaper colors
  palette.wp.forEach((color, i) => {
    r.setProperty(`--orca-wp-${i + 1}`, color);
  });

  // Accent — overlay onto GG's accent system so buttons/icons recolor live.
  r.setProperty("--primary", palette.accent);
  r.setProperty("--secondary", palette.accentBright);
  r.setProperty("--orca-accent-glow", hexToRgba(palette.accent, 0.3));

  // Glossy button gradients (derived from the active accent).
  r.setProperty(
    "--gloss-primary",
    `linear-gradient(180deg, ${palette.accentBright} 0%, ${palette.accent} 100%)`,
  );
  r.setProperty(
    "--grad-primary",
    `linear-gradient(135deg, ${palette.accent} 0%, ${palette.accentBright} 100%)`,
  );
  r.setProperty(
    "--gloss-shadow-primary",
    `0 1px 2px rgba(0, 0, 0, 0.3), inset 0 1px 0 ${hexToRgba("#ffffff", 0.28)}`,
  );

  applyGlass(state.glass, palette.glassTint);
}

/** brightness 30..100 → CSS filter brightness() on the wallpaper layer. */
export function applyBrightness(val: number): void {
  ROOT().style.setProperty("--orca-brightness", (clamp(val, 30, 100) / 100).toFixed(2));
}

/** saturation 0..200 → CSS filter saturate() on the wallpaper layer. */
export function applySaturation(val: number): void {
  ROOT().style.setProperty("--orca-saturation", (clamp(val, 0, 200) / 100).toFixed(2));
}

/** glass 15..80 → glass surface rgba opacity. */
export function applyGlass(val: number, glassTintOverride?: string): void {
  const opacity = clamp(val, 15, 80) / 100;
  const tint = glassTintOverride;
  const r = ROOT().style;
  if (tint) {
    r.setProperty("--orca-glass", `rgba(${tint}, ${opacity.toFixed(2)})`);
    r.setProperty("--orca-glass-solid", `rgba(${tint}, ${Math.min(1, opacity + 0.3).toFixed(2)})`);
    r.setProperty("--orca-glass-hover", `rgba(${tint}, ${Math.min(1, opacity + 0.1).toFixed(2)})`);
  } else {
    r.setProperty("--orca-glass", `rgba(22, 16, 36, ${opacity.toFixed(2)})`);
    r.setProperty(
      "--orca-glass-solid",
      `rgba(22, 16, 36, ${Math.min(1, opacity + 0.3).toFixed(2)})`,
    );
    r.setProperty(
      "--orca-glass-hover",
      `rgba(22, 16, 36, ${Math.min(1, opacity + 0.1).toFixed(2)})`,
    );
  }
}

/** Apply everything from a state object. */
export function applyAll(state: OrcaThemeState): void {
  applyTheme(state.theme, state);
  applyBrightness(state.brightness);
  applySaturation(state.saturation);
}

/**
 * Temporarily use the selected attention palette while this window is waiting.
 * The saved normal palette remains untouched and is restored when work resumes.
 */
function applySavedState(): OrcaThemeState {
  const state = loadState();
  ROOT().toggleAttribute("data-orca-attention", attentionRequested && state.attentionEnabled);
  applyAll(state);
  return state;
}

export function setAttentionOverride(active: boolean): void {
  attentionRequested = active;
  applySavedState();
}

/** Persist and immediately apply the user's attention-theme preference. */
export function setAttentionEnabled(enabled: boolean): void {
  saveState({ ...loadState(), attentionEnabled: enabled });
  applySavedState();
}

/** Choose which palette is used while a window is waiting. */
export function setAttentionTheme(theme: ThemeName): void {
  saveState({ ...loadState(), attentionTheme: theme });
  applySavedState();
}

/** Keep the attention preference synchronized across all open app windows. */
export function subscribeToThemeChanges(onChange?: (state: OrcaThemeState) => void): () => void {
  const sync = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) return;
    onChange?.(applySavedState());
  };
  window.addEventListener("storage", sync);
  return () => window.removeEventListener("storage", sync);
}

/** A CSS gradient string for a theme dot, used by the appearance panel. */
export function themeDotGradient(theme: ThemeName): string {
  const palette = THEMES[theme];
  const stops = palette.wp
    .map((c, i) => {
      const pct = Math.round((i / (palette.wp.length - 1)) * 100);
      return `${c} ${pct}%`;
    })
    .join(", ");
  return `linear-gradient(135deg, ${stops})`;
}
