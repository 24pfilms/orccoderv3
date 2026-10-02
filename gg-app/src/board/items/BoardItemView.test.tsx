// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardItem, BoardItemType } from "../repository";
import { BoardItemView } from "./BoardItemView";
import { defaultItemPayload } from "./itemPayload";

function item(itemType: BoardItemType, payload = defaultItemPayload(itemType)): BoardItem {
  return {
    itemId: itemType,
    boardId: "board",
    itemType,
    x: 0,
    y: 0,
    width: 200,
    height: 160,
    zIndex: 0,
    rotation: 0,
    payload,
    revision: 0,
    createdAt: "0",
    updatedAt: "0",
    deletedAt: null,
  };
}

describe("BoardItemView", () => {
  it("renders every supported item family with accessible controls", () => {
    const { rerender } = render(
      <BoardItemView
        item={item("sticky_note")}
        editable
        onPayloadChange={vi.fn()}
        onImportAsset={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Sticky note")).toBeTruthy();
    for (const type of ["text", "shape", "frame", "arrow", "image", "drawing"] as const) {
      rerender(
        <BoardItemView
          item={item(type)}
          editable
          onPayloadChange={vi.fn()}
          onImportAsset={vi.fn()}
        />,
      );
    }
    expect(screen.getByRole("img", { name: "Drawing" })).toBeTruthy();
  });

  it("renders hostile note content as text and persists edits", () => {
    const onPayloadChange = vi.fn();
    const { container } = render(
      <BoardItemView
        item={item("sticky_note", { text: "<img src=x onerror=alert(1)>", color: "#f6d365" })}
        editable
        editing
        onPayloadChange={onPayloadChange}
        onImportAsset={vi.fn()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    fireEvent.change(screen.getByLabelText("Sticky note"), { target: { value: "Saved note" } });
    expect(onPayloadChange).toHaveBeenCalledWith({ text: "Saved note", color: "#f6d365" });
  });

  it("renders persisted drawing points", () => {
    const { container } = render(
      <BoardItemView
        item={item("drawing", {
          color: "#f4f4f5",
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        })}
        editable
        onPayloadChange={vi.fn()}
        onImportAsset={vi.fn()}
      />,
    );
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("1,2 3,4");
  });

  it("uses only an authorized board-asset identifier for images", () => {
    const { rerender } = render(
      <BoardItemView
        item={item("image", { assetId: "asset-1", alt: "Diagram" })}
        editable
        onPayloadChange={vi.fn()}
        onImportAsset={vi.fn()}
      />,
    );
    expect(screen.getByRole("img", { name: "Diagram" }).getAttribute("src")).toBe(
      "board-asset://asset-1",
    );
    rerender(
      <BoardItemView
        item={item("image", { assetId: "../secret", alt: "" })}
        editable
        onPayloadChange={vi.fn()}
        onImportAsset={vi.fn()}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeTruthy();
  });

  it("allows an explicit fixture resolver without weakening the production asset resolver", () => {
    const resolveAssetUrl = vi.fn((assetId: string) =>
      assetId === "fixture-image" ? "/fixture-image.png" : null,
    );
    render(
      <BoardItemView
        item={item("image", { assetId: "fixture-image", alt: "Reference" })}
        editable
        onPayloadChange={vi.fn()}
        onImportAsset={vi.fn()}
        resolveAssetUrl={resolveAssetUrl}
      />,
    );
    expect(resolveAssetUrl).toHaveBeenCalledWith("fixture-image");
    expect(screen.getByRole("img", { name: "Reference" }).getAttribute("src")).toBe(
      "/fixture-image.png",
    );
  });
});
