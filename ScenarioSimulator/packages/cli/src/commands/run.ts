import { defineCommand } from "citty";
import { Runner } from "@scenario-simulator/core";
import { buildReporters, type ReporterSpec } from "../reporters.js";
import { resolveRootDir } from "../default-root.js";

const KNOWN_REPORTERS: ReporterSpec[] = ["pretty", "json", "junit-xml", "tap", "dot"];

export const runCommand = defineCommand({
  meta: { name: "run", description: "Запустить тесты для одного или нескольких сценариев" },
  args: {
    scenarios: { type: "positional", required: false, description: "Папки сценариев (rel или absolute)" },
    reporter: { type: "string", description: "pretty|json|junit-xml|tap|dot (можно повторять)" },
    output: { type: "string", description: "Файл для json/junit-xml репортера" },
    grep: { type: "string", description: "Фильтр по полному имени теста" },
    bail: { type: "boolean", description: "Прервать после первого падения", default: false },
    silent: { type: "boolean", description: "Не печатать pretty детали, кроме сводки", default: false },
    root: { type: "string", description: "Корневая папка репозитория" },
    "mirror-console": { type: "boolean", description: "Зеркалить console сценария в stdout", default: false },
  },
  async run({ args, rawArgs }) {
    const scenarios = collectScenarios(args.scenarios, rawArgs);
    const reporters = parseReporters(args.reporter);
    const opts: { output?: string; silent?: boolean } = {};
    if (typeof args.output === "string") opts.output = args.output;
    if (args.silent) opts.silent = true;

    const reporterInstances = buildReporters(reporters, opts);

    const runner = new Runner();
    const unsubs = reporterInstances.map((r) => r.attach(runner.bus));

    const runnerOpts: Parameters<Runner["run"]>[0] = {};
    if (scenarios.length > 0) runnerOpts.scenarios = scenarios;
    runnerOpts.rootDir = resolveRootDir(args.root);
    if (args.grep) runnerOpts.grep = String(args.grep);
    if (args.bail) runnerOpts.bail = true;
    if (args["mirror-console"]) runnerOpts.mirrorConsole = true;
    const { summary } = await runner.run(runnerOpts);

    for (const r of reporterInstances) await r.finish?.();
    for (const u of unsubs) u();

    process.exitCode = summary.failed > 0 ? 1 : 0;
  },
});

function collectScenarios(positional: unknown, rawArgs: string[]): string[] {
  const fromPositional = Array.isArray(positional)
    ? (positional as string[])
    : positional
      ? [String(positional)]
      : [];
  // citty не всегда правильно собирает многократные позиционные — собираем сами
  const extra = rawArgs.filter((a) => !a.startsWith("-") && !fromPositional.includes(a));
  // Уберём аргументы-значения для опций (--reporter pretty -> 'pretty')
  const flagValueIndexes = new Set<number>();
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i]?.startsWith("--") && !rawArgs[i]?.includes("=")) {
      flagValueIndexes.add(i + 1);
    }
  }
  const positionals = extra.filter((_, i) => !flagValueIndexes.has(rawArgs.indexOf(extra[i] ?? "")));
  return [...new Set([...fromPositional, ...positionals])];
}

function parseReporters(input: unknown): ReporterSpec[] {
  if (!input) return ["pretty"];
  const list = Array.isArray(input) ? input : [String(input)];
  const valid = list
    .map((s) => String(s).trim() as ReporterSpec)
    .filter((s) => KNOWN_REPORTERS.includes(s));
  return valid.length > 0 ? valid : ["pretty"];
}
