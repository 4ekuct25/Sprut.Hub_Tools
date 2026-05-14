import type { Utils, UtilsNet } from "../types/api.js";

export class UtilsMock implements Utils {
  private counter = 0;

  constructor(private readonly seed: number = 1) {}

  /** Детерминированный UUID для воспроизводимости тестов. */
  uuid(): string {
    this.counter++;
    const hex = (this.seed * 1_000_003 + this.counter).toString(16).padStart(8, "0");
    return `00000000-0000-4000-8000-${hex.padStart(12, "0").slice(-12)}`;
  }
}

export type UtilsNetMockOptions = {
  pingResponses?: Record<string, boolean>;
  macByHost?: Record<string, string>;
};

export class UtilsNetMock implements UtilsNet {
  readonly wolCalls: string[] = [];

  constructor(private readonly options: UtilsNetMockOptions = {}) {}

  wakeOnLan(mac: string): void {
    this.wolCalls.push(String(mac));
  }
  getMacAddress(host: string): string {
    return this.options.macByHost?.[host] ?? "";
  }
  ping(host: string): boolean {
    return this.options.pingResponses?.[host] ?? true;
  }
}
