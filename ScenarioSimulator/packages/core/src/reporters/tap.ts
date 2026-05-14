import type { Reporter, ReporterIO } from "./base.js";
import { defaultIO } from "./base.js";
import type { RunEventBus } from "../events/types.js";

export function tapReporter(io: ReporterIO = defaultIO): Reporter {
  let count = 0;
  return {
    name: "tap",
    attach(bus: RunEventBus) {
      io.out("TAP version 14\n");
      const unsub = bus.subscribe((e) => {
        if (e.kind === "test:pass") {
          count++;
          io.out(`ok ${count} - ${[...e.suite, e.name].join(" › ")}\n`);
        } else if (e.kind === "test:fail") {
          count++;
          io.out(`not ok ${count} - ${[...e.suite, e.name].join(" › ")}\n`);
          io.out(`  ---\n  message: "${e.error.message.replace(/"/g, '\\"')}"\n  ...\n`);
        } else if (e.kind === "test:skip") {
          count++;
          io.out(`ok ${count} - # SKIP ${[...e.suite, e.name].join(" › ")}\n`);
        } else if (e.kind === "run:end") {
          io.out(`1..${count}\n`);
        }
      });
      return unsub;
    },
  };
}
