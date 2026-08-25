import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeBoardExport, type BoardExportFormat } from "../export";
import type { BoardFlushCoordinator } from "../flush";
import {
  boardAssetUrl,
  defaultItemPayload,
  readItemPayload,
  type ItemPayload,
} from "../items/itemPayload";
import { nearestContainingFrame } from "../interactions/geometry";
import type { BoardMutation, BoardPoint, BoardShapeType } from "../interactions/types";
import {
  boardRepository,
  type BoardDocument,
  type BoardItem,
  type BoardItemType,
  type BoardLease,
  type BoardSummary,
} from "../repository";
import { BoardSaveQueue, type BoardSaveState } from "../saveQueue";

interface BoardDocumentState {
  boards: BoardSummary[];
  document: BoardDocument | null;
  lease: BoardLease | null;
  saveState: BoardSaveState;
  error: string | null;
  externalRevision: number;
  selectBoard: (boardId: string) => Promise<void>;
  createBoard: (name: string) => Promise<void>;
  renameBoard: (boardId: string, name: string) => Promise<void>;
  updateViewport: (panX: number, panY: number, zoom: number) => void;
  setDotDensity: (dotDensity: number) => void;
  createItem: (
    itemType: BoardItemType,
    at?: BoardPoint,
    shape?: BoardShapeType,
    initialPayload?: ItemPayload,
  ) => Promise<string | null>;
  applyMutations: (mutations: BoardMutation[]) => Promise<BoardDocument | null>;
  previewItems: (items: BoardItem[]) => void;
  clearPreview: () => void;
  updateItemPayload: (itemId: string, payload: ItemPayload) => void;
  importItemAsset: (itemId: string, role: "image" | "drawing") => Promise<boolean>;
  exportBoard: (format: BoardExportFormat) => Promise<void>;
  downloadItemImage: (itemId: string) => Promise<void>;
  /** Resolves null on success, or the failure reason to show the user. */
  generateImage: (prompt: string, at: BoardPoint) => Promise<string | null>;
  dropImageFiles: (files: File[], at: BoardPoint) => Promise<void>;
  /** Items whose picture is still being generated, so the canvas can show progress. */
  generatingItemIds: string[];
  takeOver: () => Promise<void>;
}

/** Longest edge a newly attached image is scaled to, in board units. */
const IMAGE_FIT_EDGE = 420;

/**
 * Box that matches the image's aspect ratio. Without this an image is letterboxed inside
 * whatever geometry the item was created with (200x160 by default), which leaves wide
 * bands of empty item around a landscape or portrait picture.
 */
function fitToImage(pixelWidth: number, pixelHeight: number): { width: number; height: number } {
  if (!(pixelWidth > 0) || !(pixelHeight > 0)) return { width: 200, height: 160 };
  const scale = IMAGE_FIT_EDGE / Math.max(pixelWidth, pixelHeight);
  return {
    width: Math.max(24, Math.round(pixelWidth * scale)),
    height: Math.max(24, Math.round(pixelHeight * scale)),
  };
}

function itemSize(itemType: BoardItemType): { width: number; height: number } {
  switch (itemType) {
    case "arrow":
      return { width: 240, height: 64 };
    case "text":
      return { width: 260, height: 80 };
    case "frame":
      return { width: 460, height: 320 };
    case "drawing":
      return { width: 1, height: 1 };
    default:
      return { width: 200, height: 160 };
  }
}

export function useBoardDocument(coordinator: BoardFlushCoordinator): BoardDocumentState {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [document, setDocument] = useState<BoardDocument | null>(null);
  const [lease, setLease] = useState<BoardLease | null>(null);
  const [saveState, setSaveState] = useState<BoardSaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [externalRevision, setExternalRevision] = useState(0);
  const [generatingItemIds, setGeneratingItemIds] = useState<string[]>([]);
  const queue = useMemo(() => new BoardSaveQueue(coordinator, setSaveState), [coordinator]);
  const committedRef = useRef<BoardDocument | null>(null);
  const leaseRef = useRef(lease);
  const localMutationRef = useRef(false);
  const boardId = document?.board.boardId;

  useEffect(() => {
    leaseRef.current = lease;
  }, [lease]);

  const acceptDocument = useCallback((next: BoardDocument) => {
    committedRef.current = next;
    setDocument(next);
    setBoards((current) =>
      current.map((board) => (board.boardId === next.board.boardId ? next.board : board)),
    );
  }, []);

  const openBoard = useCallback(
    async (next: BoardDocument) => {
      setError(null);
      setLease(null);
      acceptDocument(next);
      setExternalRevision(0);
      setLease(await boardRepository.acquireLease(next.board.boardId));
    },
    [acceptDocument],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const listed = (await boardRepository.list()).filter(({ deletedAt }) => !deletedAt);
        const next = listed[0]
          ? await boardRepository.get(listed[0].boardId)
          : await boardRepository.create("Main Board");
        if (cancelled) return;
        setBoards(listed.length ? listed : [next.board]);
        await openBoard(next);
      } catch {
        if (!cancelled) setError("Board could not be loaded");
      }
    })();
    return () => {
      cancelled = true;
      queue.dispose();
    };
  }, [openBoard, queue]);

  useEffect(() => {
    if (!boardId) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void boardRepository
      .onChanged((changed) => {
        const committed = committedRef.current;
        if (
          changed.boardId !== boardId ||
          changed.revision <= (committed?.board.revision ?? -1) ||
          localMutationRef.current
        )
          return;
        void boardRepository
          .get(changed.boardId)
          .then((next) => {
            if (!disposed) {
              acceptDocument(next);
              setExternalRevision((revision) => revision + 1);
              setError("Board changed in another window. Undo history was cleared.");
            }
          })
          .catch(() => setError("Board changed, but the view could not refresh"));
      })
      .then((release) => {
        if (disposed) release();
        else unlisten = release;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [acceptDocument, boardId]);

  useEffect(() => {
    if (!boardId || !lease?.editable || lease.leaseEpoch === null) return;
    const epoch = lease.leaseEpoch;
    const heartbeat = setInterval(() => {
      void boardRepository.acquireLease(boardId).catch(() => {
        setError("Board editing lease heartbeat failed");
      });
    }, 10_000);
    return () => {
      clearInterval(heartbeat);
      void queue.flush("surface-switch").then(
        () => boardRepository.releaseLease(boardId, epoch),
        () => {},
      );
    };
  }, [boardId, lease?.editable, lease?.leaseEpoch, queue]);

  /**
   * Canvas dot spacing. Applied locally at once so dragging the slider feels immediate,
   * and coalesced through the save queue under a single key so a drag is one write rather
   * than one per pixel — the same treatment viewport persistence gets.
   */
  const setDotDensity = useCallback(
    (dotDensity: number) => {
      const next = Math.max(4, Math.min(48, Math.round(dotDensity)));
      const committed = committedRef.current;
      if (committed) {
        const preview = { ...committed, dotDensity: next };
        committedRef.current = preview;
        setDocument(preview);
      }
      queue.enqueue("settings", async () => {
        const current = committedRef.current;
        const currentLease = leaseRef.current;
        if (!current || !currentLease?.editable || currentLease.leaseEpoch === null) return;
        localMutationRef.current = true;
        try {
          acceptDocument(
            await boardRepository.updateSettings(
              current.board.boardId,
              currentLease.leaseEpoch,
              current.board.revision,
              { dotDensity: next },
            ),
          );
        } finally {
          localMutationRef.current = false;
        }
      });
    },
    [acceptDocument, queue],
  );

  const selectBoard = useCallback(
    async (nextBoardId: string) => {
      if (nextBoardId === committedRef.current?.board.boardId) return;
      try {
        await queue.flush("surface-switch");
        await openBoard(await boardRepository.get(nextBoardId));
      } catch {
        setError("Board could not be opened");
      }
    },
    [openBoard, queue],
  );

  const createBoard = useCallback(
    async (name: string) => {
      try {
        await queue.flush("surface-switch");
        const next = await boardRepository.create(name);
        setBoards((current) => [...current, next.board]);
        await openBoard(next);
      } catch {
        setError("Board could not be created");
      }
    },
    [openBoard, queue],
  );

  // Renaming goes through the same settings command as viewport persistence, so it
  // inherits the lease and revision checks. Only the open board can be renamed: the
  // lease is held per board, and we do not hold one for the others.
  const renameBoard = useCallback(
    async (targetBoardId: string, nextName: string) => {
      const current = committedRef.current;
      const currentLease = leaseRef.current;
      const trimmed = nextName.trim();
      if (!trimmed) return;
      if (!current || current.board.boardId !== targetBoardId) {
        setError("Open a board before renaming it");
        return;
      }
      if (!currentLease?.editable || currentLease.leaseEpoch === null) {
        setError("The board is read only");
        return;
      }
      try {
        await queue.flush("surface-switch");
        const next = await boardRepository.updateSettings(
          targetBoardId,
          currentLease.leaseEpoch,
          committedRef.current?.board.revision ?? current.board.revision,
          { name: trimmed },
        );
        acceptDocument(next);
        setBoards((boards) =>
          boards.map((board) =>
            board.boardId === targetBoardId ? { ...board, name: trimmed } : board,
          ),
        );
      } catch {
        setError("Board could not be renamed");
      }
    },
    [acceptDocument, queue],
  );

  const updateViewport = useCallback(
    (panX: number, panY: number, zoom: number) => {
      const committed = committedRef.current;
      if (committed) {
        const preview = { ...committed, panX, panY, zoom };
        committedRef.current = preview;
        setDocument(preview);
      }
      queue.enqueue("viewport", async () => {
        const current = committedRef.current;
        const currentLease = leaseRef.current;
        if (!current || !currentLease?.editable || currentLease.leaseEpoch === null) return;
        localMutationRef.current = true;
        try {
          acceptDocument(
            await boardRepository.updateSettings(
              current.board.boardId,
              currentLease.leaseEpoch,
              current.board.revision,
              { panX, panY, zoom },
            ),
          );
        } finally {
          localMutationRef.current = false;
        }
      });
    },
    [acceptDocument, queue],
  );

  const applyMutations = useCallback(
    async (mutations: BoardMutation[]) => {
      if (mutations.length === 0) return committedRef.current;
      let result: BoardDocument | null = null;
      queue.enqueue(`mutation:${crypto.randomUUID()}`, async () => {
        const current = committedRef.current;
        const currentLease = leaseRef.current;
        if (!current || !currentLease?.editable || currentLease.leaseEpoch === null) return;
        localMutationRef.current = true;
        try {
          // Callers capture `expectedItemRevision` when the action is BUILT, but any of
          // our own writes in between (typing, a drag commit, a frame update) advance it,
          // so by execution time the expectation is stale and the write is rejected.
          // Re-anchor against the locally committed document — our own confirmed state.
          // Concurrency with other windows is still guarded by the board revision below.
          const committedRevisions = new Map(
            current.items.map((item) => [item.itemId, item.revision]),
          );
          const anchored = mutations.map((mutation) =>
            "expectedItemRevision" in mutation && committedRevisions.has(mutation.itemId)
              ? { ...mutation, expectedItemRevision: committedRevisions.get(mutation.itemId)! }
              : mutation,
          );
          result = await boardRepository.applyItems(
            current.board.boardId,
            currentLease.leaseEpoch,
            current.board.revision,
            anchored,
          );
          acceptDocument(result);
          setError(null);
        } finally {
          localMutationRef.current = false;
        }
      });
      try {
        await queue.flush("surface-switch");
        return result;
      } catch {
        setError("Board changes could not be saved. Your preview is retained.");
        // Re-read the committed board so the next edit carries fresh revisions. Without
        // this the local copy stays stale and every following write conflicts too.
        const stale = committedRef.current;
        if (stale) {
          try {
            acceptDocument(await boardRepository.get(stale.board.boardId));
          } catch {
            // Leave the retained preview in place if the refresh itself fails.
          }
        }
        return null;
      }
    },
    [acceptDocument, queue],
  );

  const createItem = useCallback(
    async (
      itemType: BoardItemType,
      at: BoardPoint = { x: 0, y: 0 },
      shape?: BoardShapeType,
      initialPayload?: ItemPayload,
    ) => {
      const current = committedRef.current;
      if (!current) return null;
      const itemId = crypto.randomUUID();
      // A YouTube embed is 16:9; giving it the generic image box would letterbox it.
      const size = initialPayload?.videoId ? { width: 480, height: 270 } : itemSize(itemType);
      const payload = {
        ...defaultItemPayload(itemType),
        ...(shape ? { shape } : {}),
        ...(initialPayload ?? {}),
      };
      const newItem = {
        itemId,
        boardId: current.board.boardId,
        itemType,
        x: at.x - size.width / 2,
        y: at.y - size.height / 2,
        ...size,
        zIndex: Math.max(-1, ...current.items.map((item) => item.zIndex)) + 1,
        rotation: 0,
        payload,
        revision: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      } satisfies BoardItem;
      const mutations: BoardMutation[] = [
        {
          kind: "create",
          itemId,
          item: {
            itemType,
            x: newItem.x,
            y: newItem.y,
            ...size,
            zIndex: newItem.zIndex,
            rotation: 0,
            payload,
          },
        },
      ];
      const parent = nearestContainingFrame(
        newItem,
        current.items.filter((item) => item.itemType === "frame" && !item.deletedAt),
      );
      if (parent) {
        const parentPayload = readItemPayload(parent.payload);
        mutations.push({
          kind: "update",
          itemId: parent.itemId,
          expectedItemRevision: parent.revision,
          patch: {
            payload: {
              ...parentPayload,
              childIds: [...new Set([...(parentPayload.childIds ?? []), itemId])],
            },
          },
        });
      }
      const next = await applyMutations(mutations);
      return next ? itemId : null;
    },
    [applyMutations],
  );

  const previewItems = useCallback((items: BoardItem[]) => {
    setDocument((current) => (current ? { ...current, items } : current));
  }, []);

  const clearPreview = useCallback(() => {
    setDocument(committedRef.current);
  }, []);

  const updateItemPayload = useCallback(
    (itemId: string, payload: ItemPayload) => {
      const current = committedRef.current;
      const item = current?.items.find((candidate) => candidate.itemId === itemId);
      if (!current || !item) return;
      previewItems(current.items.map((candidate) => (candidate.itemId === itemId ? { ...candidate, payload } : candidate)));
      void applyMutations([
        { kind: "update", itemId, expectedItemRevision: item.revision, patch: { payload } },
      ]);
    },
    [applyMutations, previewItems],
  );

  const importItemAsset = useCallback(
    async (itemId: string, role: "image" | "drawing") => {
      const current = committedRef.current;
      const currentLease = leaseRef.current;
      const item = current?.items.find((candidate) => candidate.itemId === itemId);
      if (!current || !item || !currentLease?.editable || currentLease.leaseEpoch === null)
        return false;
      try {
        await queue.flush("surface-switch");
        localMutationRef.current = true;
        const asset = await boardRepository.importAsset(
          current.board.boardId,
          itemId,
          role,
          currentLease.leaseEpoch,
          current.board.revision,
        );
        if (!asset) return false;
        // Both the flush above and the import itself can advance revisions, so the
        // pre-flush snapshot is stale by now. Re-read the committed board and keep the
        // item's existing payload instead of resetting it to defaults.
        const fresh = await boardRepository.get(current.board.boardId);
        const freshItem = fresh.items.find((candidate) => candidate.itemId === itemId);
        if (!freshItem) return false;
        const fitted = fitToImage(asset.pixelWidth, asset.pixelHeight);
        const next = await boardRepository.updateItem(
          current.board.boardId,
          itemId,
          currentLease.leaseEpoch,
          fresh.board.revision,
          freshItem.revision,
          {
            payload: { ...readItemPayload(freshItem.payload), assetId: asset.assetId },
            // Keep the item centred where it was while taking the image's shape.
            x: freshItem.x + (freshItem.width - fitted.width) / 2,
            y: freshItem.y + (freshItem.height - fitted.height) / 2,
            ...fitted,
          },
        );
        acceptDocument(next);
        return true;
      } catch {
        setError("Board asset could not be imported");
        return false;
      } finally {
        localMutationRef.current = false;
      }
    },
    [acceptDocument, queue],
  );

  const exportBoard = useCallback(
    async (format: BoardExportFormat) => {
      try {
        await queue.flush("surface-switch");
        const current = committedRef.current;
        if (!current) return;
        const bytes = await encodeBoardExport(current, format);
        await boardRepository.export(current.board.boardId, format, bytes);
      } catch (error) {
        setError(
          `Board export failed: ${
            error instanceof Error ? error.message : "the board could not be encoded"
          }`,
        );
      }
    },
    [queue],
  );

  // Reuses the audited export destination picker rather than a browser download, which a
  // Tauri webview blocks. Bytes come from the authorized board-asset:// URL.
  const downloadItemImage = useCallback(
    async (itemId: string) => {
      const current = committedRef.current;
      const item = current?.items.find((candidate) => candidate.itemId === itemId);
      const assetId = item ? readItemPayload(item.payload).assetId : undefined;
      if (!current || !assetId) return;
      try {
        const url = boardAssetUrl(assetId);
        if (!url) return;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`asset ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        await boardRepository.export(current.board.boardId, "png", bytes);
      } catch {
        setError("Image could not be downloaded");
      }
    },
    [],
  );

  // Creates the item first so the canvas shows where the image will land, then fills it.
  // A failure removes the placeholder rather than leaving an empty box behind.
  const generateImage = useCallback(
    async (prompt: string, at: BoardPoint) => {
      const itemId = await createItem("image", at);
      if (!itemId) return "Could not create the image item.";
      setGeneratingItemIds((current) => [...current, itemId]);
      try {
        await queue.flush("surface-switch");
        const current = committedRef.current;
        const currentLease = leaseRef.current;
        if (!current || !currentLease?.editable || currentLease.leaseEpoch === null) {
          return "The board is read only.";
        }
        localMutationRef.current = true;
        const asset = await boardRepository.generateImage(
          current.board.boardId,
          itemId,
          prompt,
          currentLease.leaseEpoch,
          current.board.revision,
        );
        const fresh = await boardRepository.get(current.board.boardId);
        const item = fresh.items.find((candidate) => candidate.itemId === itemId);
        if (!item) return "The image item disappeared while generating.";
        const generated = fitToImage(asset.pixelWidth, asset.pixelHeight);
        acceptDocument(
          await boardRepository.updateItem(
            current.board.boardId,
            itemId,
            currentLease.leaseEpoch,
            fresh.board.revision,
            item.revision,
            {
              payload: { ...readItemPayload(item.payload), assetId: asset.assetId, alt: prompt },
              x: item.x + (item.width - generated.width) / 2,
              y: item.y + (item.height - generated.height) / 2,
              ...generated,
            },
          ),
        );
        return null;
      } catch (error) {
        const reason =
          typeof error === "object" && error && "message" in error
            ? String((error as { message: unknown }).message)
            : "Image generation failed";
        setError(reason);
        await applyMutations([{ kind: "softDelete", itemId, expectedItemRevision: 0 }]);
        return reason;
      } finally {
        localMutationRef.current = false;
        setGeneratingItemIds((current) => current.filter((id) => id !== itemId));
      }
    },
    [acceptDocument, applyMutations, createItem, queue],
  );

  /**
   * Drop images from the desktop onto the canvas. Each file becomes its own item, laid
   * out in a short cascade from the drop point so a multi-file drop does not stack
   * everything in one spot, and sized to the picture once the bytes are validated.
   */
  const dropImageFiles = useCallback(
    async (files: File[], at: BoardPoint) => {
      const images = files.filter((file) => /^image\/(png|jpeg)$/.test(file.type));
      if (images.length === 0) {
        if (files.length > 0) setError("Only PNG and JPEG images can be dropped on a board");
        return;
      }
      for (const [index, file] of images.entries()) {
        const offset = index * 24;
        const itemId = await createItem("image", { x: at.x + offset, y: at.y + offset });
        if (!itemId) return;
        setGeneratingItemIds((current) => [...current, itemId]);
        try {
          await queue.flush("surface-switch");
          const current = committedRef.current;
          const currentLease = leaseRef.current;
          if (!current || !currentLease?.editable || currentLease.leaseEpoch === null) return;
          localMutationRef.current = true;
          const bytes = new Uint8Array(await file.arrayBuffer());
          const asset = await boardRepository.importAssetBytes(
            current.board.boardId,
            itemId,
            bytes,
            currentLease.leaseEpoch,
            current.board.revision,
          );
          const fresh = await boardRepository.get(current.board.boardId);
          const item = fresh.items.find((candidate) => candidate.itemId === itemId);
          if (!item) return;
          const fitted = fitToImage(asset.pixelWidth, asset.pixelHeight);
          acceptDocument(
            await boardRepository.updateItem(
              current.board.boardId,
              itemId,
              currentLease.leaseEpoch,
              fresh.board.revision,
              item.revision,
              {
                payload: {
                  ...readItemPayload(item.payload),
                  assetId: asset.assetId,
                  alt: file.name,
                },
                x: item.x + (item.width - fitted.width) / 2,
                y: item.y + (item.height - fitted.height) / 2,
                ...fitted,
              },
            ),
          );
        } catch {
          setError(`${file.name} could not be added to the board`);
          await applyMutations([{ kind: "softDelete", itemId, expectedItemRevision: 0 }]);
        } finally {
          localMutationRef.current = false;
          setGeneratingItemIds((current) => current.filter((id) => id !== itemId));
        }
      }
    },
    [acceptDocument, applyMutations, createItem, queue],
  );

  const takeOver = useCallback(async () => {
    const current = committedRef.current;
    if (!current || !lease?.expired) return;
    try {
      setLease(await boardRepository.acquireLease(current.board.boardId, true));
    } catch {
      setError("Editing takeover failed");
    }
  }, [lease?.expired]);

  return {
    boards,
    document,
    lease,
    saveState,
    error,
    externalRevision,
    selectBoard,
    createBoard,
    renameBoard,
    updateViewport,
    setDotDensity,
    createItem,
    applyMutations,
    previewItems,
    clearPreview,
    updateItemPayload,
    importItemAsset,
    exportBoard,
    downloadItemImage,
    generateImage,
    generatingItemIds,
    dropImageFiles,
    takeOver,
  };
}
