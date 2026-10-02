import type { BoardShapeType } from "../interactions/types";

export const SHAPE_POLYGONS: Partial<Record<BoardShapeType, ReadonlyArray<readonly [number, number]>>> = {
  triangle: [[0.5, 0.02], [0.98, 0.98], [0.02, 0.98]],
  diamond: [[0.5, 0.02], [0.98, 0.5], [0.5, 0.98], [0.02, 0.5]],
  hexagon: [[0.25, 0.02], [0.75, 0.02], [0.98, 0.5], [0.75, 0.98], [0.25, 0.98], [0.02, 0.5]],
};

export function isLinearShape(shape: BoardShapeType): boolean {
  return shape === "line" || shape === "arrow" || shape === "double_arrow";
}

export function traceBoardShape(
  context: CanvasRenderingContext2D,
  shape: BoardShapeType,
  width: number,
  height: number,
): void {
  context.beginPath();
  const polygon = SHAPE_POLYGONS[shape];
  if (polygon) {
    polygon.forEach(([x, y], index) => index === 0 ? context.moveTo(x * width, y * height) : context.lineTo(x * width, y * height));
    context.closePath();
  } else if (shape === "ellipse") {
    context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (shape === "rounded_rectangle") {
    const radius = Math.min(width, height) * 0.12;
    context.moveTo(radius, 0);
    context.lineTo(width - radius, 0);
    context.quadraticCurveTo(width, 0, width, radius);
    context.lineTo(width, height - radius);
    context.quadraticCurveTo(width, height, width - radius, height);
    context.lineTo(radius, height);
    context.quadraticCurveTo(0, height, 0, height - radius);
    context.lineTo(0, radius);
    context.quadraticCurveTo(0, 0, radius, 0);
    context.closePath();
  } else if (isLinearShape(shape)) {
    context.moveTo(width * 0.07, height * 0.5);
    context.lineTo(width * 0.93, height * 0.5);
  } else {
    context.rect(0, 0, width, height);
  }
}

export function drawCanvasArrowheads(
  context: CanvasRenderingContext2D,
  shape: BoardShapeType,
  width: number,
  height: number,
): void {
  if (shape === "line") return;
  const size = Math.min(18, Math.max(7, height * 0.22));
  const draw = (x: number, direction: number) => {
    context.beginPath();
    context.moveTo(x, height / 2);
    context.lineTo(x - size * direction, height / 2 - size * 0.65);
    context.lineTo(x - size * direction, height / 2 + size * 0.65);
    context.closePath();
    context.fill();
  };
  draw(width * 0.93, 1);
  if (shape === "double_arrow") draw(width * 0.07, -1);
}
