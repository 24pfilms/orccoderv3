import { useSyncExternalStore } from "react";

// [motion] Whether the Orca Motion entry (Home button, Motion sessions) exists.
// Two independent switches, so Motion is easy to turn off or leave out:
//   1. Build: only builds made with VITE_MOTION_ENABLED=true contain the button
//      (the sidecar bundler uses the same flag, so a build without it also leaves
//      out the ~70 MB Motion bundle and the hyperframes package).
//   2. Runtime: Settings -> "Motion on/off" hides the button in a build that has
//      Motion, no rebuild needed. Persisted in localStorage, default ON, and kept
//      in sync across open windows via the `storage` event.
// To remove Motion entirely, see docs/motion-removal.md.
const STORAGE_KEY = "orca-motion-enabled";

type MotionEnvironment = Record<string, unknown>;

/** Whether this build was made with Motion. */
export function isMotionBuilt(environment: MotionEnvironment = import.meta.env): boolean {
  return environment["VITE_MOTION_ENABLED"] === "true";
}

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

let enabled = loadEnabled();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const next = loadEnabled();
  if (next === enabled) return;
  enabled = next;
  notify();
}

export function setMotionEnabled(on: boolean): void {
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
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): boolean {
  return enabled;
}

/** The user's Motion on/off setting (default on). */
export function useMotionEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Whether to show Motion at all: this build has it AND the user hasn't turned it off. */
export function useMotionVisible(): boolean {
  const on = useMotionEnabled();
  return isMotionBuilt() && on;
}
