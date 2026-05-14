import { defineCommand } from "citty";
import { resolve } from "node:path";
import {
  ConfigLoader,
  TestFileFinder,
  TestFileLoader,
} from "@scenario-simulator/core";
import { resolveRootDir } from "../default-root.js";

export const listCommand = defineCommand({
  meta: { name: "list", description: "Показать сценарии и их тесты" },
  args: {
    scenarios: { type: "positional", required: false, description: "Папки сценариев" },
    json: { type: "boolean", description: "Машиночитаемый вывод", default: false },
    root: { type: "string", description: "Корневая папка" },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.root);
    const loader = new ConfigLoader();
    const finder = new TestFileFinder();
    const fileLoader = new TestFileLoader();

    const candidates = args.scenarios
      ? (Array.isArray(args.scenarios) ? args.scenarios : [args.scenarios]).map((s) => resolve(rootDir, String(s)))
      : await discoverDirs(rootDir, loader);

    const scenarios = await loader.findScenarios(rootDir, candidates);
    const out: {
      name: string;
      path: string;
      files: { file: string; tests: { suite: string[]; name: string; skip: boolean }[] }[];
    }[] = [];

    for (const target of scenarios) {
      const cfg = await loader.load(target.scenarioDir, target.configFile);
      const files = await finder.find(cfg.testsDir, cfg.raw.tests);
      const fileEntries: { file: string; tests: { suite: string[]; name: string; skip: boolean }[] }[] = [];
      for (const f of files) {
        const loaded = await fileLoader.load(f);
        const tests = [...loaded.collector.allTests()].map((t) => ({
          suite: t.suite.path,
          name: t.name,
          skip: t.skip,
        }));
        fileEntries.push({ file: f, tests });
      }
      out.push({ name: cfg.name, path: target.scenarioDir, files: fileEntries });
    }

    if (args.json) {
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      return;
    }

    for (const s of out) {
      process.stdout.write(`${s.name}\n`);
      for (const f of s.files) {
        process.stdout.write(`  ${f.file}\n`);
        for (const t of f.tests) {
          const flag = t.skip ? "↓" : "·";
          process.stdout.write(`    ${flag} ${[...t.suite, t.name].join(" › ")}\n`);
        }
      }
    }
  },
});

async function discoverDirs(rootDir: string, loader: ConfigLoader): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(rootDir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "ScenarioSimulator") continue;
    out.push(resolve(rootDir, e.name));
  }
  const targets = await loader.findScenarios(rootDir, out);
  const dirs = new Set<string>();
  for (const t of targets) dirs.add(t.scenarioDir);
  return [...dirs];
}
