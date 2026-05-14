import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { scenariosRoutes } from "./routes/scenarios.js";
import { runRoutes } from "./routes/run.js";
import { manualRoutes } from "./routes/manual.js";
import { metaRoutes } from "./routes/meta.js";
import { RunRegistry } from "./runs/RunRegistry.js";
import { ManualSessionRegistry } from "./manual/ManualSessionRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = resolve(__dirname, "../public");

export type ServerOptions = {
  port?: number;
  rootDir: string;
};

export async function startServer(opts: ServerOptions): Promise<void> {
  const port = opts.port ?? 5173;
  const rootDir = resolve(opts.rootDir);
  const registry = new RunRegistry(rootDir);
  const manualRegistry = new ManualSessionRegistry();
  const app = new Hono();

  app.route("/api/scenarios", scenariosRoutes(rootDir));
  app.route("/api/runs", runRoutes(registry));
  app.route("/api/manual", manualRoutes(manualRegistry, rootDir));
  app.route("/api/meta", metaRoutes(rootDir));

  app.use(
    "/*",
    serveStatic({
      root: PUBLIC_DIR,
      rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
    }),
  );

  serve({ fetch: app.fetch, port });
  process.stdout.write(`ScenarioSimulator web server on http://localhost:${port}\n`);
}
