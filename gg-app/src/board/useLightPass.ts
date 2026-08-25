import { useCallback, useEffect, useState } from "react";

export interface LightPassSettings {
  /** CSS colour for the drifting band. */
  tint: string;
  /** 0 turns the pass off entirely. */
  opacity: number;
  /** Seconds for one sweep across the canvas. */
  speed: number;
}

const STORAGE_KEY = "orcacoder.board.light-pass";

export const LIGHT_PASS_DEFAULTS: LightPassSettings = {
  tint: "#ef4444",
  opacity: 0.1,
  speed: 34,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function read(): LightPassSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return LIGHT_PASS_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<LightPassSettings>;
    return {
      tint: /^#[0-9a-f]{6}$/i.test(String(parsed.tint)) ? String(parsed.tint) : LIGHT_PASS_DEFAULTS.tint,
      opacity: clamp(Number(parsed.opacity), 0, 0.5, LIGHT_PASS_DEFAULTS.opacity),
      speed: clamp(Number(parsed.speed), 8, 120, LIGHT_PASS_DEFAULTS.speed),
    };
  } catch {
    return LIGHT_PASS_DEFAULTS;
  }
}

/**
 * Look of the drifting light pass over the grid. An app-level preference rather than
 * board data: it is a matter of taste, and storing it on the board would need a schema
 * change, which the migration runner gates behind a recovery backup.
 */
export function useLightPass(): [LightPassSettings, (next: Partial<LightPassSettings>) => void] {
  const [settings, setSettings] = useState<LightPassSettings>(read);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--board-light-tint", settings.tint);
    root.style.setProperty("--board-light-opacity", String(settings.opacity));
    root.style.setProperty("--board-light-speed", `${settings.speed}s`);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // A board that cannot persist its look is still a usable board.
    }
  }, [settings]);

  const update = useCallback((next: Partial<LightPassSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  return [settings, update];
}
