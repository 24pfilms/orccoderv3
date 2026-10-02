// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardFlushCoordinator } from "../flush";
import { boardRepository, type BoardDocument } from "../repository";
import { useBoardDocument } from "./useBoardDocument";

vi.mock("../repository", () => ({
  boardRepository: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    acquireLease: vi.fn(),
    releaseLease: vi.fn(),
    onChanged: vi.fn(),
    createItem: vi.fn(),
    applyItems: vi.fn(),
    updateItem: vi.fn(),
    updateSettings: vi.fn(),
    importAsset: vi.fn(),
  },
}));

const emptyDocument: BoardDocument = {
  board: {
    boardId: "board",
    name: "Board",
    description: null,
    revision: 0,
    updatedAt: "0",
    deletedAt: null,
  },
  backgroundColor: "#101216",
  dotDensity: 16,
  toolbarPosition: "bottom",
  panX: 0,
  panY: 0,
  zoom: 1,
  items: [],
};

function setupRepository() {
  vi.mocked(boardRepository.list).mockResolvedValue([emptyDocument.board]);
  vi.mocked(boardRepository.get).mockResolvedValue(emptyDocument);
  vi.mocked(boardRepository.acquireLease).mockResolvedValue({
    editable: true,
    leaseEpoch: 1,
    ownerWindowLabel: null,
    expired: false,
  });
  vi.mocked(boardRepository.releaseLease).mockResolvedValue();
  vi.mocked(boardRepository.onChanged).mockResolvedValue(() => {});
}

afterEach(() => vi.clearAllMocks());

describe("useBoardDocument item persistence", () => {
  it("creates an item through the fenced repository mutation", async () => {
    setupRepository();
    const created = {
      ...emptyDocument,
      board: { ...emptyDocument.board, revision: 1 },
      items: [
        {
          itemId: "note",
          boardId: "board",
          itemType: "sticky_note" as const,
          x: 80,
          y: 80,
          width: 200,
          height: 160,
          zIndex: 0,
          rotation: 0,
          payload: { text: "New note", color: "#f6d365" },
          revision: 0,
          createdAt: "1",
          updatedAt: "1",
          deletedAt: null,
        },
      ],
    };
    vi.mocked(boardRepository.applyItems).mockResolvedValue(created);
    const coordinator = new BoardFlushCoordinator(() => {});
    const { result, unmount } = renderHook(() => useBoardDocument(coordinator));
    await waitFor(() => expect(result.current.document).not.toBeNull());
    await act(() => result.current.createItem("sticky_note"));
    expect(boardRepository.applyItems).toHaveBeenCalledWith(
      "board",
      1,
      0,
      [
        expect.objectContaining({
          kind: "create",
          item: expect.objectContaining({ itemType: "sticky_note" }),
        }),
      ],
    );
    expect(result.current.document?.items).toHaveLength(1);
    unmount();
  });
});
