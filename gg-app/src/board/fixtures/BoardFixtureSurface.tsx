import { useCallback, useState } from "react";
import fixture from "../../../../docs/board-mode/fixtures/mero-core-v1/fixture.json";
import { BoardCanvas } from "../BoardCanvas";
import { defaultItemPayload, readItemPayload, type ItemPayload } from "../items/itemPayload";
import type { BoardMutation, BoardPoint, BoardShapeType } from "../interactions/types";
import type { BoardDocument, BoardItem, BoardItemType } from "../repository";
import "../../App.css";
import "../board.css";

const typeMap: Record<string, BoardItemType> = {
  FRAME: "frame",
  STICKY_NOTE: "sticky_note",
  TEXT_BOX: "text",
  SHAPE: "shape",
  IMAGE: "image",
};

const shapeMap: Record<string, BoardShapeType> = {
  ROUNDED_RECTANGLE: "rounded_rectangle",
  CIRCLE: "ellipse",
  ARROW_BOTH: "double_arrow",
  DIAMOND: "diamond",
};

function fixtureDocument(): BoardDocument {
  const items: BoardItem[] = fixture.items.map((source) => {
    const itemType = typeMap[source.type] ?? "shape";
    const shape = "shape" in source && source.shape ? shapeMap[source.shape] ?? "rectangle" : undefined;
    const payload: ItemPayload = {
      ...defaultItemPayload(itemType),
      ...(source.text ? itemType === "frame" ? { title: source.text } : { text: source.text } : {}),
      ...(source.backgroundColor ? itemType === "shape" ? { fill: source.backgroundColor } : { backgroundColor: source.backgroundColor } : {}),
      ...(source.textColor ? { color: source.textColor } : {}),
      ...(source.fontSize ? { fontSize: source.fontSize } : {}),
      ...("fontFamily" in source && source.fontFamily ? { fontFamily: "sans" as const } : {}),
      ...(source.votes ? { votes: source.votes } : {}),
      ...(shape ? { shape } : {}),
      ...(source.type === "FRAME" && "children" in source ? { childIds: source.children } : {}),
      ...(source.type === "IMAGE"
        ? { alt: "Characterization reference", assetId: "fixture-image-data" }
        : {}),
    };
    return {
      itemId: source.itemId,
      boardId: source.boardId,
      itemType,
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      zIndex: source.zIndex,
      rotation: source.rotation,
      payload,
      revision: 0,
      createdAt: String(source.createdAt),
      updatedAt: String(source.updatedAt),
      deletedAt: null,
    };
  });
  return {
    board: {
      boardId: fixture.board.boardId,
      name: fixture.board.name,
      description: fixture.board.description,
      revision: 0,
      updatedAt: String(fixture.board.updatedAt),
      deletedAt: null,
    },
    backgroundColor: fixture.board.backgroundColor,
    dotDensity: fixture.board.dotDensity,
    toolbarPosition: "bottom",
    panX: 205,
    panY: 100,
    zoom: 1,
    items,
  };
}

export function BoardFixtureSurface(): React.ReactElement {
  const [document, setDocument] = useState(fixtureDocument);
  const [previewItems, setPreviewItems] = useState<BoardItem[] | null>(null);
  const applyMutations = useCallback(async (mutations: BoardMutation[]) => {
    let nextDocument: BoardDocument | null = null;
    setDocument((current) => {
      let items = [...current.items];
      mutations.forEach((mutation) => {
        if (mutation.kind === "create") {
          items.push({
            ...mutation.item,
            itemId: mutation.itemId,
            boardId: current.board.boardId,
            revision: 0,
            createdAt: "fixture",
            updatedAt: "fixture",
            deletedAt: null,
          });
          return;
        }
        items = items.map((item) => {
          if (item.itemId !== mutation.itemId) return item;
          if (mutation.kind === "update") return { ...item, ...mutation.patch, revision: item.revision + 1 };
          if (mutation.kind === "softDelete") return { ...item, deletedAt: "fixture", revision: item.revision + 1 };
          return { ...item, deletedAt: null, revision: item.revision + 1 };
        });
      });
      nextDocument = { ...current, board: { ...current.board, revision: current.board.revision + 1 }, items };
      return nextDocument;
    });
    return nextDocument;
  }, []);
  const createItem = useCallback(async (itemType: BoardItemType, at: BoardPoint = { x: 0, y: 0 }, shape?: BoardShapeType) => {
    const itemId = crypto.randomUUID();
    const size = itemType === "frame" ? { width: 460, height: 320 } : itemType === "arrow" ? { width: 240, height: 64 } : { width: 200, height: 160 };
    await applyMutations([{ kind: "create", itemId, item: {
      itemType, x: at.x - size.width / 2, y: at.y - size.height / 2, ...size,
      zIndex: document.items.length + 1, rotation: 0,
      payload: { ...defaultItemPayload(itemType), ...(shape ? { shape } : {}) },
    } }]);
    return itemId;
  }, [applyMutations, document.items.length]);

  return (
    <main className="board-fixture-root">
      <header className="board-shell-header">
        <strong>{document.board.name}</strong>
        <span role="status">Fixture · saved</span>
      </header>
      <BoardCanvas
        document={previewItems ? { ...document, items: previewItems } : document}
        editable
        externalRevision={0}
        onViewportChange={(panX, panY, zoom) => setDocument((current) => ({ ...current, panX, panY, zoom }))}
        onCreateItem={createItem}
        onApplyMutations={applyMutations}
        onPreviewItems={setPreviewItems}
        onClearPreview={() => setPreviewItems(null)}
        onItemPayloadChange={(itemId, payload) => setDocument((current) => ({
          ...current,
          items: current.items.map((item) => item.itemId === itemId ? { ...item, payload: { ...readItemPayload(item.payload), ...payload } } : item),
        }))}
        onImportAsset={async () => false}
        resolveAssetUrl={(assetId) =>
          assetId === "fixture-image-data" ? "/src/board/fixtures/fixture-image.png" : null
        }
        onExport={() => {}}
      />
    </main>
  );
}
