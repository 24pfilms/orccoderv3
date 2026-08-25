import { useCallback, useEffect, useRef, useState } from "react";
import {
  boundsForItems,
  fitViewport,
  screenToWorld,
  zoomAtPoint,
} from "../interactions/geometry";
import type { BoardBounds, BoardPoint, BoardViewport } from "../interactions/types";
import type { BoardItem } from "../repository";

export { zoomAtPoint } from "../interactions/geometry";
export type { BoardPoint, BoardViewport } from "../interactions/types";

export function useBoardViewport(
  initial: BoardViewport,
  onCommit?: (viewport: BoardViewport) => void,
) {
  const [viewport, setViewportState] = useState(initial);
  const viewportRef = useRef(viewport);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Depend on the values, not the object identity: callers build a fresh literal
  // every render, so an identity dependency re-ran this effect forever.
  const { panX: initialPanX, panY: initialPanY, zoom: initialZoom } = initial;
  useEffect(() => {
    const next = { panX: initialPanX, panY: initialPanY, zoom: initialZoom };
    setViewportState(next);
    viewportRef.current = next;
  }, [initialPanX, initialPanY, initialZoom]);

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  const commit = useCallback(
    (next = viewportRef.current) => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = null;
      onCommit?.(next);
    },
    [onCommit],
  );

  const setViewport = useCallback(
    (next: BoardViewport, settle = true) => {
      viewportRef.current = next;
      setViewportState(next);
      if (!settle) return;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => commit(next), 180);
    },
    [commit],
  );

  const screenToCanvas = useCallback(
    (point: BoardPoint): BoardPoint => screenToWorld(point, viewportRef.current),
    [],
  );

  const panBy = useCallback(
    (x: number, y: number, settle = false) => {
      const current = viewportRef.current;
      setViewport(
        { ...current, panX: current.panX + x, panY: current.panY + y },
        settle,
      );
    },
    [setViewport],
  );

  const wheelZoom = useCallback(
    (point: BoardPoint, deltaY: number) => {
      const current = viewportRef.current;
      setViewport(
        zoomAtPoint(current, point, current.zoom * Math.exp(-deltaY * 0.0015)),
        true,
      );
    },
    [setViewport],
  );

  const zoomBy = useCallback(
    (factor: number, center: BoardPoint) => {
      const current = viewportRef.current;
      setViewport(zoomAtPoint(current, center, current.zoom * factor), true);
    },
    [setViewport],
  );

  const fitItems = useCallback(
    (items: BoardItem[], size: { width: number; height: number }) => {
      setViewport(fitViewport(boundsForItems(items), size), true);
    },
    [setViewport],
  );

  const centerBounds = useCallback(
    (bounds: BoardBounds, size: { width: number; height: number }) => {
      const current = viewportRef.current;
      setViewport({
        ...current,
        panX: size.width / 2 - (bounds.x + bounds.width / 2) * current.zoom,
        panY: size.height / 2 - (bounds.y + bounds.height / 2) * current.zoom,
      });
    },
    [setViewport],
  );

  return {
    viewport,
    viewportRef,
    setViewport,
    screenToCanvas,
    panBy,
    wheelZoom,
    zoomBy,
    fitItems,
    centerBounds,
    commit,
  };
}
