import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BringToFront,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  SendToBack,
  ThumbsUp,
  Sparkles,
  Trash2,
  MonitorPlay,
} from "lucide-react";
import type { BoardItem } from "./repository";

interface BoardContextMenuProps {
  x: number;
  y: number;
  selectedItems: BoardItem[];
  onClose: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onAddVote: () => void;
  onDelete: () => void;
  onMaximizeImage: (itemId: string) => void;
  onMinimizeImage: (itemId: string) => void;
  onDownloadImage?: (itemId: string) => void;
  onAddVideo?: () => void;
  onGenerateImage?: () => void;
}

const MENU_MARGIN = 8;

export function BoardContextMenu({
  x,
  y,
  selectedItems,
  onClose,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onAddVote,
  onDelete,
  onMaximizeImage,
  onMinimizeImage,
  onDownloadImage,
  onAddVideo,
  onGenerateImage,
}: BoardContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Keep the menu inside the viewport rather than letting it run off an edge.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - width - MENU_MARGIN)),
      y: Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - height - MENU_MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const onlyItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const empty = selectedItems.length === 0;
  const notes = selectedItems.filter((item) => item.itemType === "sticky_note");
  const image = onlyItem?.itemType === "image" ? onlyItem : null;

  return (
    <div
      ref={menuRef}
      className="board-context-menu"
      role="menu"
      aria-label="Board item actions"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {empty ? (
        <>
          {onGenerateImage ? (
            <button type="button" role="menuitem" onClick={run(onGenerateImage)}>
              <Sparkles aria-hidden="true" />
              Generate image…
            </button>
          ) : null}
          {onAddVideo ? (
            <button type="button" role="menuitem" onClick={run(onAddVideo)}>
              <MonitorPlay aria-hidden="true" />
              Add YouTube video…
            </button>
          ) : null}
        </>
      ) : null}
      {empty ? null : (
        <>
          <button type="button" role="menuitem" onClick={run(onBringToFront)}>
            <BringToFront aria-hidden="true" />
            Bring to front
          </button>
          <button type="button" role="menuitem" onClick={run(onSendToBack)}>
            <SendToBack aria-hidden="true" />
            Send to back
          </button>
          <button type="button" role="menuitem" onClick={run(onDuplicate)}>
            <Copy aria-hidden="true" />
            Duplicate
          </button>
          {notes.length > 0 ? (
            <button type="button" role="menuitem" onClick={run(onAddVote)}>
              <ThumbsUp aria-hidden="true" />
              Add vote
            </button>
          ) : null}
          {image ? (
            <>
              <span className="board-context-menu-divider" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                onClick={run(() => onMaximizeImage(image.itemId))}
              >
                <Maximize2 aria-hidden="true" />
                Maximize
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={run(() => onMinimizeImage(image.itemId))}
              >
                <Minimize2 aria-hidden="true" />
                Minimize
              </button>
              {onDownloadImage ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(() => onDownloadImage(image.itemId))}
                >
                  <Download aria-hidden="true" />
                  Download image
                </button>
              ) : null}
            </>
          ) : null}
          <span className="board-context-menu-divider" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="board-context-menu-danger"
            onClick={run(onDelete)}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </button>
        </>
      )}
    </div>
  );
}
