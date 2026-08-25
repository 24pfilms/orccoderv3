// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { handleBoardKeyDown, type BoardKeyboardCommands } from "./boardKeyboard";

function commands(): BoardKeyboardCommands {
  return {
    undo: vi.fn(),
    redo: vi.fn(),
    duplicate: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    deleteSelection: vi.fn(),
    escape: vi.fn(),
  };
}

describe("Board keyboard scope", () => {
  it.each([
    ["d", "duplicate"],
    ["c", "copy"],
    ["v", "paste"],
    ["z", "undo"],
    ["y", "redo"],
  ] as const)("maps Ctrl+%s to %s", (key, name) => {
    const actions = commands();
    const event = new KeyboardEvent("keydown", { key, ctrlKey: true, cancelable: true });
    expect(handleBoardKeyDown(event, actions)).toBe(true);
    expect(actions[name]).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("maps redo, delete, and Escape without duplicate global listeners", () => {
    const actions = commands();
    handleBoardKeyDown(new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true }), actions);
    handleBoardKeyDown(new KeyboardEvent("keydown", { key: "Backspace" }), actions);
    handleBoardKeyDown(new KeyboardEvent("keydown", { key: "Escape" }), actions);
    expect(actions.redo).toHaveBeenCalledOnce();
    expect(actions.deleteSelection).toHaveBeenCalledOnce();
    expect(actions.escape).toHaveBeenCalledOnce();
  });

  it("leaves editing controls and their native clipboard alone", () => {
    const actions = commands();
    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true });
    input.addEventListener("keydown", (next) => handleBoardKeyDown(next, actions));
    input.dispatchEvent(event);
    expect(actions.paste).not.toHaveBeenCalled();
  });
});
