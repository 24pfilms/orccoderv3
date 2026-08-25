// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardContextMenu } from "./BoardContextMenu";
import type { BoardItem } from "./repository";

function item(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    itemId: "item-1",
    boardId: "board-1",
    itemType: "sticky_note",
    x: 0,
    y: 0,
    width: 200,
    height: 160,
    zIndex: 0,
    rotation: 0,
    payload: {},
    revision: 0,
    createdAt: "0",
    updatedAt: "0",
    deletedAt: null,
    ...overrides,
  };
}

function renderMenu(overrides: Partial<Parameters<typeof BoardContextMenu>[0]> = {}) {
  const props = {
    x: 40,
    y: 40,
    selectedItems: [item()],
    onClose: vi.fn(),
    onBringToFront: vi.fn(),
    onSendToBack: vi.fn(),
    onDuplicate: vi.fn(),
    onAddVote: vi.fn(),
    onDelete: vi.fn(),
    onMaximizeImage: vi.fn(),
    onMinimizeImage: vi.fn(),
    ...overrides,
  };
  render(<BoardContextMenu {...props} />);
  return props;
}

describe("BoardContextMenu", () => {
  it("runs an action and closes", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Bring to front" }));
    expect(props.onBringToFront).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("offers Add vote only when a sticky note is selected", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: "Add vote" })).toBeTruthy();
  });

  it("hides note and image actions for a plain shape", () => {
    renderMenu({ selectedItems: [item({ itemType: "shape" })] });
    expect(screen.queryByRole("menuitem", { name: "Add vote" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Maximize" })).toBeNull();
  });

  it("offers image actions for a single image, and download only when wired", () => {
    renderMenu({ selectedItems: [item({ itemType: "image" })] });
    expect(screen.getByRole("menuitem", { name: "Maximize" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Download image" })).toBeNull();
  });

  it("closes on Escape", () => {
    const props = renderMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
