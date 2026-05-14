export type RunEvent =
  | { kind: "run:start"; scenarios: string[]; ts: number }
  | { kind: "scenario:start"; scenario: string; ts: number }
  | { kind: "scenario:end"; scenario: string; ts: number; durationMs: number }
  | { kind: "file:start"; scenario: string; file: string; ts: number }
  | { kind: "file:end"; scenario: string; file: string; ts: number; durationMs: number }
  | { kind: "test:start"; scenario: string; file: string; suite: string[]; name: string; ts: number }
  | {
      kind: "test:pass";
      scenario: string;
      file: string;
      suite: string[];
      name: string;
      durationMs: number;
      ts: number;
    }
  | {
      kind: "test:fail";
      scenario: string;
      file: string;
      suite: string[];
      name: string;
      durationMs: number;
      ts: number;
      error: { message: string; stack?: string; expected?: unknown; actual?: unknown };
      logs: { level: string; message: string }[];
    }
  | {
      kind: "test:skip";
      scenario: string;
      file: string;
      suite: string[];
      name: string;
      reason?: string;
      ts: number;
    }
  | { kind: "log"; scenario: string; level: string; message: string; ts: number }
  | {
      kind: "run:end";
      ts: number;
      durationMs: number;
      summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        scenarios: number;
        files: number;
      };
    };

export type RunEventListener = (event: RunEvent) => void;

export class RunEventBus {
  private readonly listeners = new Set<RunEventListener>();

  subscribe(listener: RunEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RunEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* listener errors must not break the run */
      }
    }
  }
}
