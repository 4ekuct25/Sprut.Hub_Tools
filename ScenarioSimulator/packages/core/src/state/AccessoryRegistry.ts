import { AccessoryMock } from "../mocks/AccessoryMock.js";
import { CharacteristicMock } from "../mocks/CharacteristicMock.js";
import { RoomMock } from "../mocks/RoomMock.js";
import { ServiceMock } from "../mocks/ServiceMock.js";

export class AccessoryRegistry {
  private readonly accessoriesById = new Map<number, AccessoryMock>();
  private readonly roomsById = new Map<number, RoomMock>();
  private readonly roomsByName = new Map<string, RoomMock>();

  registerAccessory(a: AccessoryMock): void {
    this.accessoriesById.set(a.id, a);
  }

  registerRoom(r: RoomMock): void {
    this.roomsById.set(r.id, r);
    this.roomsByName.set(r.getName(), r);
  }

  getAccessory(id: number): AccessoryMock | null {
    return this.accessoriesById.get(id) ?? null;
  }

  getAccessories(): AccessoryMock[] {
    return [...this.accessoriesById.values()];
  }

  getRooms(): RoomMock[] {
    return [...this.roomsById.values()];
  }

  getRoomByName(name: string): RoomMock | null {
    return this.roomsByName.get(name) ?? null;
  }

  getRoomById(id: number): RoomMock | null {
    return this.roomsById.get(id) ?? null;
  }

  findService(aid: number, sid: number): ServiceMock | null {
    const acc = this.getAccessory(aid);
    if (!acc) return null;
    return (acc.getService(sid) as ServiceMock | null) ?? null;
  }

  findCharacteristic(aid: number, cid: number): CharacteristicMock | null {
    const acc = this.getAccessory(aid);
    if (!acc) return null;
    return (acc.getCharacteristic(cid) as CharacteristicMock | null) ?? null;
  }

  /**
   * Снимает аксессуар с реестра и из комнаты, если был привязан. Не трогает
   * подписки SubscriptionManager — они тихо не сматчатся при отсутствии
   * характеристик удалённого аксессуара.
   */
  removeAccessory(id: number): boolean {
    const acc = this.accessoriesById.get(id);
    if (!acc) return false;
    this.accessoriesById.delete(id);
    const room = acc.getRoom();
    if (room && "removeAccessory" in room) {
      (room as RoomMock).removeAccessory(acc);
    }
    return true;
  }

  /**
   * Удалить комнату по имени или id. У всех её аксессуаров сбрасывается
   * `room` (становятся бескомнатными).
   */
  removeRoom(idOrName: number | string): boolean {
    const room =
      typeof idOrName === "number"
        ? this.roomsById.get(idOrName)
        : this.roomsByName.get(idOrName);
    if (!room) return false;
    for (const acc of this.accessoriesById.values()) {
      if (acc.getRoom() === room) acc.setRoom(null);
    }
    this.roomsById.delete(room.id);
    this.roomsByName.delete(room.getName());
    return true;
  }
}
