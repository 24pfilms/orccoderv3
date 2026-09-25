import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, PanelTop, Square, X } from "lucide-react";
import { setCompactTitlebar, useCompactTitlebar } from "./compact-titlebar";
import { theme } from "./theme";

/** Settings toggle for the compact title bar; renders nothing off Windows. */
export function CompactTitlebarButton(): React.ReactElement | null {
  const on = useCompactTitlebar();
  if (!document.documentElement.classList.contains("platform-windows")) return null;
  return (
    <button
      className="modal-btn"
      aria-pressed={on}
      title={
        on
          ? "Bring back the standard Windows title bar"
          : "Hide the Windows title bar and use OrcaCoder's header instead"
      }
      style={on ? undefined : { color: theme.textMuted }}
      onClick={() => setCompactTitlebar(!on)}
    >
      <PanelTop size={16} aria-hidden="true" />
      Compact title bar {on ? "on" : "off"}
    </button>
  );
}

/**
 * In-app minimise / maximise / close for the compact title bar (Windows only —
 * see compact-titlebar.ts). Fixed to the window's top-right; the headers
 * reserve room for it via `.compact-titlebar` CSS. Close goes through the same
 * close request as the native button, so window-close handling is unchanged.
 */
export function WindowControls(): React.ReactElement | null {
  const compact = useCompactTitlebar();
  const isWindows = document.documentElement.classList.contains("platform-windows");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isWindows || !compact) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const sync = () => {
      void win.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    };
    sync();
    void win.onResized(sync).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isWindows, compact]);

  if (!isWindows || !compact) return null;
  const win = getCurrentWindow();
  return (
    <div className="window-controls" role="group" aria-label="Window controls">
      <button
        type="button"
        className="window-control"
        aria-label="Minimise"
        title="Minimise"
        onClick={() => void win.minimize()}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={maximized ? "Restore" : "Maximise"}
        title={maximized ? "Restore" : "Maximise"}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? (
          <Copy size={12} aria-hidden="true" />
        ) : (
          <Square size={12} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label="Close"
        title="Close"
        onClick={() => void win.close()}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
