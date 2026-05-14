import { defineCommand } from "citty";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConfigLoader, Validator } from "@scenario-simulator/core";
import { resolveRootDir } from "../default-root.js";

export const validateCommand = defineCommand({
  meta: { name: "validate", description: "Проверить ES5+ совместимость сценариев (только AST)" },
  args: {
    scenarios: { type: "positional", required: false },
    root: { type: "string", description: "Корневая папка" },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.root);
    const loader = new ConfigLoader();
    const validator = new Validator({ mode: "es5+" });

    const targets = args.scenarios
      ? (Array.isArray(args.scenarios) ? args.scenarios : [args.scenarios]).map((s) => resolve(rootDir, String(s)))
      : await discover(rootDir, loader);
    const scenarios = await loader.findScenarios(rootDir, targets);

    let bad = 0;
    for (const target of scenarios) {
      const cfg = await loader.load(target.scenarioDir, target.configFile);
      for (const file of [...cfg.globalFiles, ...cfg.logicFiles]) {
        const source = await readFile(file, "utf-8");
        const result = validator.validate(source);
        if (result.valid) {
          process.stdout.write(`OK   ${file}\n`);
        } else {
          bad++;
          process.stdout.write(`FAIL ${file}\n`);
          for (const issue of result.issues) {
            process.stdout.write(`     ${issue.line}:${issue.column}  ${issue.nodeType}  ${issue.message}\n`);
          }
        }
      }
    }

    process.exitCode = bad > 0 ? 1 : 0;
  },
});

async function discover(rootDir: string, loader: ConfigLoader): Promise<string[]> {
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
