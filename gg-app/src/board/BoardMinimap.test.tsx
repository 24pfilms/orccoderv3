// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardItem } from "./repository";
import { BoardMinimap } from "./BoardMinimap";

const item: BoardItem = {
  itemId: "item", boardId: "board", itemType: "shape", x: 100, y: 50, width: 200,
  height: 100, zIndex: 0, rotation: 0, payload: {}, revision: 0,
  createdAt: "0", updatedAt: "0", deletedAt: null,
};

describe("BoardMinimap", () => {
  it("hides on an empty board and projects content plus the real viewport", () => {
    const { rerender, container } = render(
      <BoardMinimap items={[]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Board minimap")).toBeNull();
    rerender(<BoardMinimap items={[item]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={vi.fn()} />);
    expect(screen.getByLabelText("Board minimap")).toBeTruthy();
    expect(container.querySelector(".board-minimap-item")).toBeTruthy();
    expect(container.querySelector(".board-minimap-viewport")).toBeTruthy();
  });

  it("recenters by keyboard activation", () => {
    const onRecenter = vi.fn();
    render(<BoardMinimap items={[item]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={onRecenter} />);
    fireEvent.click(screen.getByLabelText("Board minimap"), { detail: 0 });
    expect(onRecenter).toHaveBeenCalledWith({ x: 200, y: 100 });
  });
});
