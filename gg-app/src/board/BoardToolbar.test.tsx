// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BoardToolbar } from "./BoardToolbar";

it("arms every item tool, exposes shape choices, and remains keyboard accessible", () => {
  const onToolChange = vi.fn();
  render(
    <BoardToolbar
      tool={{ kind: "select" }}
      position="bottom"
      disabled={false}
      canUndo
      canRedo={false}
      onToolChange={onToolChange}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
    />,
  );
  for (const label of ["Select", "Sticky note", "Text", "Shapes", "Frame", "Arrow", "Image", "Pen"]) {
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("button", { name: "Sticky note" }));
  expect(onToolChange).toHaveBeenCalledWith({ kind: "place", itemType: "sticky_note" });
  fireEvent.click(screen.getByRole("button", { name: "Shapes" }));
  expect(screen.getByRole("menu", { name: "Shape type" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Double arrow" }));
  expect(onToolChange).toHaveBeenCalledWith({ kind: "place", itemType: "shape", shape: "double_arrow" });
  expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
});
