import {
  BringToFront,
  Copy,
  RotateCw,
  SendToBack,
  Trash2,
} from "lucide-react";
import type { BoardBounds, BoardViewport, ResizeHandle } from "./interactions/types";
import type { BoardItem } from "./repository";

interface BoardSelectionChromeProps {
  bounds: BoardBounds | null;
  viewport: BoardViewport;
  canvasSize: { width: number; height: number };
  selectedItems: BoardItem[];
  editable: boolean;
  onResizeStart: (event: React.PointerEvent, handle: ResizeHandle) => void;
  onRotateStart: (event: React.PointerEvent) => void;
  onColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function BoardSelectionChrome({
  bounds,
  viewport,
  canvasSize,
  selectedItems,
  editable,
  onResizeStart,
  onRotateStart,
  onColorChange,
  onFontSizeChange,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
}: BoardSelectionChromeProps): React.ReactElement | null {
  if (!bounds || selectedItems.length === 0) return null;
  const screen = {
    left: bounds.x * viewport.zoom + viewport.panX,
    top: bounds.y * viewport.zoom + viewport.panY,
    width: bounds.width * viewport.zoom,
    height: bounds.height * viewport.zoom,
  };
  const toolbarWidth = 330;
  const toolbarLeft = Math.max(8, Math.min(canvasSize.width - toolbarWidth - 8, screen.left + screen.width / 2 - toolbarWidth / 2));
  const toolbarTop = Math.max(8, Math.min(canvasSize.height - 52, screen.top > 64 ? screen.top - 52 : screen.top + screen.height + 10));
  const supportsFont = selectedItems.every((item) => item.itemType === "text" || item.itemType === "sticky_note" || item.itemType === "shape");
  const supportsColor = selectedItems.every((item) => item.itemType !== "image");
  const currentPayload = selectedItems[0]?.payload as { color?: unknown; fill?: unknown; fontSize?: unknown } | undefined;
  const color = typeof currentPayload?.color === "string"
    ? currentPayload.color
    : typeof currentPayload?.fill === "string"
      ? currentPayload.fill
      : "#7db7ff";

  return (
    <>
      <div className="board-selection-box" style={screen}>
        {(["nw", "ne", "se", "sw"] as ResizeHandle[]).map((handle) => (
          <button
            key={handle}
            type="button"
            className="board-resize-handle"
            data-handle={handle}
            tabIndex={-1}
            disabled={!editable}
            onPointerDown={(event) => onResizeStart(event, handle)}
          />
        ))}
        <span className="board-rotate-stem" />
        <button
          type="button"
          className="board-rotate-handle"
          aria-label="Rotate selection"
          title="Rotate"
          disabled={!editable}
          onPointerDown={onRotateStart}
        >
          <RotateCw aria-hidden="true" />
        </button>
      </div>
      <div
        className="board-context-toolbar"
        role="toolbar"
        aria-label="Selection formatting"
        style={{ left: toolbarLeft, top: toolbarTop }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {supportsColor ? (
          <label className="board-color-control" title="Color">
            <span className="sr-only">Selection color</span>
            <input
              type="color"
              value={color}
              disabled={!editable}
              onChange={(event) => onColorChange(event.currentTarget.value)}
            />
          </label>
        ) : null}
        {supportsFont ? (
          <label>
            <span className="sr-only">Font size</span>
            <select
              aria-label="Font size"
              disabled={!editable}
              value={typeof currentPayload?.fontSize === "number" ? currentPayload.fontSize : 16}
              onChange={(event) => onFontSizeChange(Number(event.currentTarget.value))}
            >
              {[12, 16, 20, 24, 32, 48, 64].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" aria-label="Bring to front" title="Bring to front" disabled={!editable} onClick={onBringToFront}>
          <BringToFront aria-hidden="true" />
        </button>
        <button type="button" aria-label="Send to back" title="Send to back" disabled={!editable} onClick={onSendToBack}>
          <SendToBack aria-hidden="true" />
        </button>
        <button type="button" aria-label="Duplicate selection" title="Duplicate" disabled={!editable} onClick={onDuplicate}>
          <Copy aria-hidden="true" />
        </button>
        <button type="button" aria-label="Delete selection" title="Delete" disabled={!editable} onClick={onDelete}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
