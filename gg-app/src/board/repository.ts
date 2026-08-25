import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BoardMutation } from "./interactions/types";

export type BoardItemType =
  | "sticky_note"
  | "text"
  | "shape"
  | "frame"
  | "arrow"
  | "image"
  | "drawing";

export interface BoardSummary {
  boardId: string;
  name: string;
  description: string | null;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BoardItem {
  itemId: string;
  boardId: string;
  itemType: BoardItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  payload: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BoardDocument {
  board: BoardSummary;
  backgroundColor: string;
  dotDensity: number;
  toolbarPosition: "top" | "bottom" | "left" | "right";
  panX: number;
  panY: number;
  zoom: number;
  items: BoardItem[];
}

export interface BoardLease {
  editable: boolean;
  leaseEpoch: number | null;
  ownerWindowLabel: string | null;
  expired: boolean;
}

export interface BoardAsset {
  assetId: string;
  mimeType: "image/png" | "image/jpeg";
  byteLength: number;
  url: string;
  boardRevision: number;
}

export interface BoardChanged {
  boardId: string;
  revision: number;
}

export const boardRepository = {
  list: (): Promise<BoardSummary[]> => invoke("board_list"),
  create: (name: string): Promise<BoardDocument> => invoke("board_create", { name }),
  get: (boardId: string): Promise<BoardDocument> => invoke("board_get", { boardId }),
  acquireLease: (boardId: string, reclaimExpired = false): Promise<BoardLease> =>
    invoke("board_lease_acquire", { boardId, reclaimExpired }),
  releaseLease: (boardId: string, leaseEpoch: number): Promise<void> =>
    invoke("board_lease_release", { boardId, leaseEpoch }),
  updateSettings: (
    boardId: string,
    leaseEpoch: number,
    expectedRevision: number,
    patch: Record<string, unknown>,
  ): Promise<BoardDocument> =>
    invoke("board_update_settings", { boardId, leaseEpoch, expectedRevision, patch }),
  createItem: (
    boardId: string,
    leaseEpoch: number,
    expectedRevision: number,
    item: Omit<
      BoardItem,
      "itemId" | "boardId" | "revision" | "createdAt" | "updatedAt" | "deletedAt"
    >,
  ): Promise<BoardDocument> =>
    invoke("board_item_create", { boardId, leaseEpoch, expectedRevision, item }),
  applyItems: (
    boardId: string,
    leaseEpoch: number,
    expectedRevision: number,
    mutations: BoardMutation[],
  ): Promise<BoardDocument> =>
    invoke("board_items_apply", { boardId, leaseEpoch, expectedRevision, mutations }),
  updateItem: (
    boardId: string,
    itemId: string,
    leaseEpoch: number,
    expectedRevision: number,
    expectedItemRevision: number,
    patch: Record<string, unknown>,
  ): Promise<BoardDocument> =>
    invoke("board_item_update", {
      boardId,
      itemId,
      leaseEpoch,
      expectedRevision,
      expectedItemRevision,
      patch,
    }),
  export: (
    boardId: string,
    format: "png" | "jpg" | "pdf" | "csv",
    bytes: Uint8Array,
  ): Promise<boolean> =>
    invoke("board_export_choose_destination", { boardId, format, bytes: Array.from(bytes) }),
  importAsset: (
    boardId: string,
    itemId: string,
    role: "image" | "drawing",
    leaseEpoch: number,
    expectedRevision: number,
  ): Promise<BoardAsset | null> =>
    invoke("board_asset_choose_and_import", {
      boardId,
      itemId,
      role,
      leaseEpoch,
      expectedRevision,
    }),
  deleteItem: (
    boardId: string,
    itemId: string,
    leaseEpoch: number,
    expectedRevision: number,
  ): Promise<BoardDocument> =>
    invoke("board_item_soft_delete", { boardId, itemId, leaseEpoch, expectedRevision }),
  onChanged: (handler: (event: BoardChanged) => void): Promise<UnlistenFn> =>
    listen<BoardChanged>("board://changed", ({ payload }) => handler(payload)),
};
