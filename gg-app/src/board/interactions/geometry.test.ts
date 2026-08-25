import { describe, expect, it } from "vitest";
import type { BoardItem } from "../repository";
import {
  boundsForItems,
  fitViewport,
  frameDescendantIds,
  intersects,
  itemsWithFrameDescendants,
  nearestContainingFrame,
  normalizeBounds,
  projectToMinimap,
  reconcileFrameMembership,
  resizeBounds,
  rotationDegrees,
  scaleItems,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
} from "./geometry";

function item(itemId: string, x: number, y: number, width = 100, height = 100, payload: unknown = {}): BoardItem {
  return {
    itemId,
    boardId: "board",
    itemType: "shape",
    x,
    y,
    width,
    height,
    zIndex: 0,
    rotation: 0,
    payload,
    revision: 0,
    createdAt: "0",
    updatedAt: "0",
    deletedAt: null,
  };
}

describe("board geometry", () => {
  it("converts screen and negative world coordinates without drift", () => {
    const viewport = { panX: 205, panY: 100, zoom: 2 };
    expect(screenToWorld({ x: 5, y: 0 }, viewport)).toEqual({ x: -100, y: -50 });
    expect(worldToScreen({ x: -100, y: -50 }, viewport)).toEqual({ x: 5, y: 0 });
  });

  it("keeps the cursor anchored while clamping zoom", () => {
    expect(zoomAtPoint({ panX: 10, panY: 20, zoom: 1 }, { x: 110, y: 120 }, 2)).toEqual({
      panX: -90,
      panY: -80,
      zoom: 2,
    });
    expect(zoomAtPoint({ panX: 0, panY: 0, zoom: 1 }, { x: 0, y: 0 }, 99).zoom).toBe(8);
  });

  it("normalizes and intersects a marquee", () => {
    const marquee = normalizeBounds({ x: 50, y: 50 }, { x: -10, y: -20 });
    expect(marquee).toEqual({ x: -10, y: -20, width: 60, height: 70 });
    expect(intersects(marquee, { x: 40, y: 40, width: 20, height: 20 })).toBe(true);
    expect(intersects(marquee, { x: 51, y: 51, width: 20, height: 20 })).toBe(false);
  });

  it("fits actual bounds with padding and centers an empty board", () => {
    expect(fitViewport({ x: 0, y: 0, width: 1000, height: 500 }, { width: 1440, height: 900 }, 100)).toEqual({
      panX: 220,
      panY: 200,
      zoom: 1,
    });
    expect(fitViewport({ x: 0, y: 0, width: 1, height: 1 }, { width: 900, height: 600 })).toEqual({
      panX: 449.5,
      panY: 299.5,
      zoom: 1,
    });
  });

  it("resizes from the opposite corner and preserves aspect ratio", () => {
    expect(resizeBounds({ x: 10, y: 20, width: 100, height: 50 }, "nw", { x: -90, y: -30 }, true)).toEqual({
      x: -90,
      y: -30,
      width: 200,
      height: 100,
    });
  });

  it("scales multi-selection positions and dimensions", () => {
    const items = [item("a", 0, 0), item("b", 100, 100)];
    const scaled = scaleItems(items, { x: 0, y: 0, width: 200, height: 200 }, { x: -100, y: -100, width: 400, height: 200 });
    expect(scaled.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: -100, y: -100, width: 200, height: 100 },
      { x: 100, y: 0, width: 200, height: 100 },
    ]);
  });

  it("computes rotation and rotated selection bounds", () => {
    expect(rotationDegrees({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(90);
    const rotated = { ...item("a", 0, 0, 100, 50), rotation: 90 };
    const bounds = boundsForItems([rotated]);
    expect(bounds.x).toBeCloseTo(25);
    expect(bounds).toMatchObject({ y: -25, width: 50, height: 100 });
  });

  it("deduplicates nested frame descendants and chooses the nearest frame", () => {
    const outer = { ...item("outer", 0, 0, 500, 500, { childIds: ["inner", "leaf"] }), itemType: "frame" as const };
    const inner = { ...item("inner", 50, 50, 300, 300, { childIds: ["leaf"] }), itemType: "frame" as const };
    const leaf = item("leaf", 100, 100, 50, 50);
    expect(frameDescendantIds([outer, inner, leaf], ["outer"])).toEqual(["inner", "leaf"]);
    expect(itemsWithFrameDescendants([outer, inner, leaf], ["outer", "leaf"]).map(({ itemId }) => itemId)).toEqual(["outer", "inner", "leaf"]);
    expect(nearestContainingFrame(leaf, [outer, inner])?.itemId).toBe("inner");
  });

  it("attaches to the nearest frame and detaches after leaving", () => {
    const frame = { ...item("frame", 0, 0, 300, 300, { childIds: [] }), itemType: "frame" as const };
    const before = [frame, item("leaf", 400, 400, 20, 20)];
    const inside = [frame, item("leaf", 100, 100, 20, 20)];
    const attached = reconcileFrameMembership(before, inside, ["leaf"]);
    expect(attached.afterFrames[0]?.payload).toEqual({ childIds: ["leaf"] });
    const detached = reconcileFrameMembership(
      [{ ...frame, payload: { childIds: ["leaf"] } }, inside[1]],
      [{ ...frame, payload: { childIds: ["leaf"] } }, before[1]],
      ["leaf"],
    );
    expect(detached.afterFrames[0]?.payload).toEqual({ childIds: [] });
  });

  it("projects real content bounds into the minimap", () => {
    expect(projectToMinimap({ x: 100, y: 50, width: 200, height: 100 }, { x: 0, y: 0, width: 1000, height: 500 }, { width: 200, height: 120 })).toEqual({
      x: 20,
      y: 20,
      width: 40,
      height: 20,
    });
  });
});
