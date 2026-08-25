// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BoardShapeType } from "../interactions/types";
import { BoardShape } from "./BoardShape";

const shapes: BoardShapeType[] = [
  "rectangle",
  "rounded_rectangle",
  "ellipse",
  "triangle",
  "diamond",
  "hexagon",
  "line",
  "arrow",
  "double_arrow",
];

describe("BoardShape", () => {
  it.each(shapes)("renders characterized %s geometry", (shape) => {
    const { container } = render(<BoardShape shape={shape} label="Safe <text>" />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
      `${shape.replace("_", " ")} shape`,
    );
    expect(container.textContent).toContain("Safe <text>");
    expect(container.querySelector("script")).toBeNull();
  });

  it("keeps arrowheads in the shared SVG geometry", () => {
    const { container, rerender } = render(<BoardShape shape="arrow" />);
    expect(container.querySelector("path[marker-end]")).toBeTruthy();
    rerender(<BoardShape shape="double_arrow" />);
    expect(container.querySelector("path[marker-start]")).toBeTruthy();
    expect(container.querySelector("path[marker-end]")).toBeTruthy();
  });
});
