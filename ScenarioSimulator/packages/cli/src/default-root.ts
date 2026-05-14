import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Этот файл лежит в <repo>/ScenarioSimulator/packages/cli/src/.
// Дефолтный корень — родитель ScenarioSimulator (то есть корень репозитория Sprut.Hub_Tools),
// чтобы `bun run cli ...` работал без явного --root, даже если cwd = ScenarioSimulator/.
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT_DIR = resolve(HERE, "../../../..");

export function resolveRootDir(arg: unknown): string {
  return arg ? String(arg) : DEFAULT_ROOT_DIR;
}
