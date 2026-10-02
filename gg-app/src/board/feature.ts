export const BOARD_MODE_KILL_SWITCH_KEY = "orcacoder.board-mode.disabled";

type BoardFeatureEnvironment = Record<string, unknown>;

type RuntimeStorage = Pick<Storage, "getItem">;

export function isBoardModeEnabled(
  environment: BoardFeatureEnvironment = import.meta.env,
  storage?: RuntimeStorage,
): boolean {
  if (environment["VITE_BOARD_MODE_ENABLED"] !== "true") return false;

  const runtimeStorage = storage ?? window.localStorage;
  try {
    return runtimeStorage.getItem(BOARD_MODE_KILL_SWITCH_KEY) !== "true";
  } catch {
    return false;
  }
}
