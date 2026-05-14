import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { ScenarioConfigSchema, type ScenarioConfig } from "./schema.js";

export type LoadedConfig = {
  configPath: string;
  testsDir: string;
  scenarioDir: string;
  name: string;
  raw: ScenarioConfig;
  /** Абсолютные пути к глобальным js-файлам. */
  globalFiles: string[];
  /** Абсолютные пути к логическим js-файлам. */
  logicFiles: string[];
};

/** Ссылка на конкретный конфиг внутри `.tests/` сценария. */
export type ScenarioTarget = {
  /** Папка сценария (родительская для `.tests/`). */
  scenarioDir: string;
  /** Имя файла конфига (например `config.json` или `disable.config.json`). */
  configFile: string;
};

export class ConfigLoader {
  /**
   * Загружает указанный config из `.tests/` папки сценария.
   * Если `configFile` не указан — берёт `config.json`.
   */
  async load(scenarioDir: string, configFile = "config.json"): Promise<LoadedConfig> {
    const testsDir = resolve(scenarioDir, ".tests");
    const configPath = resolve(testsDir, configFile);
    if (!existsSync(configPath)) {
      throw new Error(`Config not found: ${configPath}`);
    }
    const raw = JSON.parse(await readFile(configPath, "utf-8"));
    const parsed = ScenarioConfigSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid config ${configPath}:\n${issues}`);
    }
    const cfg = parsed.data;

    const globalFiles = cfg.scenario.globals.map((p) => this.resolveRel(testsDir, p));
    const logicFiles = cfg.scenario.logic.map((p) => this.resolveRel(testsDir, p));

    for (const f of [...globalFiles, ...logicFiles]) {
      await this.assertExists(f);
    }

    const baseName = cfg.name ?? this.deriveName(scenarioDir);
    const name = configFile === "config.json" ? baseName : `${baseName}:${configFile.replace(/\.config\.json$/, "")}`;

    return {
      configPath,
      testsDir,
      scenarioDir: resolve(scenarioDir),
      name,
      raw: cfg,
      globalFiles,
      logicFiles,
    };
  }

  /**
   * Найти все цели тестирования среди кандидатов. Каждая цель — это пара
   * (папка сценария, имя config-файла). В одной `.tests/` папке может быть
   * несколько конфигов:
   *   - `config.json` — главный
   *   - `*.config.json` — дополнительные (для multi-logic пакетов).
   */
  async findScenarios(rootDir: string, candidates: string[]): Promise<ScenarioTarget[]> {
    const found: ScenarioTarget[] = [];
    for (const c of candidates) {
      const candidate = isAbsolute(c) ? c : resolve(rootDir, c);
      const testsDir = resolve(candidate, ".tests");
      if (!existsSync(testsDir)) continue;
      let entries: string[];
      try {
        entries = await readdir(testsDir);
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e === "config.json" || e.endsWith(".config.json")) {
          found.push({ scenarioDir: candidate, configFile: e });
        }
      }
    }
    return found;
  }

  private resolveRel(testsDir: string, p: string): string {
    if (isAbsolute(p)) return p;
    return resolve(testsDir, p);
  }

  private async assertExists(file: string): Promise<void> {
    try {
      await stat(file);
    } catch {
      throw new Error(`Scenario file does not exist: ${file}`);
    }
  }

  private deriveName(scenarioDir: string): string {
    return scenarioDir.split(/[\\/]/).pop() ?? "scenario";
  }
}
