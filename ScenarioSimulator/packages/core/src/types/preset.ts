import type { AccessoryFixture, RoomFixture, WorldFixture } from "./fixtures.js";

/**
 * Описание устройства для ручной проверки. Расширяет AccessoryFixture
 * флагом `target`: устройство, на изменение характеристик которого
 * реагирует логический сценарий. На странице ручной проверки тайл такого
 * устройства подсвечивается и его характеристики автоматически дергают
 * `trigger(source, value, variables, options, context)` сценария.
 */
export type PresetAccessory = AccessoryFixture & {
  target?: boolean;
};

export type ScenarioPreset = {
  /** Человекочитаемое имя preset (для UI), не используется в логике. */
  name?: string;
  /** Краткое описание preset. */
  description?: string;
  /** Начальные значения опций сценария (имя → значение). */
  options?: Record<string, unknown>;
  /** Начальные значения переменных. */
  variables?: Record<string, unknown>;
  /** Начальное время в ISO-8601, например "2026-05-12T08:00:00". */
  time?: string;
  sunrise?: string;
  sunset?: string;
  rooms?: RoomFixture[];
  accessories?: PresetAccessory[];
};

/** Развернуть preset в WorldFixture для FixtureLoader. */
export function presetToWorld(preset: ScenarioPreset): WorldFixture {
  const rooms = preset.rooms ?? [];
  const accessories = (preset.accessories ?? []).map((a) => {
    const { target: _ignore, ...rest } = a;
    return rest as AccessoryFixture;
  });
  return { rooms, accessories };
}

/** Найти id первого target-устройства в preset. */
export function findTargetAccessoryId(preset: ScenarioPreset): number | null {
  for (const a of preset.accessories ?? []) {
    if (a.target) return a.id;
  }
  return null;
}
