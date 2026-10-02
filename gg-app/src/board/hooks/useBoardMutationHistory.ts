import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BoardHistoryEntry,
  BoardMutation,
  ItemPatch,
  MutationTemplate,
} from "../interactions/types";
import type { BoardDocument, BoardItem } from "../repository";

const HISTORY_LIMIT = 100;
const CLIPBOARD_ITEM_LIMIT = 200;
const CLIPBOARD_BYTE_LIMIT = 1_048_576;

function hydrateTemplates(
  templates: MutationTemplate[],
  document: BoardDocument,
): BoardMutation[] | null {
  const items = new Map(document.items.map((item) => [item.itemId, item]));
  const mutations: BoardMutation[] = [];
  for (const template of templates) {
    if (template.kind === "create" && template.item) {
      mutations.push({ kind: "create", itemId: template.itemId, item: template.item });
      continue;
    }
    const item = items.get(template.itemId);
    if (!item) return null;
    if (template.kind === "update" && template.patch) {
      mutations.push({
        kind: "update",
        itemId: item.itemId,
        expectedItemRevision: item.revision,
        patch: template.patch,
      });
    } else if (template.kind === "softDelete") {
      mutations.push({
        kind: "softDelete",
        itemId: item.itemId,
        expectedItemRevision: item.revision,
      });
    } else if (template.kind === "restore") {
      mutations.push({
        kind: "restore",
        itemId: item.itemId,
        expectedItemRevision: item.revision,
      });
    } else {
      return null;
    }
  }
  return mutations;
}

export function patchFromItem(item: BoardItem): Required<ItemPatch> {
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    zIndex: item.zIndex,
    rotation: item.rotation,
    payload: item.payload,
  };
}

export function updateHistoryEntry(
  label: string,
  before: BoardItem[],
  after: BoardItem[],
): BoardHistoryEntry {
  const beforeById = new Map(before.map((item) => [item.itemId, item]));
  return {
    label,
    forward: after.map((item) => ({ kind: "update", itemId: item.itemId, patch: patchFromItem(item) })),
    reverse: after.map((item) => {
      const original = beforeById.get(item.itemId);
      if (!original) throw new Error(`Missing original board item ${item.itemId}`);
      return { kind: "update", itemId: item.itemId, patch: patchFromItem(original) };
    }),
  };
}

export function deleteHistoryEntry(items: BoardItem[]): BoardHistoryEntry {
  return {
    label: items.length === 1 ? "Delete item" : `Delete ${items.length} items`,
    forward: items.map((item) => ({ kind: "softDelete", itemId: item.itemId })),
    reverse: items.map((item) => ({ kind: "restore", itemId: item.itemId })),
  };
}

export class BoardClipboard {
  private items: BoardItem[] = [];
  private pasteCount = 0;

  copy(items: BoardItem[]): boolean {
    const bounded = items.slice(0, CLIPBOARD_ITEM_LIMIT);
    if (JSON.stringify(bounded).length > CLIPBOARD_BYTE_LIMIT) return false;
    this.items = structuredClone(bounded);
    this.pasteCount = 0;
    return true;
  }

  paste(): BoardItem[] {
    this.pasteCount += 1;
    const offset = 20 * this.pasteCount;
    return structuredClone(this.items).map((item) => ({
      ...item,
      itemId: crypto.randomUUID(),
      x: item.x + offset,
      y: item.y + offset,
      revision: 0,
      deletedAt: null,
    }));
  }

  get hasItems(): boolean {
    return this.items.length > 0;
  }
}

interface MutationHistoryOptions {
  document: BoardDocument | null;
  externalRevision: number;
  applyMutations: (mutations: BoardMutation[]) => Promise<BoardDocument | null>;
}

export function useBoardMutationHistory({
  document,
  externalRevision,
  applyMutations,
}: MutationHistoryOptions) {
  const [past, setPast] = useState<BoardHistoryEntry[]>([]);
  const [future, setFuture] = useState<BoardHistoryEntry[]>([]);
  const documentRef = useRef(document);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  useEffect(() => {
    if (externalRevision > 0) clear();
  }, [clear, externalRevision]);

  const record = useCallback((entry: BoardHistoryEntry) => {
    setPast((entries) => [...entries.slice(-(HISTORY_LIMIT - 1)), entry]);
    setFuture([]);
  }, []);

  const execute = useCallback(
    async (entry: BoardHistoryEntry) => {
      const current = documentRef.current;
      if (!current) return false;
      const mutations = hydrateTemplates(entry.forward, current);
      if (!mutations || !(await applyMutations(mutations))) return false;
      record(entry);
      return true;
    },
    [applyMutations, record],
  );

  const undo = useCallback(async () => {
    const entry = past[past.length - 1];
    const current = documentRef.current;
    if (!entry || !current) return false;
    const mutations = hydrateTemplates(entry.reverse, current);
    if (!mutations || !(await applyMutations(mutations))) return false;
    setPast((entries) => entries.slice(0, -1));
    setFuture((entries) => [entry, ...entries]);
    return true;
  }, [applyMutations, past]);

  const redo = useCallback(async () => {
    const entry = future[0];
    const current = documentRef.current;
    if (!entry || !current) return false;
    const mutations = hydrateTemplates(entry.forward, current);
    if (!mutations || !(await applyMutations(mutations))) return false;
    setFuture((entries) => entries.slice(1));
    setPast((entries) => [...entries.slice(-(HISTORY_LIMIT - 1)), entry]);
    return true;
  }, [applyMutations, future]);

  return {
    execute,
    record,
    undo,
    redo,
    clear,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label ?? null,
    redoLabel: future[0]?.label ?? null,
  };
}
