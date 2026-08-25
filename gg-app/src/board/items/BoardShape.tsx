import { useId } from "react";
import type { BoardShapeType } from "../interactions/types";
import { isLinearShape, SHAPE_POLYGONS } from "./shapeGeometry";

interface BoardShapeProps {
  shape: BoardShapeType;
  fill?: string;
  stroke?: string;
  color?: string;
  label?: string;
  fontSize?: number;
  className?: string;
}

export function BoardShape({
  shape,
  fill = "transparent",
  stroke = "currentColor",
  color = "currentColor",
  label,
  fontSize = 14,
  className,
}: BoardShapeProps): React.ReactElement {
  const markerId = `board-arrow-${useId().replace(/:/g, "")}`;
  const isLine = isLinearShape(shape);
  const polygon = SHAPE_POLYGONS[shape];
  let geometry: React.ReactNode;
  if (polygon) {
    geometry = <polygon points={polygon.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")} />;
  } else if (shape === "rounded_rectangle") {
    geometry = <rect x="2" y="2" width="96" height="96" rx="12" />;
  } else if (shape === "ellipse") {
    geometry = <ellipse cx="50" cy="50" rx="48" ry="48" />;
  } else if (isLine) {
    geometry = (
      <>
        <path d="M7 50H93" className="board-shape-hit-target" />
        <path
          d="M7 50H93"
          fill="none"
          markerStart={shape === "double_arrow" ? `url(#${markerId})` : undefined}
          markerEnd={shape !== "line" ? `url(#${markerId})` : undefined}
        />
      </>
    );
  } else {
    geometry = <rect x="2" y="2" width="96" height="96" />;
  }
  return (
    <svg
      className={className}
      role="img"
      aria-label={`${shape.replace("_", " ")} shape`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M0 0L10 5L0 10Z" fill={stroke} stroke="none" />
        </marker>
      </defs>
      <g fill={isLine ? "none" : fill} stroke={stroke} strokeWidth="2">
        {geometry}
      </g>
      {label ? (
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          stroke="none"
          fontSize={fontSize}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}
