import { LayoutDashboard } from "lucide-react";
import type { WindowSurface } from "./agent";

interface BoardModeButtonProps {
  surface: WindowSurface;
  disabled?: boolean;
  onChange: (surface: WindowSurface) => void;
}

export function BoardModeButton({
  surface,
  disabled = false,
  onChange,
}: BoardModeButtonProps): React.ReactElement {
  const boardActive = surface === "board";
  const nextSurface = boardActive ? "workspace" : "board";
  const label = boardActive ? "Workspace" : "Board";

  return (
    <button
      type="button"
      className={`btn btn-sm ${boardActive ? "btn-primary" : "btn-ghost"}`}
      aria-pressed={boardActive}
      disabled={disabled}
      title={`Switch to ${label}`}
      onClick={() => onChange(nextSurface)}
    >
      <LayoutDashboard size={14} aria-hidden="true" />
      {label}
    </button>
  );
}
