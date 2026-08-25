import { createContext, useContext, type ReactNode } from "react";
import { BoardCanvas } from "./BoardCanvas";
import { BoardManager } from "./BoardManager";
import type { BoardFlushCoordinator } from "./flush";
import { useBoardDocument } from "./hooks/useBoardDocument";
import "./board.css";

const BoardFlushContext = createContext<BoardFlushCoordinator | null>(null);

export function useBoardFlushCoordinator(): BoardFlushCoordinator {
  const coordinator = useContext(BoardFlushContext);
  if (!coordinator) throw new Error("Board flush coordinator is unavailable");
  return coordinator;
}

interface WorkspaceSurfaceProps {
  boardEnabled: boolean;
  hidden: boolean;
  children: ReactNode;
}

export function WorkspaceSurface({
  boardEnabled,
  hidden,
  children,
}: WorkspaceSurfaceProps): React.ReactElement {
  if (!boardEnabled) return <>{children}</>;

  return (
    <div
      className="workspace-surface"
      hidden={hidden}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      {children}
    </div>
  );
}

function BoardContent({ flushCoordinator }: { flushCoordinator: BoardFlushCoordinator }) {
  const {
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
    createItem,
    applyMutations,
    previewItems,
    clearPreview,
    updateItemPayload,
    importItemAsset,
    exportBoard,
    downloadItemImage,
    generateImage,
    takeOver,
  } = useBoardDocument(flushCoordinator);
  return (
    <section className="board-surface" aria-label="Board Mode">
      <header className="board-shell-header">
        <BoardManager
          boards={boards}
          selectedBoardId={document?.board.boardId ?? null}
          disabled={saveState === "saving"}
          onSelect={(boardId) => void selectBoard(boardId)}
          onCreate={(name) => void createBoard(name)}
          onRename={(boardId, name) => void renameBoard(boardId, name)}
        />
        <span role="status">
          {error ??
            (lease?.editable
              ? saveState
              : `Read only${lease?.ownerWindowLabel ? ` — ${lease.ownerWindowLabel}` : ""}`)}
        </span>
        {lease?.expired && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void takeOver()}>
            Take over editing
          </button>
        )}
      </header>
      {document ? (
        <BoardCanvas
          key={document.board.boardId}
          document={document}
          editable={lease?.editable === true}
          externalRevision={externalRevision}
          onViewportChange={updateViewport}
          onCreateItem={createItem}
          onApplyMutations={applyMutations}
          onPreviewItems={previewItems}
          onClearPreview={clearPreview}
          onItemPayloadChange={updateItemPayload}
          onImportAsset={importItemAsset}
          onExport={(format) => void exportBoard(format)}
          onDownloadImage={(itemId) => void downloadItemImage(itemId)}
          onGenerateImage={generateImage}
        />
      ) : (
        <div className="board-surface-empty">{error ?? "Loading board…"}</div>
      )}
    </section>
  );
}

export function BoardSurface({
  flushCoordinator,
}: {
  flushCoordinator: BoardFlushCoordinator;
}): React.ReactElement {
  return (
    <BoardFlushContext.Provider value={flushCoordinator}>
      <BoardContent flushCoordinator={flushCoordinator} />
    </BoardFlushContext.Provider>
  );
}
