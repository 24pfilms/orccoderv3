import { Clapperboard } from "lucide-react"; // [motion]
import { theme } from "./theme";
import { isMotionBuilt, setMotionEnabled, useMotionEnabled } from "./motion-feature";

/** Settings toggle that hides or shows Motion; renders nothing in a build without it. */
export function MotionToggleButton(): React.ReactElement | null {
  const on = useMotionEnabled();
  if (!isMotionBuilt()) return null;
  return (
    <button
      className="modal-btn"
      aria-pressed={on}
      title={on ? "Hide Motion from the home screen" : "Show Motion on the home screen"}
      style={on ? undefined : { color: theme.textMuted }}
      onClick={() => setMotionEnabled(!on)}
    >
      <Clapperboard size={16} aria-hidden="true" />
      Motion {on ? "on" : "off"}
    </button>
  );
}
