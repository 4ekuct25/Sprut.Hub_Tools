import type { HC } from "../generated/HC.js";
import type { HS } from "../generated/HS.js";
import { TaskMock } from "../mocks/TaskMock.js";
import type { Task } from "../types/api.js";
import type { CharacteristicMock } from "../mocks/CharacteristicMock.js";
import { MatchEngine, type Subscription } from "./MatchEngine.js";

export type SubscriptionManagerOptions = {
  /** Максимальная глубина реентерабельных уведомлений. */
  maxDepth?: number;
  /** В strict-режиме при превышении глубины — throw, иначе warn. */
  strict?: boolean;
  onWarn?: (msg: string) => void;
};

export class SubscriptionManager {
  private readonly engine = new MatchEngine();
  private readonly subs: Subscription[] = [];
  private nextId = 1;
  private depth = 0;
  private readonly maxDepth: number;
  private readonly strict: boolean;
  private readonly onWarn?: (msg: string) => void;

  constructor(opts: SubscriptionManagerOptions = {}) {
    this.maxDepth = opts.maxDepth ?? 50;
    this.strict = opts.strict === true;
    this.onWarn = opts.onWarn;
  }

  subscribe(handler: (...args: unknown[]) => void, ...userArgs: unknown[]): Task {
    return this.register({
      kind: "all",
      handler,
      userArgs,
    });
  }

  subscribeWithCondition(
    cond: string,
    value: string,
    hs: HS[] | undefined,
    hc: HC[] | undefined,
    handler: (...args: unknown[]) => void,
    ...userArgs: unknown[]
  ): Task {
    return this.register({
      kind: "conditional",
      cond,
      value,
      hs: hs && hs.length > 0 ? hs : undefined,
      hc: hc && hc.length > 0 ? hc : undefined,
      handler,
      userArgs,
    });
  }

  private register(partial: Omit<Subscription, "id" | "cancelled">): Task {
    const sub: Subscription = {
      id: this.nextId++,
      cancelled: false,
      ...partial,
    };
    this.subs.push(sub);
    return new TaskMock(() => {
      sub.cancelled = true;
    });
  }

  /**
   * Вызывается из HubMock после применения нового значения характеристики.
   * Вызывает всех подписчиков, чей фильтр совпал. Reentrancy ограничена
   * `maxDepth` для защиты от бесконечных циклов.
   */
  fireChange(char: CharacteristicMock, _oldValue: unknown, newValue: unknown): void {
    if (this.depth >= this.maxDepth) {
      const msg = `SubscriptionManager: max depth ${this.maxDepth} reached for ${char.getUUID()}`;
      if (this.strict) throw new Error(msg);
      this.onWarn?.(msg);
      return;
    }
    this.depth++;
    try {
      const snapshot = [...this.subs];
      for (const sub of snapshot) {
        if (sub.cancelled) continue;
        if (!this.engine.matches(sub, char, newValue)) continue;
        try {
          sub.handler(char, newValue, ...sub.userArgs);
        } catch (err) {
          const msg = `Subscription handler threw: ${(err as Error)?.message ?? String(err)}`;
          if (this.strict) throw err;
          this.onWarn?.(msg);
        }
      }
    } finally {
      this.depth--;
    }
  }

  /** Освобождение всех подписок (между тестами). */
  reset(): void {
    for (const s of this.subs) s.cancelled = true;
    this.subs.length = 0;
    this.nextId = 1;
    this.depth = 0;
  }

  /** Снапшот для UI-инспекторов. */
  list(): { id: number; kind: string; cond?: string; value?: string; hs?: string[]; hc?: string[] }[] {
    const out: { id: number; kind: string; cond?: string; value?: string; hs?: string[]; hc?: string[] }[] = [];
    for (const s of this.subs) {
      if (s.cancelled) continue;
      const item: { id: number; kind: string; cond?: string; value?: string; hs?: string[]; hc?: string[] } = {
        id: s.id,
        kind: s.kind,
      };
      if (s.kind === "conditional") {
        if (s.cond) item.cond = s.cond;
        if (s.value) item.value = s.value;
        if (s.hs) item.hs = s.hs.map((h) => String(h));
        if (s.hc) item.hc = s.hc.map((c) => String(c));
      }
      out.push(item);
    }
    return out;
  }
}
