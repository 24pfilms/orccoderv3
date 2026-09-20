import { Sparkles } from "lucide-react";
import { theme } from "../theme";
import { setGgUiEnabled, useGgUiEnabled } from "./gg-ui";

// [effects] The Settings toggle for all decorative effects (thinking orbs,
// working beams, metal buttons). Rendered by SettingsModal.
export function EffectsButton(): React.ReactElement {
  const on = useGgUiEnabled();
  return (
    <button
      className="modal-btn"
      aria-pressed={on}
      title={on ? "Turn decorative UI effects off" : "Turn decorative UI effects on"}
      style={on ? undefined : { color: theme.textMuted }}
      onClick={() => setGgUiEnabled(!on)}
    >
      <Sparkles size={16} aria-hidden="true" />
      Effects {on ? "on" : "off"}
    </button>
  );
}
