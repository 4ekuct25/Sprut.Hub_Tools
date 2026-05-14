import { randomUUID } from "node:crypto";
import { Runner, type RunEvent } from "@scenario-simulator/core";

export type RunRecord = {
  id: string;
  scenarios: string[];
  events: RunEvent[];
  status: "running" | "passed" | "failed";
  startedAt: number;
  endedAt?: number;
  subscribers: Set<(e: RunEvent) => void>;
};

export class RunRegistry {
  private readonly runs = new Map<string, RunRecord>();

  constructor(private readonly rootDir: string) {}

  list(): { id: string; scenarios: string[]; status: RunRecord["status"]; startedAt: number; endedAt?: number }[] {
    return [...this.runs.values()].map((r) => ({
      id: r.id,
      scenarios: r.scenarios,
      status: r.status,
      startedAt: r.startedAt,
      ...(r.endedAt !== undefined ? { endedAt: r.endedAt } : {}),
    }));
  }

  get(id: string): RunRecord | null {
    return this.runs.get(id) ?? null;
  }

  /** Стартует новый run и возвращает его id. */
  start(opts: { scenarios?: string[]; grep?: string; bail?: boolean }): string {
    const id = randomUUID();
    const runner = new Runner();
    const record: RunRecord = {
      id,
      scenarios: opts.scenarios ?? [],
      events: [],
      status: "running",
      startedAt: Date.now(),
      subscribers: new Set(),
    };
    this.runs.set(id, record);

    runner.bus.subscribe((e) => {
      record.events.push(e);
      for (const sub of record.subscribers) {
        try {
          sub(e);
        } catch {
          /* ignore subscriber errors */
        }
      }
      if (e.kind === "run:end") {
        record.endedAt = Date.now();
        record.status = e.summary.failed > 0 ? "failed" : "passed";
      }
    });

    const runOpts: Parameters<Runner["run"]>[0] = { rootDir: this.rootDir };
    if (opts.scenarios && opts.scenarios.length > 0) runOpts.scenarios = opts.scenarios;
    if (opts.grep) runOpts.grep = opts.grep;
    if (opts.bail) runOpts.bail = true;

    void runner.run(runOpts).catch((err) => {
      record.status = "failed";
      record.endedAt = Date.now();
      record.events.push({
        kind: "test:fail",
        scenario: "<run>",
        file: "",
        suite: [],
        name: "runner crash",
        durationMs: 0,
        ts: Date.now(),
        error: { message: (err as Error)?.message ?? String(err) },
        logs: [],
      });
    });

    return id;
  }

  subscribe(id: string, listener: (e: RunEvent) => void): () => void {
    const record = this.runs.get(id);
    if (!record) return () => undefined;
    record.subscribers.add(listener);
    // Replay уже накопленные события
    for (const e of record.events) listener(e);
    return () => record.subscribers.delete(listener);
  }
}
