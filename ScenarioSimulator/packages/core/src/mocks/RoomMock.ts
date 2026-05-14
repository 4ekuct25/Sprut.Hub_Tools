import type { Accessory, Room } from "../types/api.js";

export class RoomMock implements Room {
  readonly id: number;
  private displayName: string;
  private readonly accessories: Accessory[] = [];

  constructor(id: number, name: string) {
    this.id = id;
    this.displayName = name;
  }

  addAccessory(a: Accessory): void {
    this.accessories.push(a);
  }

  removeAccessory(a: Accessory): void {
    const idx = this.accessories.indexOf(a);
    if (idx >= 0) this.accessories.splice(idx, 1);
  }

  getAccessories(): Accessory[] {
    return [...this.accessories];
  }
  getName(): string {
    return this.displayName;
  }
  setName(name: string): void {
    this.displayName = String(name);
  }
}
