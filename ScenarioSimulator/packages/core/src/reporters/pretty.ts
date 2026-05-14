import type { Reporter, ReporterIO } from "./base.js";
import { defaultIO, EventDispatcher } from "./base.js";
import type { RunEventBus } from "../events/types.js";

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export type PrettyOptions = {
  io?: ReporterIO;
  color?: boolean;
  silent?: boolean;
};

export function prettyReporter(opts: PrettyOptions = {}): Reporter {
  const io = opts.io ?? defaultIO;
  const color = opts.color ?? io.isTTY;
  const c = (code: string, s: string) => (color ? `${code}${s}${COLOR.reset}` : s);
  const silent = opts.silent === true;

  return {
    name: "pretty",
    attach(bus: RunEventBus) {
      const dispatcher = new EventDispatcher()
        .on("scenario:start", (e) => {
          if (silent) return;
          io.out(`\n ${c(COLOR.cyan + COLOR.bold, "RUN")}  ${e.scenario}\n`);
        })
        .on("test:pass", (e) => {
          if (silent) return;
          io.out(
            `  ${c(COLOR.green, "✓")} ${[...e.suite, e.name].join(" › ")}  ${c(
              COLOR.dim,
              `(${e.durationMs.toFixed(0)} ms)`,
            )}\n`,
          );
        })
        .on("test:fail", (e) => {
          io.out(
            `  ${c(COLOR.red, "✗")} ${[...e.suite, e.name].join(" › ")}  ${c(
              COLOR.dim,
              `(${e.durationMs.toFixed(0)} ms)`,
            )}\n`,
          );
          io.out(`    ${c(COLOR.red, e.error.message)}\n`);
          if (e.error.stack) {
            const line = e.error.stack
              .split("\n")
              .find((l) => l.includes("at ") && !l.includes("ScenarioSimulator/packages"));
            if (line) io.out(`    ${c(COLOR.gray, line.trim())}\n`);
          }
          if (e.logs.length > 0) {
            io.out(`    ${c(COLOR.dim, `captured logs (last ${e.logs.length}):`)}\n`);
            for (const l of e.logs) {
              io.out(`      ${c(COLOR.gray, `[${l.level}]`)} ${l.message}\n`);
            }
          }
        })
        .on("test:skip", (e) => {
          if (silent) return;
          io.out(
            `  ${c(COLOR.yellow, "↓")} ${[...e.suite, e.name].join(" › ")}  ${c(
              COLOR.dim,
              e.reason ?? "skipped",
            )}\n`,
          );
        })
        .on("run:end", (e) => {
          const s = e.summary;
          io.out("\n");
          io.out(
            ` ${c(COLOR.bold, "Test Files")}  ${s.files} files | ${s.scenarios} scenarios\n`,
          );
          io.out(
            `      ${c(COLOR.bold, "Tests")}  ${c(COLOR.green, `${s.passed} passed`)}` +
              ` | ${c(COLOR.red, `${s.failed} failed`)}` +
              ` | ${c(COLOR.yellow, `${s.skipped} skipped`)}` +
              ` (${s.total})\n`,
          );
          io.out(`   ${c(COLOR.bold, "Duration")}  ${e.durationMs.toFixed(0)}ms\n`);
        });
      const unsub = bus.subscribe((event) => dispatcher.dispatch(event));
      return unsub;
    },
  };
}
