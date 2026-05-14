import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPRUTHUB_JS = resolve(__dirname, "../../ScenarioTemplate/spruthub.js");
const OUT_DIR = resolve(__dirname, "../packages/core/src/generated");

function extractEnum(source: string, name: string): string[] {
  const re = new RegExp(`declare\\s+enum\\s+${name}\\s*\\{([^}]+)\\}`);
  const match = source.match(re);
  if (!match) throw new Error(`Enum ${name} not found in spruthub.js`);
  return match[1]!
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function renderConst(name: string, values: string[]): string {
  const entries = values.map((v) => `  ${v}: "${v}"`).join(",\n");
  return `// AUTO-GENERATED FROM ScenarioTemplate/spruthub.js — do not edit by hand.
// Run: npm run generate

export const ${name} = {
${entries}
} as const;

export type ${name} = (typeof ${name})[keyof typeof ${name}];
`;
}

const source = readFileSync(SPRUTHUB_JS, "utf-8");
const hc = extractEnum(source, "HC");
const hs = extractEnum(source, "HS");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "HC.ts"), renderConst("HC", hc), "utf-8");
writeFileSync(resolve(OUT_DIR, "HS.ts"), renderConst("HS", hs), "utf-8");

console.log(`Generated ${hc.length} HC values, ${hs.length} HS values → ${OUT_DIR}`);
