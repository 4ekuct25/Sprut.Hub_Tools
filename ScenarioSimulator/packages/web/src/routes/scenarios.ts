import { Hono } from "hono";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ConfigLoader,
  TestFileFinder,
  TestFileLoader,
  Validator,
} from "@scenario-simulator/core";

export function scenariosRoutes(rootDir: string): Hono {
  const app = new Hono();
  const loader = new ConfigLoader();
  const finder = new TestFileFinder();
  const fileLoader = new TestFileLoader();
  const validator = new Validator({ mode: "es5+" });

  app.get("/", async (c) => {
    const found = await discoverAndLoad(rootDir, loader, finder, fileLoader);
    return c.json(found);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const all = await discoverAndLoad(rootDir, loader, finder, fileLoader);
    const found = all.find((s) => s.id === id);
    return found ? c.json(found) : c.json({ error: "not found" }, 404);
  });

  app.get("/:id/source", async (c) => {
    const id = c.req.param("id");
    const scenarioDir = resolve(rootDir, id);
    try {
      const cfg = await loader.load(scenarioDir);
      const globals: { path: string; content: string }[] = [];
      const logic: { path: string; content: string }[] = [];
      for (const f of cfg.globalFiles) globals.push({ path: f, content: await readFile(f, "utf-8") });
      for (const f of cfg.logicFiles) logic.push({ path: f, content: await readFile(f, "utf-8") });
      return c.json({ globals, logic });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.get("/:id/tests", async (c) => {
    const id = c.req.param("id");
    const scenarioDir = resolve(rootDir, id);
    try {
      const cfg = await loader.load(scenarioDir);
      const files = await finder.find(cfg.testsDir, cfg.raw.tests);
      const out: { file: string; source: string }[] = [];
      for (const f of files) {
        out.push({ file: f, source: await readFile(f, "utf-8") });
      }
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.get("/:id/preset", async (c) => {
    const id = c.req.param("id");
    const scenarioDir = resolve(rootDir, id);
    try {
      const cfg = await loader.load(scenarioDir);
      const presetPath = resolve(cfg.testsDir, "preset.json");
      if (!existsSync(presetPath)) return c.json(null);
      const raw = JSON.parse(await readFile(presetPath, "utf-8"));
      return c.json(raw);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post("/:id/validate", async (c) => {
    const id = c.req.param("id");
    const scenarioDir = resolve(rootDir, id);
    try {
      const cfg = await loader.load(scenarioDir);
      const results: { file: string; valid: boolean; issues: ReturnType<Validator["validate"]>["issues"] }[] = [];
      for (const f of [...cfg.globalFiles, ...cfg.logicFiles]) {
        const source = await readFile(f, "utf-8");
        const r = validator.validate(source);
        results.push({ file: f, valid: r.valid, issues: r.issues });
      }
      return c.json(results);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}

type ScenarioListItem = {
  id: string;
  name: string;
  path: string;
  kind: "builtin" | "upload";
  hasLogic: boolean;
  hasGlobals: boolean;
  hasPreset: boolean;
  testCount: number;
  files: { file: string; tests: { suite: string[]; name: string; skip: boolean }[] }[];
};

async function discoverAndLoad(
  rootDir: string,
  loader: ConfigLoader,
  finder: TestFileFinder,
  fileLoader: TestFileLoader,
): Promise<ScenarioListItem[]> {
  const candidates: string[] = [];
  for (const e of await readdir(rootDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "ScenarioSimulator") continue;
    candidates.push(resolve(rootDir, e.name));
  }
  // Пользовательские сценарии живут в localStorage браузера: на бэке их нет.
  const scenarios = await loader.findScenarios(rootDir, candidates);
  const out: ScenarioListItem[] = [];
  for (const target of scenarios) {
    const cfg = await loader.load(target.scenarioDir, target.configFile);
    const files = await finder.find(cfg.testsDir, cfg.raw.tests);
    const fileEntries: { file: string; tests: { suite: string[]; name: string; skip: boolean }[] }[] = [];
    let total = 0;
    for (const f of files) {
      const loaded = await fileLoader.load(f);
      const tests = [...loaded.collector.allTests()].map((t) => ({
        suite: t.suite.path,
        name: t.name,
        skip: t.skip,
      }));
      total += tests.length;
      fileEntries.push({ file: f, tests });
    }
    const presetPath = resolve(cfg.testsDir, "preset.json");
    out.push({
      id: cfg.name,
      name: cfg.name,
      path: target.scenarioDir,
      kind: "builtin",
      hasLogic: cfg.logicFiles.length > 0,
      hasGlobals: cfg.globalFiles.length > 0,
      hasPreset: existsSync(presetPath),
      testCount: total,
      files: fileEntries,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return out;
}
