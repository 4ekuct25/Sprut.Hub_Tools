type TimerEntry = {
  id: number;
  dueAt: number;
  handler: (...args: unknown[]) => void;
  args: unknown[];
  intervalMs?: number;
  cancelled: boolean;
};

/**
 * Виртуальные часы для эмулятора. Время не течёт само — оно
 * продвигается явными вызовами `advance(ms)` / `jumpTo(ms)` / `runAllTimers()`.
 *
 * Все `setTimeout`/`setInterval` сценария регистрируются здесь
 * через `TimerScheduler` — никакие реальные таймеры Node/Bun не создаются.
 */
export class TimeController {
  private nowMs: number;
  private queue: TimerEntry[] = [];
  private nextId = 1;
  private runDepth = 0;
  private readonly maxIterations: number;

  constructor(opts: { start?: number; maxIterations?: number } = {}) {
    this.nowMs = opts.start ?? new Date("2024-06-21T12:00:00Z").getTime();
    this.maxIterations = opts.maxIterations ?? 100_000;
  }

  now(): number {
    return this.nowMs;
  }

  setNow(ms: number): void {
    this.nowMs = ms;
  }

  /**
   * Регистрирует одноразовый таймер.
   * @returns id таймера для последующей отмены
   */
  schedule(handler: (...args: unknown[]) => void, delayMs: number, args: unknown[] = []): number {
    const id = this.nextId++;
    const dueAt = this.nowMs + Math.max(0, delayMs);
    this.queue.push({ id, dueAt, handler, args, cancelled: false });
    return id;
  }

  scheduleInterval(handler: (...args: unknown[]) => void, intervalMs: number, args: unknown[] = []): number {
    const id = this.nextId++;
    const safeInterval = Math.max(1, intervalMs);
    const dueAt = this.nowMs + safeInterval;
    this.queue.push({ id, dueAt, handler, args, intervalMs: safeInterval, cancelled: false });
    return id;
  }

  /**
   * Регистрирует абсолютный таймер (используется CronScheduler).
   * @returns id таймера для последующей отмены
   */
  scheduleAt(handler: (...args: unknown[]) => void, atMs: number, args: unknown[] = []): number {
    const id = this.nextId++;
    this.queue.push({ id, dueAt: atMs, handler, args, cancelled: false });
    return id;
  }

  cancel(id: number): void {
    for (const entry of this.queue) {
      if (entry.id === id) entry.cancelled = true;
    }
  }

  /**
   * Продвинуть время на `ms` миллисекунд, попутно вызывая все истёкшие таймеры.
   * Re-entrancy безопасна — счётчик глубины предотвращает бесконечные циклы.
   */
  advance(ms: number): void {
    const target = this.nowMs + Math.max(0, ms);
    this.runUntil(target);
  }

  jumpTo(targetMs: number): void {
    if (targetMs < this.nowMs) {
      this.nowMs = targetMs;
      return;
    }
    this.runUntil(targetMs);
  }

  /**
   * Прогнать все pending таймеры. Останавливается, когда очередь пуста
   * или сработал лимит итераций.
   */
  runAllTimers(): void {
    let iterations = 0;
    while (this.hasPending()) {
      if (++iterations > this.maxIterations) {
        throw new Error(
          `TimeController.runAllTimers exceeded ${this.maxIterations} iterations — possible infinite setInterval`,
        );
      }
      const next = this.nextDueAt();
      if (next === null) break;
      this.runUntil(next);
    }
  }

  hasPending(): boolean {
    return this.queue.some((e) => !e.cancelled);
  }

  pendingCount(): number {
    return this.queue.filter((e) => !e.cancelled).length;
  }

  /** Список активных таймеров — для UI-инспекторов планировщиков. */
  listTimers(): { id: number; dueAt: number; intervalMs?: number }[] {
    const out: { id: number; dueAt: number; intervalMs?: number }[] = [];
    for (const e of this.queue) {
      if (e.cancelled) continue;
      const item: { id: number; dueAt: number; intervalMs?: number } = {
        id: e.id,
        dueAt: e.dueAt,
      };
      if (e.intervalMs !== undefined) item.intervalMs = e.intervalMs;
      out.push(item);
    }
    return out;
  }

  private nextDueAt(): number | null {
    let min: number | null = null;
    for (const e of this.queue) {
      if (e.cancelled) continue;
      if (min === null || e.dueAt < min) min = e.dueAt;
    }
    return min;
  }

  private runUntil(target: number): void {
    if (++this.runDepth > 50) {
      this.runDepth--;
      throw new Error("TimeController re-entrancy depth exceeded (50)");
    }
    try {
      let iterations = 0;
      while (true) {
        if (++iterations > this.maxIterations) {
          throw new Error(
            `TimeController.runUntil exceeded ${this.maxIterations} iterations`,
          );
        }
        const due = this.findNextDue(target);
        if (!due) break;
        this.nowMs = due.dueAt;
        this.invokeOne(due);
      }
      this.nowMs = target;
      this.compact();
    } finally {
      this.runDepth--;
    }
  }

  private findNextDue(maxTime: number): TimerEntry | null {
    let best: TimerEntry | null = null;
    for (const e of this.queue) {
      if (e.cancelled) continue;
      if (e.dueAt > maxTime) continue;
      if (!best || e.dueAt < best.dueAt) best = e;
    }
    return best;
  }

  private invokeOne(entry: TimerEntry): void {
    if (entry.intervalMs !== undefined) {
      entry.dueAt += entry.intervalMs;
    } else {
      entry.cancelled = true;
    }
    try {
      entry.handler(...entry.args);
    } catch (err) {
      // Timer-функции могут бросать — Sprut.Hub ловит их и продолжает.
      // Пробрасываем дальше через "uncaught" event? Сейчас просто rethrow
      // на уровень runUntil — Sandbox решит как обработать.
      throw err;
    }
  }

  private compact(): void {
    if (this.queue.length > 256 && this.queue.filter((e) => e.cancelled).length * 2 > this.queue.length) {
      this.queue = this.queue.filter((e) => !e.cancelled);
    }
  }
}
