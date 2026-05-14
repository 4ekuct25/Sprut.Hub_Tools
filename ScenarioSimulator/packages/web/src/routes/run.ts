import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { RunRegistry } from "../runs/RunRegistry.js";

export function runRoutes(registry: RunRegistry): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json(registry.list()));

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      scenarioId?: string;
      scenarioIds?: string[];
      grep?: string;
      bail?: boolean;
    };
    const scenarios = body.scenarioIds ?? (body.scenarioId ? [body.scenarioId] : []);
    const opts: Parameters<RunRegistry["start"]>[0] = { scenarios };
    if (body.grep) opts.grep = body.grep;
    if (body.bail) opts.bail = body.bail;
    const id = registry.start(opts);
    return c.json({ runId: id });
  });

  app.get("/:id", (c) => {
    const record = registry.get(c.req.param("id"));
    if (!record) return c.json({ error: "not found" }, 404);
    return c.json({
      id: record.id,
      scenarios: record.scenarios,
      status: record.status,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      events: record.events,
    });
  });

  app.get("/:id/stream", (c) => {
    const id = c.req.param("id");
    return streamSSE(c, async (stream) => {
      let unsub = (): void => undefined;
      let finished = false;
      const done = new Promise<void>((resolve) => {
        unsub = registry.subscribe(id, async (e) => {
          if (finished) return;
          await stream.writeSSE({ event: e.kind, data: JSON.stringify(e) });
          if (e.kind === "run:end") {
            finished = true;
            resolve();
          }
        });
        if (!registry.get(id)) {
          finished = true;
          resolve();
        }
      });
      await done;
      unsub();
    });
  });

  return app;
}
