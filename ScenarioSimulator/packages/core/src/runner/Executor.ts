import type { SuiteNode, TestCase } from "../dsl/types.js";
import type { RunEventBus } from "../events/types.js";
import { AssertionError } from "../dsl/expect.js";
import type { LogCapture } from "../capture/LogCapture.js";
import type { TestRunFactory, TestRunSession } from "./TestRunFactory.js";

export type ExecutorOptions = {
  bus: RunEventBus;
  scenarioName: string;
  testFile: string;
  factory: TestRunFactory;
  /** Если true — все тесты пропускаются кроме помеченных `it.only`. */
  hasOnly: boolean;
  /** Регулярка/строка для фильтрации тестов по полному имени. */
  grep?: RegExp | null;
  bail?: boolean;
};

export type ExecutorTotals = {
  passed: number;
  failed: number;
  skipped: number;
};

export class Executor {
  constructor(private readonly opts: ExecutorOptions) {}

  async runRoot(root: SuiteNode): Promise<ExecutorTotals> {
    const totals: ExecutorTotals = { passed: 0, failed: 0, skipped: 0 };
    await this.runSuite(root, totals);
    return totals;
  }

  private async runSuite(suite: SuiteNode, totals: ExecutorTotals): Promise<void> {
    for (const hook of suite.beforeAll) {
      await this.runHook(hook, "beforeAll", suite);
    }

    for (const test of suite.tests) {
      await this.runTest(test, totals);
      if (this.opts.bail && totals.failed > 0) return;
    }

    for (const child of suite.children) {
      await this.runSuite(child, totals);
      if (this.opts.bail && totals.failed > 0) return;
    }

    for (const hook of suite.afterAll) {
      await this.runHook(hook, "afterAll", suite);
    }
  }

  private collectBeforeEach(suite: SuiteNode): ((c: unknown) => unknown | Promise<unknown>)[] {
    const stack: SuiteNode[] = [];
    let cur: SuiteNode | null = suite;
    while (cur) {
      stack.push(cur);
      cur = cur.parent;
    }
    stack.reverse();
    return stack.flatMap((s) => s.beforeEach);
  }

  private collectAfterEach(suite: SuiteNode): ((c: unknown) => unknown | Promise<unknown>)[] {
    const stack: SuiteNode[] = [];
    let cur: SuiteNode | null = suite;
    while (cur) {
      stack.push(cur);
      cur = cur.parent;
    }
    // afterEach: внутренний → внешний
    return stack.flatMap((s) => s.afterEach);
  }

  private async runHook(
    hook: (c: unknown) => unknown | Promise<unknown>,
    label: string,
    suite: SuiteNode,
  ): Promise<void> {
    try {
      const result = hook(null);
      if (result instanceof Promise) await result;
    } catch (err) {
      this.opts.bus.emit({
        kind: "log",
        scenario: this.opts.scenarioName,
        level: "error",
        message: `[${label} in ${suite.path.join(" › ") || "<root>"}] ${(err as Error)?.message ?? String(err)}`,
        ts: Date.now(),
      });
    }
  }

  private async runTest(test: TestCase, totals: ExecutorTotals): Promise<void> {
    const suitePath = test.suite.path;
    const fullName = test.fullName;
    const ts = Date.now();

    if (this.opts.grep && !this.opts.grep.test(fullName)) {
      // Не пишем skip-эвенты для отфильтрованных тестов — это шум.
      return;
    }

    if (this.opts.hasOnly && !test.only && !this.containsOnly(test.suite)) {
      this.opts.bus.emit({
        kind: "test:skip",
        scenario: this.opts.scenarioName,
        file: this.opts.testFile,
        suite: suitePath,
        name: test.name,
        reason: "skipped (other tests marked .only)",
        ts,
      });
      totals.skipped++;
      return;
    }

    if (test.skip || test.todo || !test.fn) {
      this.opts.bus.emit({
        kind: "test:skip",
        scenario: this.opts.scenarioName,
        file: this.opts.testFile,
        suite: suitePath,
        name: test.name,
        reason: test.todo ? "todo" : "skipped",
        ts,
      });
      totals.skipped++;
      return;
    }

    this.opts.bus.emit({
      kind: "test:start",
      scenario: this.opts.scenarioName,
      file: this.opts.testFile,
      suite: suitePath,
      name: test.name,
      ts,
    });

    const start = performance.now();
    let session: TestRunSession | null = null;
    let logs: LogCapture | null = null;

    try {
      session = this.opts.factory.build();
      logs = session.logs;

      if (session.validationFailure) {
        const issues = session.validationFailure.result.issues
          .map((i) => `  ${session!.validationFailure!.filename}:${i.line}:${i.column}  ${i.nodeType}  ${i.message}`)
          .join("\n");
        throw new Error(`Scenario AST validation failed:\n${issues}`);
      }

      const beforeEachHooks = this.collectBeforeEach(test.suite);
      const afterEachHooks = this.collectAfterEach(test.suite);

      for (const h of beforeEachHooks) {
        const r = h(session.ctx);
        if (r instanceof Promise) await r;
      }

      const result = test.fn(session.ctx);
      if (result instanceof Promise) await result;

      for (const h of afterEachHooks) {
        const r = h(session.ctx);
        if (r instanceof Promise) await r;
      }

      const durationMs = performance.now() - start;
      this.opts.bus.emit({
        kind: "test:pass",
        scenario: this.opts.scenarioName,
        file: this.opts.testFile,
        suite: suitePath,
        name: test.name,
        durationMs,
        ts: Date.now(),
      });
      totals.passed++;
    } catch (err) {
      const durationMs = performance.now() - start;
      const isAssertion = err instanceof AssertionError;
      const e = err as AssertionError | Error;
      this.opts.bus.emit({
        kind: "test:fail",
        scenario: this.opts.scenarioName,
        file: this.opts.testFile,
        suite: suitePath,
        name: test.name,
        durationMs,
        ts: Date.now(),
        error: {
          message: e.message,
          stack: e.stack,
          ...(isAssertion ? { expected: (e as AssertionError).expected, actual: (e as AssertionError).actual } : {}),
        },
        logs: (logs?.tail(20) ?? []).map((l) => ({ level: l.level, message: l.message })),
      });
      totals.failed++;
    } finally {
      session?.dispose();
    }
  }

  private containsOnly(suite: SuiteNode): boolean {
    if (suite.tests.some((t) => t.only)) return true;
    return suite.children.some((c) => this.containsOnly(c));
  }
}
