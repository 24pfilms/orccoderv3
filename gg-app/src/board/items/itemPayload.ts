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
  /** YouTube video id for an embedded player (carried on an image item). */
  videoId?: string;
  childIds?: string[];
  points?: DrawingPoint[];
  strokeWidth?: number;
  /** Where a maximized image came from, so Minimize can restore it. */
  restoreBounds?: { x: number; y: number; width: number; height: number };
  _provenance?: Record<string, unknown>;
}

export function readItemPayload(payload: unknown): ItemPayload {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as ItemPayload)
    : {};
}

/**
 * Custom-scheme URL for a board asset.
 *
 * Windows WebView2 does not load a bare `scheme://` URL: Tauri serves registered
 * protocols there as `http://<scheme>.localhost/<path>` (which is why the Rust side
 * already allow-lists the `board-asset.localhost` host). Using the bare form on Windows
 * renders every board image as a broken icon.
 */
export function boardAssetUrl(assetId: unknown, userAgent = navigator.userAgent): string | null {
  if (typeof assetId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(assetId)) {
    return null;
  }
  const encoded = encodeURIComponent(assetId);
  return /windows/i.test(userAgent)
    ? `http://board-asset.localhost/${encoded}`
    : `board-asset://${encoded}`;
}

/**
 * Extract a YouTube video id from any of the URL shapes YouTube hands out
 * (watch?v=, youtu.be/, /embed/, /v/, /shorts/). Returns null when the input is not a
 * recognizable YouTube link, so callers can reject it rather than embed nothing.
 */
export function parseYouTubeUrl(url: string): string | null {
  const match = url
    .trim()
    .match(/(?:youtu\.be\/|\/embed\/|\/shorts\/|\/v\/|[?&]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return match ? match[1] : null;
}

export function youTubeEmbedUrl(videoId: string): string | null {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&controls=1&modestbranding=1&rel=0`
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
