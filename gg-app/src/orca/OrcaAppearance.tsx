import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import {
  THEME_NAMES,
  applyBrightness,
  applySaturation,
  applyTheme,
  loadState,
  saveState,
  themeDotGradient,
  type OrcaThemeState,
  type ThemeName,
} from "./orca-theme";

/**
 * Orca appearance dropdown — theme dots + brightness/saturation/glass sliders.
 * Mounts once in the app HEADER (settings cluster). On mount it re-applies the
 * saved theme so the very first paint uses the persisted palette. All state is
 * local React; no DOM query selectors.
 */
export function OrcaAppearance(): React.ReactElement {
  const [state, setState] = useState<OrcaThemeState>(() => loadState());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function setTheme(theme: ThemeName): void {
    setState((prev) => {
      const next = { ...prev, theme };
      applyTheme(theme, next);
      saveState(next);
      return next;
    });
  }

  function setBrightness(val: number): void {
    setState((prev) => {
      const next = { ...prev, brightness: val };
      applyBrightness(val);
      saveState(next);
      return next;
    });
  }

  function setSaturation(val: number): void {
    setState((prev) => {
      const next = { ...prev, saturation: val };
      applySaturation(val);
      saveState(next);
      return next;
    });
  }

  function setGlass(val: number): void {
    setState((prev) => {
      const next = { ...prev, glass: val };
      applyTheme(prev.theme, next);
      saveState(next);
      return next;
    });
  }

  return (
    <div className="orca-appearance-group" ref={ref}>
      <button
        className="orca-appearance-toggle btn btn-ghost btn-sm btn-icon"
        type="button"
        title="Appearance"
        aria-label="Appearance"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="orca-appearance-dropdown" role="dialog" aria-label="Appearance">
          <div className="orca-appearance-title">Theme</div>
          <div className="orca-theme-dots">
            {THEME_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={`orca-theme-dot${state.theme === name ? " active" : ""}`}
                title={name.charAt(0).toUpperCase() + name.slice(1)}
                aria-label={name}
                aria-pressed={state.theme === name}
                style={{ background: themeDotGradient(name) }}
                onClick={() => setTheme(name)}
              />
            ))}
          </div>

          <div className="orca-appearance-title">Display</div>
          <Slider
            label="Brightness"
            value={state.brightness}
            min={30}
            max={100}
            onChange={setBrightness}
          />
          <Slider
            label="Saturation"
            value={state.saturation}
            min={0}
            max={200}
            onChange={setSaturation}
          />
          <Slider label="Glass" value={state.glass} min={15} max={80} onChange={setGlass} />
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div className="orca-slider-group">
      <div className="orca-slider-label">
        <span>{label}</span>
        <span className="orca-slider-value">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
