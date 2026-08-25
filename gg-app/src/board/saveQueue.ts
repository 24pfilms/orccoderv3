import type { BoardFlushCoordinator, BoardFlushReason } from "./flush";

export type BoardSaveState = "saved" | "saving" | "failed";
type SaveOperation = () => Promise<void>;

export class BoardSaveQueue {
  private readonly pending = new Map<string, SaveOperation>();
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
        this.onStateChange(this.pending.size === 0 ? "saved" : "saving");
      } catch (error) {
        for (const [key, operation] of batch) {
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
