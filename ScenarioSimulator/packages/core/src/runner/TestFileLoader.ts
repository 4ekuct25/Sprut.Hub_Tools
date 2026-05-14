import { readFile } from "node:fs/promises";
import * as vm from "node:vm";
import { Collector } from "../dsl/Collector.js";
import { expect } from "../dsl/expect.js";
import { HC } from "../generated/HC.js";
import { HS } from "../generated/HS.js";

export type LoadedTestFile = {
  file: string;
  source: string;
  collector: Collector;
  loadError: Error | null;
};

/**
 * Загружает .test.js в изолированный vm-контекст с инжектированным DSL.
 *
 * Тесты пишутся без `import`/`require` — `describe`, `it`, `expect`,
 * `HC`, `HS` доступны как глобальные имена, как принято в Mocha/Vitest.
 */
export class TestFileLoader {
  async load(file: string): Promise<LoadedTestFile> {
    const source = await readFile(file, "utf-8");
    const collector = new Collector();

    const it = ((name: string, fn: Parameters<Collector["it"]>[1]) => collector.it(name, fn)) as {
      (name: string, fn: Parameters<Collector["it"]>[1]): void;
      skip: (name: string, fn?: Parameters<Collector["it"]>[1]) => void;
      only: (name: string, fn: Parameters<Collector["it"]>[1]) => void;
      todo: (name: string, fn?: Parameters<Collector["it"]>[1]) => void;
    };
    it.skip = (name, fn) => collector.it(name, fn ?? (() => {}), { skip: true });
    it.only = (name, fn) => collector.it(name, fn, { only: true });
    it.todo = (name, fn) => collector.it(name, fn ?? (() => {}), { todo: true });

    const ctx: Record<string, unknown> = {
      describe: collector.describe.bind(collector),
      it,
      test: it,
      beforeAll: collector.beforeAll.bind(collector),
      beforeEach: collector.beforeEach.bind(collector),
      afterEach: collector.afterEach.bind(collector),
      afterAll: collector.afterAll.bind(collector),
      expect,
      HC,
      HS,
      console,
      Math,
      JSON,
      Map,
      Set,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Date,
      NaN,
      Infinity,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Symbol,
    };

    let loadError: Error | null = null;
    try {
      const script = new vm.Script(source, { filename: file });
      script.runInContext(vm.createContext(ctx), { displayErrors: true });
    } catch (err) {
      loadError = err instanceof Error ? err : new Error(String(err));
    }

    return { file, source, collector, loadError };
  }
}
