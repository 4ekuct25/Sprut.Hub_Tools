import type { Accessory, Characteristic, Service } from "../types/api.js";
import type { HC } from "../generated/HC.js";
import type { HS } from "../generated/HS.js";
import { CharacteristicMock } from "./CharacteristicMock.js";

export type ServiceMockInit = {
  id: number;
  hs: HS;
  name?: string;
  visible?: boolean;
  accessory: () => Accessory;
};

export class ServiceMock implements Service {
  readonly id: number;
  readonly hs: HS;
  private displayName: string;
  private visible: boolean;
  private readonly accessoryRef: () => Accessory;
  private readonly chars: CharacteristicMock[] = [];

  constructor(init: ServiceMockInit) {
    this.id = init.id;
    this.hs = init.hs;
    this.displayName = init.name ?? init.hs;
    this.visible = init.visible !== false;
    this.accessoryRef = init.accessory;
  }

  addCharacteristic(c: CharacteristicMock): void {
    this.chars.push(c);
  }

  removeCharacteristic(id: number): boolean {
    const idx = this.chars.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    this.chars.splice(idx, 1);
    return true;
  }

  getAccessory(): Accessory {
    return this.accessoryRef();
  }
  getCharacteristic(idOrType: number | HC): Characteristic | null {
    if (typeof idOrType === "number") {
      return this.chars.find((c) => c.id === idOrType) ?? null;
    }
    return this.chars.find((c) => c.hc === idOrType) ?? null;
  }
  getCharacteristics(): Characteristic[] {
    return [...this.chars];
  }
  getCharacteristicMocks(): CharacteristicMock[] {
    return this.chars;
  }
  getType(): HS {
    return this.hs;
  }
  isVisible(): boolean {
    return this.visible;
  }
  setVisible(visible: boolean): void {
    this.visible = !!visible;
  }
  getUUID(): string {
    const acc = this.accessoryRef() as unknown as { id?: number };
    return `${acc.id ?? "?"}.${this.id}`;
  }
  getName(): string {
    return this.displayName;
  }
  setName(name: string): void {
    this.displayName = String(name);
  }
}
