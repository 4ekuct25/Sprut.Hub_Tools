import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigLoader, ScenarioLoader, type ScenarioSources } from "@scenario-simulator/core";
import type { ScenarioPreset } from "@scenario-simulator/core";
import type { ManualSession } from "../manual/ManualSession.js";
import type { ManualSessionRegistry } from "../manual/ManualSessionRegistry.js";
import { generateTest } from "../manual/TestGenerator.js";

/**
 * REST + SSE для ручной проверки сценариев. Сессия хранит vm-контекст;
 * клиент общается с ней через sessionId.
 */
export function manualRoutes(registry: ManualSessionRegistry, rootDir: string): Hono {
  const app = new Hono();
  const cfgLoader = new ConfigLoader();
  const srcLoader = new ScenarioLoader();

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      scenarioId?: string;
      scenarioName?: string;
      sources?: ScenarioSources;
      preset?: ScenarioPreset | null;
      onStart?: boolean;
    };

    let sources: ScenarioSources;
    let scenarioName: string;
    let preset: ScenarioPreset | null = body.preset ?? null;

    if (body.sources && body.scenarioName) {
      sources = body.sources;
      scenarioName = body.scenarioName;
    } else if (body.scenarioId) {
      const scenarioDir = resolve(rootDir, body.scenarioId);
      try {
        const cfg = await cfgLoader.load(scenarioDir);
        sources = await srcLoader.load(cfg);
        scenarioName = cfg.name;
        if (preset === null) {
          const presetPath = resolve(cfg.testsDir, "preset.json");
          if (existsSync(presetPath)) {
            preset = JSON.parse(await readFile(presetPath, "utf-8")) as ScenarioPreset;
          }
        }
      } catch (err) {
        return c.json({ error: (err as Error).message }, 400);
      }
    } else {
      return c.json({ error: "scenarioId либо (sources + scenarioName) обязательны" }, 400);
    }

    try {
      const session = registry.start({
        scenarioName,
        sources,
        preset,
        onStart: body.onStart ?? true,
      });
      return c.json({ id: session.id, state: session.state() });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  app.get("/", (c) => c.json(registry.list()));

  app.get("/:id", (c) => {
    const s = registry.get(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    return c.json(s.state());
  });

  app.get("/:id/stream", (c) => {
    const id = c.req.param("id");
    return streamSSE(c, async (stream) => {
      const session = registry.get(id);
      if (!session) {
        await stream.writeSSE({ event: "closed", data: JSON.stringify({}) });
        return;
      }
      let done = false;
      await new Promise<void>((resolve) => {
        const unsub = session.subscribe((e) => {
          stream
            .writeSSE({ event: e.kind, data: JSON.stringify(e) })
            .catch(() => {
              /* client gone */
            });
          if (e.kind === "closed") {
            done = true;
            unsub();
            resolve();
          }
        });
        stream.onAbort(() => {
          if (done) return;
          done = true;
          unsub();
          resolve();
        });
      });
    });
  });

  const handle = (action: (s: ManualSession, body: Record<string, unknown>) => Promise<void> | void) =>
    async (c: Context) => {
      const s = registry.get(c.req.param("id") ?? "");
      if (!s) return c.json({ error: "not found" }, 404);
      try {
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        await action(s, body);
        return c.json({ ok: true });
      } catch (err) {
        return c.json({ error: (err as Error).message }, 400);
      }
    };

  app.post(
    "/:id/char",
    handle((s, b) => {
      s.setChar(Number(b.aid), Number(b.cid), b.value);
    }),
  );

  app.post(
    "/:id/options",
    handle((s, b) => {
      if (b.options && typeof b.options === "object") {
        for (const [k, v] of Object.entries(b.options as Record<string, unknown>)) s.setOption(k, v);
      } else if (typeof b.name === "string") {
        s.setOption(b.name, b.value);
      }
    }),
  );

  app.post(
    "/:id/variables",
    handle((s, b) => {
      if (b.variables && typeof b.variables === "object") {
        for (const [k, v] of Object.entries(b.variables as Record<string, unknown>)) s.setVariable(k, v);
      } else if (typeof b.name === "string") {
        s.setVariable(b.name, b.value);
      }
    }),
  );

  app.post(
    "/:id/time",
    handle((s, b) => {
      const opts: { iso?: string; advanceMs?: number } = {};
      if (typeof b.iso === "string") opts.iso = b.iso;
      if (typeof b.advanceMs === "number") opts.advanceMs = b.advanceMs;
      s.setTime(opts);
    }),
  );

  app.post(
    "/:id/sun",
    handle((s, b) => {
      const opts: { sunrise?: string; sunset?: string } = {};
      if (typeof b.sunrise === "string") opts.sunrise = b.sunrise;
      if (typeof b.sunset === "string") opts.sunset = b.sunset;
      s.setSun(opts);
    }),
  );

  app.post(
    "/:id/room",
    handle((s, b) => {
      s.addRoom(String(b.name));
    }),
  );

  app.post(
    "/:id/accessory",
    handle((s, b) => {
      s.addAccessory(b.accessory as Parameters<ManualSession["addAccessory"]>[0]);
    }),
  );

  app.post(
    "/:id/service",
    handle((s, b) => {
      s.addService(Number(b.aid), b.service as Parameters<ManualSession["addService"]>[1]);
    }),
  );

  app.post(
    "/:id/characteristic",
    handle((s, b) => {
      s.addCharacteristic(
        Number(b.aid),
        Number(b.sid),
        b.char as Parameters<ManualSession["addCharacteristic"]>[2],
      );
    }),
  );

  app.post(
    "/:id/trigger",
    handle((s, b) => {
      s.trigger(Number(b.aid), Number(b.cid));
    }),
  );

  app.post(
    "/:id/recording",
    handle((s, b) => {
      if (b.clear) s.clearRecording();
      else s.setRecording(Boolean(b.on));
    }),
  );

  app.post(
    "/:id/reboot",
    handle((s) => {
      s.rebootHub();
    }),
  );

  app.get("/:id/recording", (c) => {
    const s = registry.get(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    return c.json({ actions: s.recordedActions() });
  });

  app.delete("/:id/room/:name", (c) => {
    const s = registry.get(c.req.param("id") ?? "");
    if (!s) return c.json({ error: "not found" }, 404);
    try {
      s.removeRoom(decodeURIComponent(c.req.param("name") ?? ""));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id/accessory/:aid", (c) => {
    const s = registry.get(c.req.param("id") ?? "");
    if (!s) return c.json({ error: "not found" }, 404);
    try {
      s.removeAccessory(Number(c.req.param("aid")));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id/service/:aid/:sid", (c) => {
    const s = registry.get(c.req.param("id") ?? "");
    if (!s) return c.json({ error: "not found" }, 404);
    try {
      s.removeService(Number(c.req.param("aid")), Number(c.req.param("sid")));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id/characteristic/:aid/:sid/:cid", (c) => {
    const s = registry.get(c.req.param("id") ?? "");
    if (!s) return c.json({ error: "not found" }, 404);
    try {
      s.removeCharacteristic(
        Number(c.req.param("aid")),
        Number(c.req.param("sid")),
        Number(c.req.param("cid")),
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/:id/generate-test", async (c) => {
    const s = registry.get(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const source = generateTest(s, body.name ? { name: body.name } : undefined);
    return c.json({ source });
  });

  app.delete("/:id", (c) => {
    const ok = registry.close(c.req.param("id"));
    return c.json({ ok });
  });

  return app;
}
