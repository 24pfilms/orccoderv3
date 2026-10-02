// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardMutation } from "../interactions/types";
import type { BoardDocument, BoardItem } from "../repository";
import {
  BoardClipboard,
  updateHistoryEntry,
  useBoardMutationHistory,
} from "./useBoardMutationHistory";

const baseItem: BoardItem = {
  itemId: "item",
  boardId: "board",
  itemType: "shape",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  zIndex: 0,
  rotation: 0,
  payload: { shape: "rectangle" },
  revision: 0,
  createdAt: "0",
  updatedAt: "0",
  deletedAt: null,
};

function board(item = baseItem): BoardDocument {
  return {
    board: { boardId: "board", name: "Board", description: null, revision: item.revision, updatedAt: "0", deletedAt: null },
    backgroundColor: "#fff",
    dotDensity: 16,
    toolbarPosition: "bottom",
    panX: 0,
    panY: 0,
    zoom: 1,
    items: [item],
  };
}

describe("useBoardMutationHistory", () => {
  it("undoes and redoes confirmed mutations using current item revisions", async () => {
    let current = board();
    const applyMutations = vi.fn(async (mutations: BoardMutation[]) => {
      const mutation = mutations[0];
      if (!mutation || mutation.kind !== "update") return null;
      const item = current.items[0];
      current = board({ ...item, ...mutation.patch, revision: item.revision + 1 });
      return current;
    });
    const moved = { ...baseItem, x: 40 };
    const entry = updateHistoryEntry("Move item", [baseItem], [moved]);
    const { result, rerender } = renderHook(
      ({ document, externalRevision }) =>
        useBoardMutationHistory({ document, externalRevision, applyMutations }),
      { initialProps: { document: current, externalRevision: 0 } },
    );

    await act(() => result.current.execute(entry));
    rerender({ document: current, externalRevision: 0 });
    expect(result.current.canUndo).toBe(true);
    await act(() => result.current.undo());
    expect(applyMutations.mock.calls[1]?.[0][0]).toMatchObject({ expectedItemRevision: 1, patch: { x: 0 } });
    rerender({ document: current, externalRevision: 0 });
    await act(() => result.current.redo());
    expect(applyMutations.mock.calls[2]?.[0][0]).toMatchObject({ expectedItemRevision: 2, patch: { x: 40 } });
  });

  it("clears stale history after an external revision", async () => {
    const applyMutations = vi.fn().mockResolvedValue(board({ ...baseItem, revision: 1 }));
    const { result, rerender } = renderHook(
      ({ externalRevision }) => useBoardMutationHistory({ document: board(), externalRevision, applyMutations }),
      { initialProps: { externalRevision: 0 } },
    );
    await act(() => result.current.execute(updateHistoryEntry("Move", [baseItem], [{ ...baseItem, x: 20 }])));
    expect(result.current.canUndo).toBe(true);
    rerender({ externalRevision: 1 });
    expect(result.current.canUndo).toBe(false);
  });

  it("copies a bounded internal item snapshot and offsets each paste", () => {
    const clipboard = new BoardClipboard();
    expect(clipboard.copy([baseItem])).toBe(true);
    const first = clipboard.paste()[0];
    const second = clipboard.paste()[0];
    expect(first).toMatchObject({ x: 20, y: 20 });
    expect(second).toMatchObject({ x: 40, y: 40 });
    expect(first?.itemId).not.toBe(baseItem.itemId);
  });
});
