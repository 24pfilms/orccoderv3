import { describe, expect, it, vi } from "vitest";
import { BoardFlushCoordinator } from "./flush";
import { BoardSaveQueue } from "./saveQueue";

describe("BoardSaveQueue", () => {
  it("coalesces repeated edits by key and confirms a flush", async () => {
    const states: string[] = [];
    const first = vi.fn(async () => {});
    const latest = vi.fn(async () => {});
    const coordinator = new BoardFlushCoordinator(() => {});
    const queue = new BoardSaveQueue(coordinator, (state) => states.push(state), 60_000);
    queue.enqueue("item", first);
    queue.enqueue("item", latest);

    expect(await coordinator.flush("surface-switch")).toEqual({ ok: true });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(states[states.length - 1]).toBe("saved");
    queue.dispose();
  });

  it("retains failed work for explicit retry", async () => {
    const states: string[] = [];
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const coordinator = new BoardFlushCoordinator(() => {});
    const queue = new BoardSaveQueue(coordinator, (state) => states.push(state), 60_000);
    queue.enqueue("item", save);

    expect(await coordinator.flush("window-close")).toEqual({
      ok: false,
      error: "Board changes could not be saved",
    });
    expect(states[states.length - 1]).toBe("failed");
    expect(await coordinator.flush("window-close")).toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(2);
    queue.dispose();
  });

  it("does not clear an edit queued during an in-flight save", async () => {
    let finish = () => {};
    const coordinator = new BoardFlushCoordinator(() => {});
    const queue = new BoardSaveQueue(coordinator, () => {}, 60_000);
    queue.enqueue(
      "first",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const flushing = coordinator.flush("update");
    queue.enqueue("second", async () => {});
    finish();

    expect(await flushing).toEqual({ ok: false, error: "Board changed while saving" });
    expect(await coordinator.flush("update")).toEqual({ ok: true });
    queue.dispose();
  });
});
