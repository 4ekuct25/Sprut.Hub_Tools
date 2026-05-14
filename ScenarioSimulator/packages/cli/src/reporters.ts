import {
  dotReporter,
  jsonReporter,
  junitXmlReporter,
  prettyReporter,
  tapReporter,
  type Reporter,
} from "@scenario-simulator/core";

export type ReporterSpec = "pretty" | "json" | "junit-xml" | "tap" | "dot";

export function buildReporters(specs: ReporterSpec[], options: { output?: string; silent?: boolean }): Reporter[] {
  return specs.map((s) => {
    switch (s) {
      case "pretty":
        return prettyReporter({ silent: options.silent === true });
      case "json":
        return jsonReporter(options.output ? { output: options.output } : {});
      case "junit-xml":
        return junitXmlReporter(options.output ? { output: options.output } : {});
      case "tap":
        return tapReporter();
      case "dot":
        return dotReporter();
      default:
        return prettyReporter();
    }
  });
}
