import type { BoardItem, BoardItemType } from "../repository";

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardBounds extends BoardPoint {
  width: number;
  height: number;
}

export interface BoardViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export type BoardShapeType =
  | "rectangle"
  | "rounded_rectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "line"
  | "arrow"
  | "double_arrow";

export type BoardTool =
  | { kind: "select" }
  | { kind: "place"; itemType: Exclude<BoardItemType, "drawing">; shape?: BoardShapeType }
  | { kind: "pen"; color: string };

export type ResizeHandle = "nw" | "ne" | "se" | "sw";

export type BoardGesture =
  | { kind: "idle" }
  | { kind: "pan"; pointerId: number; start: BoardPoint; viewport: BoardViewport }
  | { kind: "marquee"; pointerId: number; start: BoardPoint; current: BoardPoint }
  | { kind: "drag"; pointerId: number; start: BoardPoint; items: BoardItem[] }
  | {
      kind: "resize";
      pointerId: number;
      start: BoardPoint;
      handle: ResizeHandle;
      bounds: BoardBounds;
      items: BoardItem[];
    }
  | {
      kind: "rotate";
      pointerId: number;
      center: BoardPoint;
      startAngle: number;
      items: BoardItem[];
    }
  | { kind: "draw"; pointerId: number; points: BoardPoint[] };

export interface ItemPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  rotation?: number;
  payload?: unknown;
}

export type BoardMutation =
  | {
      kind: "create";
      itemId: string;
      item: Omit<
        BoardItem,
        "itemId" | "boardId" | "revision" | "createdAt" | "updatedAt" | "deletedAt"
      >;
    }
  | { kind: "update"; itemId: string; expectedItemRevision: number; patch: ItemPatch }
  | { kind: "softDelete"; itemId: string; expectedItemRevision: number }
  | { kind: "restore"; itemId: string; expectedItemRevision: number };

export interface MutationTemplate {
  kind: BoardMutation["kind"];
  itemId: string;
  item?: Extract<BoardMutation, { kind: "create" }>['item'];
  patch?: ItemPatch;
}

export interface BoardHistoryEntry {
  label: string;
  forward: MutationTemplate[];
  reverse: MutationTemplate[];
}
