import { useId } from "react";
import type { BoardShapeType } from "../interactions/types";
import { isLinearShape, SHAPE_POLYGONS } from "./shapeGeometry";

interface BoardShapeProps {
  shape: BoardShapeType;
  fill?: string;
  stroke?: string;
  className?: string;
}

/**
 * A shape's rim is the same hue as its fill, mixed toward white. One colour control then
 * drives both, and a recoloured shape keeps a rim that belongs to it — a fixed white or
 * blue outline looks wrong the moment the fill changes.
 */
function deriveRim(fill: string): string {
  return fill === "transparent"
    ? "currentColor"
    : `color-mix(in srgb, ${fill} 58%, white)`;
}

export function BoardShape({
  shape,
  fill = "transparent",
  stroke,
  className,
}: BoardShapeProps): React.ReactElement {
  const rim = stroke ?? deriveRim(fill);
  const rawId = useId().replace(/:/g, "");
  const markerId = `board-arrow-${rawId}`;
  const sheenId = `board-sheen-${rawId}`;
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
          <path d="M0 0L10 5L0 10Z" fill={rim} stroke="none" />
        </marker>
        {/* A light-from-above sheen laid over the flat fill. Kept as a neutral
            white/black overlay so it works with any fill colour the user picks. */}
        <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          {/* Opacity is set in CSS, not here: var() does not resolve inside SVG
              presentation attributes, only in CSS declarations. */}
          <stop className="board-sheen-top" offset="0%" stopColor="#fff" />
          <stop className="board-sheen-mid" offset="45%" stopColor="#fff" />
          <stop className="board-sheen-bottom" offset="100%" stopColor="#000" />
        </linearGradient>
      </defs>
      {/* non-scaling-stroke keeps the outline an even weight however the shape is
          stretched; without it a wide rectangle renders fat vertical edges and thin
          horizontal ones. Round joins soften the polygon corners. */}
      <g
        fill={isLine ? "none" : fill}
        style={{ stroke: rim }}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      >
        {geometry}
      </g>
      {isLine ? null : (
        <g fill={`url(#${sheenId})`} stroke="none" style={{ pointerEvents: "none" }}>
          {geometry}
        </g>
      )}
    </svg>
  );
}
