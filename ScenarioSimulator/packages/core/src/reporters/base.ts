import type { RunEvent, RunEventBus } from "../events/types.js";

export type Reporter = {
  name: string;
  attach(bus: RunEventBus): () => void;
  finish?(): Promise<void> | void;
};

export type ReporterIO = {
  out: (s: string) => void;
  err: (s: string) => void;
  isTTY: boolean;
};

export const defaultIO: ReporterIO = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  isTTY: process.stdout.isTTY === true,
};

export type EventHandler<K extends RunEvent["kind"]> = (e: Extract<RunEvent, { kind: K }>) => void;

export class EventDispatcher {
  private handlers = new Map<string, ((e: RunEvent) => void)[]>();

  on<K extends RunEvent["kind"]>(kind: K, handler: EventHandler<K>): this {
    const arr = this.handlers.get(kind) ?? [];
    arr.push(handler as (e: RunEvent) => void);
    this.handlers.set(kind, arr);
    return this;
  }

  dispatch(e: RunEvent): void {
    const arr = this.handlers.get(e.kind);
    if (!arr) return;
    for (const h of arr) h(e);
  }
}
