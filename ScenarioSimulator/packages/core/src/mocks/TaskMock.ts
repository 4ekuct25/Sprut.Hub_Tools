import type { Task } from "../types/api.js";

export class TaskMock implements Task {
  private cleared = false;

  constructor(private readonly onClear: () => void) {}

  clear(): void {
    if (this.cleared) return;
    this.cleared = true;
    this.onClear();
  }

  isCleared(): boolean {
    return this.cleared;
  }
}
