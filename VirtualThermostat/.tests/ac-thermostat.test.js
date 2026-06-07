// Тесты форка: управление кондиционером (сервис Термостат) из виртуального термостата.
//
// README §"Управление кондиционером":
//   1. Требуется охлаждение (currentState=2): кондиционер → Целевой режим 2 (Охлаждение),
//      Целевая температура = acCoolTemp (форсированная).
//   2. Требуется нагрев (currentState=1): кондиционер → режим 1 (Нагрев), температура = acHeatTemp.
//   3. Требование снято (currentState=0 или targetState=0): кондиционер → режим 0 (Выключен).
//   4. Целевая температура кондиционера ограничивается min/max его характеристики.
//   5. Защита: выбор самого виртуального термостата в качестве кондиционера игнорируется.
//   6. Вентилятор кондиционера управляется по разнице температур (опция acFanControl).
//   7. Отказ датчика: behavior 0 → кондиционер OFF, 1 → Нагрев, 2 → Охлаждение.

function makeThermostat(hub, id, currentState, targetState, opts) {
  opts = opts || {};
  const chars = [
    { type: HC.CurrentHeatingCoolingState, value: currentState != null ? currentState : 0 },
    { type: HC.TargetHeatingCoolingState, value: targetState != null ? targetState : 0 },
    { type: HC.CurrentTemperature, value: opts.currentTemp != null ? opts.currentTemp : 20 },
    { type: HC.TargetTemperature, value: opts.targetTemp != null ? opts.targetTemp : 22 },
  ];
  if (opts.fanSpeed != null) {
    chars.push({ type: HC.C_FanSpeed, value: opts.fanSpeed });
  }
  return hub.addAccessory({
    id, name: 'Термостат', room: 'Гостиная',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: true }],
      },
      {
        type: HS.Thermostat,
        characteristics: chars,
      },
    ],
  });
}

// Кондиционер: аксессуар с сервисом Термостат ("Режим кондиционера"),
// как у VIOMI Cross 18000BTU.
function makeAc(hub, id, opts) {
  opts = opts || {};
  return hub.addAccessory({
    id, name: 'Кондиционер', room: 'Гостиная',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: opts.online !== false }],
      },
      {
        type: HS.Thermostat,
        characteristics: [
          { type: HC.CurrentHeatingCoolingState, value: opts.currentState != null ? opts.currentState : 0 },
          { type: HC.TargetHeatingCoolingState, value: opts.targetState != null ? opts.targetState : 0 },
          { type: HC.CurrentTemperature, value: opts.currentTemp != null ? opts.currentTemp : 28 },
          { type: HC.TargetTemperature, value: opts.targetTemp != null ? opts.targetTemp : 24 },
          { type: HC.C_FanSpeed, value: opts.fanSpeed != null ? opts.fanSpeed : 0 },
        ],
      },
    ],
  });
}

function makeTempSensor(hub, id, temp, online) {
  return hub.addAccessory({
    id, name: 'Датчик температуры', room: 'Гостиная',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: online !== false }],
      },
      {
        type: HS.TemperatureSensor,
        characteristics: [{ type: HC.CurrentTemperature, value: temp != null ? temp : 25 }],
      },
    ],
  });
}

function baseOptions(overrides) {
  const o = {
    sensor: '',
    heatingRelay: '',
    coolingRelay: '',
    acThermostat: '',
    acCoolTemp: 17,
    acHeatTemp: 30,
    acFanControl: true,
    fanTempStep: 0.5,
    fanSpeedManualLock: true,
    emulateThermostat: false,
    hysteresis: 0.5,
    failureBehavior: 0,
    failureTimeout: 240,
    debug: false,
  };
  if (overrides) for (const k of Object.keys(overrides)) o[k] = overrides[k];
  return o;
}

function freshVars() {
  return {
    lastTemp: undefined,
    lastUpdateTime: undefined,
    subscribed: false,
    subscribe: undefined,
    relaySubscribe: undefined,
    relaySubscribed: false,
    fanSpeedManuallySet: false,
    acFanSpeedManuallySet: false,
    acLastSetFanSpeed: undefined,
    acLastSetState: undefined,
    acLastSetTemp: undefined,
    acManualOverride: false,
    acSubscribe: undefined,
    acSubscribed: false,
    acLastCommandTime: undefined,
    acReassertCount: 0,
    midnightTask: undefined,
    failureCheckTask: undefined,
    sensorFailed: false,
    lastUserTargetState: undefined,
  };
}

function acUUID(ac) {
  return ac.getService(HS.Thermostat).getUUID();
}

// Делает вид, что окно подавления запоздалых событий (AC_ECHO_WINDOW_MS) истекло —
// последующие события кондиционера трактуются как настоящее ручное вмешательство.
function expireEchoWindow(vars) {
  if (vars.acLastCommandTime != null) vars.acLastCommandTime = Date.now() - 31000;
}

function runTrigger(scenario, t, options, vars, value) {
  scenario.run({
    source: t.char(HS.Thermostat, HC.TargetHeatingCoolingState),
    value: value != null ? value : t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue(),
    variables: vars,
    options,
    context: 'LOGIC[1] <- C[10.13.0] <- CLOUD[0]',
  });
}

// ---------------------------------------------------------------------------
describe('AC §"Требуется охлаждение"', () => {
  it('currentState=2 → кондиционер: режим 2, целевая температура = acCoolTemp', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 2);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(17);
  });

  it('требование снято (currentState=0, target=2) → кондиционер выключается', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 2, { currentTemp: 23.5, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 2, targetTemp: 17 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 2);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
  });

  it('целевой режим термостата 0 (Выключен) → кондиционер выключается', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 0, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 2, targetTemp: 17 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 0);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
  });
});

describe('AC §"Требуется нагрев"', () => {
  it('currentState=1 → кондиционер: режим 1, целевая температура = acHeatTemp', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 1, 1, { currentTemp: 19, targetTemp: 22 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 1);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(1);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(30);
  });
});

describe('AC §"Ограничение целевой температуры"', () => {
  it('acCoolTemp=5 ниже минимума характеристики (10) → ставится минимум', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac), acCoolTemp: 5 }), freshVars(), 2);

    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(10);
  });

  it('acHeatTemp=45 выше максимума характеристики (38) → ставится максимум', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 1, 1, { currentTemp: 19, targetTemp: 22 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac), acHeatTemp: 45 }), freshVars(), 1);

    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(38);
  });
});

describe('AC §"Защита от выбора самого себя"', () => {
  it('acThermostat = UUID самого виртуального термостата → ошибка в лог, режим термостата не сломан', ({ hub, scenario, logs }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });

    runTrigger(scenario, t, baseOptions({ acThermostat: t.getService(HS.Thermostat).getUUID() }), freshVars(), 2);

    const errors = logs.byLevel('error');
    const hasGuardLog = errors.some((e) => e.message.indexOf('выбран сам виртуальный термостат') >= 0);
    expect(hasGuardLog).toBe(true);
    // Состояние термостата не тронуто логикой кондиционера
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });
});

describe('AC §"Вентилятор кондиционера"', () => {
  it('охлаждение, разница 3°C (шаг 0.5) → скорость 5 (Турбо)', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 0 });
    const vars = freshVars();

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), vars, 2);

    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(5);
    expect(vars.acLastSetFanSpeed).toBe(5);
  });

  it('разница 0.7°C (шаг 0.5) → скорость 2 (Медленно)', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 24.7, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 0 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 2);

    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(2);
  });

  it('acFanControl=false → вентилятор не трогаем', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 3 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac), acFanControl: false }), freshVars(), 2);

    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(3);
  });

  it('термостат выключен → вентилятор кондиционера не трогаем', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 0, { currentTemp: 24, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 4 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 0);

    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(4);
  });

  it('пользователь сменил скорость вручную → фиксация, сценарий не перезаписывает', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 0 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    // Первый прогон: сценарий ставит 5
    runTrigger(scenario, t, options, vars, 2);
    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(5);

    // Пользователь руками ставит 2
    ac.char(HS.Thermostat, HC.C_FanSpeed).setValue(2);

    // Второй прогон: скорость не перезаписывается, стоит фиксация
    runTrigger(scenario, t, options, vars, 2);
    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(2);
    expect(vars.acFanSpeedManuallySet).toBe(true);
  });

  it('пользователь вернул Авто (0) → фиксация снимается, сценарий снова управляет', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 0 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    ac.char(HS.Thermostat, HC.C_FanSpeed).setValue(2);
    runTrigger(scenario, t, options, vars, 2);
    expect(vars.acFanSpeedManuallySet).toBe(true);

    // Возврат в Авто
    ac.char(HS.Thermostat, HC.C_FanSpeed).setValue(0);
    runTrigger(scenario, t, options, vars, 2);

    expect(vars.acFanSpeedManuallySet).toBe(false);
    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(5);
  });

  it('fanSpeedManualLock=false → ручное значение перезаписывается сценарием', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { fanSpeed: 0 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac), fanSpeedManualLock: false });

    runTrigger(scenario, t, options, vars, 2);
    ac.char(HS.Thermostat, HC.C_FanSpeed).setValue(2);
    runTrigger(scenario, t, options, vars, 2);

    expect(ac.char(HS.Thermostat, HC.C_FanSpeed).getValue()).toBe(5);
    expect(vars.acFanSpeedManuallySet).toBe(false);
  });
});

describe('AC §"Отказ датчика"', () => {
  it('sensorFailed + behavior=0 (Отключить) → кондиционер OFF', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const sensor = makeTempSensor(hub, 30, 27);
    const ac = makeAc(hub, 20, { targetState: 2, targetTemp: 17 });
    const vars = freshVars();
    vars.sensorFailed = true;

    runTrigger(scenario, t, baseOptions({
      acThermostat: acUUID(ac),
      sensor: sensor.getService(HS.TemperatureSensor).getUUID(),
      failureBehavior: 0,
    }), vars, 2);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
  });

  it('sensorFailed + behavior=2 (Охлаждение) → кондиционер в режим Охлаждение', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 2, { currentTemp: 24, targetTemp: 24 });
    const sensor = makeTempSensor(hub, 30, 24);
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    vars.sensorFailed = true;

    runTrigger(scenario, t, baseOptions({
      acThermostat: acUUID(ac),
      sensor: sensor.getService(HS.TemperatureSensor).getUUID(),
      failureBehavior: 2,
    }), vars, 2);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(17);
  });

  it('sensorFailed + behavior=1 (Нагрев) → кондиционер в режим Нагрев', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 1, { currentTemp: 20, targetTemp: 22 });
    const sensor = makeTempSensor(hub, 30, 20);
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    vars.sensorFailed = true;

    runTrigger(scenario, t, baseOptions({
      acThermostat: acUUID(ac),
      sensor: sensor.getService(HS.TemperatureSensor).getUUID(),
      failureBehavior: 1,
    }), vars, 1);

    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(1);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(30);
  });
});

describe('AC §"Кондиционер не в сети"', () => {
  it('оффлайн → ошибка в лог, но команда всё равно отправляется', ({ hub, scenario, logs }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { online: false, targetState: 0 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), freshVars(), 2);

    const errors = logs.byLevel('error');
    const hasOfflineLog = errors.some((e) => e.message.indexOf('не в сети') >= 0);
    expect(hasOfflineLog).toBe(true);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });
});

describe('AC §"Ручное вмешательство"', () => {
  it('пользователь выключил кондиционер пультом при активном охлаждении → виртуальный термостат выключается, кондиционер не включается обратно', ({ hub, scenario, logs }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    // Сценарий включил охлаждение (создаётся подписка)
    runTrigger(scenario, t, options, vars, 2);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);

    // Пользователь выключает кондиционер пультом (окно подавления уже истекло)
    expireEchoWindow(vars);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(0);

    // Виртуальный термостат выключился, флаг ручного управления стоит
    expect(vars.acManualOverride).toBe(true);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    // Кондиционер остался выключенным (сценарий не вернул его обратно)
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    // Предупреждение в логе
    const warns = logs.byLevel('warn');
    const hasLog = warns.some((e) => e.message.indexOf('Кондиционер изменён вручную') >= 0);
    expect(hasLog).toBe(true);
  });

  it('пользователь сменил режим на Авто (3) пультом → термостат выключается, режим кондиционера не перезаписывается', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    expireEchoWindow(vars);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(3);

    expect(vars.acManualOverride).toBe(true);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(3);
  });

  it('пользователь сменил целевую температуру кондиционера при активном охлаждении → термостат выключается', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(17);

    expireEchoWindow(vars);
    ac.char(HS.Thermostat, HC.TargetTemperature).setValue(22);

    expect(vars.acManualOverride).toBe(true);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(22);
  });

  it('эхо собственных команд сценария → НЕ считается ручным вмешательством', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();

    // Сценарий сам ставит режим 2 и температуру 17 — подписка создаётся в этом же прогоне
    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), vars, 2);

    expect(vars.acManualOverride).toBe(false);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });

  it('термостат выключен → пользователь свободно крутит кондиционер, override не ставится', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 0, { currentTemp: 24, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac) }), vars, 0);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);

    expect(vars.acManualOverride).toBe(false);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });

  it('смена уставки при выключенном сценарием кондиционере (standby) → игнорируется', ({ hub, scenario }) => {
    // Термостат охлаждает, потом цель достигнута (currentState=0) — кондиционер выключен сценарием
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    t.char(HS.Thermostat, HC.CurrentHeatingCoolingState).setValue(0);
    runTrigger(scenario, t, options, vars, 2);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);

    // Интеграция/устройство меняет уставку при выключенном кондиционере
    ac.char(HS.Thermostat, HC.TargetTemperature).setValue(26);

    expect(vars.acManualOverride).toBe(false);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });

  it('во время override температурные изменения НЕ выключают кондиционер пользователя', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    // Пользователь ставит режим Авто пультом → override
    expireEchoWindow(vars);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(3);
    expect(vars.acManualOverride).toBe(true);

    // Приходит обновление температуры (термостат уже выключен, off-ветка)
    scenario.run({
      source: t.char(HS.Thermostat, HC.CurrentTemperature),
      value: 26, variables: vars, options,
      context: 'LOGIC[1] <- C[10.12.0] <- CLOUD[0]',
    });

    // Кондиционер остался в режиме пользователя
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(3);
  });

  it('пользователь снова включил термостат → override снимается, сценарий вернул управление', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    expireEchoWindow(vars);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(0); // пульт: выкл
    expect(vars.acManualOverride).toBe(true);

    // Пользователь включает виртуальный термостат: Охлаждение
    t.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);
    t.char(HS.Thermostat, HC.CurrentHeatingCoolingState).setValue(2);
    runTrigger(scenario, t, options, vars, 2);

    expect(vars.acManualOverride).toBe(false);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(17);
  });
});

describe('AC §"Окно подавления запоздалых событий"', () => {
  it('запоздалое событие устройства внутри окна → НЕ ручное вмешательство, команда переотправляется', ({ hub, scenario, logs }) => {
    // Сценарий выключает кондиционер (деманд снят), устройство через пару секунд
    // переизлучает старое состояние 2 — как VIOMI в реальной жизни.
    const t = makeThermostat(hub, 10, 0, 2, { currentTemp: 23.5, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 2, targetTemp: 17 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);

    // Запоздалое «2» от устройства (окно ещё активно)
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);

    // Термостат НЕ выключен, override не стоит, кондиционер возвращён в 0
    expect(vars.acManualOverride).toBe(false);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    expect(vars.acReassertCount).toBe(1);
    const warns = logs.byLevel('warn');
    expect(warns.some((e) => e.message.indexOf('повторяю команду') >= 0)).toBe(true);
  });

  it('запоздалое изменение уставки внутри окна → игнорируется', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0, targetTemp: 24 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);
    // Устройство переизлучает свою уставку внутри окна
    ac.char(HS.Thermostat, HC.TargetTemperature).setValue(24);

    expect(vars.acManualOverride).toBe(false);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });

  it('лимит переотправок исчерпан → ручное вмешательство', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 2, { currentTemp: 23.5, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 2, targetTemp: 17 });
    const vars = freshVars();
    const options = baseOptions({ acThermostat: acUUID(ac) });

    runTrigger(scenario, t, options, vars, 2);

    // Устройство упорно сообщает 2 четыре раза подряд (внутри окна)
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);
    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);
    expect(vars.acReassertCount).toBe(3);
    expect(vars.acManualOverride).toBe(false);

    ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).setValue(2);
    expect(vars.acManualOverride).toBe(true);
    expect(t.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
    // Кондиционер остаётся как есть — сценарий больше не воюет
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
  });
});

describe('AC §"Эмуляция термостата + кондиционер"', () => {
  it('emulateThermostat: жарко (27 > 24+0.5) → currentState=2 и кондиционер включается', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 0, 2, { currentTemp: 27, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 0 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac), emulateThermostat: true }), freshVars(), 2);

    expect(t.char(HS.Thermostat, HC.CurrentHeatingCoolingState).getValue()).toBe(2);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(2);
    expect(ac.char(HS.Thermostat, HC.TargetTemperature).getValue()).toBe(17);
  });

  it('emulateThermostat: остыло (23.4 < 24-0.5) при охлаждении → currentState=0 и кондиционер выключается', ({ hub, scenario }) => {
    const t = makeThermostat(hub, 10, 2, 2, { currentTemp: 23.4, targetTemp: 24 });
    const ac = makeAc(hub, 20, { targetState: 2, targetTemp: 17 });

    runTrigger(scenario, t, baseOptions({ acThermostat: acUUID(ac), emulateThermostat: true }), freshVars(), 2);

    expect(t.char(HS.Thermostat, HC.CurrentHeatingCoolingState).getValue()).toBe(0);
    expect(ac.char(HS.Thermostat, HC.TargetHeatingCoolingState).getValue()).toBe(0);
  });
});
