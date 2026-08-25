import { ChevronDown, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { BoardManagerDialog } from "./BoardManagerDialog";
import type { BoardSummary } from "./repository";

interface BoardManagerProps {
  boards: BoardSummary[];
  selectedBoardId: string | null;
  disabled: boolean;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => void;
  onRename: (boardId: string, name: string) => void;
}

export function BoardManager({
  boards,
  selectedBoardId,
  disabled,
  onSelect,
  onCreate,
  onRename,
}: BoardManagerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const selected = boards.find((board) => board.boardId === selectedBoardId);
  return (
    <div className="board-manager">
      <button
        type="button"
        className="board-name-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!selectedBoardId}
        onClick={() => setOpen(true)}
      >
        <LayoutDashboard aria-hidden="true" />
        <span>{selected?.name ?? "Board"}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <BoardManagerDialog
          boards={boards}
          selectedBoardId={selectedBoardId}
          disabled={disabled}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
