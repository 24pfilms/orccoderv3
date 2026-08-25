// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardCanvas } from "./BoardCanvas";
import type { BoardDocument } from "./repository";

const document: BoardDocument = {
  board: { boardId: "board", name: "Board", description: null, revision: 0, updatedAt: "0", deletedAt: null },
  backgroundColor: "#fff",
  dotDensity: 16,
  toolbarPosition: "bottom",
  panX: 0,
  panY: 0,
  zoom: 1,
  items: [{
    itemId: "note", boardId: "board", itemType: "sticky_note", x: 10, y: 20,
    width: 200, height: 100, zIndex: 1, rotation: 0, payload: {}, revision: 0,
    createdAt: "0", updatedAt: "0", deletedAt: null,
  }],
};

function canvasProps() {
  return {
    document,
    editable: true,
    externalRevision: 0,
    onViewportChange: vi.fn(),
    onCreateItem: vi.fn().mockResolvedValue("created"),
    onApplyMutations: vi.fn().mockResolvedValue(document),
    onPreviewItems: vi.fn(),
    onClearPreview: vi.fn(),
    onItemPayloadChange: vi.fn(),
    onImportAsset: vi.fn().mockResolvedValue(true),
    onExport: vi.fn(),
  };
}

describe("BoardCanvas", () => {
  it("selects an item and persists cursor-centered wheel zoom after settling", () => {
    vi.useFakeTimers();
    const props = canvasProps();
    render(<BoardCanvas {...props} />);
    const item = screen.getByRole("group", { name: "sticky note item" });
    fireEvent.pointerDown(item, { pointerId: 1 });
    expect(item.getAttribute("data-selected")).toBe("true");
    fireEvent.wheel(screen.getByLabelText("Board canvas"), { deltaY: -100, clientX: 0, clientY: 0 });
    act(() => vi.advanceTimersByTime(180));
    expect(props.onViewportChange).toHaveBeenCalledWith(0, 0, expect.any(Number));
    vi.useRealTimers();
  });

  it("arms a toolbar tool without creating until the canvas is clicked", async () => {
    const props = canvasProps();
    render(<BoardCanvas {...props} document={{ ...document, items: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Sticky note" }));
    expect(props.onCreateItem).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.pointerDown(screen.getByLabelText("Board canvas"), { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    });
    expect(props.onCreateItem).toHaveBeenCalledWith("sticky_note", { x: 100, y: 100 }, undefined);
  });
});
