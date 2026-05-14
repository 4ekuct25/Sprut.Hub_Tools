import { readFile } from "node:fs/promises";
import type { LoadedConfig } from "../config/ConfigLoader.js";

export type ScenarioSources = {
  globals: { file: string; source: string }[];
  logic: { file: string; source: string }[];
};

export class ScenarioLoader {
  async load(cfg: LoadedConfig): Promise<ScenarioSources> {
    const [globals, logic] = await Promise.all([
      Promise.all(cfg.globalFiles.map(async (file) => ({ file, source: await readFile(file, "utf-8") }))),
      Promise.all(cfg.logicFiles.map(async (file) => ({ file, source: await readFile(file, "utf-8") }))),
    ]);
    return { globals, logic };
  }
}
