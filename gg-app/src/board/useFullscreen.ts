import { useCallback, useEffect, useState } from "react";

/**
 * Native window fullscreen, for the board's fullscreen toggle.
 *
 * The Tauri window API is imported lazily inside each call so this hook stays inert in a
 * plain browser (the board fixture route, and jsdom under test) rather than throwing at
 * module load.
 */
export function useFullscreen(): [boolean, () => void] {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = await getCurrentWindow().isFullscreen();
        if (!cancelled) setFullscreen(current);
      } catch {
        // Not running in a Tauri window; the control simply stays inactive.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const window_ = getCurrentWindow();
        // Read the real window state rather than trusting local state, which can drift if
        // fullscreen was changed by the OS or a keyboard shortcut.
        const next = !(await window_.isFullscreen());
        await window_.setFullscreen(next);
        setFullscreen(next);
      } catch (error) {
        // Do not swallow this silently. The most likely cause is a missing Tauri
        // capability (core:window:allow-set-fullscreen), which produces a control that
        // looks fine and does nothing at all.
        console.error("Board full screen toggle failed", error);
      }
    })();
  }, []);

  return [fullscreen, toggle];
}
