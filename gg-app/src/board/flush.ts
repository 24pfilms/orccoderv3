export type BoardFlushReason = "surface-switch" | "project-change" | "window-close" | "update";
export type BoardFlushHandler = (reason: BoardFlushReason) => Promise<void>;

export interface BoardFlushResult {
  ok: boolean;
  error?: string;
}

export class BoardFlushCoordinator {
  private handler: BoardFlushHandler | null = null;
  private dirtyGeneration = 0;
  private savedGeneration = 0;

  constructor(private readonly onDirtyChange: (dirty: boolean) => void) {}

  get dirty(): boolean {
    return this.dirtyGeneration !== this.savedGeneration;
  }

  register(handler: BoardFlushHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = null;
    };
  }

  markDirty(): void {
    const wasDirty = this.dirty;
    this.dirtyGeneration += 1;
    if (!wasDirty) this.onDirtyChange(true);
  }

  async flush(reason: BoardFlushReason): Promise<BoardFlushResult> {
    if (!this.dirty) return { ok: true };
    if (!this.handler) return { ok: false, error: "Board changes have no save handler" };

    const generation = this.dirtyGeneration;
    try {
      await this.handler(reason);
      this.savedGeneration = generation;
      if (this.dirty) return { ok: false, error: "Board changed while saving" };
      this.onDirtyChange(false);
      return { ok: true };
    } catch {
      return { ok: false, error: "Board changes could not be saved" };
    }
  }
}
