export type TestContext = unknown;

export type TestFn = (ctx: TestContext) => unknown | Promise<unknown>;
export type HookFn = (ctx: TestContext) => unknown | Promise<unknown>;

export type SkipReason = string;

export type TestCase = {
  name: string;
  fullName: string;
  fn: TestFn | null;
  skip: boolean;
  skipReason?: SkipReason;
  todo: boolean;
  only: boolean;
  suite: SuiteNode;
};

export type SuiteNode = {
  name: string;
  parent: SuiteNode | null;
  /** Path from root excluding the synthetic root (`['suiteA', 'suiteB']`). */
  path: string[];
  beforeAll: HookFn[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
  afterAll: HookFn[];
  children: SuiteNode[];
  tests: TestCase[];
};

export function createRootSuite(): SuiteNode {
  return {
    name: "",
    parent: null,
    path: [],
    beforeAll: [],
    beforeEach: [],
    afterEach: [],
    afterAll: [],
    children: [],
    tests: [],
  };
}

export type TestFile = {
  file: string;
  root: SuiteNode;
};
