// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardItem } from "./repository";
import { BoardSelectionChrome } from "./BoardSelectionChrome";

const selected: BoardItem = {
  itemId: "item", boardId: "board", itemType: "text", x: 0, y: 0, width: 100,
  height: 50, zIndex: 0, rotation: 0, payload: { color: "#ffffff", fontSize: 16 },
  revision: 0, createdAt: "0", updatedAt: "0", deletedAt: null,
};

describe("BoardSelectionChrome", () => {
  it("keeps its contextual controls inside the viewport and exposes every manipulation", () => {
    const onDelete = vi.fn();
    const { container } = render(
      <BoardSelectionChrome
        bounds={{ x: -100, y: -100, width: 100, height: 50 }}
        viewport={{ panX: 0, panY: 0, zoom: 1 }}
        canvasSize={{ width: 400, height: 300 }}
        selectedItems={[selected]}
        editable
        onResizeStart={vi.fn()}
        onRotateStart={vi.fn()}
        onColorChange={vi.fn()}
        onFontSizeChange={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={onDelete}
      />,
    );
    expect((container.querySelector(".board-context-toolbar") as HTMLElement).style.left).toBe("8px");
    expect(screen.getByRole("button", { name: "Rotate selection" })).toBeTruthy();
    expect(container.querySelectorAll(".board-resize-handle")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Delete selection" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
