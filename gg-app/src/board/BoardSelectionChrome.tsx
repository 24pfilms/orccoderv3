import {
  BringToFront,
  Copy,
  Minus,
  Plus,
  RotateCw,
  SendToBack,
} from "lucide-react";
import type { BoardBounds, BoardViewport, ResizeHandle } from "./interactions/types";
import type { BoardItem } from "./repository";

// Mero's font-size bounds and step, applied as a delta rather than a fixed list.
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;
const FONT_SIZE_STEP = 2;

function clampFontSize(size: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(size)));
}

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
}: BoardSelectionChromeProps): React.ReactElement | null {
  if (!bounds || selectedItems.length === 0) return null;
  const screen = {
    left: bounds.x * viewport.zoom + viewport.panX,
    top: bounds.y * viewport.zoom + viewport.panY,
    width: bounds.width * viewport.zoom,
    height: bounds.height * viewport.zoom,
  };
  // Centre on the selection with a CSS translate instead of subtracting an assumed
  // width: the toolbar's real width changes with which controls apply to the selection,
  // so a hard-coded number always left it slightly off-centre.
  const toolbarCenter = Math.max(8, Math.min(canvasSize.width - 8, screen.left + screen.width / 2));
  const toolbarTop = Math.max(8, Math.min(canvasSize.height - 40, screen.top > 50 ? screen.top - 40 : screen.top + screen.height + 10));
  const supportsFont = selectedItems.every((item) => item.itemType === "text" || item.itemType === "sticky_note" || item.itemType === "shape");
  const supportsColor = selectedItems.every((item) => item.itemType !== "image");
  const currentPayload = selectedItems[0]?.payload as { color?: unknown; fill?: unknown; fontSize?: unknown } | undefined;
  const currentFontSize = typeof currentPayload?.fontSize === "number"
    ? clampFontSize(currentPayload.fontSize)
    : 16;
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
        style={{ left: toolbarCenter, top: toolbarTop, transform: "translateX(-50%)" }}
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
          // Stepper rather than a <select>: native WebView2 select popups can open
          // without ever accepting a selection (the app documents this elsewhere), so the
          // dropdown silently did nothing. Mero uses a delta control clamped to 8..200.
          <span className="board-font-size" role="group" aria-label="Font size">
            <button
              type="button"
              aria-label="Decrease font size"
              title="Decrease font size"
              disabled={!editable}
              onClick={() => onFontSizeChange(clampFontSize(currentFontSize - FONT_SIZE_STEP))}
            >
              <Minus aria-hidden="true" />
            </button>
            <output aria-live="off">{currentFontSize}</output>
            <button
              type="button"
              aria-label="Increase font size"
              title="Increase font size"
              disabled={!editable}
              onClick={() => onFontSizeChange(clampFontSize(currentFontSize + FONT_SIZE_STEP))}
            >
              <Plus aria-hidden="true" />
            </button>
          </span>
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
      </div>
    </>
  );
}
