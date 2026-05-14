import type { RunEvent, RunEventBus } from "../events/types.js";
import type { Reporter, ReporterIO } from "./base.js";
import { defaultIO } from "./base.js";

export type JsonReporterOptions = {
  io?: ReporterIO;
  /** Если задан — финальный отчёт пишется в файл вместо stdout. */
  output?: string;
};

export function jsonReporter(opts: JsonReporterOptions = {}): Reporter {
  const io = opts.io ?? defaultIO;
  const events: RunEvent[] = [];

  return {
    name: "json",
    attach(bus: RunEventBus) {
      const unsub = bus.subscribe((e) => events.push(e));
      return unsub;
    },
    async finish() {
      const payload = JSON.stringify(events, null, 2);
      if (opts.output) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(opts.output, payload, "utf-8");
      } else {
        io.out(`${payload}\n`);
      }
    },
  };
}
