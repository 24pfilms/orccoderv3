import { useCallback, useMemo, useRef, useState } from "react";
import { handleBoardKeyDown } from "../interactions/boardKeyboard";
import {
  boundsForItems,
  itemBounds,
  itemsWithFrameDescendants,
  normalizeBounds,
  reconcileFrameMembership,
  resizeBounds,
  rotationDegrees,
  scaleItems,
  screenToWorld,
} from "../interactions/geometry";
import type {
  BoardBounds,
  BoardGesture,
  BoardMutation,
  BoardPoint,
  BoardTool,
  BoardViewport,
  ResizeHandle,
} from "../interactions/types";
import { readItemPayload } from "../items/itemPayload";
import type { BoardDocument, BoardItem, BoardItemType } from "../repository";
import {
  BoardClipboard,
  deleteHistoryEntry,
  updateHistoryEntry,
  useBoardMutationHistory,
} from "./useBoardMutationHistory";

// Movement (in screen pixels) before a press on an item becomes a drag and takes the
// pointer. Below this the press stays a click, so double-click-to-edit still works.
const DRAG_CAPTURE_THRESHOLD_PX = 3;

// Interactive chrome that lives inside the canvas element and owns its own input.
// A canvas gesture must never start from a press on any of it.
const BOARD_CHROME_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  ".board-toolbar",
  ".board-zoom-controls",
  ".board-minimap",
  ".board-context-toolbar",
  ".board-selection-box",
  ".board-resize-handle",
  ".board-rotate-handle",
  ".board-rotate-stem",
].join(", ");

interface BoardInteractionOptions {
  document: BoardDocument;
  editable: boolean;
  externalRevision: number;
  viewport: BoardViewport;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  setViewport: (viewport: BoardViewport, settle?: boolean) => void;
  commitViewport: (viewport?: BoardViewport) => void;
  createItem: (
    itemType: BoardItemType,
    at?: BoardPoint,
    shape?: Extract<BoardTool, { kind: "place" }>["shape"],
  ) => Promise<string | null>;
  applyMutations: (mutations: BoardMutation[]) => Promise<BoardDocument | null>;
  previewItems: (items: BoardItem[]) => void;
  clearPreview: () => void;
  importItemAsset: (itemId: string, role: "image" | "drawing") => Promise<boolean>;
}

function localPoint(event: { clientX: number; clientY: number }, element: HTMLElement): BoardPoint {
  const bounds = element.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function activeItems(document: BoardDocument): BoardItem[] {
  return document.items.filter((item) => !item.deletedAt);
}

function createTemplates(items: BoardItem[]) {
  return items.map((item) => ({
    kind: "create" as const,
    itemId: item.itemId,
    item: {
      itemType: item.itemType,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      zIndex: item.zIndex,
      rotation: item.rotation,
      payload: item.payload,
    },
  }));
}

export function useBoardInteraction({
  document,
  editable,
  externalRevision,
  viewport,
  canvasRef,
  setViewport,
  commitViewport,
  createItem,
  applyMutations,
  previewItems,
  clearPreview,
  importItemAsset,
}: BoardInteractionOptions) {
  const [tool, setTool] = useState<BoardTool>({ kind: "select" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [gesture, setGestureState] = useState<BoardGesture>({ kind: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; world: BoardPoint } | null
  >(null);
  const gestureRef = useRef<BoardGesture>(gesture);
  const spacePressed = useRef(false);
  const clipboard = useRef(new BoardClipboard());
  const history = useBoardMutationHistory({ document, externalRevision, applyMutations });
  const items = useMemo(() => activeItems(document), [document]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.itemId)),
    [items, selectedIds],
  );
  const selectionBounds = selectedItems.length ? boundsForItems(selectedItems) : null;

  const setGesture = useCallback((next: BoardGesture) => {
    gestureRef.current = next;
    setGestureState(next);
  }, []);

  const recordCreation = useCallback(
    (itemIds: string[], label: string) => {
      history.record({
        label,
        forward: itemIds.map((itemId) => ({ kind: "restore", itemId })),
        reverse: itemIds.map((itemId) => ({ kind: "softDelete", itemId })),
      });
    },
    [history],
  );

  const placeItem = useCallback(
    async (at: BoardPoint, placement: Extract<BoardTool, { kind: "place" }>) => {
      const itemId = await createItem(placement.itemType, at, placement.shape);
      setTool({ kind: "select" });
      if (!itemId) return;
      setSelectedIds([itemId]);
      recordCreation([itemId], `Create ${placement.itemType.replace("_", " ")}`);
      if (placement.itemType === "image" && !(await importItemAsset(itemId, "image"))) {
        await history.execute({
          label: "Cancel image",
          forward: [{ kind: "softDelete", itemId }],
          reverse: [{ kind: "restore", itemId }],
        });
        setSelectedIds([]);
      }
    },
    [createItem, history, importItemAsset, recordCreation],
  );

  const updateSelection = useCallback(
    async (label: string, update: (item: BoardItem) => BoardItem) => {
      if (!editable || selectedItems.length === 0) return;
      await history.execute(updateHistoryEntry(label, selectedItems, selectedItems.map(update)));
    },
    [editable, history, selectedItems],
  );

  const changeColor = useCallback(
    (color: string) => void updateSelection("Change color", (item) => {
      const payload = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : {};
      if (item.itemType !== "shape") return { ...item, payload: { ...payload, color } };
      // Drop any stored rim so it re-derives from the new fill; otherwise a recoloured
      // shape keeps the outline of the colour it used to be.
      const { stroke: _previousRim, ...rest } = payload;
      return { ...item, payload: { ...rest, fill: color } };
    }),
    [updateSelection],
  );

  const changeFontSize = useCallback(
    (fontSize: number) => void updateSelection("Change font size", (item) => ({
      ...item,
      payload: { ...(item.payload as object), fontSize },
    })),
    [updateSelection],
  );

  const addVote = useCallback(
    () => void updateSelection("Add vote", (item) => {
      const payload = item.payload && typeof item.payload === "object"
        ? (item.payload as Record<string, unknown>)
        : {};
      const votes = typeof payload.votes === "number" ? payload.votes : 0;
      return { ...item, payload: { ...payload, votes: votes + 1 } };
    }),
    [updateSelection],
  );

  // Maximize fits the image inside the visible canvas (keeping aspect ratio) and stores
  // where it came from; minimize restores that. Mirrors Mero's originalSize/originalPosition.
  const maximizeImage = useCallback(
    (itemId: string) => {
      const canvas = canvasRef.current;
      const item = items.find((candidate) => candidate.itemId === itemId);
      if (!canvas || !item || !item.height) return;
      const bounds = canvas.getBoundingClientRect();
      const margin = 50;
      const maxWidth = (bounds.width - margin * 2) / viewport.zoom;
      const maxHeight = (bounds.height - margin * 2) / viewport.zoom;
      if (maxWidth <= 0 || maxHeight <= 0) return;
      const aspect = item.width / item.height;
      let width = maxWidth;
      let height = maxWidth / aspect;
      if (height > maxHeight) {
        height = maxHeight;
        width = maxHeight * aspect;
      }
      const centre = screenToWorld({ x: bounds.width / 2, y: bounds.height / 2 }, viewport);
      const payload = readItemPayload(item.payload);
      void history.execute(
        updateHistoryEntry("Maximize image", [item], [
          {
            ...item,
            x: centre.x - width / 2,
            y: centre.y - height / 2,
            width,
            height,
            payload: {
              ...payload,
              restoreBounds: { x: item.x, y: item.y, width: item.width, height: item.height },
            },
          },
        ]),
      );
    },
    [canvasRef, history, items, viewport],
  );

  const minimizeImage = useCallback(
    (itemId: string) => {
      const item = items.find((candidate) => candidate.itemId === itemId);
      const payload = item ? readItemPayload(item.payload) : null;
      const restore = payload?.restoreBounds;
      if (!item || !restore) return;
      const { restoreBounds: _discarded, ...rest } = payload;
      void history.execute(
        updateHistoryEntry("Minimize image", [item], [
          { ...item, x: restore.x, y: restore.y, width: restore.width, height: restore.height, payload: rest },
        ]),
      );
    },
    [history, items],
  );

  const moveLayer = useCallback(
    (front: boolean) => {
      const edge = front
        ? Math.max(-1, ...items.map((item) => item.zIndex)) + 1
        : Math.min(1, ...items.map((item) => item.zIndex)) - selectedItems.length;
      void updateSelection(front ? "Bring to front" : "Send to back", (item) => ({
        ...item,
        zIndex: edge + selectedItems.indexOf(item),
      }));
    },
    [items, selectedItems, updateSelection],
  );

  const deleteSelection = useCallback(async () => {
    if (!editable || selectedItems.length === 0) return;
    if (await history.execute(deleteHistoryEntry(selectedItems))) setSelectedIds([]);
  }, [editable, history, selectedItems]);

  const duplicateSelection = useCallback(async () => {
    if (!editable || selectedItems.length === 0) return;
    const duplicates = selectedItems.map((item) => ({
      ...structuredClone(item),
      itemId: crypto.randomUUID(),
      x: item.x + 20,
      y: item.y + 20,
      zIndex: item.zIndex + selectedItems.length,
      revision: 0,
      deletedAt: null,
    }));
    if (!(await applyMutations(createTemplates(duplicates)))) return;
    recordCreation(
      duplicates.map((item) => item.itemId),
      selectedItems.length === 1 ? "Duplicate item" : `Duplicate ${selectedItems.length} items`,
    );
    setSelectedIds(duplicates.map((item) => item.itemId));
  }, [applyMutations, editable, recordCreation, selectedItems]);

  const paste = useCallback(async () => {
    if (!editable) return;
    if (!clipboard.current.hasItems) {
      try {
        const text = (await navigator.clipboard.readText()).slice(0, 100_000);
        if (text) {
          const rect = canvasRef.current?.getBoundingClientRect();
          const center = screenToWorld(
            { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 },
            viewport,
          );
          const itemId = crypto.randomUUID();
          const width = 200;
          const height = 160;
          if (
            await applyMutations([
              {
                kind: "create",
                itemId,
                item: {
                  itemType: "text",
                  x: center.x - width / 2,
                  y: center.y - height / 2,
                  width,
                  height,
                  zIndex: Math.max(-1, ...items.map((item) => item.zIndex)) + 1,
                  rotation: 0,
                  payload: { text, color: "#e5e7eb", fontFamily: "sans", fontSize: 24 },
                },
              },
            ])
          ) {
            recordCreation([itemId], "Paste text");
            setSelectedIds([itemId]);
          }
        }
      } catch {
        // Clipboard permission denial leaves the board unchanged.
      }
      return;
    }
    const pasted = clipboard.current.paste();
    if (!(await applyMutations(createTemplates(pasted)))) return;
    recordCreation(pasted.map((item) => item.itemId), "Paste items");
    setSelectedIds(pasted.map((item) => item.itemId));
  }, [applyMutations, canvasRef, editable, items, recordCreation, viewport]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.code === "Space") spacePressed.current = true;
      handleBoardKeyDown(event.nativeEvent, {
        undo: () => void history.undo(),
        redo: () => void history.redo(),
        duplicate: () => void duplicateSelection(),
        copy: () => void clipboard.current.copy(selectedItems),
        paste: () => void paste(),
        deleteSelection: () => void deleteSelection(),
        escape: () => {
          setTool({ kind: "select" });
          setEditingId(null);
          setGesture({ kind: "idle" });
          clearPreview();
        },
      });
    },
    [clearPreview, deleteSelection, duplicateSelection, history, paste, selectedItems, setGesture],
  );

  const onKeyUp = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.code === "Space") spacePressed.current = false;
  }, []);

  const onCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // The toolbar, zoom cluster, minimap, and selection handles render INSIDE the
      // canvas element. Without this guard a press on them still starts a canvas
      // gesture and captures the pointer, so the release retargets to the canvas and
      // no `click` is ever dispatched on the control the user actually pressed.
      if (event.target instanceof Element && event.target.closest(BOARD_CHROME_SELECTOR)) return;
      const screen = localPoint(event, canvas);
      if (event.button === 1 || spacePressed.current) {
        event.preventDefault();
        canvas.setPointerCapture?.(event.pointerId);
        setGesture({ kind: "pan", pointerId: event.pointerId, start: screen, viewport });
        return;
      }
      if (
        event.button !== 0 ||
        (event.target instanceof Element && event.target.closest("[data-board-item]"))
      )
        return;
      const world = screenToWorld(screen, viewport);
      if (tool.kind === "place") {
        void placeItem(world, tool);
        return;
      }
      if (tool.kind === "pen" && editable) {
        canvas.setPointerCapture?.(event.pointerId);
        setGesture({ kind: "draw", pointerId: event.pointerId, points: [world] });
        return;
      }
      setSelectedIds([]);
      // Leave editing (a note's text cursor, a video's active player) when the canvas
      // itself is pressed, otherwise the board stays stuck in that mode.
      setEditingId(null);
      if (tool.kind === "select") {
        canvas.setPointerCapture?.(event.pointerId);
        setGesture({ kind: "marquee", pointerId: event.pointerId, start: world, current: world });
      }
    },
    [canvasRef, editable, placeItem, setGesture, tool, viewport],
  );

  // Right-click selects what is under the pointer (unless it is already part of the
  // selection) and opens the menu there, matching Mero's `selectItemOnly` behaviour.
  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!editable) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(BOARD_CHROME_SELECTOR)) return;
      const itemId = target?.closest("[data-board-item]")?.getAttribute("data-board-item");
      if (itemId && !selectedIds.includes(itemId)) setSelectedIds([itemId]);
      // An empty-canvas right-click keeps its own menu (add video, generate image), so it
      // clears the selection rather than showing actions for items you did not click.
      if (!itemId) setSelectedIds([]);
      const canvas = canvasRef.current;
      const world = canvas
        ? screenToWorld(localPoint(event, canvas), viewport)
        : { x: 0, y: 0 };
      setContextMenu({ x: event.clientX, y: event.clientY, world });
    },
    [canvasRef, editable, selectedIds, viewport],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const onItemPointerDown = useCallback(
    (event: React.PointerEvent, itemId: string) => {
      if (tool.kind !== "select") return;
      // A press on the item being edited belongs to that editor (text cursor, player
      // controls). A press on any OTHER item leaves editing and proceeds — bailing out
      // whenever anything was being edited made the whole board unmovable.
      if (editingId === itemId) return;
      if (editingId) setEditingId(null);
      event.stopPropagation();
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      const nextIds = additive
        ? selectedIds.includes(itemId)
          ? selectedIds.filter((id) => id !== itemId)
          : [...selectedIds, itemId]
        : selectedIds.includes(itemId)
          ? selectedIds
          : [itemId];
      setSelectedIds(nextIds);
      if (!editable || additive) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Capture is deferred to the first real movement (see onPointerMove). Capturing on
      // press retargets the release to the canvas, which suppresses click and dblclick on
      // the item itself and made double-click-to-edit impossible.
      setGesture({
        kind: "drag",
        pointerId: event.pointerId,
        start: screenToWorld(localPoint(event, canvas), viewport),
        items: itemsWithFrameDescendants(items, nextIds),
      });
    },
    [canvasRef, editable, editingId, items, selectedIds, setGesture, tool.kind, viewport],
  );

  const startResize = useCallback(
    (event: React.PointerEvent, handle: ResizeHandle) => {
      if (!selectionBounds || !editable) return;
      event.stopPropagation();
      canvasRef.current?.setPointerCapture?.(event.pointerId);
      setGesture({
        kind: "resize",
        pointerId: event.pointerId,
        start: screenToWorld(localPoint(event, canvasRef.current!), viewport),
        handle,
        bounds: selectionBounds,
        items: selectedItems,
      });
    },
    [canvasRef, editable, selectedItems, selectionBounds, setGesture, viewport],
  );

  const startRotate = useCallback(
    (event: React.PointerEvent) => {
      if (!selectionBounds || !editable) return;
      event.stopPropagation();
      const center = {
        x: selectionBounds.x + selectionBounds.width / 2,
        y: selectionBounds.y + selectionBounds.height / 2,
      };
      const point = screenToWorld(localPoint(event, canvasRef.current!), viewport);
      canvasRef.current?.setPointerCapture?.(event.pointerId);
      setGesture({
        kind: "rotate",
        pointerId: event.pointerId,
        center,
        startAngle: rotationDegrees(center, point),
        items: selectedItems,
      });
    },
    [canvasRef, editable, selectedItems, selectionBounds, setGesture, viewport],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gestureRef.current;
      const canvas = canvasRef.current;
      if (current.kind === "idle" || !canvas || current.pointerId !== event.pointerId) return;
      const screen = localPoint(event, canvas);
      if (current.kind === "pan") {
        setViewport(
          {
            ...current.viewport,
            panX: current.viewport.panX + screen.x - current.start.x,
            panY: current.viewport.panY + screen.y - current.start.y,
          },
          false,
        );
        return;
      }
      const world = screenToWorld(screen, viewport);
      if (current.kind === "marquee") {
        setGesture({ ...current, current: world });
        const bounds = normalizeBounds(current.start, world);
        setSelectedIds(items.filter((item) => itemBounds(item) && intersectsBounds(bounds, itemBounds(item))).map((item) => item.itemId));
      } else if (current.kind === "drag") {
        const dx = world.x - current.start.x;
        const dy = world.y - current.start.y;
        // Take the pointer only once this is genuinely a drag, so a plain press keeps its
        // click/dblclick on the item (double-click-to-edit).
        if (
          !canvas.hasPointerCapture?.(event.pointerId) &&
          Math.hypot(dx, dy) * viewport.zoom > DRAG_CAPTURE_THRESHOLD_PX
        ) {
          canvas.setPointerCapture?.(event.pointerId);
        }
        const moving = new Map(current.items.map((item) => [item.itemId, { ...item, x: item.x + dx, y: item.y + dy }]));
        previewItems(document.items.map((item) => moving.get(item.itemId) ?? item));
      } else if (current.kind === "resize") {
        const nextBounds = resizeBounds(current.bounds, current.handle, world, event.shiftKey);
        const resized = new Map(scaleItems(current.items, current.bounds, nextBounds).map((item) => [item.itemId, item]));
        previewItems(document.items.map((item) => resized.get(item.itemId) ?? item));
      } else if (current.kind === "rotate") {
        const delta = rotationDegrees(current.center, world) - current.startAngle;
        const radians = (delta * Math.PI) / 180;
        const rotated = new Map(current.items.map((item) => {
          const centerX = item.x + item.width / 2;
          const centerY = item.y + item.height / 2;
          const dx = centerX - current.center.x;
          const dy = centerY - current.center.y;
          const nextCenterX = current.center.x + dx * Math.cos(radians) - dy * Math.sin(radians);
          const nextCenterY = current.center.y + dx * Math.sin(radians) + dy * Math.cos(radians);
          return [item.itemId, { ...item, x: nextCenterX - item.width / 2, y: nextCenterY - item.height / 2, rotation: item.rotation + delta }];
        }));
        previewItems(document.items.map((item) => rotated.get(item.itemId) ?? item));
      } else if (current.kind === "draw") {
        const last = current.points[current.points.length - 1];
        if (!last || Math.hypot(world.x - last.x, world.y - last.y) >= 2 / viewport.zoom) {
          setGesture({ ...current, points: [...current.points, world].slice(-10_000) });
        }
      }
    },
    [canvasRef, document.items, items, previewItems, setGesture, setViewport, viewport],
  );

  const onPointerUp = useCallback(
    async (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gestureRef.current;
      if (current.kind === "idle" || current.pointerId !== event.pointerId) return;
      if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) canvasRef.current.releasePointerCapture?.(event.pointerId);
      setGesture({ kind: "idle" });
      if (current.kind === "pan") {
        commitViewport();
        return;
      }
      if (current.kind === "drag" || current.kind === "resize" || current.kind === "rotate") {
        let after = document.items.filter((item) => current.items.some((original) => original.itemId === item.itemId));
        let before = current.items;
        if (current.kind === "drag") {
          const membership = reconcileFrameMembership(current.items.concat(items.filter((item) => item.itemType === "frame")), document.items, current.items.map((item) => item.itemId));
          const changedFrames = new Map(membership.afterFrames.map((item) => [item.itemId, item]));
          if (changedFrames.size > 0) {
            previewItems(document.items.map((item) => changedFrames.get(item.itemId) ?? item));
            before = uniqueItems([...before, ...membership.beforeFrames]);
            after = uniqueItems([...after, ...membership.afterFrames]);
          }
        }
        await history.execute(updateHistoryEntry(
          current.kind === "drag" ? "Move items" : current.kind === "resize" ? "Resize items" : "Rotate items",
          before,
          after,
        ));
        return;
      }
      if (current.kind === "draw" && current.points.length > 1) {
        const bounds = normalizeBounds(
          { x: Math.min(...current.points.map((point) => point.x)), y: Math.min(...current.points.map((point) => point.y)) },
          { x: Math.max(...current.points.map((point) => point.x)), y: Math.max(...current.points.map((point) => point.y)) },
        );
        const itemId = crypto.randomUUID();
        const mutation: BoardMutation = {
          kind: "create",
          itemId,
          item: {
            itemType: "drawing",
            x: bounds.x,
            y: bounds.y,
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
            zIndex: Math.max(-1, ...items.map((item) => item.zIndex)) + 1,
            rotation: 0,
            payload: {
              color: tool.kind === "pen" ? tool.color : "#e5e7eb",
              strokeWidth: 3,
              points: current.points.map((point) => ({ x: point.x - bounds.x, y: point.y - bounds.y })),
            },
          },
        };
        if (await applyMutations([mutation])) {
          recordCreation([itemId], "Draw stroke");
          setSelectedIds([itemId]);
        }
      }
    },
    [applyMutations, canvasRef, commitViewport, document.items, history, items, previewItems, recordCreation, setGesture, tool],
  );

  const marquee = gesture.kind === "marquee" ? normalizeBounds(gesture.start, gesture.current) : null;
  const drawingPoints = gesture.kind === "draw" ? gesture.points : null;

  return {
    tool,
    setTool,
    selectedIds,
    setSelectedIds,
    selectedItems,
    selectionBounds,
    marquee,
    drawingPoints,
    editingId,
    setEditingId,
    history,
    onKeyDown,
    onKeyUp,
    resetSpace: () => {
      spacePressed.current = false;
    },
    contextMenu,
    onContextMenu,
    closeContextMenu,
    addVote,
    maximizeImage,
    minimizeImage,
    onCanvasPointerDown,
    onItemPointerDown,
    onPointerMove,
    onPointerUp,
    startResize,
    startRotate,
    deleteSelection,
    duplicateSelection,
    changeColor,
    changeFontSize,
    bringToFront: () => moveLayer(true),
    sendToBack: () => moveLayer(false),
  };
}

function uniqueItems(items: BoardItem[]): BoardItem[] {
  return [...new Map(items.map((item) => [item.itemId, item])).values()];
}

function intersectsBounds(a: BoardBounds, b: BoardBounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
