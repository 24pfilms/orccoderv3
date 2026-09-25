// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const win = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
  onResized: vi.fn(async () => () => {}),
  setDecorations: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));

// compact-titlebar keeps module-level state, so each test loads it fresh.
async function load(platform: string) {
  vi.resetModules();
  document.documentElement.className = platform;
  const titlebar = await import("./compact-titlebar");
  const controls = await import("./WindowControls");
  titlebar.initCompactTitlebar();
  return { ...titlebar, ...controls };
}

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(win)) fn.mockClear();
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

describe("compactTitlebarActive", () => {
  it("is only active on Windows with the setting on", async () => {
    const { compactTitlebarActive } = await load("platform-windows");
    expect(compactTitlebarActive(true, true)).toBe(true);
    expect(compactTitlebarActive(true, false)).toBe(false);
    expect(compactTitlebarActive(false, true)).toBe(false);
  });
});

describe("WindowControls", () => {
  it("drops the native title bar and shows in-app controls on Windows by default", async () => {
    const { WindowControls, COMPACT_CLASS } = await load("platform-windows");
    render(<WindowControls />);
    expect(win.setDecorations).toHaveBeenCalledWith(false);
    expect(document.documentElement.classList.contains(COMPACT_CLASS)).toBe(true);
    expect(screen.getByRole("button", { name: "Minimise" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Maximise" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  it("routes each button to its window action", async () => {
    const { WindowControls } = await load("platform-windows");
    render(<WindowControls />);
    fireEvent.click(screen.getByRole("button", { name: "Minimise" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximise" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    expect(win.close).toHaveBeenCalledOnce();
  });

  it("shows the restore icon while the window is maximised", async () => {
    win.isMaximized.mockResolvedValueOnce(true);
    const { WindowControls } = await load("platform-windows");
    render(<WindowControls />);
    expect(await screen.findByRole("button", { name: "Restore" })).toBeDefined();
  });

  it("brings the native title bar back when the setting is turned off", async () => {
    const { WindowControls, CompactTitlebarButton, COMPACT_CLASS } =
      await load("platform-windows");
    render(
      <>
        <WindowControls />
        <CompactTitlebarButton />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Compact title bar on/ }));
    });
    expect(win.setDecorations).toHaveBeenLastCalledWith(true);
    expect(document.documentElement.classList.contains(COMPACT_CLASS)).toBe(false);
    expect(screen.queryByRole("button", { name: "Minimise" })).toBeNull();
    expect(localStorage.getItem("orca-compact-titlebar")).toBe("0");
  });

  it("renders nothing and leaves decorations alone off Windows", async () => {
    const { WindowControls, CompactTitlebarButton } = await load("platform-macos");
    render(
      <>
        <WindowControls />
        <CompactTitlebarButton />
      </>,
    );
    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Compact title bar/ })).toBeNull();
    expect(win.setDecorations).not.toHaveBeenCalled();
  });
});
