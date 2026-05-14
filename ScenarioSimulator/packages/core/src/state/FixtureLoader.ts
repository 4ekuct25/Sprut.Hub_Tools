import { AccessoryMock } from "../mocks/AccessoryMock.js";
import {
  CharacteristicMock,
  type CharacteristicHost,
} from "../mocks/CharacteristicMock.js";
import { RoomMock } from "../mocks/RoomMock.js";
import { ServiceMock } from "../mocks/ServiceMock.js";
import { CharMetadataRegistry } from "../metadata/CharMetadataRegistry.js";
import { ValueCoercer } from "../metadata/ValueCoercer.js";
import type {
  AccessoryFixture,
  CharacteristicFixture,
  RoomFixture,
  ServiceFixture,
  WorldFixture,
} from "../types/fixtures.js";
import { AccessoryRegistry } from "./AccessoryRegistry.js";
import { IdAllocator } from "./IdAllocator.js";

export type FixtureLoaderDeps = {
  registry: AccessoryRegistry;
  metadata: CharMetadataRegistry;
  coercer: ValueCoercer;
  /** Фабрика host'а для конкретной характеристики (обычно HubMock). */
  hostFor: (char: () => CharacteristicMock, service: ServiceMock, accessory: AccessoryMock) => CharacteristicHost;
  strict?: boolean;
};

export class FixtureLoader {
  private readonly serviceIds = new IdAllocator(13);
  private readonly charIds = new IdAllocator(13);
  private readonly roomIds = new IdAllocator(1);

  constructor(private readonly deps: FixtureLoaderDeps) {}

  loadWorld(world: WorldFixture): void {
    for (const r of world.rooms ?? []) this.addRoom(r);
    for (const a of world.accessories ?? []) this.addAccessory(a);
  }

  addRoom(r: RoomFixture): RoomMock {
    const existing = this.deps.registry.getRoomByName(r.name);
    if (existing) return existing;
    const id = r.id ?? this.roomIds.allocate();
    if (r.id !== undefined) this.roomIds.seen(r.id);
    const room = new RoomMock(id, r.name);
    this.deps.registry.registerRoom(room);
    return room;
  }

  addAccessory(fix: AccessoryFixture): AccessoryMock {
    const acc = new AccessoryMock({
      id: fix.id,
      name: fix.name,
      model: fix.model,
      modelId: fix.modelId,
      manufacturer: fix.manufacturer,
      manufacturerId: fix.manufacturerId,
      serial: fix.serial,
      firmware: fix.firmware,
    });

    if (fix.room) {
      const room = this.addRoom({ name: fix.room });
      acc.setRoom(room);
      room.addAccessory(acc);
    }

    for (const sf of fix.services ?? []) this.buildService(acc, sf);

    this.deps.registry.registerAccessory(acc);
    return acc;
  }

  /**
   * Добавить сервис в существующий аксессуар без пересоздания. Используется
   * UI ручной проверки, где порядок сервисов и id уже добавленных не должны
   * меняться.
   */
  addServiceTo(acc: AccessoryMock, sf: ServiceFixture): ServiceMock {
    return this.buildService(acc, sf);
  }

  /**
   * Добавить характеристику в существующий сервис. См. {@link addServiceTo}.
   */
  addCharacteristicTo(acc: AccessoryMock, service: ServiceMock, cf: CharacteristicFixture): CharacteristicMock {
    return this.buildChar(acc, service, cf);
  }

  private buildService(acc: AccessoryMock, sf: ServiceFixture): ServiceMock {
    const sid = sf.id ?? this.serviceIds.allocate();
    if (sf.id !== undefined) this.serviceIds.seen(sf.id);

    const service = new ServiceMock({
      id: sid,
      hs: sf.type,
      name: sf.name,
      visible: sf.visible,
      accessory: () => acc,
    });
    acc.addService(service);

    for (const cf of sf.characteristics ?? []) this.buildChar(acc, service, cf);
    return service;
  }

  private buildChar(acc: AccessoryMock, service: ServiceMock, cf: CharacteristicFixture): CharacteristicMock {
    const cid = cf.id ?? this.charIds.allocate();
    if (cf.id !== undefined) this.charIds.seen(cf.id);

    const spec = this.deps.metadata.spec(cf.type);
    let char: CharacteristicMock;
    const charRef = () => char;
    const host = this.deps.hostFor(charRef, service, acc);
    char = new CharacteristicMock({
      id: cid,
      hc: cf.type,
      spec,
      name: cf.name ?? spec.name,
      initialValue: cf.value,
      host,
      coercer: this.deps.coercer,
      strict: this.deps.strict,
    });
    if (cf.statusVisible !== undefined) char.setStatusVisible(cf.statusVisible);
    if (cf.notify !== undefined) char.setNotify(cf.notify);
    service.addCharacteristic(char);
    return char;
  }
}
