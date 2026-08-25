import { readItemPayload } from "../items/itemPayload";
import type { BoardItem } from "../repository";
import type {
  BoardBounds,
  BoardPoint,
  BoardViewport,
  ResizeHandle,
} from "./types";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const EMPTY_BOARD_BOUNDS: BoardBounds = { x: 0, y: 0, width: 1, height: 1 };

export function screenToWorld(point: BoardPoint, viewport: BoardViewport): BoardPoint {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(point: BoardPoint, viewport: BoardViewport): BoardPoint {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

export function normalizeBounds(start: BoardPoint, end: BoardPoint): BoardBounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function itemBounds(item: Pick<BoardItem, "x" | "y" | "width" | "height" | "rotation">): BoardBounds {
  const radians = (item.rotation * Math.PI) / 180;
  const width = Math.abs(item.width * Math.cos(radians)) + Math.abs(item.height * Math.sin(radians));
  const height = Math.abs(item.width * Math.sin(radians)) + Math.abs(item.height * Math.cos(radians));
  return {
    x: item.x + (item.width - width) / 2,
    y: item.y + (item.height - height) / 2,
    width,
    height,
  };
}

export function boundsForItems(items: BoardItem[]): BoardBounds {
  if (items.length === 0) return EMPTY_BOARD_BOUNDS;
  const bounds = items.map(itemBounds);
  const x = Math.min(...bounds.map((bound) => bound.x));
  const y = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return { x, y, width: right - x, height: bottom - y };
}

export function intersects(a: BoardBounds, b: BoardBounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function contains(container: BoardBounds, item: BoardBounds): boolean {
  return item.x >= container.x && item.y >= container.y && item.x + item.width <= container.x + container.width && item.y + item.height <= container.y + container.height;
}

export function zoomAtPoint(viewport: BoardViewport, screen: BoardPoint, nextZoom: number): BoardViewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const world = screenToWorld(screen, viewport);
  return { panX: screen.x - world.x * zoom, panY: screen.y - world.y * zoom, zoom };
}

export function fitViewport(
  bounds: BoardBounds,
  viewportSize: { width: number; height: number },
  padding = 80,
): BoardViewport {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availableWidth / Math.max(1, bounds.width), availableHeight / Math.max(1, bounds.height), 1)));
  return {
    panX: (viewportSize.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    panY: (viewportSize.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

export function resizeBounds(
  initial: BoardBounds,
  handle: ResizeHandle,
  pointer: BoardPoint,
  preserveAspect: boolean,
  minimum = 20,
): BoardBounds {
  const opposite = {
    x: handle.includes("w") ? initial.x + initial.width : initial.x,
    y: handle.includes("n") ? initial.y + initial.height : initial.y,
  };
  let width = Math.max(minimum, Math.abs(pointer.x - opposite.x));
  let height = Math.max(minimum, Math.abs(pointer.y - opposite.y));
  if (preserveAspect) {
    const ratio = initial.width / initial.height;
    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
  }
  return {
    x: handle.includes("w") ? opposite.x - width : opposite.x,
    y: handle.includes("n") ? opposite.y - height : opposite.y,
    width,
    height,
  };
}

export function scaleItems(items: BoardItem[], initial: BoardBounds, next: BoardBounds): BoardItem[] {
  const scaleX = next.width / initial.width;
  const scaleY = next.height / initial.height;
  return items.map((item) => ({
    ...item,
    x: next.x + (item.x - initial.x) * scaleX,
    y: next.y + (item.y - initial.y) * scaleY,
    width: Math.max(1, item.width * scaleX),
    height: Math.max(1, item.height * scaleY),
  }));
}

export function rotationDegrees(center: BoardPoint, point: BoardPoint): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
}

export function frameDescendantIds(items: BoardItem[], frameIds: string[]): string[] {
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const result = new Set<string>();
  const visit = (frameId: string) => {
    const children = readItemPayload(byId.get(frameId)?.payload).childIds;
    if (!Array.isArray(children)) return;
    children.forEach((childId) => {
      if (typeof childId !== "string" || result.has(childId)) return;
      result.add(childId);
      if (byId.get(childId)?.itemType === "frame") visit(childId);
    });
  };
  frameIds.forEach(visit);
  return [...result];
}

export function nearestContainingFrame(item: BoardItem, frames: BoardItem[]): BoardItem | null {
  const candidates = frames.filter((frame) => frame.itemId !== item.itemId && contains(itemBounds(frame), itemBounds(item)));
  return candidates.sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;
}

export function itemsWithFrameDescendants(items: BoardItem[], selectedIds: string[]): BoardItem[] {
  const ids = new Set(selectedIds);
  frameDescendantIds(
    items,
    selectedIds.filter((id) => items.find((item) => item.itemId === id)?.itemType === "frame"),
  ).forEach((id) => ids.add(id));
  return items.filter((item) => ids.has(item.itemId));
}

export function reconcileFrameMembership(
  before: BoardItem[],
  after: BoardItem[],
  movedIds: string[],
): { beforeFrames: BoardItem[]; afterFrames: BoardItem[] } {
  const frames = after.filter((item) => item.itemType === "frame" && !item.deletedAt);
  const moved = after.filter((item) => movedIds.includes(item.itemId));
  const targetByItem = new Map(
    moved.map((item) => [item.itemId, nearestContainingFrame(item, frames)?.itemId ?? null]),
  );
  const beforeFrames: BoardItem[] = [];
  const afterFrames: BoardItem[] = [];
  for (const frame of frames) {
    const original = before.find((item) => item.itemId === frame.itemId) ?? frame;
    const payload = readItemPayload(frame.payload);
    const originalIds = Array.isArray(payload.childIds) ? payload.childIds : [];
    const childIds = originalIds
      .filter((id) => !targetByItem.has(id))
      .concat([...targetByItem].filter(([, frameId]) => frameId === frame.itemId).map(([id]) => id));
    const deduplicated = [...new Set(childIds)];
    if (deduplicated.length === originalIds.length && deduplicated.every((id, index) => id === originalIds[index])) continue;
    beforeFrames.push(original);
    afterFrames.push({ ...frame, payload: { ...payload, childIds: deduplicated } });
  }
  return { beforeFrames, afterFrames };
}

export function projectToMinimap(
  bounds: BoardBounds,
  content: BoardBounds,
  size: { width: number; height: number },
): BoardBounds {
  const scale = Math.min(size.width / Math.max(1, content.width), size.height / Math.max(1, content.height));
  const offsetX = (size.width - content.width * scale) / 2;
  const offsetY = (size.height - content.height * scale) / 2;
  return {
    x: offsetX + (bounds.x - content.x) * scale,
    y: offsetY + (bounds.y - content.y) * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}
