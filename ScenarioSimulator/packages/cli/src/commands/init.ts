import { defineCommand } from "citty";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const initCommand = defineCommand({
  meta: { name: "init", description: "Создать .tests/config.json и пример теста" },
  args: {
    scenario: { type: "positional", required: true, description: "Папка сценария" },
    force: { type: "boolean", default: false, description: "Перезаписать существующие файлы" },
  },
  async run({ args }) {
    const scenarioDir = resolve(process.cwd(), String(args.scenario));
    const testsDir = resolve(scenarioDir, ".tests");
    await mkdir(testsDir, { recursive: true });

    const cfgPath = resolve(testsDir, "config.json");
    const samplePath = resolve(testsDir, "sample.test.js");

    const here = new URL(".", import.meta.url).pathname;
    const cfgTpl = await readFile(resolve(here, "../templates/config.json.tpl"), "utf-8");
    const sampleTpl = await readFile(resolve(here, "../templates/sample.test.js.tpl"), "utf-8");

    const name = scenarioDir.split(/[\\/]/).pop() ?? "scenario";
    const cfgContent = cfgTpl.replaceAll("__NAME__", name);
    const sampleContent = sampleTpl.replaceAll("__NAME__", name);

    await writeIfMissing(cfgPath, cfgContent, args.force);
    await writeIfMissing(samplePath, sampleContent, args.force);

    process.stdout.write(`Initialized .tests/ in ${scenarioDir}\n`);
  },
});

async function writeIfMissing(path: string, content: string, force: boolean): Promise<void> {
  let exists = false;
  try {
    await stat(path);
    exists = true;
  } catch {
    /* not exists */
  }
  if (exists && !force) {
    process.stdout.write(`  skip (exists): ${path}\n`);
    return;
  }
  await writeFile(path, content, "utf-8");
  process.stdout.write(`  wrote: ${path}\n`);
}
