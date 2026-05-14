import { createRootSuite, type HookFn, type SuiteNode, type TestCase, type TestFn } from "./types.js";

export class Collector {
  readonly root: SuiteNode = createRootSuite();
  private currentSuite: SuiteNode = this.root;
  private hasOnly = false;

  describe(name: string, fn: () => void): void {
    const child: SuiteNode = {
      name,
      parent: this.currentSuite,
      path: [...this.currentSuite.path, name],
      beforeAll: [],
      beforeEach: [],
      afterEach: [],
      afterAll: [],
      children: [],
      tests: [],
    };
    this.currentSuite.children.push(child);
    const prev = this.currentSuite;
    this.currentSuite = child;
    try {
      fn();
    } finally {
      this.currentSuite = prev;
    }
  }

  it(name: string, fn: TestFn, options: { skip?: boolean; only?: boolean; todo?: boolean } = {}): void {
    if (options.only) this.hasOnly = true;
    const test: TestCase = {
      name,
      fullName: [...this.currentSuite.path, name].join(" › "),
      fn: options.todo ? null : fn,
      skip: options.skip === true,
      todo: options.todo === true,
      only: options.only === true,
      suite: this.currentSuite,
    };
    this.currentSuite.tests.push(test);
  }

  beforeAll(fn: HookFn): void {
    this.currentSuite.beforeAll.push(fn);
  }
  beforeEach(fn: HookFn): void {
    this.currentSuite.beforeEach.push(fn);
  }
  afterEach(fn: HookFn): void {
    this.currentSuite.afterEach.push(fn);
  }
  afterAll(fn: HookFn): void {
    this.currentSuite.afterAll.push(fn);
  }

  hasOnlyMarker(): boolean {
    return this.hasOnly;
  }

  /** Перечисление всех тестов в порядке обхода (root → child → tests). */
  *allTests(): IterableIterator<TestCase> {
    yield* this.walk(this.root);
  }

  private *walk(suite: SuiteNode): IterableIterator<TestCase> {
    for (const t of suite.tests) yield t;
    for (const c of suite.children) yield* this.walk(c);
  }
}
