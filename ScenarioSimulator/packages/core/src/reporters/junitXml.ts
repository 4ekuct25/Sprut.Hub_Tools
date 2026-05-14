import type { RunEvent, RunEventBus } from "../events/types.js";
import type { Reporter, ReporterIO } from "./base.js";
import { defaultIO } from "./base.js";

export type JunitOptions = {
  io?: ReporterIO;
  output?: string;
};

type Suite = {
  scenario: string;
  file: string;
  cases: Case[];
  start: number;
  durationMs: number;
};

type Case = {
  classname: string;
  name: string;
  durationMs: number;
  status: "pass" | "fail" | "skip";
  error?: { message: string; stack?: string };
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function junitXmlReporter(opts: JunitOptions = {}): Reporter {
  const io = opts.io ?? defaultIO;
  const suites = new Map<string, Suite>();
  let runStart = 0;
  let runDuration = 0;

  const keyOf = (scenario: string, file: string): string => `${scenario}|${file}`;

  return {
    name: "junit-xml",
    attach(bus: RunEventBus) {
      const handler = (e: RunEvent): void => {
        if (e.kind === "run:start") runStart = e.ts;
        if (e.kind === "run:end") runDuration = e.durationMs;
        if (e.kind === "file:start") {
          suites.set(keyOf(e.scenario, e.file), {
            scenario: e.scenario,
            file: e.file,
            cases: [],
            start: e.ts,
            durationMs: 0,
          });
        }
        if (e.kind === "file:end") {
          const s = suites.get(keyOf(e.scenario, e.file));
          if (s) s.durationMs = e.durationMs;
        }
        if (e.kind === "test:pass" || e.kind === "test:fail" || e.kind === "test:skip") {
          const s = suites.get(keyOf(e.scenario, e.file));
          if (!s) return;
          const c: Case = {
            classname: [e.scenario, ...e.suite].join("."),
            name: e.name,
            durationMs: e.kind === "test:skip" ? 0 : e.durationMs,
            status: e.kind === "test:pass" ? "pass" : e.kind === "test:fail" ? "fail" : "skip",
          };
          if (e.kind === "test:fail") {
            c.error = { message: e.error.message, ...(e.error.stack ? { stack: e.error.stack } : {}) };
          }
          s.cases.push(c);
        }
      };
      const unsub = bus.subscribe(handler);
      return unsub;
    },
    async finish() {
      let total = 0;
      let failed = 0;
      let skipped = 0;
      for (const s of suites.values()) {
        for (const c of s.cases) {
          total++;
          if (c.status === "fail") failed++;
          if (c.status === "skip") skipped++;
        }
      }
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<testsuites name="spruttest" tests="${total}" failures="${failed}" skipped="${skipped}" time="${(runDuration / 1000).toFixed(3)}" timestamp="${new Date(runStart).toISOString()}">\n`;
      for (const s of suites.values()) {
        xml += `  <testsuite name="${esc(s.scenario)}" tests="${s.cases.length}" failures="${s.cases.filter((c) => c.status === "fail").length}" skipped="${s.cases.filter((c) => c.status === "skip").length}" time="${(s.durationMs / 1000).toFixed(3)}" file="${esc(s.file)}">\n`;
        for (const c of s.cases) {
          xml += `    <testcase classname="${esc(c.classname)}" name="${esc(c.name)}" time="${(c.durationMs / 1000).toFixed(3)}">`;
          if (c.status === "fail" && c.error) {
            xml += `\n      <failure message="${esc(c.error.message)}">${esc(c.error.stack ?? c.error.message)}</failure>\n    `;
          } else if (c.status === "skip") {
            xml += `\n      <skipped/>\n    `;
          }
          xml += `</testcase>\n`;
        }
        xml += `  </testsuite>\n`;
      }
      xml += `</testsuites>\n`;
      if (opts.output) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(opts.output), { recursive: true });
        await writeFile(opts.output, xml, "utf-8");
      } else {
        io.out(xml);
      }
    },
  };
}
