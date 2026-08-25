import { BoardShape } from "./BoardShape";
import type { BoardItem } from "../repository";
import {
  boardAssetUrl,
  readItemPayload,
  youTubeEmbedUrl,
  type ItemPayload,
} from "./itemPayload";

interface BoardItemViewProps {
  item: BoardItem;
  editable: boolean;
  editing?: boolean;
  selected?: boolean;
  onBeginEditing?: () => void;
  onEndEditing?: () => void;
  onPayloadChange: (payload: ItemPayload) => void;
  onImportAsset: (role: "image" | "drawing") => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}

export function BoardItemView({
  item,
  editable,
  editing = false,
  selected = false,
  onBeginEditing,
  onEndEditing,
  onPayloadChange,
  onImportAsset,
  resolveAssetUrl = boardAssetUrl,
}: BoardItemViewProps): React.ReactElement {
  const payload = readItemPayload(item.payload);
  const text = typeof payload.text === "string" ? payload.text : "";
  const color = typeof payload.color === "string" ? payload.color : "#e5e7eb";
  const fill = typeof payload.fill === "string" ? payload.fill : "#7db7ff";
  const stroke = typeof payload.stroke === "string" ? payload.stroke : color;
  const fontSize = typeof payload.fontSize === "number" ? payload.fontSize : undefined;
  const fontFamily = payload.fontFamily ?? "sans";
  const points = Array.isArray(payload.points)
    ? payload.points.filter(
        (point) =>
          Number.isFinite(point?.x) &&
          Number.isFinite(point?.y) &&
          Math.abs(point.x) <= 100_000 &&
          Math.abs(point.y) <= 100_000,
      )
    : [];

  if (item.itemType === "sticky_note" || item.itemType === "text") {
    const label = item.itemType === "sticky_note" ? "Sticky note" : "Text item";
    const style = {
      color,
      // Sticky notes are offered the font-size control too (see `supportsFont` in
      // BoardSelectionChrome), so honour the payload here instead of silently dropping
      // it for notes — the value was being saved and then ignored on render.
      fontSize,
      fontFamily: `var(--board-font-${fontFamily})`,
      backgroundColor:
        item.itemType === "sticky_note"
          ? payload.backgroundColor ?? "#f6d365"
          : "transparent",
    };
    return editing ? (
      // Mero centres the editor by wrapping a content-sized textarea in a centring box;
      // styling the textarea itself as the box leaves its text stuck at the top.
      <div className={`board-item-text board-item-${item.itemType}`} style={style}>
        <textarea
          autoFocus
          aria-label={label}
          className="board-item-textarea"
          value={text}
          rows={Math.max(1, text.split("\n").length)}
          onBlur={(event) => {
            // Reaching for the selection toolbar (font size, colour, layers) blurs the
            // editor. Ending editing there re-renders the chrome mid-click, so the
            // control never receives its change event. Keep editing when focus moves
            // into board chrome rather than away from the item.
            const next = event.relatedTarget as Element | null;
            if (next?.closest(".board-context-toolbar, .board-toolbar")) return;
            onEndEditing?.();
          }}
          onChange={(event) => onPayloadChange({ ...payload, text: event.currentTarget.value })}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </div>
    ) : (
      <div
        role="textbox"
        aria-label={label}
        aria-readonly="true"
        className={`board-item-text board-item-${item.itemType}`}
        style={style}
        onDoubleClick={() => editable && onBeginEditing?.()}
      >
        <span>{text || (editable ? "Double-click to edit" : "")}</span>
        {item.itemType === "sticky_note" && typeof payload.votes === "number" && payload.votes > 0 ? (
          <span className="board-note-votes" aria-label={`${payload.votes} votes`}>
            +{payload.votes}
          </span>
        ) : null}
      </div>
    );
  }

  if (item.itemType === "shape") {
    // Shapes carry a label, and Mero lets you type straight into one. The editor is the
    // same centred textarea notes use, overlaid on the shape while editing.
    return (
      <div
        className="board-shape-wrap"
        onDoubleClick={() => editable && onBeginEditing?.()}
      >
        <BoardShape
          className="board-shape"
          shape={payload.shape ?? "rectangle"}
          fill={fill}
          stroke={stroke}
          color={color}
          label={editing ? "" : text}
          fontSize={fontSize}
        />
        {editing ? (
          <div
            className="board-item-text board-shape-text"
            style={{ color, fontSize, fontFamily: `var(--board-font-${fontFamily})` }}
          >
            <textarea
              autoFocus
              aria-label="Shape text"
              className="board-item-textarea"
              value={text}
              rows={Math.max(1, text.split("\n").length)}
              onBlur={(event) => {
                const next = event.relatedTarget as Element | null;
                if (next?.closest(".board-context-toolbar, .board-toolbar")) return;
                onEndEditing?.();
              }}
              onChange={(event) => onPayloadChange({ ...payload, text: event.currentTarget.value })}
              onPointerDown={(event) => event.stopPropagation()}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (item.itemType === "frame") {
    const title = typeof payload.title === "string" ? payload.title : "Frame";
    return (
      <div className="board-frame" style={{ borderColor: color }}>
        {/* Mero makes only the border a grab target so the interior stays click-through
            and items inside (or beneath) a frame remain selectable. */}
        {(["top", "bottom", "left", "right"] as const).map((edge) => (
          <span key={edge} className="board-frame-edge" data-edge={edge} aria-hidden="true" />
        ))}
        {editing ? (
          <input
            autoFocus
            aria-label="Frame title"
            value={title}
            onBlur={onEndEditing}
            onChange={(event) => onPayloadChange({ ...payload, title: event.currentTarget.value })}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="board-frame-title" onDoubleClick={() => editable && onBeginEditing?.()}>
            {title}
          </span>
        )}
      </div>
    );
  }

  if (item.itemType === "arrow") {
    return (
      <BoardShape
        className="board-arrow"
        shape={payload.shape === "double_arrow" || payload.shape === "line" ? payload.shape : "arrow"}
        stroke={color}
        color={color}
        label={payload.label}
      />
    );
  }

  if (item.itemType === "drawing") {
    const path = points.map((point) => `${point.x},${point.y}`).join(" ");
    return (
      <svg className="board-drawing" role="img" aria-label="Drawing">
        <polyline className="board-drawing-hit-target" points={path} fill="none" />
        <polyline
          points={path}
          fill="none"
          stroke={color}
          strokeWidth={payload.strokeWidth ?? 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const embedUrl = typeof payload.videoId === "string" ? youTubeEmbedUrl(payload.videoId) : null;
  if (embedUrl) {
    return (
      // The player stays inert until double-clicked. An iframe swallows pointer input into
      // its own document, which would eat the inner half of the resize handles and turn
      // every resize into a drag, so board gestures always win until you activate it.
      <div
        className="board-asset-item board-video-item"
        data-playing={editing || undefined}
        onDoubleClick={() => editable && onBeginEditing?.()}
      >
        <iframe
          src={embedUrl}
          title={typeof payload.alt === "string" && payload.alt ? payload.alt : "YouTube video"}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
        {!editing && selected ? (
          <span className="board-video-hint">Double-click to play</span>
        ) : null}
      </div>
    );
  }

  const assetUrl = typeof payload.assetId === "string" ? resolveAssetUrl(payload.assetId) : null;
  return (
    <div className="board-asset-item">
      {assetUrl ? (
        <img src={assetUrl} alt={typeof payload.alt === "string" ? payload.alt : ""} draggable={false} />
      ) : (
        <button type="button" disabled={!editable} onClick={() => onImportAsset("image")}>
          Choose image
        </button>
      )}
    </div>
  );
}
