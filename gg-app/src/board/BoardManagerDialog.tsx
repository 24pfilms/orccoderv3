import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSummary } from "./repository";

interface BoardManagerDialogProps {
  boards: BoardSummary[];
  selectedBoardId: string | null;
  disabled: boolean;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}

export function BoardManagerDialog({
  boards,
  selectedBoardId,
  disabled,
  onSelect,
  onCreate,
  onClose,
}: BoardManagerDialogProps): React.ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);
  const filteredBoards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? boards.filter((board) => board.name.toLocaleLowerCase().includes(normalized))
      : boards;
  }, [boards, query]);

  return (
    <dialog
      ref={dialogRef}
      className="board-manager-dialog"
      aria-labelledby="board-manager-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="board-manager-panel">
        <header>
          <div>
            <h2 id="board-manager-title">Boards</h2>
            <p>Open a board or create a new workspace.</p>
          </div>
          <button type="button" aria-label="Close board manager" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <label className="board-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search boards</span>
          <input
            autoFocus
            type="search"
            placeholder="Search boards"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <ul className="board-manager-cards" aria-label="Available boards">
          {filteredBoards.map((board) => (
            <li key={board.boardId}>
              <button
                type="button"
                data-selected={board.boardId === selectedBoardId || undefined}
                disabled={disabled}
                onClick={() => {
                  onSelect(board.boardId);
                  onClose();
                }}
              >
                <strong>{board.name}</strong>
                <span>Updated {board.updatedAt}</span>
              </button>
            </li>
          ))}
          {filteredBoards.length === 0 ? <li className="board-manager-empty">No boards match “{query}”.</li> : null}
        </ul>
        <footer>
          {creating ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const nextName = name.trim();
                if (!nextName) return;
                onCreate(nextName);
                onClose();
              }}
            >
              <label>
                <span>Board name</span>
                <input
                  autoFocus
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <button type="button" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="is-primary" disabled={!name.trim()}>Create board</button>
            </form>
          ) : (
            <button type="button" className="is-primary" disabled={disabled} onClick={() => setCreating(true)}>
              New board
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
