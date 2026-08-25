// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BoardZoomControls } from "./BoardZoomControls";

it("offers explicit zoom, actual-size, and fit controls", () => {
  const actions = { onZoomIn: vi.fn(), onZoomOut: vi.fn(), onActualSize: vi.fn(), onFit: vi.fn() };
  render(
    <BoardZoomControls zoom={1.25} fullscreen={false} onToggleFullscreen={vi.fn()} {...actions} />,
  );
  expect(screen.getByLabelText("Board zoom level").textContent).toBe("125%");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  fireEvent.click(screen.getByRole("button", { name: "Actual size" }));
  fireEvent.click(screen.getByRole("button", { name: "Fit to content" }));
  Object.values(actions).forEach((action) => expect(action).toHaveBeenCalledOnce());
});

it("toggles full screen and reflects the current state", () => {
  const onToggleFullscreen = vi.fn();
  const actions = { onZoomIn: vi.fn(), onZoomOut: vi.fn(), onActualSize: vi.fn(), onFit: vi.fn() };
  const { rerender } = render(
    <BoardZoomControls
      zoom={1}
      fullscreen={false}
      onToggleFullscreen={onToggleFullscreen}
      {...actions}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
  expect(onToggleFullscreen).toHaveBeenCalledOnce();

  // While full screen the control offers the way back out, not the way in.
  rerender(
    <BoardZoomControls
      zoom={1}
      fullscreen
      onToggleFullscreen={onToggleFullscreen}
      {...actions}
    />,
  );
  expect(screen.getByRole("button", { name: "Exit full screen" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
});
