import { useEffect, useRef, useState } from "react";
import { BoardSelectionChrome } from "./BoardSelectionChrome";
import { BoardExportMenu } from "./BoardExportMenu";
import { BoardMinimap } from "./BoardMinimap";
import { BoardToolbar } from "./BoardToolbar";
import { BoardZoomControls } from "./BoardZoomControls";
import { useBoardInteraction } from "./hooks/useBoardInteraction";
import { useBoardViewport } from "./hooks/useBoardViewport";
import type { ItemPayload } from "./items/itemPayload";
import { BoardItemView } from "./items/BoardItemView";
import { zoomAtPoint } from "./interactions/geometry";
import type { BoardMutation, BoardPoint, BoardShapeType } from "./interactions/types";
import type { BoardDocument, BoardItem, BoardItemType } from "./repository";
import type { BoardExportFormat } from "./export";

interface BoardCanvasProps {
  document: BoardDocument;
  editable: boolean;
  externalRevision: number;
  onViewportChange: (panX: number, panY: number, zoom: number) => void;
  onCreateItem: (
    itemType: BoardItemType,
    at?: BoardPoint,
    shape?: BoardShapeType,
  ) => Promise<string | null>;
  onApplyMutations: (mutations: BoardMutation[]) => Promise<BoardDocument | null>;
  onPreviewItems: (items: BoardItem[]) => void;
  onClearPreview: () => void;
  onItemPayloadChange: (itemId: string, payload: ItemPayload) => void;
  onImportAsset: (itemId: string, role: "image" | "drawing") => Promise<boolean>;
  resolveAssetUrl?: (assetId: string) => string | null;
  onExport: (format: BoardExportFormat) => void;
}

export function BoardCanvas({
  document,
  editable,
  externalRevision,
  onViewportChange,
  onCreateItem,
  onApplyMutations,
  onPreviewItems,
  onClearPreview,
  onItemPayloadChange,
  onImportAsset,
  resolveAssetUrl,
  onExport,
}: BoardCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const viewportState = useBoardViewport(
    { panX: document.panX, panY: document.panY, zoom: document.zoom },
    ({ panX, panY, zoom }) => editable && onViewportChange(panX, panY, zoom),
  );
  const interaction = useBoardInteraction({
    document,
    editable,
    externalRevision,
    viewport: viewportState.viewport,
    canvasRef,
    setViewport: viewportState.setViewport,
    commitViewport: viewportState.commit,
    createItem: onCreateItem,
    applyMutations: onApplyMutations,
    previewItems: onPreviewItems,
    clearPreview: onClearPreview,
    importItemAsset: onImportAsset,
  });
  const activeItems = document.items.filter(({ deletedAt }) => !deletedAt);

  return (
    <div
      ref={canvasRef}
      className="board-canvas"
      tabIndex={0}
      aria-label="Board canvas"
      data-tool={interaction.tool.kind}
      style={{ backgroundColor: document.backgroundColor, backgroundSize: `${document.dotDensity}px ${document.dotDensity}px` }}
      onKeyDown={interaction.onKeyDown}
      onKeyUp={interaction.onKeyUp}
      onBlur={interaction.resetSpace}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        viewportState.wheelZoom(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          event.deltaY,
        );
      }}
      onPointerDown={interaction.onCanvasPointerDown}
      onPointerMove={interaction.onPointerMove}
      onPointerUp={(event) => void interaction.onPointerUp(event)}
      onPointerCancel={(event) => void interaction.onPointerUp(event)}
    >
      <div
        className="board-canvas-world"
        style={{
          transform: `translate(${viewportState.viewport.panX}px, ${viewportState.viewport.panY}px) scale(${viewportState.viewport.zoom})`,
        }}
      >
        {activeItems.map((item) => {
          const selected = interaction.selectedIds.includes(item.itemId);
          return (
            <div
              key={item.itemId}
              role="group"
              aria-label={`${item.itemType.replace("_", " ")} item`}
              data-board-item={item.itemId}
              data-item-type={item.itemType}
              data-selected={selected || undefined}
              className="board-item"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                zIndex: item.zIndex,
                transform: `rotate(${item.rotation}deg)`,
              }}
              onPointerDown={(event) => interaction.onItemPointerDown(event, item.itemId)}
            >
              <BoardItemView
                item={item}
                editable={editable}
                editing={interaction.editingId === item.itemId}
                onBeginEditing={() => interaction.setEditingId(item.itemId)}
                onEndEditing={() => interaction.setEditingId(null)}
                onPayloadChange={(payload) => onItemPayloadChange(item.itemId, payload)}
                onImportAsset={(role) => void onImportAsset(item.itemId, role)}
                resolveAssetUrl={resolveAssetUrl}
              />
            </div>
          );
        })}
        {interaction.marquee ? (
          <div
            className="board-marquee"
            style={{
              left: interaction.marquee.x,
              top: interaction.marquee.y,
              width: interaction.marquee.width,
              height: interaction.marquee.height,
            }}
          />
        ) : null}
        {interaction.drawingPoints ? (
          <svg className="board-drawing-preview" aria-hidden="true">
            <polyline
              points={interaction.drawingPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={interaction.tool.kind === "pen" ? interaction.tool.color : "#e5e7eb"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
      <BoardMinimap
        items={activeItems}
        viewport={viewportState.viewport}
        canvasSize={canvasSize}
        onRecenter={(point) => viewportState.setViewport({
          ...viewportState.viewport,
          panX: canvasSize.width / 2 - point.x * viewportState.viewport.zoom,
          panY: canvasSize.height / 2 - point.y * viewportState.viewport.zoom,
        })}
      />
      <BoardZoomControls
        zoom={viewportState.viewport.zoom}
        onZoomIn={() => viewportState.zoomBy(1.2, { x: canvasSize.width / 2, y: canvasSize.height / 2 })}
        onZoomOut={() => viewportState.zoomBy(1 / 1.2, { x: canvasSize.width / 2, y: canvasSize.height / 2 })}
        onActualSize={() => viewportState.setViewport(zoomAtPoint(viewportState.viewport, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, 1))}
        onFit={() => viewportState.fitItems(activeItems, canvasSize)}
      />
      <BoardSelectionChrome
        bounds={interaction.selectionBounds}
        viewport={viewportState.viewport}
        canvasSize={canvasSize}
        selectedItems={interaction.selectedItems}
        editable={editable}
        onResizeStart={interaction.startResize}
        onRotateStart={interaction.startRotate}
        onColorChange={interaction.changeColor}
        onFontSizeChange={interaction.changeFontSize}
        onBringToFront={interaction.bringToFront}
        onSendToBack={interaction.sendToBack}
        onDuplicate={() => void interaction.duplicateSelection()}
        onDelete={() => void interaction.deleteSelection()}
      />
      <BoardToolbar
        tool={interaction.tool}
        position={document.toolbarPosition}
        disabled={!editable}
        canUndo={interaction.history.canUndo}
        canRedo={interaction.history.canRedo}
        onToolChange={interaction.setTool}
        onUndo={() => void interaction.history.undo()}
        onRedo={() => void interaction.history.redo()}
      >
        <BoardExportMenu disabled={false} onExport={onExport} />
      </BoardToolbar>
    </div>
  );
}
