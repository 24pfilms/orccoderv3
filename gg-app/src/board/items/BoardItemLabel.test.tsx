// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardItemView } from "./BoardItemView";
import type { BoardItem } from "../repository";

function shape(payload: Record<string, unknown>): BoardItem {
  return {
    itemId: "item", boardId: "board", itemType: "shape", x: 0, y: 0, width: 300,
    height: 80, zIndex: 0, rotation: 0, payload, revision: 0,
    createdAt: "0", updatedAt: "0", deletedAt: null,
  };
}

/**
 * Labels are HTML overlays rather than SVG <text>: the shape's viewBox is stretched with
 * preserveAspectRatio="none", which would squash the glyphs, and SVG text does not
 * inherit the app font.
 */
describe("shape labels", () => {
  const props = {
    editable: true,
    onPayloadChange: vi.fn(),
    onImportAsset: vi.fn(),
  };

  it("renders the label outside the SVG so it cannot be distorted", () => {
    const { container } = render(
      <BoardItemView item={shape({ shape: "rectangle", text: "Hello" })} {...props} />,
    );
    const label = container.querySelector(".board-shape-label");
    expect(label?.textContent).toBe("Hello");
    expect(container.querySelector("svg")?.textContent).toBe("");
  });

  it("escapes label text rather than treating it as markup", () => {
    render(<BoardItemView item={shape({ shape: "rectangle", text: "Safe <text>" })} {...props} />);
    expect(screen.getByText("Safe <text>")).toBeTruthy();
  });

  it("omits the overlay when there is no label", () => {
    const { container } = render(<BoardItemView item={shape({ shape: "ellipse" })} {...props} />);
    expect(container.querySelector(".board-shape-label")).toBeNull();
  });
});
