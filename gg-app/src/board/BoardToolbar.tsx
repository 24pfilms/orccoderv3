import { useState } from "react";
import {
  BoxSelect,
  ChevronDown,
  Frame,
  Image,
  MousePointer2,
  MoveRight,
  Pencil,
  Redo2,
  Shapes,
  StickyNote,
  Type,
  Undo2,
} from "lucide-react";
import type { BoardShapeType, BoardTool } from "./interactions/types";

const shapes: Array<[BoardShapeType, string]> = [
  ["rectangle", "Rectangle"],
  ["rounded_rectangle", "Rounded rectangle"],
  ["ellipse", "Ellipse"],
  ["triangle", "Triangle"],
  ["diamond", "Diamond"],
  ["hexagon", "Hexagon"],
  ["line", "Line"],
  ["arrow", "Arrow"],
  ["double_arrow", "Double arrow"],
];

interface BoardToolbarProps {
  tool: BoardTool;
  position: string;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: BoardTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  children?: React.ReactNode;
}

export function BoardToolbar({
  tool,
  position,
  disabled,
  canUndo,
  canRedo,
  onToolChange,
  onUndo,
  onRedo,
  children,
}: BoardToolbarProps): React.ReactElement {
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const button = (
    label: string,
    nextTool: BoardTool,
    icon: React.ReactNode,
    shortcut?: string,
  ) => (
    <button
      type="button"
      className="board-tool-button"
      data-active={JSON.stringify(tool) === JSON.stringify(nextTool)}
      aria-label={label}
      aria-pressed={JSON.stringify(tool) === JSON.stringify(nextTool)}
      title={`${label}${shortcut ? ` (${shortcut})` : ""}`}
      disabled={disabled && nextTool.kind !== "select"}
      onClick={() => onToolChange(nextTool)}
    >
      {icon}
    </button>
  );

  return (
    <nav
      className="board-toolbar"
      data-position={position}
      aria-label="Board tools"
    >
      <div className="board-toolbar-scroll">
        <div className="board-tool-group">
          {button("Select", { kind: "select" }, <MousePointer2 aria-hidden="true" />, "V")}
          {button("Sticky note", { kind: "place", itemType: "sticky_note" }, <StickyNote aria-hidden="true" />, "N")}
          {button("Text", { kind: "place", itemType: "text" }, <Type aria-hidden="true" />, "T")}
        </div>
        <span className="board-toolbar-divider" aria-hidden="true" />
        <div className="board-tool-group board-shape-control">
          <button
            type="button"
            className="board-tool-button board-tool-split"
            data-active={tool.kind === "place" && tool.itemType === "shape"}
            aria-label="Shapes"
            aria-expanded={shapeMenuOpen}
            title="Shapes"
            disabled={disabled}
            onClick={() => setShapeMenuOpen((open) => !open)}
          >
            <Shapes aria-hidden="true" />
            <ChevronDown aria-hidden="true" />
          </button>
          {shapeMenuOpen ? (
            <div className="board-shape-menu" role="menu" aria-label="Shape type">
              {shapes.map(([shape, label]) => (
                <button
                  key={shape}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToolChange({ kind: "place", itemType: "shape", shape });
                    setShapeMenuOpen(false);
                  }}
                >
                  <BoxSelect aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {button("Frame", { kind: "place", itemType: "frame" }, <Frame aria-hidden="true" />, "F")}
          {button("Arrow", { kind: "place", itemType: "arrow" }, <MoveRight aria-hidden="true" />, "A")}
          {button("Image", { kind: "place", itemType: "image" }, <Image aria-hidden="true" />, "I")}
          {button("Pen", { kind: "pen", color: "#e5e7eb" }, <Pencil aria-hidden="true" />, "P")}
        </div>
        <span className="board-toolbar-divider" aria-hidden="true" />
        <div className="board-tool-group">
          <button type="button" className="board-tool-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <Undo2 aria-hidden="true" />
          </button>
          <button type="button" className="board-tool-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
            <Redo2 aria-hidden="true" />
          </button>
        </div>
        {children ? <><span className="board-toolbar-divider" aria-hidden="true" />{children}</> : null}
      </div>
    </nav>
  );
}
