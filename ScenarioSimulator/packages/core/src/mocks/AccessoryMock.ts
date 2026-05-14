import type { Accessory, Characteristic, Room, Service } from "../types/api.js";
import type { HS } from "../generated/HS.js";
import { ServiceMock } from "./ServiceMock.js";

export type AccessoryMockInit = {
  id: number;
  name?: string;
  model?: string;
  modelId?: string;
  manufacturer?: string;
  manufacturerId?: string;
  serial?: string;
  firmware?: string;
};

export class AccessoryMock implements Accessory {
  readonly id: number;
  private displayName: string;
  private modelStr: string;
  private modelIdStr: string;
  private manufacturerStr: string;
  private manufacturerIdStr: string;
  private serialStr: string;
  private firmwareStr: string;
  private room: Room | null = null;
  private readonly services: ServiceMock[] = [];

  constructor(init: AccessoryMockInit) {
    this.id = init.id;
    this.displayName = init.name ?? `Accessory ${init.id}`;
    this.modelStr = init.model ?? "";
    this.modelIdStr = init.modelId ?? "";
    this.manufacturerStr = init.manufacturer ?? "";
    this.manufacturerIdStr = init.manufacturerId ?? "";
    this.serialStr = init.serial ?? "";
    this.firmwareStr = init.firmware ?? "";
  }

  addService(s: ServiceMock): void {
    this.services.push(s);
  }

  removeService(id: number): boolean {
    const idx = this.services.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    this.services.splice(idx, 1);
    return true;
  }

  setRoom(room: Room | null): void {
    this.room = room;
  }

  getServiceMocks(): ServiceMock[] {
    return this.services;
  }

  getServices(visible?: boolean, hs?: HS): Service[] {
    let list: ServiceMock[] = this.services;
    if (visible !== undefined) list = list.filter((s) => s.isVisible() === visible);
    if (hs !== undefined) list = list.filter((s) => s.getType() === hs);
    return list;
  }

  getService(idOrType: number | string | HS): Service | null {
    if (typeof idOrType === "number") {
      return this.services.find((s) => s.id === idOrType) ?? null;
    }
    if (typeof idOrType === "string" && /^\d+$/.test(idOrType)) {
      const n = Number(idOrType);
      return this.services.find((s) => s.id === n) ?? null;
    }
    return this.services.find((s) => s.hs === idOrType) ?? null;
  }

  getCharacteristic(id: number | string): Characteristic | null {
    const n = typeof id === "number" ? id : Number(id);
    return this.findCharByNumericId(n);
  }

  private findCharByNumericId(id: number): Characteristic | null {
    for (const s of this.services) {
      const c = s.getCharacteristic(id);
      if (c) return c;
    }
    return null;
  }

  getServiceByUUID(uuid: string): Service | null {
    return this.services.find((s) => s.getUUID() === uuid) ?? null;
  }

  getRoom(): Room | null {
    return this.room;
  }
  getUUID(): string {
    return String(this.id);
  }
  getName(): string {
    return this.displayName;
  }
  setName(name: string): void {
    this.displayName = String(name);
  }
  getModel(): string {
    return this.modelStr;
  }
  getModelId(): string {
    return this.modelIdStr;
  }
  getManufacturer(): string {
    return this.manufacturerStr;
  }
  getManufacturerId(): string {
    return this.manufacturerIdStr;
  }
  getSerial(): string {
    return this.serialStr;
  }
  getFirmware(): string {
    return this.firmwareStr;
  }
  getSnapshot(_width?: number, _height?: number): number[] {
    return [];
  }
}
