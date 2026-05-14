import type { HC } from "../generated/HC.js";
import type { HS } from "../generated/HS.js";
import type { CharacteristicMock } from "../mocks/CharacteristicMock.js";

export type Subscription = {
  id: number;
  kind: "all" | "conditional";
  cond?: string;
  value?: string;
  hs?: HS[];
  hc?: HC[];
  handler: (...args: unknown[]) => void;
  userArgs: unknown[];
  cancelled: boolean;
};

const COND_OPS = [">=", "<=", "!=", "<>", "==", "=", ">", "<"] as const;
type Op = (typeof COND_OPS)[number];

/**
 * Проверяет совпадает ли подписка с конкретным изменением характеристики.
 */
export class MatchEngine {
  matches(sub: Subscription, char: CharacteristicMock, newValue: unknown): boolean {
    if (sub.cancelled) return false;
    if (sub.hs && sub.hs.length > 0) {
      const serviceType = (char.getService() as { getType: () => HS }).getType();
      if (!sub.hs.includes(serviceType)) return false;
    }
    if (sub.hc && sub.hc.length > 0) {
      if (!sub.hc.includes(char.hc)) return false;
    }
    if (sub.kind === "conditional") {
      if (!this.compare(newValue, sub.cond ?? "", sub.value ?? "")) return false;
    }
    return true;
  }

  compare(actual: unknown, cond: string, expected: string): boolean {
    if (!cond || cond === "") return true;
    const op = this.parseOp(cond);
    if (!op) return true;
    const a = this.toComparable(actual);
    const b = this.toComparable(expected);
    switch (op) {
      case "=":
      case "==":
        return a === b || String(actual) === String(expected);
      case "!=":
      case "<>":
        return a !== b && String(actual) !== String(expected);
      case ">":
        return Number(a) > Number(b);
      case "<":
        return Number(a) < Number(b);
      case ">=":
        return Number(a) >= Number(b);
      case "<=":
        return Number(a) <= Number(b);
      default:
        return true;
    }
  }

  private parseOp(s: string): Op | null {
    const trimmed = s.trim();
    for (const op of COND_OPS) {
      if (trimmed === op) return op;
    }
    return null;
  }

  private toComparable(v: unknown): unknown {
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      if (v === "true") return 1;
      if (v === "false") return 0;
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
      return v;
    }
    return v;
  }
}
