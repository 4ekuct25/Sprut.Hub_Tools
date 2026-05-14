import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { ConfigLoader } from "../config/ConfigLoader.js";
import { RunEventBus } from "../events/types.js";
import { Executor, type ExecutorTotals } from "./Executor.js";
import { ScenarioLoader } from "./ScenarioLoader.js";
import { TestFileFinder } from "./TestFileFinder.js";
import { TestFileLoader } from "./TestFileLoader.js";
import { TestRunFactory } from "./TestRunFactory.js";

export type RunnerOptions = {
  /** Папки сценариев (например ["TurnOffAllLight", "CircadianLight"]); либо абсолютные пути. */
  scenarios?: string[];
  /** Корневая папка для поиска сценариев (по умолчанию — две папки выше testsDir). */
  rootDir?: string;
  grep?: string | RegExp;
  bail?: boolean;
  /** Зеркалировать console сценария в реальный stdout. */
  mirrorConsole?: boolean;
};

export class Runner {
  readonly bus = new RunEventBus();
  private readonly configLoader = new ConfigLoader();
  private readonly scenarioLoader = new ScenarioLoader();
  private readonly fileFinder = new TestFileFinder();
  private readonly fileLoader = new TestFileLoader();

  /** Главная точка входа: возвращает summary и пушит события в `bus`. */
  async run(opts: RunnerOptions): Promise<{
    summary: { total: number; passed: number; failed: number; skipped: number; scenarios: number; files: number };
    durationMs: number;
  }> {
    const startTime = performance.now();
    const rootDir = opts.rootDir ?? process.cwd();
    const targets = opts.scenarios && opts.scenarios.length > 0
      ? opts.scenarios.map((s) => (s.startsWith("/") ? s : resolve(rootDir, s)))
      : await this.discoverAll(rootDir);

    const scenarios = await this.configLoader.findScenarios(rootDir, targets.map((t) => t));

    this.bus.emit({
      kind: "run:start",
      scenarios: scenarios.map((s) => this.basename(s.scenarioDir)),
      ts: Date.now(),
    });

    const grep = this.toRegex(opts.grep);
    const totals: ExecutorTotals = { passed: 0, failed: 0, skipped: 0 };
    let fileCount = 0;

    for (const target of scenarios) {
      const cfg = await this.configLoader.load(target.scenarioDir, target.configFile);
      const scenarioName = cfg.name;
      const sources = await this.scenarioLoader.load(cfg);
      const factory = new TestRunFactory({
        config: cfg,
        sources,
        mirrorConsole: opts.mirrorConsole,
        onLog: (e) =>
          this.bus.emit({
            kind: "log",
            scenario: scenarioName,
            level: e.level,
            message: e.message,
            ts: e.ts,
          }),
      });
      const testFiles = await this.fileFinder.find(cfg.testsDir, cfg.raw.tests);

      const scenarioStart = performance.now();
      this.bus.emit({ kind: "scenario:start", scenario: scenarioName, ts: Date.now() });

      for (const file of testFiles) {
        fileCount++;
        const fileStart = performance.now();
        this.bus.emit({ kind: "file:start", scenario: scenarioName, file, ts: Date.now() });

        const loaded = await this.fileLoader.load(file);
        if (loaded.loadError) {
          this.bus.emit({
            kind: "test:fail",
            scenario: scenarioName,
            file,
            suite: [],
            name: "<file load>",
            durationMs: 0,
            ts: Date.now(),
            error: { message: loaded.loadError.message, stack: loaded.loadError.stack },
            logs: [],
          });
          totals.failed++;
          this.bus.emit({
            kind: "file:end",
            scenario: scenarioName,
            file,
            ts: Date.now(),
            durationMs: performance.now() - fileStart,
          });
          if (opts.bail) {
            this.emitRunEnd(startTime, totals, scenarios.length, fileCount);
            return this.summary(startTime, totals, scenarios.length, fileCount);
          }
          continue;
        }

        const executor = new Executor({
          bus: this.bus,
          scenarioName,
          testFile: file,
          factory,
          hasOnly: loaded.collector.hasOnlyMarker(),
          grep,
          ...(opts.bail !== undefined ? { bail: opts.bail } : {}),
        });
        const fileTotals = await executor.runRoot(loaded.collector.root);
        totals.passed += fileTotals.passed;
        totals.failed += fileTotals.failed;
        totals.skipped += fileTotals.skipped;

        this.bus.emit({
          kind: "file:end",
          scenario: scenarioName,
          file,
          ts: Date.now(),
          durationMs: performance.now() - fileStart,
        });

        if (opts.bail && fileTotals.failed > 0) {
          this.emitScenarioEnd(scenarioName, scenarioStart);
          this.emitRunEnd(startTime, totals, scenarios.length, fileCount);
          return this.summary(startTime, totals, scenarios.length, fileCount);
        }
      }

      this.emitScenarioEnd(scenarioName, scenarioStart);
    }

    this.emitRunEnd(startTime, totals, scenarios.length, fileCount);
    return this.summary(startTime, totals, scenarios.length, fileCount);
  }

  /** Обнаружить все сценарии (папки) с `.tests/config.json` в данной корневой папке. */
  async discoverAll(rootDir: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(rootDir, { withFileTypes: true });
    const candidates: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "ScenarioSimulator") continue;
      candidates.push(resolve(rootDir, e.name));
    }
    // Возвращаем уникальные папки — для обратной совместимости со старым
    // вызовом `run({ scenarios })`. Реальный список целей вычисляется
    // ConfigLoader.findScenarios уже в `run()`.
    const targets = await this.configLoader.findScenarios(rootDir, candidates);
    const dirs = new Set<string>();
    for (const t of targets) dirs.add(t.scenarioDir);
    return [...dirs];
  }

  private basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
  }

  private toRegex(grep?: string | RegExp): RegExp | null {
    if (!grep) return null;
    if (grep instanceof RegExp) return grep;
    return new RegExp(grep);
  }

  private emitScenarioEnd(name: string, start: number): void {
    this.bus.emit({
      kind: "scenario:end",
      scenario: name,
      ts: Date.now(),
      durationMs: performance.now() - start,
    });
  }

  private emitRunEnd(start: number, totals: ExecutorTotals, scenarios: number, files: number): void {
    this.bus.emit({
      kind: "run:end",
      ts: Date.now(),
      durationMs: performance.now() - start,
      summary: {
        total: totals.passed + totals.failed + totals.skipped,
        passed: totals.passed,
        failed: totals.failed,
        skipped: totals.skipped,
        scenarios,
        files,
      },
    });
  }

  private summary(
    start: number,
    totals: ExecutorTotals,
    scenarios: number,
    files: number,
  ): {
    summary: { total: number; passed: number; failed: number; skipped: number; scenarios: number; files: number };
    durationMs: number;
  } {
    return {
      summary: {
        total: totals.passed + totals.failed + totals.skipped,
        passed: totals.passed,
        failed: totals.failed,
        skipped: totals.skipped,
        scenarios,
        files,
      },
      durationMs: performance.now() - start,
    };
  }
}
