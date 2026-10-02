import { useEffect, useRef, useState } from "react";
import { Grid2x2 } from "lucide-react";
import { LIGHT_PASS_DEFAULTS, useLightPass } from "./useLightPass";

interface BoardCanvasSettingsProps {
  dotDensity: number;
  disabled: boolean;
  onDotDensityChange: (value: number) => void;
}

/** Canvas appearance. Currently just dot spacing, which is a per-board stored setting. */
export function BoardCanvasSettings({
  dotDensity,
  disabled,
  onDotDensityChange,
}: BoardCanvasSettingsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [light, setLight] = useLightPass();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="board-canvas-settings" ref={wrapRef}>
      <button
        type="button"
        aria-label="Canvas settings"
        aria-expanded={open}
        title="Canvas settings"
        onClick={() => setOpen((value) => !value)}
      >
        <Grid2x2 aria-hidden="true" />
      </button>
      {open ? (
        <div className="board-canvas-settings-panel" role="dialog" aria-label="Canvas settings">
          <label>
            <span>Dot spacing</span>
            <input
              type="range"
              min={4}
              max={48}
              step={1}
              value={dotDensity}
              disabled={disabled}
              onChange={(event) => {
                // Read before the updater runs: React clears currentTarget once the
                // handler returns.
                const next = Number(event.currentTarget.value);
                onDotDensityChange(next);
              }}
            />
            <output>{Math.round(dotDensity)}</output>
          </label>

          <hr />

          <label>
            <span>Light tint</span>
            <input
              type="color"
              value={light.tint}
              onChange={(event) => {
                const tint = event.currentTarget.value;
                setLight({ tint });
              }}
            />
          </label>

          <label>
            <span>Light strength</span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={light.opacity}
              onChange={(event) => {
                const opacity = Number(event.currentTarget.value);
                setLight({ opacity });
              }}
            />
            <output>{Math.round(light.opacity * 100)}%</output>
          </label>

          <label>
            <span>Light speed</span>
            <input
              type="range"
              min={8}
              max={120}
              step={1}
              value={light.speed}
              onChange={(event) => {
                const speed = Number(event.currentTarget.value);
                setLight({ speed });
              }}
            />
            <output>{light.speed}s</output>
          </label>

          <button
            type="button"
            className="board-canvas-settings-reset"
            onClick={() => setLight(LIGHT_PASS_DEFAULTS)}
          >
            Reset light
          </button>
        </div>
      ) : null}
    </div>
  );
}
