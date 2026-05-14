// Тесты для "⏱ Счётчик времени работы устройства" (RuntimeCounter.js).
//
// Сценарий вешается на устройство с HC.On/HC.Active (Lightbulb, Switch, Fan ...).
// При включении — стартует таймер наработки, каждые 30 сек обновляет
// Integer (секунды) и String ("2 часа 30 минут") в Параметре.
// При выключении — стартует таймер простоя (если выбран).
// Сброс — включение C_Boolean в Параметре.

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeDevice(hub, id) {
  return hub.addAccessory({
    id, name: 'Насос', room: 'Котельная',
    services: [{
      type: HS.Switch,
      characteristics: [{ type: HC.On, value: false }],
    }],
  });
}

function makeParameter(hub, id, name) {
  return hub.addAccessory({
    id, name: name || 'Параметр', room: 'Котельная',
    services: [{
      type: HS.C_Option,
      name: name || 'Параметр',
      characteristics: [
        { type: HC.C_Integer, value: 0 },
        { type: HC.C_Long, value: 0 },
        { type: HC.C_Double, value: 0 },
        { type: HC.C_Boolean, value: false },
        { type: HC.C_String, value: '' },
      ],
    }],
  });
}

function makeIncompleteParameter(hub, id) {
  // Без C_Long — обязательной характеристики
  return hub.addAccessory({
    id, name: 'Неполный', room: 'Котельная',
    services: [{
      type: HS.C_Option,
      characteristics: [
        { type: HC.C_Integer, value: 0 },
        { type: HC.C_Double, value: 0 },
        { type: HC.C_Boolean, value: false },
      ],
    }],
  });
}

function baseOptions(overrides) {
  const o = {
    runtimeParameter: '',
    downtimeParameter: '',
    timeTextFormat: 0,
  };
  if (overrides) for (const k of Object.keys(overrides)) o[k] = overrides[k];
  return o;
}

function freshVars() {
  return { intervalTask: undefined, parameterSubscribe: undefined };
}

// ---------------------------------------------------------------------------
// info-блок
// ---------------------------------------------------------------------------

describe('info-блок', () => {
  it('sourceCharacteristics содержит On и Active', ({ scenario }) => {
    const info = scenario.info();
    expect(info).not.toBeNull();
    expect(info.sourceCharacteristics).toContain(HC.On);
    expect(info.sourceCharacteristics).toContain(HC.Active);
  });

  it('sourceServices содержит Switch и Lightbulb', ({ scenario }) => {
    const info = scenario.info();
    expect(info.sourceServices).toContain(HS.Switch);
    expect(info.sourceServices).toContain(HS.Lightbulb);
  });

  it('onStart=true — состояние восстанавливается при перезагрузке хаба', ({ scenario }) => {
    const info = scenario.info();
    expect(info.onStart).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// README §"Как это работает" — базовая логика
// ---------------------------------------------------------------------------

describe('README §"Как это работает" — старт/остановка таймера', () => {
  it('при включении устройства запускается таймер наработки (Long-метка обновляется)', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2, 'Время работы насоса');
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    const longChar = param.char(HS.C_Option, HC.C_Long).getValue();
    expect(longChar).toBeGreaterThan(1000000000000);  // валидный timestamp
  });

  it('при выключении устройства таймер останавливается, накапливается результат в Integer', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    time.advance('60s');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: false, variables: vars,
      options: opts, context: 'USER',
    });

    // Integer должен показать ~60 секунд работы
    const seconds = param.char(HS.C_Option, HC.C_Integer).getValue();
    expect(seconds).toBeGreaterThanOrEqual(60);
    expect(seconds).toBeLessThan(70);
  });

  it('Integer обновляется каждые 30 секунд (INTERVAL_MS)', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    // первый тик через 30 сек
    time.advance('30s');
    const after30s = param.char(HS.C_Option, HC.C_Integer).getValue();
    expect(after30s).toBeGreaterThanOrEqual(30);
    expect(after30s).toBeLessThan(35);
  });
});

// ---------------------------------------------------------------------------
// README §"Сброс показаний"
// При включении C_Boolean у Параметра — счётчик обнуляется.
// ---------------------------------------------------------------------------

describe('README §"Сброс показаний"', () => {
  it('включение C_Boolean у параметра наработки → счётчик в 0, Boolean сбрасывается в false', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });
    time.advance('120s');

    // пользователь включает Boolean → сброс
    param.char(HS.C_Option, HC.C_Boolean).setValue(true);

    expect(param.char(HS.C_Option, HC.C_Integer).getValue()).toBe(0);
    expect(param.char(HS.C_Option, HC.C_Double).getValue()).toBe(0);
    expect(param.char(HS.C_Option, HC.C_Boolean).getValue()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// README §"Примечания" — валидация настроек
// ---------------------------------------------------------------------------

describe('README §"Примечания" — валидация', () => {
  it('Если не выбран ни один параметр — лог ошибки', ({ hub, scenario, logs }) => {
    const dev = makeDevice(hub, 1);
    const vars = freshVars();

    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: baseOptions(), context: 'USER',
    });

    expect(logs.byLevel('error').length).toBeGreaterThan(0);
  });

  it('Если параметры наработки и простоя совпадают — лог ошибки', ({ hub, scenario, logs }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const sameUuid = param.getService(HS.C_Option).getUUID();
    const vars = freshVars();

    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: baseOptions({ runtimeParameter: sameUuid, downtimeParameter: sameUuid }), context: 'USER',
    });

    expect(logs.byLevel('error').length).toBeGreaterThan(0);
  });

  it('Если параметр не имеет всех обязательных характеристик — лог ошибки', ({ hub, scenario, logs }) => {
    const dev = makeDevice(hub, 1);
    const param = makeIncompleteParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    expect(logs.byLevel('error').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// README §"Параметр простоя" — учёт времени, когда устройство выключено
// ---------------------------------------------------------------------------

describe('README §"Параметр простоя"', () => {
  it('выключение устройства запускает таймер простоя', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const downParam = makeParameter(hub, 2, 'Простой');
    const vars = freshVars();
    const opts = baseOptions({ downtimeParameter: downParam.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: false, variables: vars,
      options: opts, context: 'USER',
    });

    time.advance('30s');
    expect(downParam.char(HS.C_Option, HC.C_Integer).getValue()).toBeGreaterThanOrEqual(30);
  });

  it('включение устройства останавливает простой и запускает наработку', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const runParam = makeParameter(hub, 2, 'Работа');
    const downParam = makeParameter(hub, 3, 'Простой');
    const vars = freshVars();
    const opts = baseOptions({
      runtimeParameter: runParam.getService(HS.C_Option).getUUID(),
      downtimeParameter: downParam.getService(HS.C_Option).getUUID(),
    });

    time.set('2024-06-21T10:00:00Z');
    // запускаем простой
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: false, variables: vars,
      options: opts, context: 'USER',
    });
    time.advance('60s');

    // включаем устройство
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    expect(downParam.char(HS.C_Option, HC.C_Integer).getValue()).toBeGreaterThanOrEqual(60);

    // запустилась наработка
    time.advance('30s');
    expect(runParam.char(HS.C_Option, HC.C_Integer).getValue()).toBeGreaterThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// README §"Формат отображения времени" — formatRuntime через timeTextFormat
// ---------------------------------------------------------------------------

describe('README §"Формат отображения времени"', () => {
  it('timeTextFormat=0 (Часы и минуты): 30 минут', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({
      runtimeParameter: param.getService(HS.C_Option).getUUID(),
      timeTextFormat: 0,
    });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });
    time.advance('30m');

    const str = param.char(HS.C_Option, HC.C_String).getValue();
    expect(str).toContain('минут');
  });

  it('timeTextFormat=2 (Дни, часы и минуты)', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({
      runtimeParameter: param.getService(HS.C_Option).getUUID(),
      timeTextFormat: 2,
    });

    // имитируем уже накопленные >1 день: предзаписываем в Double
    param.char(HS.C_Option, HC.C_Double).setValueSilent(2 * 86400 + 3 * 3600 + 5 * 60);  // 2дня 3ч 5мин

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    const str = param.char(HS.C_Option, HC.C_String).getValue();
    expect(str).toContain('дн');
    expect(str).toContain('час');
  });

  it('пустая длительность → "0 минут"', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({
      runtimeParameter: param.getService(HS.C_Option).getUUID(),
      timeTextFormat: 0,
    });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    const str = param.char(HS.C_Option, HC.C_String).getValue();
    expect(str).toBe('0 минут');
  });
});

// ---------------------------------------------------------------------------
// README §"Поддерживаемые устройства" — HC.Active вместо HC.On.
// ---------------------------------------------------------------------------

describe('README §"Поддерживаемые устройства" — HC.Active', () => {
  it('устройство с HC.Active=1 (вентилятор) учитывается как "включено"', ({ hub, scenario, time }) => {
    const fan = hub.addAccessory({
      id: 1, name: 'Вентилятор', room: 'Тест',
      services: [{
        type: HS.Fan,
        characteristics: [{ type: HC.Active, value: 0 }],
      }],
    });
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: fan.char(HS.Fan, HC.Active), value: 1, variables: vars,
      options: opts, context: 'USER',
    });
    time.advance('30s');

    expect(param.char(HS.C_Option, HC.C_Integer).getValue()).toBeGreaterThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// README §"Примечания" — перезагрузка хаба с включённым устройством.
// "при включённом устройстве подсчёт наработки продолжается. Соответственно,
// если состояние устройства не менялось в момент, когда хаб не работал,
// то время считается корректно."
//
// Реализация хранит startTime в C_Long у Параметра (значения характеристик
// переживают перезагрузку). variables сбрасываются — это имитируем freshVars().
// ---------------------------------------------------------------------------

describe('README §"Примечания" — перезагрузка хаба', () => {
  it('включённое устройство → перезагрузка через 50с → Integer ≥ 50 (время не теряется)', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const paramUuid = param.getService(HS.C_Option).getUUID();
    const opts = baseOptions({ runtimeParameter: paramUuid });

    time.set('2024-06-21T10:00:00Z');
    const varsBefore = freshVars();
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: varsBefore,
      options: opts, context: 'USER',
    });

    // Прошло 50с (внутри 30-секундного интервала тик мог не успеть)
    time.advance('50s');

    // Перезагрузка: variables сбрасываются, значения характеристик у параметра
    // остаются (включая C_Long), устройство по-прежнему включено.
    const varsAfter = freshVars();
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: varsAfter,
      options: opts, context: 'USER',
    });

    const seconds = param.char(HS.C_Option, HC.C_Integer).getValue();
    expect(seconds).toBeGreaterThanOrEqual(50);
    expect(seconds).toBeLessThan(60);
  });

  it('повторный trigger с value=true не сбрасывает C_Long, накопленное время сохраняется', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param = makeParameter(hub, 2);
    const vars = freshVars();
    const opts = baseOptions({ runtimeParameter: param.getService(HS.C_Option).getUUID() });

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });
    const longBefore = param.char(HS.C_Option, HC.C_Long).getValue();

    time.advance('20s');

    // Повторный trigger без смены состояния (например, дребезг от устройства)
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: opts, context: 'USER',
    });

    const longAfter = param.char(HS.C_Option, HC.C_Long).getValue();
    expect(longAfter).toBe(longBefore);  // C_Long не перезаписан

    time.advance('30s');  // Прошло уже 50с с реального старта
    const seconds = param.char(HS.C_Option, HC.C_Integer).getValue();
    expect(seconds).toBeGreaterThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// Смена UUID параметра в опциях между вызовами trigger.
// Подписка должна пересоздаваться, чтобы сброс по Boolean реагировал на новый
// параметр (через isOptionChanged).
// ---------------------------------------------------------------------------

describe('Смена UUID параметра в опциях', () => {
  it('после смены runtimeParameter сброс Boolean на новом параметре обнуляет именно его', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param1 = makeParameter(hub, 2, 'Параметр 1');
    const param2 = makeParameter(hub, 3, 'Параметр 2');
    const vars = freshVars();

    time.set('2024-06-21T10:00:00Z');
    // Первый запуск — runtimeParameter = param1
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: baseOptions({ runtimeParameter: param1.getService(HS.C_Option).getUUID() }),
      context: 'USER',
    });
    time.advance('60s');

    // Пользователь поменял опцию на param2 и сохранил сценарий
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: baseOptions({ runtimeParameter: param2.getService(HS.C_Option).getUUID() }),
      context: 'USER',
    });
    time.advance('30s');

    // Сброс на новом параметре через Boolean=true
    param2.char(HS.C_Option, HC.C_Integer).setValueSilent(100);
    param2.char(HS.C_Option, HC.C_Double).setValueSilent(100);
    param2.char(HS.C_Option, HC.C_Boolean).setValue(true);

    expect(param2.char(HS.C_Option, HC.C_Integer).getValue()).toBe(0);
    expect(param2.char(HS.C_Option, HC.C_Boolean).getValue()).toBe(false);
  });

  it('после смены runtimeParameter сброс Boolean на старом параметре игнорируется', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const param1 = makeParameter(hub, 2, 'Параметр 1');
    const param2 = makeParameter(hub, 3, 'Параметр 2');
    const vars = freshVars();

    time.set('2024-06-21T10:00:00Z');
    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: baseOptions({ runtimeParameter: param1.getService(HS.C_Option).getUUID() }),
      context: 'USER',
    });
    time.advance('60s');

    scenario.run({
      source: dev.char(HS.Switch, HC.On), value: true, variables: vars,
      options: baseOptions({ runtimeParameter: param2.getService(HS.C_Option).getUUID() }),
      context: 'USER',
    });

    // Сохраняем в param1 ненулевое значение и дёргаем Boolean.
    // Сценарий больше не должен реагировать на param1.
    param1.char(HS.C_Option, HC.C_Integer).setValueSilent(500);
    param1.char(HS.C_Option, HC.C_Boolean).setValue(true);

    // Подписка отписана от старого UUID → значение не обнулилось
    expect(param1.char(HS.C_Option, HC.C_Integer).getValue()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Накопление через несколько циклов вкл/выкл.
// Integer наработки и простоя должны расти монотонно.
// ---------------------------------------------------------------------------

describe('Накопление через несколько вкл/выкл циклов', () => {
  it('два полных цикла: суммарная наработка и простой монотонно растут', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const runParam = makeParameter(hub, 2, 'Работа');
    const downParam = makeParameter(hub, 3, 'Простой');
    const vars = freshVars();
    const opts = baseOptions({
      runtimeParameter: runParam.getService(HS.C_Option).getUUID(),
      downtimeParameter: downParam.getService(HS.C_Option).getUUID(),
    });

    time.set('2024-06-21T10:00:00Z');

    // Цикл 1: вкл 60с
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: true, variables: vars, options: opts, context: 'USER' });
    time.advance('60s');
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: false, variables: vars, options: opts, context: 'USER' });
    const run1 = runParam.char(HS.C_Option, HC.C_Integer).getValue();
    expect(run1).toBeGreaterThanOrEqual(60);

    // Цикл 1: выкл 120с
    time.advance('120s');
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: true, variables: vars, options: opts, context: 'USER' });
    const down1 = downParam.char(HS.C_Option, HC.C_Integer).getValue();
    expect(down1).toBeGreaterThanOrEqual(120);

    // Цикл 2: вкл ещё 90с
    time.advance('90s');
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: false, variables: vars, options: opts, context: 'USER' });
    const run2 = runParam.char(HS.C_Option, HC.C_Integer).getValue();
    expect(run2).toBeGreaterThanOrEqual(run1 + 90);

    // Цикл 2: выкл 30с
    time.advance('30s');
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: true, variables: vars, options: opts, context: 'USER' });
    const down2 = downParam.char(HS.C_Option, HC.C_Integer).getValue();
    expect(down2).toBeGreaterThanOrEqual(down1 + 30);
  });
});

// ---------------------------------------------------------------------------
// README §"Сброс показаний":
// "Если в этот момент устройство включено (для наработки) или выключено
// (для простоя), подсчёт продолжается с нуля."
// Обратный случай: сброс runtime при выключенном устройстве — не должен
// запустить ложную сессию наработки до фактического включения.
// ---------------------------------------------------------------------------

describe('Сброс параметра в "противоположном" состоянии устройства', () => {
  it('сброс runtime при выключенном устройстве → при включении счёт начинается с 0, без накопления времени ожидания', ({ hub, scenario, time }) => {
    const dev = makeDevice(hub, 1);
    const runParam = makeParameter(hub, 2, 'Работа');
    const downParam = makeParameter(hub, 3, 'Простой');
    const vars = freshVars();
    const opts = baseOptions({
      runtimeParameter: runParam.getService(HS.C_Option).getUUID(),
      downtimeParameter: downParam.getService(HS.C_Option).getUUID(),
    });

    time.set('2024-06-21T10:00:00Z');
    // устройство выключено — стартует таймер простоя
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: false, variables: vars, options: opts, context: 'USER' });

    // имитируем уже накопленное время наработки от прошлой жизни
    runParam.char(HS.C_Option, HC.C_Integer).setValueSilent(500);
    runParam.char(HS.C_Option, HC.C_Double).setValueSilent(500);

    time.advance('60s');

    // Пользователь сбрасывает runtime, пока устройство ВЫКЛЮЧЕНО.
    runParam.char(HS.C_Option, HC.C_Boolean).setValue(true);
    expect(runParam.char(HS.C_Option, HC.C_Integer).getValue()).toBe(0);

    // Ещё минута простоя
    time.advance('60s');

    // Включаем устройство
    scenario.run({ source: dev.char(HS.Switch, HC.On), value: true, variables: vars, options: opts, context: 'USER' });
    time.advance('30s');

    // Наработка должна быть около 30 с, а не 30 + 60 (время простоя после ресета)
    const runSeconds = runParam.char(HS.C_Option, HC.C_Integer).getValue();
    expect(runSeconds).toBeGreaterThanOrEqual(30);
    expect(runSeconds).toBeLessThan(45);
  });
});
