import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CHAR_METADATA, HC, HS } from "@scenario-simulator/core";

type ShChar = { type: string };
type ShService = { type: string; required?: ShChar[]; optional?: ShChar[] };
type ShTypes = { service?: { types?: { types?: ShService[] } } };

type ServiceMeta = { type: string; required: string[]; optional: string[] };

let cached: { services: ServiceMeta[]; servicesByType: Record<string, ServiceMeta> } | null = null;

async function loadServices(rootDir: string): Promise<{
  services: ServiceMeta[];
  servicesByType: Record<string, ServiceMeta>;
}> {
  if (cached) return cached;
  const path = resolve(rootDir, "ScenarioTemplate/sh_types.json");
  if (!existsSync(path)) {
    cached = { services: [], servicesByType: {} };
    return cached;
  }
  const raw = JSON.parse(await readFile(path, "utf-8")) as ShTypes;
  const list = raw.service?.types?.types ?? [];
  const services: ServiceMeta[] = list.map((s) => ({
    type: s.type,
    required: (s.required ?? []).map((c) => c.type),
    optional: (s.optional ?? []).map((c) => c.type),
  }));
  services.sort((a, b) => a.type.localeCompare(b.type));
  const servicesByType: Record<string, ServiceMeta> = {};
  for (const s of services) servicesByType[s.type] = s;
  cached = { services, servicesByType };
  return cached;
}

export function metaRoutes(rootDir: string): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const { services } = await loadServices(rootDir);
    return c.json({
      hc: Object.keys(HC),
      hs: Object.keys(HS),
      chars: CHAR_METADATA,
      services,
    });
  });

  app.get("/services", async (c) => {
    const { services } = await loadServices(rootDir);
    return c.json(services);
  });

  app.get("/chars", (c) => c.json(CHAR_METADATA));

  return app;
}
