import type { LogEntry, LogLevel } from "../types/api.js";

export type LogCaptureListener = (entry: LogEntry) => void;

export class LogCapture {
  readonly entries: LogEntry[] = [];
  private readonly listeners = new Set<LogCaptureListener>();

  constructor(private readonly clock: () => number = Date.now) {}

  push(level: LogLevel, format: string, args: unknown[]): void {
    const message = LogCapture.format(format, args);
    const entry: LogEntry = { level, message, args, ts: this.clock() };
    this.entries.push(entry);
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  /** Подписаться на каждый push — для стрима логов в SSE/bus. */
  subscribe(listener: LogCaptureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  byLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  containing(needle: string): LogEntry[] {
    const lower = needle.toLowerCase();
    return this.entries.filter((e) => e.message.toLowerCase().includes(lower));
  }

  tail(n: number): LogEntry[] {
    return this.entries.slice(-Math.max(0, n));
  }

  clear(): void {
    this.entries.length = 0;
  }

  /**
   * Поддерживает упрощённый printf-формат (`%s`, `%d`, `%j`, `%%`).
   * Для остальных случаев — выводит первый аргумент после format через пробел.
   */
  static format(format: string, args: unknown[]): string {
    if (typeof format !== "string") {
      return [format, ...args].map(LogCapture.stringify).join(" ");
    }
    if (args.length === 0) return format;
    let i = 0;
    const out = format.replace(/%[sdj%]/g, (token) => {
      if (token === "%%") return "%";
      if (i >= args.length) return token;
      const a = args[i++];
      if (token === "%s") return String(a);
      if (token === "%d") return String(Number(a));
      if (token === "%j") return JSON.stringify(a);
      return token;
    });
    if (i < args.length) {
      return [out, ...args.slice(i).map(LogCapture.stringify)].join(" ");
    }
    return out;
  }

  private static stringify(v: unknown): string {
    if (typeof v === "string") return v;
    if (v === null || v === undefined) return String(v);
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  }
}
