import { defineCommand } from "citty";
import { resolve } from "node:path";
import chokidar from "chokidar";
import { Runner, prettyReporter } from "@scenario-simulator/core";
import { resolveRootDir } from "../default-root.js";

export const watchCommand = defineCommand({
  meta: { name: "watch", description: "Перезапускать тесты при изменении source/.tests/" },
  args: {
    scenarios: { type: "positional", required: false },
    grep: { type: "string", description: "Фильтр тестов" },
    root: { type: "string", description: "Корневая папка" },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.root);
    const scenarios = collectPositionals(args.scenarios);

    const trigger = async (): Promise<void> => {
      const runner = new Runner();
      const unsub = prettyReporter().attach(runner.bus);
      const opts: Parameters<Runner["run"]>[0] = { rootDir };
      if (scenarios.length > 0) opts.scenarios = scenarios;
      if (args.grep) opts.grep = String(args.grep);
      await runner.run(opts);
      unsub();
    };

    const watchPaths = scenarios.length > 0
      ? scenarios.map((s) => resolve(rootDir, s))
      : [rootDir];

    const watcher = chokidar.watch(watchPaths, {
      ignored: /node_modules|\.git|\.tsbuildinfo/,
      ignoreInitial: true,
    });

    process.stdout.write(`Watching ${watchPaths.join(", ")} ... (Ctrl-C to exit)\n`);
    await trigger();

    let scheduled: NodeJS.Timeout | null = null;
    watcher.on("all", () => {
      if (scheduled) clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        scheduled = null;
        process.stdout.write("\n— rerunning —\n");
        trigger().catch((e) => process.stderr.write(`${(e as Error).message}\n`));
      }, 200);
    });
  },
});

function collectPositionals(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String);
  return [String(input)];
}
