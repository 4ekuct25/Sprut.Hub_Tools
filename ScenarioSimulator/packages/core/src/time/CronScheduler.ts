import parser from "cron-parser";
import { TaskMock } from "../mocks/TaskMock.js";
import type { Cron, Task } from "../types/api.js";
import type { TimeController } from "./TimeController.js";
import type { SunCalculator } from "./SunCalculator.js";

/**
 * Записи о текущих cron-задачах — полезно для assertions из тестов
 * (`cron.listScheduled()`, `cron.tickNow()`).
 */
export type CronEntry = {
  id: number;
  kind: "cron" | "sunrise" | "sunset";
  spec: string;
  offsetMinutes?: number;
  cancelled: boolean;
  nextAtMs: number | null;
};

export class CronScheduler implements Cron {
  private readonly entries: CronEntry[] = [];
  private nextId = 1;

  constructor(private readonly time: TimeController, private readonly sun: SunCalculator) {}

  schedule(spec: string, handler: (...args: unknown[]) => void, ...args: unknown[]): Task {
    const entry: CronEntry = {
      id: this.nextId++,
      kind: "cron",
      spec,
      cancelled: false,
      nextAtMs: null,
    };
    this.entries.push(entry);
    const armCron = (): void => {
      if (entry.cancelled) return;
      const nextMs = this.computeNextCron(spec);
      if (nextMs === null) return;
      entry.nextAtMs = nextMs;
      this.time.scheduleAt(
        () => {
          if (entry.cancelled) return;
          try {
            handler(...args);
          } finally {
            armCron();
          }
        },
        nextMs,
      );
    };
    armCron();
    return new TaskMock(() => {
      entry.cancelled = true;
    });
  }

  sunrise(_spec: string, offset: number, handler: (...args: unknown[]) => void, ...args: unknown[]): Task {
    return this.scheduleSun("sunrise", offset, handler, args);
  }

  sunset(_spec: string, offset: number, handler: (...args: unknown[]) => void, ...args: unknown[]): Task {
    return this.scheduleSun("sunset", offset, handler, args);
  }

  /** Список активных cron-задач для тестов и веб-UI. */
  listScheduled(): CronEntry[] {
    return this.entries.filter((e) => !e.cancelled);
  }

  /**
   * Принудительно срабатывает первая активная задача — удобно в тестах
   * (`cron.tickNow()`), не дожидаясь реального момента.
   */
  tickNow(): void {
    const next = this.entries.find((e) => !e.cancelled && e.nextAtMs !== null);
    if (!next || next.nextAtMs === null) return;
    this.time.jumpTo(next.nextAtMs);
  }

  reset(): void {
    for (const e of this.entries) e.cancelled = true;
    this.entries.length = 0;
    this.nextId = 1;
  }

  private scheduleSun(
    kind: "sunrise" | "sunset",
    offsetMinutes: number,
    handler: (...args: unknown[]) => void,
    args: unknown[],
  ): Task {
    const entry: CronEntry = {
      id: this.nextId++,
      kind,
      spec: "",
      offsetMinutes,
      cancelled: false,
      nextAtMs: null,
    };
    this.entries.push(entry);

    const arm = (): void => {
      if (entry.cancelled) return;
      const now = this.time.now();
      const nextMs =
        kind === "sunrise"
          ? this.sun.nextSunrise(now, offsetMinutes)
          : this.sun.nextSunset(now, offsetMinutes);
      entry.nextAtMs = nextMs;
      this.time.scheduleAt(() => {
        if (entry.cancelled) return;
        try {
          handler(...args);
        } finally {
          arm();
        }
      }, nextMs);
    };
    arm();
    return new TaskMock(() => {
      entry.cancelled = true;
    });
  }

  private computeNextCron(spec: string): number | null {
    try {
      const interval = parser.parseExpression(spec, {
        currentDate: new Date(this.time.now()),
      });
      const next = interval.next();
      return next.getTime();
    } catch {
      return null;
    }
  }
}
