import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SH_TYPES = resolve(__dirname, "../../ScenarioTemplate/sh_types.json");
const OUT = resolve(__dirname, "../packages/core/src/generated/charMetadata.ts");

type ShTypesJson = {
  service: {
    types: {
      types: Array<{
        type: string;
        required?: ShChar[];
        optional?: ShChar[];
      }>;
    };
  };
  characteristic?: {
    types?: { types?: ShChar[] };
  };
};

type ShChar = {
  type: string;
  name?: string;
  format: "Boolean" | "Integer" | "Double" | "String" | "Base64Tlv8" | string;
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  maxLen?: number;
  read?: boolean;
  write?: boolean;
  events?: boolean;
  hidden?: boolean;
  validValues?: Array<{
    value: { intValue?: number; stringValue?: string };
    key: string;
    name?: string;
  }>;
};

type ValidValueDetail = { value: number; key: string; name?: string };

type CharSpec = {
  hc: string;
  name?: string;
  format: string;
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  maxLen?: number;
  readable: boolean;
  writable: boolean;
  events: boolean;
  /**
   * `true` для stateless event-характеристик (нажатие кнопки и т.п.).
   * У них значение — это сигнал: повторная запись `0` после `0` всё равно
   * должна разбудить подписчиков. Распознаём по паттерну `validValues`:
   * ключи `*_PRESS` или `*_EVENT` (HomeKit StatelessProgrammableSwitch и
   * родственные).
   */
  eventLike: boolean;
  defaultValue: unknown;
  validValues?: number[];
  /** Полные сведения о допустимых значениях: интовое значение + ключ + локализованное имя. */
  validValueDetails?: ValidValueDetail[];
};

function isEventLike(c: ShChar): boolean {
  if (c.type === "ButtonEvent") return true;
  if (!c.validValues || c.validValues.length === 0) return false;
  return c.validValues.some((v) => /(_PRESS|_EVENT)$/.test(v.key));
}

function defaultFor(c: ShChar): unknown {
  switch (c.format) {
    case "Boolean":
      return false;
    case "Integer":
      return typeof c.minValue === "number" ? c.minValue : 0;
    case "Double":
      return typeof c.minValue === "number" ? c.minValue : 0;
    case "String":
      return "";
    default:
      return null;
  }
}

function toSpec(c: ShChar): CharSpec {
  const spec: CharSpec = {
    hc: c.type,
    name: c.name,
    format: c.format,
    readable: c.read ?? true,
    writable: c.write ?? false,
    events: c.events ?? false,
    eventLike: isEventLike(c),
    defaultValue: defaultFor(c),
  };
  if (typeof c.minValue === "number") spec.minValue = c.minValue;
  if (typeof c.maxValue === "number") spec.maxValue = c.maxValue;
  if (typeof c.minStep === "number") spec.minStep = c.minStep;
  if (typeof c.maxLen === "number") spec.maxLen = c.maxLen;
  if (c.validValues && c.validValues.length > 0) {
    const details: ValidValueDetail[] = [];
    for (const v of c.validValues) {
      if (typeof v.value.intValue !== "number") continue;
      const d: ValidValueDetail = { value: v.value.intValue, key: v.key };
      if (v.name) d.name = v.name;
      details.push(d);
    }
    if (details.length > 0) {
      spec.validValues = details.map((d) => d.value);
      spec.validValueDetails = details;
    }
  }
  return spec;
}

function merge(existing: CharSpec, next: CharSpec): CharSpec {
  return {
    ...existing,
    readable: existing.readable || next.readable,
    writable: existing.writable || next.writable,
    events: existing.events || next.events,
    eventLike: existing.eventLike || next.eventLike,
  };
}

const raw = readFileSync(SH_TYPES, "utf-8");
const data: ShTypesJson = JSON.parse(raw);

const map = new Map<string, CharSpec>();

function visit(c: ShChar): void {
  if (!c.type) return;
  const spec = toSpec(c);
  const prev = map.get(c.type);
  map.set(c.type, prev ? merge(prev, spec) : spec);
}

for (const service of data.service.types.types) {
  for (const c of service.required ?? []) visit(c);
  for (const c of service.optional ?? []) visit(c);
}
for (const c of data.characteristic?.types?.types ?? []) visit(c);

const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const body = sorted
  .map(([hc, spec]) => `  ${JSON.stringify(hc)}: ${JSON.stringify(spec)}`)
  .join(",\n");

const out = `// AUTO-GENERATED FROM ScenarioTemplate/sh_types.json — do not edit by hand.
// Run: npm run generate

export type CharFormat = "Boolean" | "Integer" | "Double" | "String" | "Base64Tlv8" | string;

export type CharSpec = {
  hc: string;
  name?: string;
  format: CharFormat;
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  maxLen?: number;
  readable: boolean;
  writable: boolean;
  events: boolean;
  /**
   * Stateless event characteristic (StatelessProgrammableSwitch.ProgrammableSwitchEvent,
   * ButtonEvent и т.п.) — повторная запись того же значения должна разбудить
   * подписчиков, потому что это "сигнал", а не "состояние".
   */
  eventLike: boolean;
  defaultValue: unknown;
  validValues?: number[];
  validValueDetails?: { value: number; key: string; name?: string }[];
};

export const CHAR_METADATA: Record<string, CharSpec> = {
${body}
};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, "utf-8");

console.log(`Generated metadata for ${map.size} characteristics → ${OUT}`);
