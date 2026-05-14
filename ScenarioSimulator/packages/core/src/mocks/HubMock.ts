import type { HC } from "../generated/HC.js";
import type { HS } from "../generated/HS.js";
import type { Accessory, Characteristic, Hub, Room, Task } from "../types/api.js";
import type { AccessoryRegistry } from "../state/AccessoryRegistry.js";
import type { SubscriptionManager } from "../subscriptions/SubscriptionManager.js";
import type { CharacteristicHost } from "./CharacteristicMock.js";
import type { CharacteristicMock } from "./CharacteristicMock.js";
import type { ServiceMock } from "./ServiceMock.js";
import type { AccessoryMock } from "./AccessoryMock.js";

export class HubMock implements Hub {
  constructor(
    private readonly registry: AccessoryRegistry,
    private readonly subs: SubscriptionManager,
  ) {}

  /**
   * Host для каждой характеристики. Хранит ссылки на её сервис и аксессуар
   * и проксирует уведомления об изменениях в SubscriptionManager.
   */
  hostFor(charRef: () => CharacteristicMock, service: ServiceMock, accessory: AccessoryMock): CharacteristicHost {
    return {
      service: () => service,
      accessory: () => accessory,
      onChange: (char, oldValue, newValue) => {
        this.subs.fireChange(char, oldValue, newValue);
      },
    };
  }

  getAccessory(id: number | string): Accessory | null {
    return this.registry.getAccessory(Number(id));
  }
  getAccessories(): Accessory[] {
    return this.registry.getAccessories();
  }
  getCharacteristicValue(aid: number | string, cid: number | string): unknown {
    const c = this.registry.findCharacteristic(Number(aid), Number(cid));
    return c ? c.getValue() : undefined;
  }
  setCharacteristicValue(aid: number | string, cid: number | string, value: unknown): void {
    const c = this.registry.findCharacteristic(Number(aid), Number(cid));
    if (!c) return;
    c.setValue(value);
  }
  toggleCharacteristicValue(aid: number | string, cid: number | string): void {
    const c = this.registry.findCharacteristic(Number(aid), Number(cid));
    if (!c) return;
    c.toggle();
  }
  getCharacteristic(aid: number | string, cid: number | string): Characteristic | null {
    return this.registry.findCharacteristic(Number(aid), Number(cid));
  }
  getRooms(): Room[] {
    return this.registry.getRooms();
  }
  subscribe(handler: (...args: unknown[]) => void, ...args: unknown[]): Task {
    return this.subs.subscribe(handler, ...args);
  }
  subscribeWithCondition(
    cond: string,
    value: string,
    hs: HS[],
    hc: HC[],
    handler: (...args: unknown[]) => void,
    ...args: unknown[]
  ): Task {
    return this.subs.subscribeWithCondition(cond, value, hs, hc, handler, ...args);
  }
}
