import type { BoardShapeType } from "../interactions/types";
import type { BoardItemType } from "../repository";

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface ItemPayload {
  text?: string;
  title?: string;
  label?: string;
  color?: string;
  backgroundColor?: string;
  fill?: string;
  stroke?: string;
  shape?: BoardShapeType;
  fontSize?: number;
  fontFamily?: "sans" | "serif" | "mono" | "hand";
  votes?: number;
  assetId?: string;
  alt?: string;
  childIds?: string[];
  points?: DrawingPoint[];
  strokeWidth?: number;
  _provenance?: Record<string, unknown>;
}

export function readItemPayload(payload: unknown): ItemPayload {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as ItemPayload)
    : {};
}

export function boardAssetUrl(assetId: unknown): string | null {
  return typeof assetId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(assetId)
    ? `board-asset://${encodeURIComponent(assetId)}`
    : null;
}

export function defaultItemPayload(itemType: BoardItemType): ItemPayload {
  switch (itemType) {
    case "sticky_note":
      return { text: "New note", color: "#4a3b12", backgroundColor: "#f6d365", votes: 0 };
    case "text":
      return { text: "Start typing", color: "#e5e7eb", fontSize: 28, fontFamily: "sans" };
    case "shape":
      return { shape: "rectangle", fill: "#7db7ff", stroke: "#345a88", color: "#10243b" };
    case "frame":
      return { title: "Frame", color: "#7f8ca3", childIds: [] };
    case "arrow":
      return { shape: "arrow", label: "", color: "#dce4f2" };
    case "image":
      return { alt: "" };
    case "drawing":
      return { color: "#e5e7eb", strokeWidth: 3, points: [] };
  }
}
