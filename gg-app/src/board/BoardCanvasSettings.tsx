import { useEffect, useRef, useState } from "react";
import { Grid2x2 } from "lucide-react";

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
        </div>
      ) : null}
    </div>
  );
}
