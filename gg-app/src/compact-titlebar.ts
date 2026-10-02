import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Compact title bar (Windows): windows are built WITHOUT the native Windows
// title bar (Rust `build_app_window_with_visibility`), and OrcaCoder's own
// header — already a drag region for the macOS overlay — becomes the title bar,
// with in-app minimise / maximise / close (WindowControls). Saves the native
// bar's height in every window. Persisted in localStorage, default ON, and kept
// in sync across open windows via the `storage` event; turning it off restores
// the native title bar live.
const STORAGE_KEY = "orca-compact-titlebar";
/** Class on <html> while the compact title bar is active (Windows only). */
export const COMPACT_CLASS = "compact-titlebar";

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

let enabled = loadEnabled();
const listeners = new Set<() => void>();

function isWindowsHost(doc: Document = document): boolean {
  return doc.documentElement.classList.contains("platform-windows");
}

/** Pure: whether this window should run without native decorations. */
export function compactTitlebarActive(isWindows: boolean, on: boolean): boolean {
  return isWindows && on;
}

/**
 * Apply the current setting to THIS window: tag <html> so CSS reserves room for
 * the in-app window controls, and add or drop the native title bar.
 */
function apply(): void {
  const isWindows = isWindowsHost();
  if (!isWindows) return;
  const active = compactTitlebarActive(isWindows, enabled);
  document.documentElement.classList.toggle(COMPACT_CLASS, active);
  void getCurrentWindow()
    .setDecorations(!active)
    .catch((error: unknown) => {
      console.error("compact title bar: setDecorations failed", error);
    });
}

function notify(): void {
  apply();
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const next = loadEnabled();
  if (next === enabled) return;
  enabled = next;
  notify();
}

/** Boot hook for every app window (called from main.tsx before first render). */
export function initCompactTitlebar(): void {
  window.addEventListener("storage", onStorage);
  apply();
}

export function setCompactTitlebar(on: boolean): void {
  if (on === enabled) return;
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Still applies in memory for this window when storage is unavailable.
  }
  notify();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): boolean {
  return enabled;
}

/** Whether the compact title bar setting is on (shared by Settings + controls). */
export function useCompactTitlebar(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
