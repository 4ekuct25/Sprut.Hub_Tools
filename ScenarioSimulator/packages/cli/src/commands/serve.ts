import { defineCommand } from "citty";
import { resolveRootDir } from "../default-root.js";

export const serveCommand = defineCommand({
  meta: { name: "serve", description: "Запустить веб-UI для управления тестами" },
  args: {
    port: { type: "string", description: "Порт", default: "5173" },
    root: { type: "string", description: "Корневая папка" },
  },
  async run({ args }) {
    const { startServer } = await import("@scenario-simulator/web");
    const port = Number(args.port ?? 5173);
    const rootDir = resolveRootDir(args.root);
    await startServer({ port, rootDir });
  },
});
