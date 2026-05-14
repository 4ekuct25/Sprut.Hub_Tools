import type { Log } from "../types/api.js";
import { LogCapture } from "../capture/LogCapture.js";

export class ConsoleMock implements Log {
  constructor(private readonly capture: LogCapture, private readonly mirror?: Log) {}

  message(format: string, ...args: unknown[]): void {
    this.capture.push("message", format, args);
    this.mirror?.message(format, ...args);
  }
  info(format: string, ...args: unknown[]): void {
    this.capture.push("info", format, args);
    this.mirror?.info(format, ...args);
  }
  warn(format: string, ...args: unknown[]): void {
    this.capture.push("warn", format, args);
    this.mirror?.warn(format, ...args);
  }
  error(format: string, ...args: unknown[]): void {
    this.capture.push("error", format, args);
    this.mirror?.error(format, ...args);
  }
  /** alias for `console.log` style calls */
  log(format: string, ...args: unknown[]): void {
    this.message(format, ...args);
  }
}
