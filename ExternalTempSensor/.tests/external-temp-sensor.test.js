// Тесты для логического сценария "🌡️ Внешний датчик температуры для термоголовок".
//
// Тесты написаны от README — каждый describe соответствует разделу README,
// каждый it — конкретное утверждение спецификации.

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Aqara E1 thermostat: hasSwitch=true, modelId=lumi.airrtc.agl001, manufacturer=Aqara
function makeAqaraE1(hub, id) {
  return hub.addAccessory({
    id, name: 'Термоголовка', room: 'Спальня',
    modelId: 'lumi.airrtc.agl001',
    manufacturer: 'Aqara',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: true }],
      },
      {
        type: HS.Thermostat,
        characteristics: [
          { type: HC.CurrentHeatingCoolingState, value: 1 },
          { type: HC.CurrentTemperature, value: 21 },
          { type: HC.TargetTemperature, value: 22 },
        ],
      },
      {
        // переключатель "Внешний датчик температуры"
        type: HS.Switch,
        characteristics: [{ type: HC.On, value: false }],
      },
      {
        // C_TemperatureControl — куда устанавливается значение внешнего датчика
        type: HS.C_TemperatureControl,
        characteristics: [{ type: HC.TargetTemperature, value: 0 }],
      },
    ],
  });
}

// SmartKot Opentherm: hasSwitch=false
function makeSmartKot(hub, id) {
  return hub.addAccessory({
    id, name: 'Котёл', room: 'Бойлерная',
    modelId: 'Opentherm',
    manufacturer: 'SmartKot',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: true }],
      },
      {
        type: HS.Thermostat,
        characteristics: [
          { type: HC.CurrentHeatingCoolingState, value: 1 },
          { type: HC.CurrentTemperature, value: 21 },
          { type: HC.TargetTemperature, value: 22 },
        ],
      },
      {
        type: HS.C_TemperatureControl,
        characteristics: [{ type: HC.TargetTemperature, value: 0 }],
      },
    ],
  });
}

function makeTempSensor(hub, id, temp) {
  return hub.addAccessory({
    id, name: 'Датчик температуры', room: 'Спальня',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: true }],
      },
      {
        type: HS.TemperatureSensor,
        characteristics: [{ type: HC.CurrentTemperature, value: temp }],
      },
    ],
  });
}

function makeUnsupportedThermostat(hub, id) {
  return hub.addAccessory({
    id, name: 'Неизвестный термостат', room: 'Зал',
    modelId: 'UNKNOWN_MODEL',
    manufacturer: 'UnknownVendor',
    services: [
      {
        type: HS.AccessoryInformation,
        characteristics: [{ type: HC.C_Online, value: true }],
      },
      {
        type: HS.Thermostat,
        characteristics: [
          { type: HC.CurrentHeatingCoolingState, value: 0 },
          { type: HC.CurrentTemperature, value: 21 },
          { type: HC.TargetTemperature, value: 22 },
        ],
      },
    ],
  });
}

function baseOptions(overrides) {
  const o = { sensor: '', changeTempPeriodically: 0 };
  if (overrides) for (const k of Object.keys(overrides)) o[k] = overrides[k];
  return o;
}

function freshVars() {
  return {
    lastTemp: undefined,
    lastUpdateTime: undefined,
    subscribed: false,
    subscribe: undefined,
    tempChangeTask: undefined,
    tempChangeTimeoutId: undefined,
    midnightTask: undefined,
  };
}

// ---------------------------------------------------------------------------
// README §"Поддерживаемые устройства"
// "Aqara E1, SONOFF TRVZB, Danfoss eTRV0101, SmartKot Opentherm"
// ---------------------------------------------------------------------------

describe('README §"Поддерживаемые устройства"', () => {
  it('Aqara E1 → корректно определяется и применяется логика', ({ hub, scenario }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 23);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // Переключатель внешнего датчика должен включиться
    expect(therm.char(HS.Switch, HC.On).getValue()).toBe(true);
    // Значение датчика (23) передано на термоголовку
    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(23);
  });

  it('SmartKot Opentherm → работает без поиска переключателя (hasSwitch=false)', ({ hub, scenario, logs }) => {
    const therm = makeSmartKot(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // У SmartKot нет переключателя — не должно быть ошибки про "Не обнаружен переключатель"
    expect(logs.byLevel('error').length).toBe(0);
    // Значение датчика установлено
    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(22);
  });

  it('неподдерживаемый термостат → ошибка в логе с упоминанием поддерживаемых', ({ hub, scenario, logs }) => {
    const therm = makeUnsupportedThermostat(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(logs.byLevel('error').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// README §"Возможные проблемы" — Ошибка "Выберите внешний датчик"
// ---------------------------------------------------------------------------

describe('README §"Ошибка: Выберите внешний датчик"', () => {
  it('options.sensor="" → error лог "Выберите внешний датчик"', ({ hub, scenario, logs }) => {
    const therm = makeAqaraE1(hub, 100);
    const vars = freshVars();
    const options = baseOptions({ sensor: '' });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    const errs = logs.byLevel('error');
    expect(errs.length).toBeGreaterThan(0);
    let found = false;
    for (let i = 0; i < errs.length; i++) {
      if (errs[i].message && errs[i].message.indexOf('Выберите внешний датчик') >= 0) {
        found = true; break;
      }
    }
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// README §"Привязка внешнего датчика"
// "1. Включение переключателя: автоматически включает Switch [Внешний датчик температуры]
//  2. Подписка на изменения выбранного датчика
//  3. Передача данных: при каждом изменении показаний датчика значение устанавливается на термоголовку"
// ---------------------------------------------------------------------------

describe('README §"Привязка внешнего датчика"', () => {
  it('включается переключатель Switch внешнего датчика (для Aqara E1)', ({ hub, scenario }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    expect(therm.char(HS.Switch, HC.On).getValue()).toBe(false);

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(therm.char(HS.Switch, HC.On).getValue()).toBe(true);
  });

  it('первичное значение датчика устанавливается на термоголовку', ({ hub, scenario }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 24.5);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(24.5);
  });

  it('обновление датчика → новое значение передаётся на термоголовку', ({ hub, scenario }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // Датчик передал новое значение — подписка должна сработать
    sensor.char(HS.TemperatureSensor, HC.CurrentTemperature).setValue(25);

    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(25);
  });

  it('сохраняет lastTemp и lastUpdateTime в variables при обновлении', ({ hub, scenario }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(vars.lastTemp).toBe(22);
    expect(vars.lastUpdateTime).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// README §"Ежесуточное обновление"
// "Каждый день в полночь происходит автоматическое обновление значения температуры"
// ---------------------------------------------------------------------------

describe('README §"Ежесуточное обновление"', () => {
  it('создаётся cron задача midnightTask при первой инициализации', ({ hub, scenario, cron }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(vars.midnightTask).toBeDefined();
    // Проверяем что cron задача активна
    const scheduled = cron.listScheduled();
    expect(scheduled.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// README §"Периодическое изменение температуры"
// "Если в опции Периодически менять значение температуры выбран интервал
//  (30 минут или 1 час), сценарий с выбранной периодичностью проверяет, было ли
//  обновление от датчика более 30 минут назад. Если да, значение изменяется на
//  0.1°C и возвращается обратно."
// ---------------------------------------------------------------------------

describe('README §"Периодическое изменение температуры"', () => {
  it('changeTempPeriodically=30 → создаётся cron задача tempChangeTask с расписанием каждые 30 минут', ({ hub, scenario, cron }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 30 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(vars.tempChangeTask).toBeDefined();
    const scheduled = cron.listScheduled();
    let found = false;
    for (let i = 0; i < scheduled.length; i++) {
      if (scheduled[i].spec === '0 */30 * * * *') { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('changeTempPeriodically=60 → создаётся cron задача tempChangeTask с расписанием каждый час', ({ hub, scenario, cron }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 60 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(vars.tempChangeTask).toBeDefined();
    const scheduled = cron.listScheduled();
    let found = false;
    for (let i = 0; i < scheduled.length; i++) {
      if (scheduled[i].spec === '0 0 * * * *') { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('changeTempPeriodically=0 → cron задача не создаётся', ({ hub, scenario }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 0 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    expect(vars.tempChangeTask).toBeUndefined();
  });

  // Порог «свежести»: для режима 30 минут — 5 минут (Danfoss, таймаут 35 мин)
  it('режим 30 мин: lastUpdateTime младше 5 мин → встряска пропускается', ({ hub, scenario, time }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 30 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // Сенсор обновляется за 3 минуты до cron-тика (lastUpdateTime ≈ t=27 мин)
    time.tick(27 * 60 * 1000);
    sensor.char(HS.TemperatureSensor, HC.CurrentTemperature).setValue(23);
    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(23);

    // Доводим до cron-тика на 30-минутной отметке: diff=3 мин < 5 мин → SKIP
    time.tick(4 * 60 * 1000);

    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(23);
  });

  it('режим 30 мин: lastUpdateTime старше 5 мин → встряска применяется', ({ hub, scenario, time }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 30 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // Сенсор не обновляется. Доводим время до cron-тика: diff=30 мин ≥ 5 мин → NUDGE.
    // При heating=1 уменьшение на 0.1: 22 → 21.9. Не доходим до setTimeout 10 сек, чтобы значение не восстановилось.
    time.tick(30 * 60 * 1000 + 1000);

    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(21.9);
  });

  // Порог «свежести»: для режима 1 час — 60 минут (Sonoff, таймаут 2 часа)
  it('режим 60 мин: lastUpdateTime младше 60 мин → встряска пропускается', ({ hub, scenario, time }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 60 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // Сенсор обновляется за 10 минут до cron-тика (lastUpdateTime ≈ t=50 мин)
    time.tick(50 * 60 * 1000);
    sensor.char(HS.TemperatureSensor, HC.CurrentTemperature).setValue(23);
    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(23);

    // Доводим до cron-тика на 60-минутной отметке: diff=10 мин < 60 мин → SKIP
    time.tick(11 * 60 * 1000);

    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(23);
  });

  it('режим 60 мин: lastUpdateTime старше 60 мин → встряска применяется', ({ hub, scenario, time }) => {
    const therm = makeAqaraE1(hub, 100);
    const sensor = makeTempSensor(hub, 200, 22);
    const sensorId = sensor.getService(HS.TemperatureSensor).getUUID();
    const vars = freshVars();
    const options = baseOptions({ sensor: sensorId, changeTempPeriodically: 60 });

    scenario.run({
      source: therm.char(HS.Thermostat, HC.CurrentHeatingCoolingState),
      value: 1, variables: vars, options, context: '',
    });

    // Сенсор не обновляется. Доводим до cron-тика на 60-минутной отметке: diff=60 мин не меньше 60 → NUDGE.
    time.tick(60 * 60 * 1000 + 1000);

    expect(therm.char(HS.C_TemperatureControl, HC.TargetTemperature).getValue()).toBe(21.9);
  });
});

// ---------------------------------------------------------------------------
// info-блок
// ---------------------------------------------------------------------------

describe('info-блок', () => {
  it('sourceServices содержит Thermostat', ({ scenario }) => {
    const info = scenario.info();
    expect(info).not.toBeNull();
    expect(info.sourceServices).toContain(HS.Thermostat);
  });

  it('sourceCharacteristics содержит CurrentHeatingCoolingState', ({ scenario }) => {
    const info = scenario.info();
    expect(info.sourceCharacteristics).toContain(HC.CurrentHeatingCoolingState);
  });

  it('onStart=true — README §"Запуск при старте"', ({ scenario }) => {
    const info = scenario.info();
    expect(info.onStart).toBe(true);
  });
});
