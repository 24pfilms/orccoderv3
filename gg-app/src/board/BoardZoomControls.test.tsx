// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BoardZoomControls } from "./BoardZoomControls";

it("offers explicit zoom, actual-size, and fit controls", () => {
  const actions = { onZoomIn: vi.fn(), onZoomOut: vi.fn(), onActualSize: vi.fn(), onFit: vi.fn() };
  render(<BoardZoomControls zoom={1.25} {...actions} />);
  expect(screen.getByLabelText("Board zoom level").textContent).toBe("125%");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  fireEvent.click(screen.getByRole("button", { name: "Actual size" }));
  fireEvent.click(screen.getByRole("button", { name: "Fit to content" }));
  Object.values(actions).forEach((action) => expect(action).toHaveBeenCalledOnce());
});
