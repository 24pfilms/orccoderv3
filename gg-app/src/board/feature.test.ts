import { describe, expect, it, vi } from "vitest";
import { BOARD_MODE_KILL_SWITCH_KEY, isBoardModeEnabled } from "./feature";

describe("Board Mode feature gating", () => {
  it("defaults off without touching runtime storage", () => {
    const getItem = vi.fn();

    expect(isBoardModeEnabled({}, { getItem })).toBe(false);
    expect(getItem).not.toHaveBeenCalled();
  });

  it("allows an explicitly enabled isolated build", () => {
    const getItem = vi.fn().mockReturnValue(null);

    expect(isBoardModeEnabled({ VITE_BOARD_MODE_ENABLED: "true" }, { getItem })).toBe(true);
    expect(getItem).toHaveBeenCalledWith(BOARD_MODE_KILL_SWITCH_KEY);
  });

  it("honors the runtime kill switch", () => {
    const getItem = vi.fn().mockReturnValue("true");

    expect(isBoardModeEnabled({ VITE_BOARD_MODE_ENABLED: "true" }, { getItem })).toBe(false);
  });

  it("fails closed when runtime storage is unavailable", () => {
    const getItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });

    expect(isBoardModeEnabled({ VITE_BOARD_MODE_ENABLED: "true" }, { getItem })).toBe(false);
  });
});
