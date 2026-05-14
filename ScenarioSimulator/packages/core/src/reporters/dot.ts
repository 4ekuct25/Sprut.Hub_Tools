import type { Reporter, ReporterIO } from "./base.js";
import { defaultIO } from "./base.js";
import type { RunEventBus } from "../events/types.js";

export function dotReporter(io: ReporterIO = defaultIO): Reporter {
  return {
    name: "dot",
    attach(bus: RunEventBus) {
      const unsub = bus.subscribe((e) => {
        if (e.kind === "test:pass") io.out(".");
        else if (e.kind === "test:fail") io.out("F");
        else if (e.kind === "test:skip") io.out("S");
        else if (e.kind === "run:end") {
          const s = e.summary;
          io.out(`\n${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped (${s.total})\n`);
        }
      });
      return unsub;
    },
  };
}
