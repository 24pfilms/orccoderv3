// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZoomController } from "./ZoomController";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.windowSurface;
  document.documentElement.style.removeProperty("zoom");
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.windowSurface;
});

describe("ZoomController Board Mode shortcut scoping", () => {
  it("leaves canvas zoom shortcuts to Board Mode", () => {
    document.documentElement.dataset.windowSurface = "board";
    render(<ZoomController />);

    fireEvent.keyDown(window, { key: "+", ctrlKey: true });

    expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1");
    expect(screen.queryByText("105%")).toBeNull();
  });

  it("keeps app zoom shortcuts in Workspace", () => {
    render(<ZoomController />);

    fireEvent.keyDown(window, { key: "+", ctrlKey: true });

    expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1.05");
    expect(screen.getByText("105%")).toBeDefined();
  });
});
