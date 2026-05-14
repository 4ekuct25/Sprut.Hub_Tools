export class AssertionError extends Error {
  expected?: unknown;
  actual?: unknown;
  constructor(message: string, expected?: unknown, actual?: unknown) {
    super(message);
    this.name = "AssertionError";
    if (expected !== undefined) this.expected = expected;
    if (actual !== undefined) this.actual = actual;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keysA = Object.keys(ao);
  const keysB = Object.keys(bo);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

function fmt(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "function") return "[Function]";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export type Expectation<T> = {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toContain(item: unknown): void;
  toHaveLength(n: number): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toThrow(message?: string | RegExp): void;
  toMatchObject(shape: Record<string, unknown>): void;
  not: Expectation<T>;
};

function matchesShape(actual: unknown, shape: Record<string, unknown>): boolean {
  if (actual === null || typeof actual !== "object") return false;
  const a = actual as Record<string, unknown>;
  for (const [k, v] of Object.entries(shape)) {
    if (!(k in a)) return false;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      if (!matchesShape(a[k], v as Record<string, unknown>)) return false;
    } else if (!deepEqual(a[k], v)) {
      return false;
    }
  }
  return true;
}

export function expect<T = unknown>(actual: T): Expectation<T> {
  return makeExpect<T>(actual, false);
}

function makeExpect<T>(actual: T, negated: boolean): Expectation<T> {
  const fail = (msg: string, expected?: unknown, actualVal?: unknown): void => {
    throw new AssertionError(msg, expected, actualVal);
  };
  const check = (cond: boolean, posMsg: string, negMsg: string, expected?: unknown): void => {
    if (negated) {
      if (cond) fail(negMsg, expected, actual);
    } else {
      if (!cond) fail(posMsg, expected, actual);
    }
  };

  const exp: Expectation<T> = {
    toBe(expected) {
      check(
        Object.is(actual, expected),
        `expected ${fmt(actual)} to be ${fmt(expected)}`,
        `expected ${fmt(actual)} not to be ${fmt(expected)}`,
        expected,
      );
    },
    toEqual(expected) {
      check(
        deepEqual(actual, expected),
        `expected ${fmt(actual)} to deeply equal ${fmt(expected)}`,
        `expected ${fmt(actual)} not to deeply equal ${fmt(expected)}`,
        expected,
      );
    },
    toBeTruthy() {
      check(
        !!actual,
        `expected ${fmt(actual)} to be truthy`,
        `expected ${fmt(actual)} to be falsy`,
      );
    },
    toBeFalsy() {
      check(
        !actual,
        `expected ${fmt(actual)} to be falsy`,
        `expected ${fmt(actual)} to be truthy`,
      );
    },
    toBeNull() {
      check(
        actual === null,
        `expected ${fmt(actual)} to be null`,
        `expected ${fmt(actual)} not to be null`,
      );
    },
    toBeUndefined() {
      check(
        actual === undefined,
        `expected ${fmt(actual)} to be undefined`,
        `expected ${fmt(actual)} not to be undefined`,
      );
    },
    toBeDefined() {
      check(
        actual !== undefined,
        `expected value to be defined`,
        `expected value to be undefined`,
      );
    },
    toContain(item) {
      let contained = false;
      if (Array.isArray(actual)) contained = actual.includes(item);
      else if (typeof actual === "string") contained = actual.includes(String(item));
      else if (actual instanceof Set) contained = actual.has(item);
      check(
        contained,
        `expected ${fmt(actual)} to contain ${fmt(item)}`,
        `expected ${fmt(actual)} not to contain ${fmt(item)}`,
        item,
      );
    },
    toHaveLength(n) {
      const len = (actual as { length?: number }).length;
      check(
        len === n,
        `expected length ${len} to be ${n}`,
        `expected length not to be ${n}`,
        n,
      );
    },
    toBeGreaterThan(n) {
      check(
        Number(actual) > n,
        `expected ${fmt(actual)} > ${n}`,
        `expected ${fmt(actual)} not > ${n}`,
        n,
      );
    },
    toBeGreaterThanOrEqual(n) {
      check(
        Number(actual) >= n,
        `expected ${fmt(actual)} >= ${n}`,
        `expected ${fmt(actual)} not >= ${n}`,
        n,
      );
    },
    toBeLessThan(n) {
      check(
        Number(actual) < n,
        `expected ${fmt(actual)} < ${n}`,
        `expected ${fmt(actual)} not < ${n}`,
        n,
      );
    },
    toBeLessThanOrEqual(n) {
      check(
        Number(actual) <= n,
        `expected ${fmt(actual)} <= ${n}`,
        `expected ${fmt(actual)} not <= ${n}`,
        n,
      );
    },
    toThrow(message?: string | RegExp) {
      if (typeof actual !== "function") {
        fail(`expected a function to test .toThrow, got ${typeof actual}`);
        return;
      }
      let threw: Error | null = null;
      try {
        (actual as () => unknown)();
      } catch (e) {
        threw = e instanceof Error ? e : new Error(String(e));
      }
      const did = threw !== null;
      let matched = did;
      if (did && message) {
        const m = threw!.message;
        matched = message instanceof RegExp ? message.test(m) : m.includes(message);
      }
      check(
        matched,
        `expected function to throw${message ? ` matching ${fmt(message)}` : ""}`,
        `expected function not to throw${message ? ` matching ${fmt(message)}` : ""}`,
      );
    },
    toMatchObject(shape) {
      check(
        matchesShape(actual, shape),
        `expected ${fmt(actual)} to match ${fmt(shape)}`,
        `expected ${fmt(actual)} not to match ${fmt(shape)}`,
        shape,
      );
    },
    get not() {
      return makeExpect<T>(actual, !negated);
    },
  };
  return exp;
}
