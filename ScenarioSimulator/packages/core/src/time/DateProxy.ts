import type { TimeController } from "./TimeController.js";

/**
 * Создаёт объект, который ведёт себя как глобальный `Date`, но `Date.now()`
 * и `new Date()` без аргументов используют виртуальное время.
 *
 * Возвращаемое значение пригодно для записи в vm-контекст как `Date`.
 */
export function createDateProxy(time: TimeController): typeof Date {
  const Real = Date;

  const Wrapper = function (this: Date, ...args: unknown[]): Date | string {
    if (!(this instanceof Wrapper)) {
      return new (Real as DateConstructor)(time.now()).toString();
    }
    if (args.length === 0) {
      return new (Real as DateConstructor)(time.now());
    }
    return new (Real as unknown as new (...a: unknown[]) => Date)(...args);
  } as unknown as DateConstructor;

  (Wrapper as unknown as { now: () => number }).now = () => time.now();
  (Wrapper as unknown as { parse: typeof Real.parse }).parse = Real.parse.bind(Real);
  (Wrapper as unknown as { UTC: typeof Real.UTC }).UTC = Real.UTC.bind(Real);
  Object.defineProperty(Wrapper, "prototype", { value: Real.prototype, writable: false });
  Object.setPrototypeOf(Wrapper, Real);

  return Wrapper;
}
