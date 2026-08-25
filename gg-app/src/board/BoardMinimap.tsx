import { useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { boundsForItems, projectToMinimap, screenToWorld } from "./interactions/geometry";
import type { BoardBounds, BoardPoint, BoardViewport } from "./interactions/types";
import type { BoardItem } from "./repository";

interface BoardMinimapProps {
  items: BoardItem[];
  viewport: BoardViewport;
  canvasSize: { width: number; height: number };
  onRecenter: (point: BoardPoint) => void;
}

const MINIMAP_SIZE = { width: 160, height: 108 };

function union(a: BoardBounds, b: BoardBounds): BoardBounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

export function BoardMinimap({
  items,
  viewport,
  canvasSize,
  onRecenter,
}: BoardMinimapProps): React.ReactElement | null {
  // Collapsed by default: the minimap is a lookup tool, not something to keep on
  // screen, and an always-visible panel crowds the canvas.
  const [collapsed, setCollapsed] = useState(true);
  if (items.length === 0 || canvasSize.width <= 0 || canvasSize.height <= 0) return null;
  if (collapsed) {
    return (
      <button
        type="button"
        className="board-minimap-toggle board-minimap-collapsed"
        aria-label="Show minimap"
        title="Show minimap"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setCollapsed(false)}
      >
        <MapIcon aria-hidden="true" />
      </button>
    );
  }
  const itemContent = boundsForItems(items);
  const viewportWorld: BoardBounds = {
    ...screenToWorld({ x: 0, y: 0 }, viewport),
    width: canvasSize.width / viewport.zoom,
    height: canvasSize.height / viewport.zoom,
  };
  const content = union(itemContent, viewportWorld);
  const viewportProjection = projectToMinimap(viewportWorld, content, MINIMAP_SIZE);
  const recenter = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(MINIMAP_SIZE.width / Math.max(1, content.width), MINIMAP_SIZE.height / Math.max(1, content.height));
    const offsetX = (MINIMAP_SIZE.width - content.width * scale) / 2;
    const offsetY = (MINIMAP_SIZE.height - content.height * scale) / 2;
    onRecenter({
      x: content.x + (event.clientX - rect.left - offsetX) / scale,
      y: content.y + (event.clientY - rect.top - offsetY) / scale,
    });
  };

  return (
    <div className="board-minimap-shell">
      <button
        type="button"
        className="board-minimap-toggle"
        aria-label="Hide minimap"
        title="Hide minimap"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setCollapsed(true)}
      >
        <X aria-hidden="true" />
      </button>
    <button
      type="button"
      className="board-minimap"
      aria-label="Board minimap"
      title="Recenter board"
      onClick={(event) => {
        if (event.detail === 0) onRecenter({ x: itemContent.x + itemContent.width / 2, y: itemContent.y + itemContent.height / 2 });
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        recenter(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) recenter(event);
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture?.(event.pointerId)}
    >
      {items.map((item) => {
        const projected = projectToMinimap(
          { x: item.x, y: item.y, width: item.width, height: item.height },
          content,
          MINIMAP_SIZE,
        );
        return <span key={item.itemId} className="board-minimap-item" data-type={item.itemType} style={{ left: projected.x, top: projected.y, width: Math.max(2, projected.width), height: Math.max(2, projected.height) }} />;
      })}
      <span className="board-minimap-viewport" style={{ left: viewportProjection.x, top: viewportProjection.y, width: viewportProjection.width, height: viewportProjection.height }} />
    </button>
    </div>
  );
}
