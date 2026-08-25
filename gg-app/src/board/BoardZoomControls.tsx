import { Focus, Minus, Plus, Scan } from "lucide-react";

interface BoardZoomControlsProps {
  zoom: number;
  disabled?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
  onFit: () => void;
}

export function BoardZoomControls({
  zoom,
  disabled = false,
  onZoomIn,
  onZoomOut,
  onActualSize,
  onFit,
}: BoardZoomControlsProps): React.ReactElement {
  return (
    <div className="board-zoom-controls" role="toolbar" aria-label="Board zoom">
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled} onClick={onZoomOut}>
        <Minus aria-hidden="true" />
      </button>
      <output aria-label="Board zoom level">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={disabled} onClick={onZoomIn}>
        <Plus aria-hidden="true" />
      </button>
      <span aria-hidden="true" />
      <button type="button" aria-label="Actual size" title="100%" disabled={disabled} onClick={onActualSize}>
        <Scan aria-hidden="true" />
      </button>
      <button type="button" aria-label="Fit to content" title="Fit to content" disabled={disabled} onClick={onFit}>
        <Focus aria-hidden="true" />
      </button>
    </div>
  );
}
