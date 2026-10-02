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

/** The minimap ships collapsed, so open it before asserting on the projection. */
function expand() {
  fireEvent.click(screen.getByLabelText("Show minimap"));
}

describe("BoardMinimap", () => {
  it("hides on an empty board and projects content plus the real viewport", () => {
    const { rerender, container } = render(
      <BoardMinimap items={[]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Show minimap")).toBeNull();
    rerender(<BoardMinimap items={[item]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={vi.fn()} />);
    expand();
    expect(screen.getByLabelText("Board minimap")).toBeTruthy();
    expect(container.querySelector(".board-minimap-item")).toBeTruthy();
    expect(container.querySelector(".board-minimap-viewport")).toBeTruthy();
  });

  it("starts collapsed and toggles back", () => {
    render(<BoardMinimap items={[item]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={vi.fn()} />);
    expect(screen.queryByLabelText("Board minimap")).toBeNull();
    expand();
    expect(screen.getByLabelText("Board minimap")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Hide minimap"));
    expect(screen.queryByLabelText("Board minimap")).toBeNull();
  });

  it("recenters by keyboard activation", () => {
    const onRecenter = vi.fn();
    render(<BoardMinimap items={[item]} viewport={{ panX: 0, panY: 0, zoom: 1 }} canvasSize={{ width: 800, height: 600 }} onRecenter={onRecenter} />);
    expand();
    fireEvent.click(screen.getByLabelText("Board minimap"), { detail: 0 });
    expect(onRecenter).toHaveBeenCalledWith({ x: 200, y: 100 });
  });
});
