import type { CharSpec } from "../generated/charMetadata.js";

export class CoercionError extends Error {
  constructor(message: string, readonly spec: CharSpec, readonly rawValue: unknown) {
    super(message);
    this.name = "CoercionError";
  }
}

export type CoerceOptions = { strict?: boolean };

export class ValueCoercer {
  coerce(rawValue: unknown, spec: CharSpec, opts: CoerceOptions = {}): unknown {
    const strict = opts.strict === true;
    switch (spec.format) {
      case "Boolean":
        return this.toBoolean(rawValue, strict, spec);
      case "Integer":
      case "Long":
        return this.toInteger(rawValue, strict, spec);
      case "Double":
        return this.toDouble(rawValue, strict, spec);
      case "String":
      case "Base64Tlv8":
        return this.toString(rawValue, strict, spec);
      default:
        return rawValue;
    }
  }

  private toBoolean(v: unknown, strict: boolean, spec: CharSpec): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const lower = v.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0" || lower === "") return false;
    }
    if (strict) throw new CoercionError(`Cannot coerce to Boolean: ${String(v)}`, spec, v);
    return Boolean(v);
  }

  private toInteger(v: unknown, strict: boolean, spec: CharSpec): number {
    const num = Number(v);
    if (Number.isNaN(num)) {
      if (strict) throw new CoercionError(`Not a number: ${String(v)}`, spec, v);
      return spec.minValue ?? 0;
    }
    let result = Math.trunc(num);
    if (typeof spec.minValue === "number") result = Math.max(result, spec.minValue);
    if (typeof spec.maxValue === "number") result = Math.min(result, spec.maxValue);
    if (spec.validValues && !spec.validValues.includes(result)) {
      if (strict)
        throw new CoercionError(
          `Value ${result} not in validValues [${spec.validValues.join(",")}]`,
          spec,
          v,
        );
    }
    return result;
  }

  private toDouble(v: unknown, strict: boolean, spec: CharSpec): number {
    const num = Number(v);
    if (Number.isNaN(num)) {
      if (strict) throw new CoercionError(`Not a number: ${String(v)}`, spec, v);
      return spec.minValue ?? 0;
    }
    let result = num;
    if (typeof spec.minValue === "number") result = Math.max(result, spec.minValue);
    if (typeof spec.maxValue === "number") result = Math.min(result, spec.maxValue);
    return result;
  }

  private toString(v: unknown, strict: boolean, spec: CharSpec): string {
    if (v === null || v === undefined) {
      if (strict) throw new CoercionError(`Null/undefined for String`, spec, v);
      return "";
    }
    let s = String(v);
    if (typeof spec.maxLen === "number" && s.length > spec.maxLen) {
      s = s.slice(0, spec.maxLen);
    }
    return s;
  }
}
