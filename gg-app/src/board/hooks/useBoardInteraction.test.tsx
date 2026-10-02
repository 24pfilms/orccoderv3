// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { BoardMutation } from "../interactions/types";
import type { BoardDocument, BoardItem } from "../repository";
import { useBoardInteraction } from "./useBoardInteraction";

const item: BoardItem = {
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

function board(items: BoardItem[] = [item]): BoardDocument {
  return {
    board: { boardId: "board", name: "Board", description: null, revision: 0, updatedAt: "0", deletedAt: null },
    backgroundColor: "#fff",
    dotDensity: 16,
    toolbarPosition: "bottom",
    panX: 0,
    panY: 0,
    zoom: 1,
    items,
  };
}

function pointer(
  target: HTMLDivElement,
  overrides: Partial<React.PointerEvent<HTMLDivElement>> = {},
): React.PointerEvent<HTMLDivElement> {
  return {
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    target,
    currentTarget: target,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

function setup(initial = board()) {
  const canvas = document.createElement("div");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);
  let current = initial;
  const applyMutations = vi.fn(async (mutations: BoardMutation[]) => {
    const mutation = mutations[0];
    if (mutation?.kind === "update") {
      const changed = { ...current.items[0], ...mutation.patch, revision: current.items[0].revision + 1 };
      current = { ...current, board: { ...current.board, revision: current.board.revision + 1 }, items: [changed] };
    }
    return current;
  });
  const previewItems = vi.fn((items: BoardItem[]) => {
    current = { ...current, items };
  });
  const options = () => ({
    document: current,
    editable: true,
    externalRevision: 0,
    viewport: { panX: 100, panY: 50, zoom: 2 },
    canvasRef: { current: canvas },
    setViewport: vi.fn(),
    commitViewport: vi.fn(),
    createItem: vi.fn().mockResolvedValue("created"),
    applyMutations,
    previewItems,
    clearPreview: vi.fn(),
    importItemAsset: vi.fn().mockResolvedValue(true),
  });
  return { canvas, options, get current() { return current; }, applyMutations, previewItems };
}

describe("useBoardInteraction", () => {
  it("arms placement and creates at the clicked world coordinate", async () => {
    const setupResult = setup(board([]));
    const initialOptions = setupResult.options();
    const { result } = renderHook(() => useBoardInteraction(initialOptions));
    act(() => result.current.setTool({ kind: "place", itemType: "sticky_note" }));
    expect(initialOptions.createItem).not.toHaveBeenCalled();
    await act(async () => {
      result.current.onCanvasPointerDown(pointer(setupResult.canvas, { clientX: 300, clientY: 250 }));
    });
    expect(initialOptions.createItem).toHaveBeenCalledWith("sticky_note", { x: 100, y: 100 }, undefined);
    expect(result.current.tool).toEqual({ kind: "select" });
  });

  it("pastes plain clipboard text in one create mutation", async () => {
    const setupResult = setup(board([]));
    const initialOptions = setupResult.options();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue("Clipboard text") },
    });
    const { result } = renderHook(() => useBoardInteraction(initialOptions));
    await act(async () => {
      result.current.onKeyDown({
        nativeEvent: new KeyboardEvent("keydown", { key: "v", ctrlKey: true }),
      } as React.KeyboardEvent<HTMLDivElement>);
    });
    expect(initialOptions.createItem).not.toHaveBeenCalled();
    expect(setupResult.applyMutations).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: "create",
        item: expect.objectContaining({ payload: expect.objectContaining({ text: "Clipboard text" }) }),
      }),
    ]);
  });

  it("moves nested frame descendants exactly once", () => {
    const frame = { ...item, itemId: "frame", itemType: "frame" as const, width: 300, height: 300, payload: { title: "Frame", childIds: ["item"] } };
    const setupResult = setup(board([frame, item]));
    const { result } = renderHook(() => useBoardInteraction(setupResult.options()));
    act(() => result.current.onItemPointerDown(pointer(setupResult.canvas), "frame"));
    act(() => result.current.onPointerMove(pointer(setupResult.canvas, { clientX: 40, clientY: 20 })));
    expect(setupResult.current.items).toEqual([
      expect.objectContaining({ itemId: "frame", x: 20, y: 10 }),
      expect.objectContaining({ itemId: "item", x: 20, y: 10 }),
    ]);
  });

  it("previews a selected drag and commits one mutation on pointer-up", async () => {
    const setupResult = setup();
    const { result, rerender } = renderHook(({ options }) => useBoardInteraction(options), {
      initialProps: { options: setupResult.options() },
    });
    act(() => result.current.onItemPointerDown(pointer(setupResult.canvas), "item"));
    act(() => result.current.onPointerMove(pointer(setupResult.canvas, { clientX: 40, clientY: 20 })));
    expect(setupResult.previewItems).toHaveBeenCalledOnce();
    expect(setupResult.current.items[0]).toMatchObject({ x: 20, y: 10 });
    rerender({ options: setupResult.options() });
    await act(() => result.current.onPointerUp(pointer(setupResult.canvas, { clientX: 40, clientY: 20 })));
    expect(setupResult.applyMutations).toHaveBeenCalledOnce();
    expect(setupResult.applyMutations.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ kind: "update", itemId: "item", patch: expect.objectContaining({ x: 20, y: 10 }) }),
    ]);
  });
});
