// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBoardViewport, zoomAtPoint } from "./useBoardViewport";

describe("Board viewport", () => {
  it("keeps the canvas point under the cursor fixed while zooming", () => {
    const next = zoomAtPoint({ panX: 100, panY: 50, zoom: 1 }, { x: 300, y: 250 }, 1.12);
    expect(next.panX).toBeCloseTo(76);
    expect(next.panY).toBeCloseTo(26);
    expect(next.zoom).toBe(1.12);
    expect((300 - next.panX) / next.zoom).toBeCloseTo(200);
    expect((250 - next.panY) / next.zoom).toBeCloseTo(200);
  });

  it("clamps zoom to native store limits", () => {
    expect(zoomAtPoint({ panX: 0, panY: 0, zoom: 1 }, { x: 0, y: 0 }, 100).zoom).toBe(8);
    expect(zoomAtPoint({ panX: 0, panY: 0, zoom: 1 }, { x: 0, y: 0 }, 0).zoom).toBe(0.05);
  });

  it("synchronizes state and imperative reads when the initial viewport changes", () => {
    const initial = { panX: 0, panY: 0, zoom: 1 };
    const { result, rerender } = renderHook(
      ({ viewport }) => useBoardViewport(viewport),
      { initialProps: { viewport: initial } },
    );
    const next = { panX: 80, panY: 40, zoom: 2 };
    rerender({ viewport: next });
    expect(result.current.viewport).toEqual(next);
    act(() => result.current.panBy(20, 10));
    expect(result.current.viewport).toEqual({ panX: 100, panY: 50, zoom: 2 });
  });
});
