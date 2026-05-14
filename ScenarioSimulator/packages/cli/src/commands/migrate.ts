import { defineCommand } from "citty";
import { resolve } from "node:path";
import { migrateScenario } from "@scenario-simulator/core";

export const migrateCommand = defineCommand({
  meta: { name: "migrate", description: "Вытащить старые runXxxTests в .tests/*.test.js" },
  args: {
    scenario: { type: "positional", required: true, description: "Папка сценария" },
    output: { type: "string", description: "Имя файла-результата", default: "migrated.test.js" },
    force: { type: "boolean", default: false },
  },
  async run({ args }) {
    const scenarioDir = resolve(process.cwd(), String(args.scenario));
    const result = await migrateScenario({
      scenarioDir,
      outputFileName: String(args.output ?? "migrated.test.js"),
      force: args.force === true,
    });
    process.stdout.write(`Migrated: ${result.outputPath}\n`);
    process.stdout.write(`  tests:  ${result.testCount}\n`);
    process.stdout.write(`  assert: ${result.assertCount}\n`);
    if (result.warnings.length > 0) {
      process.stdout.write(`  warnings:\n`);
      for (const w of result.warnings) process.stdout.write(`    - ${w}\n`);
    }
  },
});
