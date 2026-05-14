import type { ManualAction, ManualSession } from "./ManualSession.js";
import type { ScenarioPreset } from "@scenario-simulator/core";

/**
 * Сгенерировать тестовый файл из записанной сессии. На выходе — describe/it
 * который восстанавливает мир из preset и проигрывает действия пользователя.
 * Ассерты не угадываем — оставляем пользователю TODO-маркер.
 */
export function generateTest(session: ManualSession, opts?: { name?: string }): string {
  const actions = session.recordedActions();
  const initAction = actions.find((a) => a.kind === "init") as { preset: ScenarioPreset | null } | undefined;
  const preset = initAction?.preset ?? null;
  const testName = opts?.name ?? "Recorded manual session";

  const lines: string[] = [];
  lines.push(`// Авто-сгенерировано ScenarioSimulator из ручной проверки.`);
  lines.push(`// Дополни ассерты в TODO-местах.`);
  lines.push(``);
  lines.push(`describe(${JSON.stringify(session.scenarioName)}, () => {`);
  lines.push(`  it(${JSON.stringify(testName)}, ({ hub, scenario, time, variables }) => {`);

  if (preset) {
    if (preset.time) lines.push(`    time.set(${JSON.stringify(preset.time)});`);
    for (const r of preset.rooms ?? []) {
      lines.push(`    hub.addRoom(${JSON.stringify({ name: r.name })});`);
    }
    for (const a of preset.accessories ?? []) {
      const { target: _t, ...rest } = a;
      lines.push(`    hub.addAccessory(${JSON.stringify(rest)});`);
    }
    if (preset.variables) {
      lines.push(`    Object.assign(variables.local, ${JSON.stringify(preset.variables)});`);
    }
  }

  const options = collectOptions(actions, (preset?.options as Record<string, unknown>) ?? {});
  const variables = collectVariables(actions, (preset?.variables as Record<string, unknown>) ?? {});
  lines.push(``);
  lines.push(`    const options = ${JSON.stringify(options, null, 2).split("\n").join("\n    ")};`);
  lines.push(`    const localVars = ${JSON.stringify(variables, null, 2).split("\n").join("\n    ")};`);

  for (const a of actions) {
    if (a.kind === "init") continue;
    switch (a.kind) {
      case "setChar":
        lines.push(`    hub.acc(${a.aid}).getCharacteristic(${a.cid}).setValue(${JSON.stringify(a.value)});`);
        lines.push(
          `    scenario.run({ source: hub.acc(${a.aid}).getCharacteristic(${a.cid}), value: ${JSON.stringify(a.value)}, variables: localVars, options });`,
        );
        break;
      case "setOption":
        lines.push(`    options[${JSON.stringify(a.name)}] = ${JSON.stringify(a.value)};`);
        break;
      case "setVariable":
        lines.push(`    localVars[${JSON.stringify(a.name)}] = ${JSON.stringify(a.value)};`);
        break;
      case "time":
        if (a.iso) lines.push(`    time.set(${JSON.stringify(a.iso)});`);
        if (typeof a.advanceMs === "number") lines.push(`    time.tick(${a.advanceMs});`);
        break;
      case "sun":
        if (a.sunrise) lines.push(`    /* sunrise=${a.sunrise} — задаётся через ctx.sun */`);
        if (a.sunset) lines.push(`    /* sunset=${a.sunset} — задаётся через ctx.sun */`);
        break;
      case "addRoom":
        lines.push(`    hub.addRoom({ name: ${JSON.stringify(a.name)} });`);
        break;
      case "addAccessory":
        const { target: _at, ...arest } = a.accessory;
        lines.push(`    hub.addAccessory(${JSON.stringify(arest)});`);
        break;
      case "addService":
        lines.push(`    /* TODO: добавить сервис ${a.service.type} в аксессуар ${a.aid} */`);
        break;
      case "addChar":
        lines.push(`    /* TODO: добавить характеристику ${a.char.type} в сервис ${a.sid} */`);
        break;
      case "trigger":
        lines.push(
          `    scenario.run({ source: hub.acc(${a.aid}).getCharacteristic(${a.cid}), value: hub.acc(${a.aid}).getCharacteristic(${a.cid}).getValue(), variables: localVars, options });`,
        );
        break;
    }
  }

  lines.push(``);
  lines.push(`    // TODO: добавь expect(...) для проверки результата`);
  lines.push(`  });`);
  lines.push(`});`);
  lines.push(``);
  return lines.join("\n");
}

function collectOptions(
  actions: ManualAction[],
  initial: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...initial };
  for (const a of actions) if (a.kind === "setOption") out[a.name] = a.value;
  return out;
}

function collectVariables(
  actions: ManualAction[],
  initial: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...initial };
  for (const a of actions) if (a.kind === "setVariable") out[a.name] = a.value;
  return out;
}
