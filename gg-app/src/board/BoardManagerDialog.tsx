import { Check, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSummary } from "./repository";

interface BoardManagerDialogProps {
  boards: BoardSummary[];
  selectedBoardId: string | null;
  disabled: boolean;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => void;
  onRename: (boardId: string, name: string) => void;
  onClose: () => void;
}

/** Board timestamps are epoch-millisecond strings; show them as something readable. */
function formatUpdated(value: string): string {
  const millis = Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return "";
  const date = new Date(millis);
  const dayMillis = 86_400_000;
  const elapsed = Date.now() - millis;
  if (elapsed < 60_000) return "just now";
  if (elapsed < dayMillis) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (elapsed < dayMillis * 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function BoardManagerDialog({
  boards,
  selectedBoardId,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onClose,
}: BoardManagerDialogProps): React.ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  const commitRename = () => {
    const next = renameValue.trim();
    if (renamingId && next) onRename(renamingId, next);
    setRenamingId(null);
  };

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
          <h2 id="board-manager-title">Boards</h2>
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
              {renamingId === board.boardId ? (
                <form
                  className="board-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitRename();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Board name"
                    maxLength={120}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                  />
                  <button type="submit" aria-label="Save board name" disabled={!renameValue.trim()}>
                    <Check aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <div
                  className="board-card"
                  data-selected={board.boardId === selectedBoardId || undefined}
                >
                  <button
                    type="button"
                    className="board-card-open"
                    disabled={disabled}
                    onClick={() => {
                      onSelect(board.boardId);
                      onClose();
                    }}
                  >
                    <strong>{board.name}</strong>
                    <span>{formatUpdated(board.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="board-card-rename"
                    aria-label={`Rename ${board.name}`}
                    title="Rename"
                    disabled={disabled}
                    onClick={() => {
                      setRenamingId(board.boardId);
                      setRenameValue(board.name);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
          {filteredBoards.length === 0 ? (
            <li className="board-manager-empty">No boards match “{query}”.</li>
          ) : null}
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
              <input
                autoFocus
                aria-label="Board name"
                placeholder="Board name"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCreating(false);
                }}
              />
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              {/* Short visible label for the compact footer, full name for assistive tech. */}
              <button
                type="submit"
                className="is-primary"
                aria-label="Create board"
                disabled={!name.trim()}
              >
                Create
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="is-primary"
              disabled={disabled}
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden="true" />
              New board
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
