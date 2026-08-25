import { describe, expect, it, vi } from "vitest";
import { BoardFlushCoordinator } from "./flush";

describe("BoardFlushCoordinator", () => {
  it("fails closed when dirty changes have no save handler", async () => {
    const dirtyChanged = vi.fn();
    const coordinator = new BoardFlushCoordinator(dirtyChanged);
    coordinator.markDirty();

    expect(await coordinator.flush("surface-switch")).toEqual({
      ok: false,
      error: "Board changes have no save handler",
    });
    expect(coordinator.dirty).toBe(true);
    expect(dirtyChanged).toHaveBeenCalledWith(true);
  });

  it("keeps dirty state available after a failed save", async () => {
    const coordinator = new BoardFlushCoordinator(vi.fn());
    coordinator.register(async () => {
      throw new Error("disk full at C:\\private\\board");
    });
    coordinator.markDirty();

    expect(await coordinator.flush("window-close")).toEqual({
      ok: false,
      error: "Board changes could not be saved",
    });
    expect(coordinator.dirty).toBe(true);
  });

  it("does not clear edits made while a save is in flight", async () => {
    const dirtyChanged = vi.fn();
    const coordinator = new BoardFlushCoordinator(dirtyChanged);
    let finishSave = () => {};
    coordinator.register(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    coordinator.markDirty();
    const flushing = coordinator.flush("update");
    coordinator.markDirty();
    finishSave();

    expect(await flushing).toEqual({ ok: false, error: "Board changed while saving" });
    expect(coordinator.dirty).toBe(true);
    expect(dirtyChanged).not.toHaveBeenCalledWith(false);
  });

  it("clears dirty state only after a confirmed save", async () => {
    const dirtyChanged = vi.fn();
    const handler = vi.fn(async () => {});
    const coordinator = new BoardFlushCoordinator(dirtyChanged);
    coordinator.register(handler);
    coordinator.markDirty();

    expect(await coordinator.flush("project-change")).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith("project-change");
    expect(coordinator.dirty).toBe(false);
    expect(dirtyChanged).toHaveBeenLastCalledWith(false);
  });
});
