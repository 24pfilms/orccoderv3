import type { BoardFlushCoordinator, BoardFlushReason } from "./flush";

export type BoardSaveState = "saved" | "saving" | "failed";
type SaveOperation = () => Promise<void>;

// A write rejected for a stale revision cannot succeed by being replayed unchanged, and
// queued work runs in order, so an endlessly retried operation blocks every later edit
// AND the flush that surface switching, project change, and window close wait on. Failed
// work is still retained for the explicit retry path, but only for a bounded number of
// attempts so the queue can never wedge the board shut.
const MAX_SAVE_ATTEMPTS = 2;

export class BoardSaveQueue {
  private readonly pending = new Map<string, SaveOperation>();
  private readonly attempts = new Map<string, number>();
  private readonly unregister: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    coordinator: BoardFlushCoordinator,
    private readonly onStateChange: (state: BoardSaveState) => void,
    private readonly debounceMs = 300,
  ) {
    this.unregister = coordinator.register((reason) => this.flush(reason));
    this.coordinator = coordinator;
  }

  private readonly coordinator: BoardFlushCoordinator;

  enqueue(key: string, operation: SaveOperation): void {
    this.pending.set(key, operation);
    this.coordinator.markDirty();
    this.onStateChange("saving");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush("surface-switch").catch(() => {});
    }, this.debounceMs);
  }

  async flush(_reason: BoardFlushReason): Promise<void> {
    if (this.flushing) await this.flushing;
    if (this.pending.size === 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = [...this.pending.entries()];
    this.pending.clear();
    this.flushing = (async () => {
      try {
        for (const [, operation] of batch) await operation();
        for (const [key] of batch) this.attempts.delete(key);
        this.onStateChange(this.pending.size === 0 ? "saved" : "saving");
      } catch (error) {
        for (const [key, operation] of batch) {
          const attempted = (this.attempts.get(key) ?? 1) + 1;
          if (attempted > MAX_SAVE_ATTEMPTS) {
            this.attempts.delete(key);
            continue;
          }
          this.attempts.set(key, attempted);
          if (!this.pending.has(key)) this.pending.set(key, operation);
        }
        this.onStateChange("failed");
        throw error;
      } finally {
        this.flushing = null;
      }
    })();
    await this.flushing;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.unregister();
  }
}
