import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

/** Минимальный glob: поддерживает `*` и `**`. */
function globToRegExp(pattern: string): RegExp {
  let p = pattern.replace(/[.+^$()|[\]\\]/g, "\\$&");
  p = p.replace(/\*\*\//g, "::DSTAR::").replace(/\*\*/g, "::DSTAR::");
  p = p.replace(/\*/g, "[^/]*");
  p = p.replace(/::DSTAR::/g, ".*");
  return new RegExp(`^${p}$`);
}

export class TestFileFinder {
  /** Возвращает абсолютные пути совпадающих файлов внутри testsDir. */
  async find(testsDir: string, patterns: string[]): Promise<string[]> {
    const all = await this.walk(testsDir, "");
    const regs = patterns.map(globToRegExp);
    const matches = all.filter((f) => regs.some((r) => r.test(f.relative)));
    return matches.map((f) => f.absolute);
  }

  private async walk(root: string, relPrefix: string): Promise<{ absolute: string; relative: string }[]> {
    const out: { absolute: string; relative: string }[] = [];
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".tests") continue;
      const full = resolve(root, e.name);
      const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        const child = await this.walk(full, rel);
        out.push(...child);
      } else if (e.isFile()) {
        out.push({ absolute: full, relative: rel });
      }
    }
    return out;
  }
}
