import { TaskMock } from "../mocks/TaskMock.js";
import type { Task } from "../types/api.js";
import type { TimeController } from "./TimeController.js";

/**
 * Поставщик `setTimeout`/`setInterval`/`clearTimeout`/`clearInterval`/`clear`
 * для vm-контекста. Все таймеры виртуальные — реальный `setTimeout` Node
 * не используется.
 */
export class TimerScheduler {
  private readonly tasks = new Map<number, TaskMock>();

  constructor(private readonly time: TimeController) {}

  bind(): {
    setTimeout: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => Task;
    setInterval: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => Task;
    clearTimeout: (task: Task | number) => void;
    clearInterval: (task: Task | number) => void;
    clear: (task: Task | number) => void;
  } {
    return {
      setTimeout: this.setTimeout.bind(this),
      setInterval: this.setInterval.bind(this),
      clearTimeout: this.clear.bind(this),
      clearInterval: this.clear.bind(this),
      clear: this.clear.bind(this),
    };
  }

  setTimeout(
    handler: (...args: unknown[]) => void,
    timeout?: number,
    ...args: unknown[]
  ): Task {
    const id = this.time.schedule(handler, timeout ?? 0, args);
    const task = new TaskMock(() => this.time.cancel(id));
    this.tasks.set(id, task);
    return task;
  }

  setInterval(
    handler: (...args: unknown[]) => void,
    timeout?: number,
    ...args: unknown[]
  ): Task {
    const id = this.time.scheduleInterval(handler, timeout ?? 1, args);
    const task = new TaskMock(() => this.time.cancel(id));
    this.tasks.set(id, task);
    return task;
  }

  clear(task: Task | number | null | undefined): void {
    if (task === null || task === undefined) return;
    if (typeof task === "number") {
      this.time.cancel(task);
      return;
    }
    if (typeof (task as Task).clear === "function") {
      (task as Task).clear();
    }
  }
}
