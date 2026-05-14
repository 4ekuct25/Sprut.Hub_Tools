import type { HC } from "../generated/HC.js";
import type { HS } from "../generated/HS.js";

export type CharacteristicFixture = {
  id?: number;
  type: HC;
  name?: string;
  value?: unknown;
  statusVisible?: boolean;
  notify?: boolean;
};

export type ServiceFixture = {
  id?: number;
  type: HS;
  name?: string;
  visible?: boolean;
  characteristics?: CharacteristicFixture[];
};

export type AccessoryFixture = {
  id: number;
  name?: string;
  room?: string;
  model?: string;
  modelId?: string;
  manufacturer?: string;
  manufacturerId?: string;
  serial?: string;
  firmware?: string;
  services?: ServiceFixture[];
};

export type RoomFixture = {
  id?: number;
  name: string;
};

export type WorldFixture = {
  rooms?: RoomFixture[];
  accessories?: AccessoryFixture[];
};
