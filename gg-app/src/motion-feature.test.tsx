// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// motion-feature keeps module-level state, so each test loads it fresh.
async function load() {
  vi.resetModules();
  const feature = await import("./motion-feature");
  const toggle = await import("./MotionToggleButton");
  return { ...feature, ...toggle };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("isMotionBuilt", () => {
  it("is on only for a build made with VITE_MOTION_ENABLED=true", async () => {
    const { isMotionBuilt } = await load();
    expect(isMotionBuilt({ VITE_MOTION_ENABLED: "true" })).toBe(true);
    expect(isMotionBuilt({ VITE_MOTION_ENABLED: "false" })).toBe(false);
    expect(isMotionBuilt({ VITE_MOTION_ENABLED: true })).toBe(false);
    expect(isMotionBuilt({})).toBe(false);
  });
});

describe("MotionToggleButton", () => {
  it("renders nothing in a build without Motion", async () => {
    const { MotionToggleButton } = await load();
    render(<MotionToggleButton />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides and shows Motion, and remembers the choice", async () => {
    vi.stubEnv("VITE_MOTION_ENABLED", "true");
    const { MotionToggleButton, useMotionVisible } = await load();
    function Probe() {
      return <span data-testid="visible">{String(useMotionVisible())}</span>;
    }
    render(
      <>
        <MotionToggleButton />
        <Probe />
      </>,
    );
    expect(screen.getByTestId("visible").textContent).toBe("true");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Motion on/ }));
    });
    expect(screen.getByTestId("visible").textContent).toBe("false");
    expect(screen.getByRole("button", { name: /Motion off/ })).toBeDefined();
    expect(localStorage.getItem("orca-motion-enabled")).toBe("0");
  });

  it("stays hidden in a build without Motion even when the setting is on", async () => {
    const { useMotionVisible } = await load();
    function Probe() {
      return <span data-testid="visible">{String(useMotionVisible())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("visible").textContent).toBe("false");
  });
});
