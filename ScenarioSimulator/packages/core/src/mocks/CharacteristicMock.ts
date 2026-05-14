import type { Accessory, Characteristic, Service } from "../types/api.js";
import type { HC } from "../generated/HC.js";
import type { CharSpec } from "../generated/charMetadata.js";
import { ValueCoercer } from "../metadata/ValueCoercer.js";

/**
 * Хост характеристики предоставляет ссылки на сервис и аксессуар,
 * а также способ уведомить hub об изменении значения.
 *
 * Реализуется HubMock — вынесено в interface, чтобы избежать круговой
 * зависимости между mocks и hub.
 */
export interface CharacteristicHost {
  service(): Service;
  accessory(): Accessory;
  onChange(char: CharacteristicMock, oldValue: unknown, newValue: unknown): void;
}

export type CharacteristicMockInit = {
  id: number;
  hc: HC;
  spec: CharSpec;
  name?: string;
  initialValue?: unknown;
  host: CharacteristicHost;
  coercer: ValueCoercer;
  strict?: boolean;
};

export class CharacteristicMock implements Characteristic {
  readonly id: number;
  readonly hc: HC;
  readonly spec: CharSpec;
  private value: unknown;
  private statusVisible = true;
  private notifyEnabled = true;
  private displayName: string;
  private readonly host: CharacteristicHost;
  private readonly coercer: ValueCoercer;
  private readonly strict: boolean;

  constructor(init: CharacteristicMockInit) {
    this.id = init.id;
    this.hc = init.hc;
    this.spec = init.spec;
    this.host = init.host;
    this.coercer = init.coercer;
    this.strict = init.strict === true;
    this.displayName = init.name ?? init.spec.name ?? init.hc;
    const start = init.initialValue !== undefined ? init.initialValue : init.spec.defaultValue;
    this.value = this.coercer.coerce(start, this.spec, { strict: this.strict });
  }

  getAccessory(): Accessory {
    return this.host.accessory();
  }
  getService(): Service {
    return this.host.service();
  }
  getValue(): unknown {
    return this.value;
  }
  setValue(rawValue: unknown): void {
    const next = this.coercer.coerce(rawValue, this.spec, { strict: this.strict });
    const prev = this.value;
    // Для stateless event-характеристик (ProgrammableSwitchEvent, ButtonEvent)
    // повторная запись того же значения — это новое событие, а не дубликат.
    // Признак приходит из generate-char-metadata.ts (эвристика по validValues
    // ключам *_PRESS / *_EVENT в sh_types.json).
    if (prev === next && !this.spec.eventLike) return;
    this.value = next;
    this.host.onChange(this, prev, next);
  }
  /** Принудительная установка без notify — используется при инициализации фикстур. */
  setValueSilent(rawValue: unknown): void {
    this.value = this.coercer.coerce(rawValue, this.spec, { strict: this.strict });
  }
  toggle(): void {
    if (this.spec.format !== "Boolean") return;
    this.setValue(!this.value);
  }
  isStatusVisible(): boolean {
    return this.statusVisible;
  }
  setStatusVisible(statusVisible: boolean): void {
    this.statusVisible = !!statusVisible;
  }
  isNotify(): boolean {
    return this.notifyEnabled;
  }
  setNotify(notify: boolean): void {
    this.notifyEnabled = !!notify;
  }
  getType(): HC {
    return this.hc;
  }
  getUUID(): string {
    const svc = this.host.service() as unknown as { id?: number };
    const acc = this.host.accessory() as unknown as { id?: number };
    return `${acc.id ?? "?"}.${svc.id ?? "?"}.${this.id}`;
  }
  format(): string {
    return this.spec.format;
  }
  getMinValue(): number {
    return this.spec.minValue ?? Number.NEGATIVE_INFINITY;
  }
  getMaxValue(): number {
    return this.spec.maxValue ?? Number.POSITIVE_INFINITY;
  }
  getMinStep(): number {
    return this.spec.minStep ?? 1;
  }
  getName(): string {
    return this.displayName;
  }
}
