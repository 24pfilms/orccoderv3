import { useState } from "react";
import { Download } from "lucide-react";
import type { BoardExportFormat } from "./export";

export function BoardExportMenu({
  disabled,
  onExport,
}: {
  disabled: boolean;
  onExport: (format: BoardExportFormat) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="board-export-menu">
      <button
        type="button"
        className="board-tool-button"
        aria-label="Export board"
        aria-expanded={open}
        aria-controls="board-export-formats"
        title="Export"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Download aria-hidden="true" />
      </button>
      {open && (
        <div id="board-export-formats" role="menu" aria-label="Export format">
          {(["png", "jpg", "pdf", "csv"] as const).map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport(format);
              }}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
