import type { NotifyEntry } from "../types/api.js";

export class NotifyCapture {
  readonly entries: NotifyEntry[] = [];

  push(entry: NotifyEntry): void {
    this.entries.push(entry);
  }

  reset(): void {
    this.entries.length = 0;
  }
}
