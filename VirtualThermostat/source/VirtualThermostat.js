let servicesList = getServicesByServiceAndCharacteristicType([HS.Switch, HS.Outlet], [HC.On]);
let sensorsServicesList = getServicesByServiceAndCharacteristicType([HS.TemperatureSensor, HS.Thermostat], [HC.CurrentTemperature]);
let acServicesList = getServicesByServiceAndCharacteristicType([HS.Thermostat], [HC.TargetHeatingCoolingState]);
let acPowerServicesList = getServicesByCharacteristicTypes([HC.On, HC.Active]);

// Выносим описание в переменную для использования в info и options
let scenarioDescription = {
    ru: "Позволяет реализовать логику виртуального термостата, указав датчик температуры и исполнительные устройства: реле нагрева/охлаждения и/или кондиционер (сервис Термостат). Сценарий получает и устанавливает температуру в помещении, включает и отключает реле, а кондиционер переводит в режим Нагрев/Охлаждение с форсированной целевой температурой и выключает его, когда требование снято. Поддерживает целевые режимы: Нагрев, Охлаждение, Автоматический и Выключен. Если кондиционер переключают в Осушитель или Вентилятор — сценарий отступает (отдаёт управление пользователю), так как эти режимы не регулируются по температуре. Автоматически управляет скоростью вентилятора (если доступна характеристика C_FanSpeed) на основе разницы между текущей и целевой температурой.",
    en: "Allows you to implement virtual thermostat logic by specifying a temperature sensor and actuators: heating/cooling relays and/or an air conditioner (Thermostat service). The scenario receives and sets the room temperature, switches relays on and off, and drives the AC to Heat/Cool mode with a forced target temperature, turning it off when the demand is over. Supports target modes: Heating, Cooling, Automatic and Off. If the AC is switched to Dry or Fan mode, the scenario steps aside (hands control back to the user), since these modes are not temperature-regulated. Automatically controls fan speed (if the C_FanSpeed characteristic is available) based on the difference between current and target temperature."
};

info = {
    name: "🌡️ Виртуальный термостат",
    description: scenarioDescription.ru,
    version: "3.9.3-ac",
    author: "@BOOMikru (форк: поддержка кондиционера)",
    onStart: true,

    sourceServices: [HS.Thermostat],
    sourceCharacteristics: [HC.CurrentHeatingCoolingState, HC.TargetHeatingCoolingState, HC.CurrentTemperature, HC.TargetTemperature, HC.HeatingThresholdTemperature, HC.CoolingThresholdTemperature, HC.C_FanSpeed],

    options: {
        desc: {
            name: {
                en: "  DESCRIPTION",
                ru: "  ОПИСАНИЕ"
            },
            desc: scenarioDescription,
            type: "String",
            value: "",
            formType: "status"
        },
        sensor: {
            name: {
                en: "Temperature sensor",
                ru: "Датчик температуры"
            },
            desc: {
                ru: "Выберите датчик температуры, по которому будет работать термостат. Значение температуры с датчика будет использоваться как текущая температура.",
                en: "Select the temperature sensor that the thermostat will use. The temperature value from the sensor will be used as the current temperature."
            },
            type: "String",
            value: "",
            formType: "list",
            values: sensorsServicesList
        },
        heatingRelay: {
            name: {
                en: "Heating relay",
                ru: "Реле нагрева"
            },
            desc: {
                ru: "Выберите реле или выключатель для управления нагревом. Реле будет включаться, когда термостат перейдет в режим нагрева.",
                en: "Select a relay or switch to control heating. The relay will turn on when the thermostat switches to heating mode."
            },
            type: "String",
            value: "",
            formType: "list",
            values: servicesList
        },
        coolingRelay: {
            name: {
                en: "Cooling relay",
                ru: "Реле охлаждения"
            },
            desc: {
                ru: "Выберите реле или выключатель для управления охлаждением. Реле будет включаться, когда термостат перейдет в режим охлаждения.",
                en: "Select a relay or switch to control cooling. The relay will turn on when the thermostat switches to cooling mode."
            },
            type: "String",
            value: "",
            formType: "list",
            values: servicesList
        },
        ac: {
            name: {
                en: "  AIR CONDITIONER",
                ru: "  КОНДИЦИОНЕР"
            },
            type: "String",
            value: "",
            formType: "status"
        },
        acThermostat: {
            name: {
                en: "Air conditioner (Thermostat service)",
                ru: "Кондиционер (сервис Термостат)"
            },
            desc: {
                ru: "Выберите сервис Термостат вашего кондиционера (например, 'Режим кондиционера'). Когда виртуальный термостат требует охлаждение — кондиционер включается в режим Охлаждение с заданной ниже целевой температурой; когда требуется нагрев — в режим Нагрев; когда требование снято — кондиционер выключается. Не выбирайте сам виртуальный термостат.",
                en: "Select the Thermostat service of your air conditioner. When the virtual thermostat demands cooling, the AC is switched to Cool mode with the target temperature set below; when heating is demanded — to Heat mode; when demand is over, the AC is turned off. Do not select the virtual thermostat itself."
            },
            type: "String",
            value: "",
            formType: "list",
            values: acServicesList
        },
        acPowerSwitch: {
            name: {
                en: "AC power switch (service with On)",
                ru: "Выключатель кондиционера (сервис с Вкл/Выкл)"
            },
            desc: {
                ru: "Опционально. Некоторые кондиционеры (например, VIOMI) не выключаются записью режима «Выключено» в сервис Термостат — у них питанием управляет отдельный сервис с характеристикой «Включен» (например, сервис «Кондиционер»). Если выбрать его здесь, сценарий будет выключать кондиционер через этот выключатель, а при включении — сначала включать питание, затем ставить режим и температуру. Ручное включение/выключение этим выключателем синхронизируется с виртуальным термостатом.",
                en: "Optional. Some ACs (e.g. VIOMI) cannot be turned off by writing Off to the Thermostat service — power is controlled by a separate service with the On characteristic. If selected, the scenario turns the AC off via this switch, and on power-up sets power first, then mode and temperature. Manual switching is synchronized with the virtual thermostat."
            },
            type: "String",
            value: "",
            formType: "list",
            values: acPowerServicesList
        },
        acCoolTemp: {
            name: {
                en: "AC target temperature for cooling (°C)",
                ru: "Целевая температура кондиционера при охлаждении (°C)"
            },
            desc: {
                ru: "Какую целевую температуру выставлять кондиционеру, когда требуется охлаждение. Ставьте заметно ниже комфортной (например 17–18°C), чтобы встроенный датчик кондиционера не остановил компрессор раньше времени — за фактическую температуру в комнате отвечают внешний датчик и виртуальный термостат.",
                en: "Target temperature to set on the AC when cooling is demanded. Set it noticeably lower than comfortable (e.g. 17–18°C) so the AC's internal sensor does not stop the compressor too early — the external sensor and the virtual thermostat are responsible for the actual room temperature."
            },
            type: "Double",
            value: 17,
            minValue: 16,
            maxValue: 30,
            minStep: 0.5
        },
        acHeatTemp: {
            name: {
                en: "AC target temperature for heating (°C)",
                ru: "Целевая температура кондиционера при нагреве (°C)"
            },
            desc: {
                ru: "Какую целевую температуру выставлять кондиционеру, когда требуется нагрев. Ставьте заметно выше комфортной (например 30°C).",
                en: "Target temperature to set on the AC when heating is demanded. Set it noticeably higher than comfortable (e.g. 30°C)."
            },
            type: "Double",
            value: 30,
            minValue: 16,
            maxValue: 30,
            minStep: 0.5
        },
        acSmoothTarget: {
            name: {
                en: "Smooth AC target temperature (inverter ACs)",
                ru: "Плавная целевая температура (для инверторных)"
            },
            desc: {
                ru: "Вместо фиксированной целевой температуры (см. опции выше) сценарий плавно подводит целевую температуру кондиционера: чем ближе комната к цели термостата (по внешнему датчику), тем мягче работает компрессор. Расчёт: собственная температура кондиционера минус разница между комнатой и целью, шаг 1°C, обновление не чаще раза в 2 минуты. Инверторный кондиционер при этом сам сбрасывает мощность вместо работы на максимуме. Если данных для расчёта нет — используется фиксированная целевая температура.",
                en: "Instead of a fixed target temperature the scenario gradually adjusts the AC target: the closer the room is to the thermostat goal (by the external sensor), the softer the compressor runs. Calculated as the AC's own temperature minus the room-to-goal difference, 1°C step, updated at most once per 2 minutes. An inverter AC then reduces power by itself instead of running at full blast. Falls back to the fixed target temperature when data is unavailable."
            },
            type: "Boolean",
            value: false
        },
        acSmoothFactor: {
            name: {
                en: "Smooth mode strength",
                ru: "Сила плавного режима"
            },
            desc: {
                ru: "Множитель для опции «Плавная целевая температура». Насколько резко кондиционер набирает холод (или тепло): целевая температура кондиционера = его собственная температура плюс умноженное на этот коэффициент отставание комнаты от цели. 1.0 — мягко (по умолчанию), 2.0 — заметно бодрее, 3.0+ — близко к форсажу. Помогает, когда в жару комната уходит выше цели, потому что плавный режим охлаждает слишком деликатно. Перелёт ниже цели невозможен при любом значении — охлаждение всё равно выключается по гистерезису. Работает только при включённой «Плавной целевой температуре»; на режим «вентилятор без компрессора» не влияет.",
                en: "Multiplier for the 'Smooth AC target temperature' option. How aggressively the AC pulls toward the goal: AC target = its own temperature plus the room-to-goal gap multiplied by this factor. 1.0 — gentle (default), 2.0 — noticeably stronger, 3.0+ — close to full blast. Helps when on hot days the room drifts above the goal because smooth mode cools too gently. Cannot overshoot below the goal at any value — cooling still stops by hysteresis. Active only when 'Smooth AC target temperature' is on; does not affect fan-without-compressor mode."
            },
            type: "Double",
            value: 1.0,
            minValue: 1.0,
            maxValue: 5.0,
            minStep: 0.5
        },
        acFanOnlyAtTarget: {
            name: {
                en: "After reaching the goal — fan without compressor",
                ru: "После достижения цели — вентилятор без компрессора"
            },
            desc: {
                ru: "Если включено: когда комната достигла цели, кондиционер не выключается — ему ставится целевая температура чуть выше собственной (при охлаждении; при нагреве — чуть ниже), компрессор останавливается, а вентилятор продолжает перемешивать воздух. Обдув работает только когда комната в рабочей зоне и внутри интервала по времени, с гистерезисом: ЗАПУСКАЕТСЯ по достижению коридора (порог = цель ∓ гистерезис) — сам по времени при переохлаждённой комнате не включается; если кондиционер уже работает, обдув УДЕРЖИВАЕТСЯ ещё на гистерезис ниже порога (проскок охлаждения не выключает кондей), а при более глубоком переохлаждении — полный выкл. Если опция выключена — кондиционер полностью выключается (как раньше). При выключении самого виртуального термостата кондиционер всегда выключается полностью.",
                en: "If enabled: when the room reaches the goal the AC is not turned off — its target temperature is set slightly above its own reading (for cooling; below for heating), the compressor stops and the fan keeps circulating air. Fan-only runs only while the room is in the working zone and within the time interval, with hysteresis: it STARTS on reaching the corridor (threshold = goal ∓ hysteresis) — so it does not switch on by time alone when the room is overcooled; if the AC is already running, fan-only is HELD for another hysteresis below the threshold (a cooling overshoot won't turn it off), and only a deeper overcooling turns it off completely. If disabled, the AC is turned off completely (as before). When the virtual thermostat itself is turned off, the AC is always turned off completely."
            },
            type: "Boolean",
            value: false
        },
        acFanOnlyFrom: {
            name: {
                en: "Fan without compressor: from hour",
                ru: "Вентилятор без компрессора: с часа"
            },
            desc: {
                ru: "Час начала действия режима «вентилятор без компрессора» (0–23). Вне интервала кондиционер при достижении цели выключается полностью. Если «с часа» и «до часа» совпадают — режим действует круглосуточно. Интервал может переходить через полночь (например, с 22 до 7).",
                en: "Start hour (0–23) for the fan-without-compressor mode. Outside the interval the AC turns off completely when the goal is reached. Equal start/end hours mean the mode is active around the clock. The interval may cross midnight (e.g. 22 to 7)."
            },
            type: "Integer",
            value: 0,
            minValue: 0,
            maxValue: 23,
            minStep: 1
        },
        acFanOnlyTo: {
            name: {
                en: "Fan without compressor: until hour",
                ru: "Вентилятор без компрессора: до часа"
            },
            desc: {
                ru: "Час окончания действия режима «вентилятор без компрессора» (0–23). Например, «с 8 до 23» — днём вентилятор перемешивает воздух, а ночью кондиционер в простое выключается полностью.",
                en: "End hour (0–23) for the fan-without-compressor mode. For example, 8 to 23 keeps the fan circulating during the day while at night the idle AC turns off completely."
            },
            type: "Integer",
            value: 0,
            minValue: 0,
            maxValue: 23,
            minStep: 1
        },
        acFanControl: {
            name: {
                en: "Control AC fan speed",
                ru: "Управлять скоростью вентилятора кондиционера"
            },
            desc: {
                ru: "Если включено и у кондиционера есть характеристика Скорость вентилятора (C_FanSpeed), сценарий выставляет её по разнице температур между текущей и целевой (см. 'Разница температур для вентилятора'). Ручное изменение скорости фиксируется (если включена 'Ручная фиксация скорости вентилятора'), возврат в авто — установкой скорости 0 (Авто).",
                en: "If enabled and the AC exposes the Fan Speed characteristic (C_FanSpeed), the scenario sets it based on the difference between current and target temperature (see 'Temperature difference for fan'). Manual speed changes are locked (if 'Manual fan speed lock' is enabled); set speed to 0 (Auto) to resume automatic control."
            },
            type: "Boolean",
            value: true
        },
        thermostatLogic: {
            name: {
                en: "  THERMOSTAT LOGIC",
                ru: "  ЛОГИКА ТЕРМОСТАТА"
            },
            type: "String",
            value: "",
            formType: "status"
        },
        emulateThermostat: {
            name: {
                en: "Emulate plain thermostat",
                ru: "Эмуляция обычного термостата"
            },
            desc: {
                ru: "Если включено, сценарий сам вычисляет Текущий режим термостата (нагревает / охлаждает / выключен) на основе Целевого режима, текущей и целевой температур (для режима Автоматически — Порогов нагрева/охлаждения). В этом случае базовый сценарий 'Обычный термостат' можно не подключать. Целевая влажность не поддерживается.",
                en: "If enabled, the scenario calculates the Current heating/cooling state (heating / cooling / off) itself based on Target state, current and target temperatures (for Auto mode — Heating/Cooling Threshold). In this case the built-in 'Plain thermostat' scenario does not need to be connected. Target humidity is not supported."
            },
            type: "Boolean",
            value: false
        },
        hysteresis: {
            name: {
                en: "Hysteresis (°C)",
                ru: "Гистерезис (°C)"
            },
            desc: {
                ru: "Зона нечувствительности при эмуляции термостата. Нагрев включается, когда температура ниже целевой на гистерезис, и выключается, когда выше целевой на гистерезис. Охлаждение — симметрично. По умолчанию 0.5 °C.",
                en: "Deadband used by the thermostat emulation. Heating turns on when temperature is below target by the hysteresis value and turns off when above target by the same value. Cooling — symmetrically. Default 0.5 °C."
            },
            type: "Double",
            value: 0.5,
            minValue: 0.0,
            maxValue: 5.0,
            minStep: 0.1
        },
        failure: {
            name: {
                en: "  SENSOR FAILURE",
                ru: "  ОТКАЗ ДАТЧИКА"
            },
            type: "String",
            value: "",
            formType: "status"
        },
        failureBehavior: {
            name: {
                en: "Sensor failure behavior",
                ru: "Поведение при отказе датчика температуры"
            },
            desc: {
                ru: "Что делать с реле и термостатом, если от датчика температуры не поступали данные дольше заданного времени.\n• 'Отключить' — перевести термостат в режим Выключен (Целевой режим = 0) и отключить оба реле.\n• 'Нагрев' — Целевой режим не меняется, включается только реле нагрева.\n• 'Охлаждение' — Целевой режим не меняется, включается только реле охлаждения.\n• 'Ничего не делать' — состояние термостата и реле не трогается.\nПосле восстановления данных с датчика управление реле возвращается в обычный режим.",
                en: "What to do with the relay and thermostat if no data has been received from the temperature sensor for longer than the specified time.\n• 'Turn off' — switch thermostat to Off (Target state = 0) and turn off both relays.\n• 'Heat' — Target state is not changed, only the heating relay is turned on.\n• 'Cool' — Target state is not changed, only the cooling relay is turned on.\n• 'Do nothing' — thermostat and relay state are not touched.\nAfter sensor data is restored, relay control returns to normal mode."
            },
            type: "Integer",
            value: 0,
            formType: "list",
            values: [
                { value: 0, name: { en: "Turn off", ru: "Отключить" } },
                { value: 1, name: { en: "Heat", ru: "Нагрев" } },
                { value: 2, name: { en: "Cool", ru: "Охлаждение" } },
                { value: 3, name: { en: "Do nothing", ru: "Ничего не делать" } }
            ]
        },
        failureTimeout: {
            name: {
                en: "Failure timeout (minutes)",
                ru: "Время до отказа (минуты)"
            },
            desc: {
                ru: "Через сколько минут отсутствия данных с датчика температуры считать его отказавшим. Кратно 15 минутам, минимум 15. По умолчанию 240 (4 часа). Проверка выполняется каждые 15 минут.",
                en: "After how many minutes without data from the temperature sensor consider it failed. Multiple of 15, minimum 15. Default 240 (4 hours). Check is performed every 15 minutes."
            },
            type: "Integer",
            value: 240,
            minValue: 15,
            maxValue: 10080,
            minStep: 15
        },
        fan: {
            name: {
                en: "  FAN",
                ru: "  ВЕНТИЛЯТОР"
            },
            type: "String",
            value: "",
            formType: "status"
        },
        fanTempStep: {
            name: {
                en: "Temperature difference for fan",
                ru: "Разница температур для вентилятора"
            },
            desc: {
                ru: "Шаг разницы температур для изменения скорости вентилятора в градусах Цельсия. При разнице от 0 до установленного шага (например 0.5) - скорость 1 (Тихо), от шага (0.5) до 2×шага (1) - скорость 2 (Медленно) и так далее. Управление вентилятором работает только если термостат поддерживает характеристику Скорость вентилятора (C_FanSpeed).",
                en: "Temperature difference step for changing fan speed in degrees Celsius. From 0 to step (for example 0.5) - speed 1 (Quiet), from step (0.5) to 2×step (1) - speed 2 (Low) and so on. Fan control only works if the thermostat supports the Fan Speed (C_FanSpeed) characteristic."
            },
            type: "Double",
            value: 0.5,
            minValue: 0.1,
            maxValue: 5.0,
            minStep: 0.1
        },
        fanSpeedManualLock: {
            name: {
                en: "Manual fan speed lock",
                ru: "Ручная фиксация скорости вентилятора"
            },
            desc: {
                ru: "Если включено, то при ручном изменении скорости вентилятора она перестаёт меняться. Для повторного включения автоматического режима - установите скорость Авто (0).",
                en: "If enabled, when manually changing the fan speed, it stops changing. To re-enable automatic mode, set the speed to Auto (0)."
            },
            type: "Boolean",
            value: true
        },
        other: {
            name: {
                en: "  OTHER",
                ru: "  ПРОЧЕЕ"
            },
            type: "String",
            value: "",
            formType: "status"
        },
        debug: {
            name: {
                en: "Debug",
                ru: "Отладка"
            },
            desc: {
                ru: "Выводить в лог информационные сообщения о работе сценария (изменения температуры, скорости вентилятора, режима эмуляции и т.п.). Предупреждения и ошибки логируются всегда.",
                en: "Output informational log messages about scenario activity (temperature changes, fan speed, emulation mode etc.). Warnings and errors are always logged."
            },
            type: "Boolean",
            value: false
        }
    },
    variables: {
        lastTemp: undefined,
        lastUpdateTime: undefined,
        subscribed: false,
        subscribe: undefined,
        relaySubscribe: undefined,
        relaySubscribed: false,
        fanSpeedManuallySet: false,
        acFanSpeedManuallySet: false,
        acLastSetFanSpeed: undefined,
        // Последние значения, установленные сценарием на кондиционер.
        // Нужны, чтобы отличать эхо собственных команд от ручного вмешательства.
        acLastSetState: undefined,
        acLastSetTemp: undefined,
        // Ручное вмешательство: кондиционер изменили не из сценария.
        // Виртуальный термостат выключается и не трогает кондиционер,
        // пока пользователь снова не включит термостат.
        acManualOverride: false,
        acSubscribe: undefined,
        acSubscribed: false,
        // Время последней команды кондиционеру и счётчик мягких переотправок
        // (защита от запоздалых подтверждений устройства).
        acLastCommandTime: undefined,
        acReassertCount: 0,
        // Последнее состояние питания, установленное сценарием (через acPowerSwitch)
        acLastSetPower: undefined,
        // Время последнего обновления целевой температуры кондиционера (антиспам)
        acTempUpdateTime: undefined,
        acPowerSubscribe: undefined,
        acPowerSubscribed: false,
        midnightTask: undefined,
        failureCheckTask: undefined,
        sensorFailed: false,
        // Последний целевой режим, установленный пользователем (не сценарием).
        // При отказе датчика в режиме «Отключить» сценарий сбрасывает TargetHCState в 0,
        // а после восстановления возвращает сюда сохранённое значение.
        lastUserTargetState: undefined
    }
};

function trigger(source, value, variables, options, context) {
    try {
        const characteristicType = source.getType()
        const service = source.getService()

        logDebug(`trigger: характеристика ${characteristicType}, значение ${value}, контекст ${context}`, source, options.debug)

        // Запоминаем последний целевой режим, выставленный пользователем (или базовой логикой).
        // Self changes (сценарий сам ставит 0 при отказе) фильтруем — иначе запомним 0.
        if (characteristicType === HC.TargetHeatingCoolingState && !isSelfChangeByContext(context)) {
            if (variables.sensorFailed && value !== 0) {
                logError(`Датчик температуры отказал. Режим будет сброшен в Выключен. После восстановления данных режим вернётся к ${value}.`, source)
            }
            variables.lastUserTargetState = value
            // Пользователь снова включил термостат — возобновляем управление кондиционером
            if (toNum(value) != 0 && variables.acManualOverride) {
                variables.acManualOverride = false
                logWarn("Виртуальный термостат включён пользователем — возобновляю управление кондиционером", source)
            }
        }

        if (characteristicType === HC.C_FanSpeed) {
            handleFanSpeedChange(service, value, variables, options, context)
        } else {
            // Эмуляция обычного термостата: пересчёт CurrentHeatingCoolingState
            if (options.emulateThermostat) {
                computeAndSetCurrentState(service, options)
            }
            // Управление реле: стандартное поведение — реагируем на любое изменение
            // характеристик термостата (целевой режим, текущий режим, температуры, пороги).
            handleHeatingCoolingLogic(source, options, variables)
            updateFanSpeed(service, variables, options)
        }

        // Подписка на датчик температуры
        subscribeToTemperatureSensor(source, service, variables, options, context)
        // Подписка на реле
        subscribeToRelayState(service, variables, options)
        // Подписка на ручные изменения кондиционера
        subscribeToAcState(service, variables, options)
        // Подписка на выключатель питания кондиционера (отдельно от subscribeToAcState:
        // опция могла быть выбрана позже, когда основная подписка уже создана)
        subscribeToAcPower(service, variables, options)
        // Проверка отказа датчика
        startFailureCheckCron(service, variables, options)


    } catch (e) {
        logError("Ошибка выполнения задачи: " + e.message);
    }
}

function handleFanSpeedChange(service, value, variables, options, context) {
    const isSelfChange = isSelfChangeByContext(context)
    const fanSpeedChar = service.getCharacteristic(HC.C_FanSpeed)
    if (isSelfChange) {
        logDebug(`Скорость вентилятора изменена самим сценарием — игнорируем`, fanSpeedChar, options.debug)
        return
    }
    // Системное переигрывание характеристик (пересохранение настроек привязки,
    // старт хаба) — это не действие пользователя, фиксацию не меняем
    if (isSystemReplayContext(context)) {
        logDebug(`Скорость вентилятора: системное событие (${context}) — фиксацию не меняем`, fanSpeedChar, options.debug)
        return
    }
    if (value == 0) {
        logDebug(`Пользователь поставил Авто (0) — снимаем фиксацию скорости`, fanSpeedChar, options.debug)
        variables.fanSpeedManuallySet = false
        updateFanSpeed(service, variables, options)
        return
    }
    // Пользователь установил конкретную скорость - ставим флаг только если включена ручная фиксация
    if (fanSpeedChar.getMinValue() > 0) {
        logDebug(`У вентилятора нет режима Авто — флаг ручной фиксации не ставим`, fanSpeedChar, options.debug)
        return
    }
    if (options.fanSpeedManualLock == true) {
        logDebug(`Пользователь установил скорость ${value} вручную — фиксируем`, fanSpeedChar, options.debug)
        variables.fanSpeedManuallySet = true
    }
}

function handleHeatingCoolingLogic(source, options, variables) {
    // При отказе датчика управление реле берёт на себя applyFailureBehavior
    if (variables && variables.sensorFailed) {
        logDebug("Управление реле в режиме 'отказ датчика'", source, options.debug)
        applyFailureBehavior(source.getService(), options, source, variables)
        return
    }

    const service = source.getService()
    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")
    const acThermostat = getAcThermostat(service, options)

    const currentStateChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
    const targetStateChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
    const currentState = currentStateChar ? currentStateChar.getValue() : 0
    const targetState = targetStateChar ? targetStateChar.getValue() : 0

    // Кондиционер в Осушителе/Вентиляторе, а сам термостат при этом в Выкл —
    // отступаем и не трогаем кондиционер (иначе пинг-понг по питанию).
    // ВАЖНО: только при targetState==0. Если пользователь явно попросил
    // Охлаждение/Нагрев/Авто (1/2/3) — сценарий БЕРЁТ управление и выводит
    // кондиционер из Dry/Fan, иначе включить термостат обратно будет невозможно.
    if (acThermostat && !variables.acManualOverride && toNum(targetState) == 0 && acIsDryOrFan(service, options)) {
        handAcToManualForDryFan(service, variables, source)
        return
    }

    // Выключено / Вентилятор / Осушитель — оба реле выкл
    if (targetState == 0 || targetState == -1 || targetState == -2) {
        logDebug(`Целевой режим ${targetState} (Off/Fan/Dry) — отключаем оба реле и кондиционер`, source, options.debug)
        setRelayValue(heatingRelay, false, source, options.debug)
        setRelayValue(coolingRelay, false, source, options.debug)
        setAcMode(acThermostat, 0, null, source, options, variables)
        return
    }
    // Дальше решает CurrentHeatingCoolingState (значения 0/1/2)
    if (currentState == 1) {
        logDebug(`Текущий режим = Нагрев → реле нагрева ON, охлаждения OFF, кондиционер → Нагрев`, source, options.debug)
        setRelayValue(heatingRelay, true, source, options.debug)
        setRelayValue(coolingRelay, false, source, options.debug)
        setAcMode(acThermostat, 1, getAcActiveTemp(acThermostat, 1, service, options), source, options, variables)
        return
    }
    if (currentState == 2) {
        logDebug(`Текущий режим = Охлаждение → реле охлаждения ON, нагрева OFF, кондиционер → Охлаждение`, source, options.debug)
        setRelayValue(heatingRelay, false, source, options.debug)
        setRelayValue(coolingRelay, true, source, options.debug)
        setAcMode(acThermostat, 2, getAcActiveTemp(acThermostat, 2, service, options), source, options, variables)
        return
    }
    // currentState == 0 — цель достигнута, термостат в простое
    setRelayValue(heatingRelay, false, source, options.debug)
    setRelayValue(coolingRelay, false, source, options.debug)
    if (isFanOnlyActive(service, options, targetState, variables) && acThermostat) {
        const standbyMode = toNum(targetState) == 1 ? 1 : 2
        logDebug(`Текущий режим = Выключен (target=${targetState}) → оба реле OFF, кондиционер: вентилятор без компрессора`, source, options.debug)
        setAcMode(acThermostat, standbyMode, getAcStandbyTemp(acThermostat, standbyMode, options), source, options, variables)
        return
    }
    logDebug(`Текущий режим = Выключен (target=${targetState}) → оба реле OFF, кондиционер OFF`, source, options.debug)
    setAcMode(acThermostat, 0, null, source, options, variables)
}

// Возвращает сервис Термостат кондиционера из опций.
// Защита от выбора самого виртуального термостата (это привело бы к зацикливанию).
function getAcThermostat(service, options) {
    const ac = getDevice(options, "acThermostat")
    if (!ac) return undefined
    if (service && ac.getUUID() == service.getUUID()) {
        logError("В качестве кондиционера выбран сам виртуальный термостат — опция игнорируется. Выберите сервис Термостат кондиционера.", undefined)
        return undefined
    }
    return ac
}

// Кондиционер сейчас в режиме Осушитель (-2) или Вентилятор (-1)?
// Сценарий сам НИКОГДА не выставляет эти режимы (только 0/1/2/3), поэтому их
// появление — это всегда выбор пользователя. В таких режимах температура не
// регулируется, поэтому сценарий должен отступить и не трогать кондиционер.
function acIsDryOrFan(service, options) {
    const ac = getAcThermostat(service, options)
    if (!ac) return false
    const ch = ac.getCharacteristic(HC.TargetHeatingCoolingState)
    if (!ch) return false
    const m = toNum(ch.getValue())
    return m == -1 || m == -2
}

// Отдать кондиционер под ручное управление (Осушитель/Вентилятор): включаем
// acManualOverride, гасим попытки реассерта и переводим виртуальный термостат
// в Выключен, чтобы сценарий перестал слать команды. Возврат автоматики —
// штатный: смена режима кондея на Охлаждение/Нагрев или включение термостата.
function handAcToManualForDryFan(service, variables, source) {
    if (variables.acManualOverride) return
    variables.acManualOverride = true
    variables.acReassertCount = 0
    logWarn("Кондиционер в режиме Осушитель/Вентилятор — отдаю управление, выключаю виртуальный термостат. Чтобы вернуть автоматику, переключите кондиционер в Охлаждение/Нагрев или включите термостат.", source)
    const targetChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
    if (targetChar && toNum(targetChar.getValue()) != 0) targetChar.setValue(0)
}

function getAcCoolTemp(options) {
    return options.acCoolTemp != null ? options.acCoolTemp : 17
}

function getAcHeatTemp(options) {
    return options.acHeatTemp != null ? options.acHeatTemp : 30
}

// Надёжное приведение значения характеристики On/Active к boolean.
function toBool(value) {
    if (value == null) return null
    if (value == true || value == 1) return true
    const s = String(value).toLowerCase()
    return s == 'true' || s == '1'
}

// Характеристика питания у сервиса-выключателя: On (Boolean) или Active (0/1).
function getPowerChar(service) {
    if (!service) return null
    return service.getCharacteristic(HC.On) || service.getCharacteristic(HC.Active)
}

function readPower(service) {
    const c = getPowerChar(service)
    return c ? toBool(c.getValue()) : null
}

// Пишет питание кондиционера. Запоминает намерение ДО записи (для эхо-фильтра).
function writePower(service, on, source, options, variables) {
    const c = getPowerChar(service)
    if (!c) {
        logError(`У выключателя ${getDeviceName(service)} нет характеристики Включен/Активно`, source)
        return
    }
    if (variables) variables.acLastSetPower = on
    const prev = toBool(c.getValue())
    if (prev !== on) {
        if (variables) variables.acLastCommandTime = Date.now()
        c.setValue(c.getType() === HC.Active ? (on ? 1 : 0) : on)
        logDebug(`Выключатель кондиционера ${getDeviceName(service)}: ${prev} → ${on}`, source, options.debug)
    }
}

// Устанавливает кондиционеру целевой режим (0 — выкл, 1 — нагрев, 2 — охлаждение)
// и целевую температуру (при state != 0). Значения пишутся только при отличии,
// чтобы не спамить команды на устройство.
// Если задан «Выключатель кондиционера» (acPowerSwitch), выключение выполняется
// через него (некоторые устройства не принимают режим «Выключено» в сервис
// Термостат), а при включении сначала подаётся питание.
// При ручном вмешательстве (acManualOverride) кондиционер не трогаем.
function setAcMode(ac, state, temp, source, options, variables) {
    if (!ac) return
    if (variables && variables.acManualOverride) {
        logDebug(`Кондиционер под ручным управлением (acManualOverride) — команды не отправляем`, source, options.debug)
        return
    }
    const power = getDevice(options, "acPowerSwitch")

    // Выключение через выключатель питания: режим в термостат-сервис не пишем
    if (state == 0 && power) {
        try {
            if (variables) variables.acLastSetState = 0
            writePower(power, false, source, options, variables)
        } catch (e) {
            logError(`Ошибка при выключении кондиционера через выключатель ${getDeviceName(power)}: ${e.toString()}`, source)
        }
        return
    }

    try {
        // Включение: сначала питание (если есть выключатель и он выключен)
        if (state != 0 && power && readPower(power) == false) {
            writePower(power, true, source, options, variables)
        }
        const acAccessory = ac.getAccessory()
        const onlineChar = acAccessory.getService(HS.AccessoryInformation).getCharacteristic(HC.C_Online)
        if (onlineChar && onlineChar.getValue() != true) {
            logError(`Кондиционер ${getDeviceName(ac)} не в сети`, source)
        }

        const targetStateChar = ac.getCharacteristic(HC.TargetHeatingCoolingState)
        if (!targetStateChar) {
            logError(`У кондиционера ${getDeviceName(ac)} нет характеристики Целевой режим`, source)
            return
        }

        // Запоминаем намерения ДО любых setValue: интеграция кондиционера может
        // переизлучить событие «целевой режим» уже в ответ на запись температуры,
        // и подписка должна в этот момент видеть актуальный acLastSetState.
        if (variables) variables.acLastSetState = state

        const prevState = toNum(targetStateChar.getValue())

        if (state != 0 && temp != null) {
            const targetTempChar = ac.getCharacteristic(HC.TargetTemperature)
            if (targetTempChar) {
                const value = clampToCharRange(temp, targetTempChar)
                const currentValue = toNum(targetTempChar.getValue())
                if (currentValue != value) {
                    // Антиспам для плавного режима: мелкие подстройки — не чаще раза
                    // в AC_TEMP_UPDATE_MIN_MS; смена режима и скачки ≥2° проходят сразу
                    const now = Date.now()
                    const modeChanging = prevState != state
                    const bigJump = currentValue == null || Math.abs(value - currentValue) >= 2
                    const intervalOk = variables == null || variables.acTempUpdateTime == null || (now - variables.acTempUpdateTime) >= AC_TEMP_UPDATE_MIN_MS
                    if (modeChanging || bigJump || intervalOk) {
                        if (variables) {
                            variables.acLastSetTemp = value
                            variables.acLastCommandTime = now
                            variables.acTempUpdateTime = now
                        }
                        targetTempChar.setValue(value)
                        logDebug(`Кондиционер ${getDeviceName(ac)}: целевая температура → ${value}°C`, source, options.debug)
                    } else {
                        logDebug(`Кондиционер ${getDeviceName(ac)}: целевая температура ${value}°C подождёт (антиспам)`, source, options.debug)
                    }
                } else if (variables) {
                    variables.acLastSetTemp = value
                }
            }
        }

        if (prevState != state) {
            if (variables) variables.acLastCommandTime = Date.now()
            targetStateChar.setValue(state)
            logDebug(`Кондиционер ${getDeviceName(ac)}: целевой режим ${prevState} → ${state}`, source, options.debug)
        }
    } catch (e) {
        logError(`Ошибка при управлении кондиционером ${getDeviceName(ac)}: ${e.toString()}`, source)
    }
}

// Вычисляет CurrentHeatingCoolingState (0/1/2) по целевому режиму и температурам с гистерезисом.
// При эмуляции термостата сам устанавливает значение на характеристику.
// Возвращает новое значение или undefined, если ничего не меняли.
function computeAndSetCurrentState(service, options) {
    const targetStateChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
    const currentStateChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
    const currentTempChar = service.getCharacteristic(HC.CurrentTemperature)
    if (!targetStateChar || !currentStateChar || !currentTempChar) {
        logDebug("Эмуляция термостата: нет нужных характеристик у термостата, пропуск", currentStateChar || targetStateChar || currentTempChar, options.debug)
        return undefined
    }

    const targetState = targetStateChar.getValue()
    const currentState = currentStateChar.getValue()
    const currentTemp = currentTempChar.getValue()
    if (currentTemp == null) {
        logDebug("Эмуляция термостата: текущая температура null, пропуск", currentTempChar, options.debug)
        return undefined
    }

    const hysteresis = options.hysteresis != null ? options.hysteresis : 0.5
    logDebug(`Эмуляция: target=${targetState}, current=${currentState}, temp=${currentTemp}°C, h=${hysteresis}`, currentStateChar, options.debug)
    const next = decideCurrentState(service, targetState, currentState, currentTemp, hysteresis)
    if (next == null) {
        logDebug("Эмуляция термостата: решение не принято (неизвестный режим)", currentStateChar, options.debug)
        return undefined
    }
    if (next !== currentState) {
        currentStateChar.setValue(next)
        logDebug(`Эмуляция термостата: текущий режим → ${next}`, currentStateChar, options.debug)
    } else {
        logDebug(`Эмуляция термостата. Текущий режим совпадает с новым`, options.debug)
    }
    return next
}

// Вычисляет следующее значение CurrentHeatingCoolingState. Без побочных эффектов.
function decideCurrentState(service, targetState, currentState, currentTemp, hysteresis) {
    // OFF / FAN_ONLY / DRY → текущий режим всегда Выключен
    if (targetState == 0 || targetState == -1 || targetState == -2) return 0

    // HEAT / ECO → используется TargetTemperature
    if (targetState == 1 || targetState == -3) {
        const targetTemp = getCharValue(service, HC.TargetTemperature)
        if (targetTemp == null) return 0
        // Сейчас греем — выключаем, когда нагрелись выше target+hysteresis
        if (currentState == 1) return currentTemp >= targetTemp + hysteresis ? 0 : 1
        // Иначе — включаем нагрев, когда температура опустилась ниже target-hysteresis
        return currentTemp <= targetTemp - hysteresis ? 1 : 0
    }

    // COOL → используется TargetTemperature
    if (targetState == 2) {
        const targetTemp = getCharValue(service, HC.TargetTemperature)
        if (targetTemp == null) return 0
        if (currentState == 2) return currentTemp <= targetTemp - hysteresis ? 0 : 2
        return currentTemp >= targetTemp + hysteresis ? 2 : 0
    }

    // AUTO → используются HeatingThresholdTemperature и CoolingThresholdTemperature.
    // Если у термостата этих порогов нет — фолбэк на TargetTemperature (используется как обе точки).
    if (targetState == 3) {
        let heatThr = getCharValue(service, HC.HeatingThresholdTemperature)
        let coolThr = getCharValue(service, HC.CoolingThresholdTemperature)
        if (heatThr == null && coolThr == null) {
            const targetTemp = getCharValue(service, HC.TargetTemperature)
            if (targetTemp == null) return 0
            heatThr = targetTemp
            coolThr = targetTemp
        }
        // Если в текущий момент уже греем — выключаемся при достижении heatThr+hysteresis
        if (currentState == 1) {
            if (heatThr != null && currentTemp >= heatThr + hysteresis) return 0
            return 1
        }
        // Если уже охлаждаем — выключаемся при достижении coolThr-hysteresis
        if (currentState == 2) {
            if (coolThr != null && currentTemp <= coolThr - hysteresis) return 0
            return 2
        }
        // Из OFF включаем нагрев или охлаждение при выходе за пороги
        if (heatThr != null && currentTemp <= heatThr - hysteresis) return 1
        if (coolThr != null && currentTemp >= coolThr + hysteresis) return 2
        return 0
    }

    return null
}

function getCharValue(service, type) {
    const c = service.getCharacteristic(type)
    return c ? c.getValue() : null
}

function subscribeToTemperatureSensor(source, service, variables, options, context) {
    const tempSensor = getDevice(options, "sensor")
    if (!tempSensor) {
        return
    }

    const currentTemperatureCharacteristic = service.getCharacteristic(HC.CurrentTemperature)
    const tempSensorSource = tempSensor.getCharacteristic(HC.CurrentTemperature)
    setValueFromSensor(tempSensorSource, variables, options, currentTemperatureCharacteristic)

    if (!variables.subscribe || variables.subscribed != true) {
        showSubscribeMessage(options, context)
        logDebug(`Создаём подписку на изменения датчика (UUID ${options.sensor})`, source, options.debug)
        let subscribe = Hub.subscribeWithCondition("", "", [HS.TemperatureSensor, HS.Thermostat], [HC.CurrentTemperature], function (sensorSource, sensorValue) {
            let sensorService = sensorSource.getService()
            let isSelected = sensorService.getUUID() == options.sensor
            if (isSelected && currentTemperatureCharacteristic) {
                // Свежий callback подписки означает, что датчик жив.
                // Если был отказ — восстанавливаем ДО записи значения, чтобы при последующем
                // handleHeatingCoolingLogic уже работала обычная логика.
                recoverFromSensorFailure(service, variables, options, sensorSource)
                setValueFromSensor(sensorSource, variables, options, currentTemperatureCharacteristic)
            }
        })
        variables.subscribe = subscribe
        variables.subscribed = true
    }
    if (!variables.midnightTask) {
        logDebug("Создаём cron задачу полуночного обновления", source, options.debug)
        variables.midnightTask = Cron.schedule("0 0 0 * * *", function () {
            setValueFromSensor(tempSensorSource, variables, options, currentTemperatureCharacteristic)
            logDebug("Полуночное обновление", source, options.debug)
        });
    }
}

function subscribeToRelayState(service, variables, options) {
    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")
    const acThermostat = getAcThermostat(service, options)

    // Используем любую характеристику термостата для создания source в callback
    const thermostatSource = service.getCharacteristic(HC.CurrentHeatingCoolingState)

    // Создаем одну подписку на онлайн статус для обоих реле и кондиционера
    if ((heatingRelay || coolingRelay || acThermostat) && (!variables.relaySubscribe || variables.relaySubscribed != true) && thermostatSource) {
        const heatingRelayAccessoryId = getAccessoryIdFromUUID(options.heatingRelay)
        const coolingRelayAccessoryId = getAccessoryIdFromUUID(options.coolingRelay)
        const acAccessoryId = getAccessoryIdFromUUID(options.acThermostat)
        logDebug(`Создаём подписку на онлайн-статус исполнительных устройств (heat=${heatingRelayAccessoryId}, cool=${coolingRelayAccessoryId}, ac=${acAccessoryId})`, thermostatSource, options.debug)

        let subscribe = Hub.subscribeWithCondition("", "", [HS.AccessoryInformation], [HC.C_Online], function (onlineSource, onlineValue) {
            if (onlineValue != true) return

            // Получаем идентификатор аксессуара и сравниваем с нашими устройствами
            const accessoryId = getAccessoryIdFromUUID(onlineSource.getUUID())
            if (accessoryId == heatingRelayAccessoryId || accessoryId == coolingRelayAccessoryId || accessoryId == acAccessoryId) {
                logDebug(`Устройство ${accessoryId} вернулось в сеть — пересчитываем состояние`, thermostatSource, options.debug)
                handleHeatingCoolingLogic(thermostatSource, options, variables)
            }
        })
        variables.relaySubscribe = subscribe
        variables.relaySubscribed = true
    }
}

// Надёжное приведение значения характеристики к числу. Значения из Sprut.Hub
// могут быть Java-объектами: Number() для них иногда даёт NaN, поэтому
// fallback — парсинг через строковое представление.
function toNum(value) {
    if (value == null) return null
    let n = Number(value)
    if (isNaN(n)) n = parseFloat(String(value))
    return isNaN(n) ? null : n
}

// Состояние кондиционера, которого сценарий добивается прямо сейчас,
// исходя из живых характеристик виртуального термостата: 0 — выкл, 1 — нагрев,
// 2 — охлаждение. null — определить нельзя.
// В режиме «вентилятор без компрессора» (acFanOnlyAtTarget) при достигнутой цели
// кондиционер остаётся включённым — желаемый режим не 0, а рабочий.
function computeDesiredAcState(service, options, variables) {
    const targetChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
    const currentChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
    if (!targetChar || !currentChar) return null
    const target = toNum(targetChar.getValue())
    const current = toNum(currentChar.getValue())
    if (target == null || current == null) return null
    if (target == 0 || target == -1 || target == -2) return 0
    if (current == 1) return 1
    if (current == 2) return 2
    // Цель достигнута (простой активного термостата)
    if (isFanOnlyActive(service, options, target, variables)) {
        return target == 1 ? 1 : 2
    }
    return 0
}

// Активен ли сейчас режим «вентилятор без компрессора»: опция включена
// и текущий час внутри настроенного интервала. Совпадающие границы —
// круглосуточно; интервал может переходить через полночь (22→7).
function isFanOnlyWindowActive(options) {
    if (!options || options.acFanOnlyAtTarget != true) return false
    let from = toNum(options.acFanOnlyFrom)
    let to = toNum(options.acFanOnlyTo)
    if (from == null || to == null) return true
    if (from < 0 || from > 23) from = 0
    if (to < 0 || to > 23) to = 0
    if (from == to) return true
    const hour = new Date().getHours()
    if (from < to) return hour >= from && hour < to
    return hour >= from || hour < to
}

// Включён ли кондиционер прямо сейчас (по выключателю питания, иначе по режиму
// термостат-сервиса != Выкл). Нужно для гистерезиса обдува.
function acCurrentlyOn(service, options) {
    const power = getDevice(options, "acPowerSwitch")
    if (power) {
        const c = getPowerChar(power)
        if (c) return toBool(c.getValue()) === true
    }
    const ac = getAcThermostat(service, options)
    if (ac) {
        const mc = ac.getCharacteristic(HC.TargetHeatingCoolingState)
        if (mc) { const v = toNum(mc.getValue()); return v != null && v != 0 }
    }
    return false
}

// Комната в «рабочей зоне» для обдува, с гистерезисом:
// • ЗАПУСК (кондиционер выключен) — только по достижению коридора: порог = цель ∓ гистерезис.
//   Поэтому утром при переохлаждённой комнате обдув сам по времени НЕ включается.
// • УДЕРЖАНИЕ (кондиционер уже работает) — допускаем заход ещё на гистерезис ниже порога,
//   чтобы проскок охлаждения (например, 23.8 при пороге 24.0) не выключал кондей полностью.
//   Между порогом запуска и порогом удержания состояние не дёргается (нет щёлканья у границы).
//   Уйдёт глубже порога удержания (реальное переохлаждение) — полный выкл.
// «Работает» определяем по намерению сценария (acLastSetState != 0), а не только по живому
// чтению питания: у части кондиционеров (VIOMI) выключатель проседает в 0, когда компрессор
// простаивает в обдув-standby. Без этого на 15-минутном тике у самого пола коридора брался бы
// строгий порог ЗАПУСКА, и комната, чуть просевшая ниже цели, выключала бы кондей полностью.
function isRoomInWorkingZone(service, options, mode, variables) {
    const room = toNum(getCharValue(service, HC.CurrentTemperature))
    if (room == null) return true // нет данных — не блокируем (поведение как раньше)
    let h = toNum(options.hysteresis)
    if (h == null) h = 0.5
    const lastSet = variables != null ? toNum(variables.acLastSetState) : null
    const running = acCurrentlyOn(service, options) || (lastSet != null && lastSet != 0)
    if (toNum(mode) == 1) { // нагрев: рабочая зона — не выше точки выключения
        const goal = toNum(getCharValue(service, HC.TargetTemperature))
        if (goal == null) return true
        const offpoint = goal + h
        return room <= (running ? offpoint + h : offpoint)
    }
    // охлаждение (и прочие режимы, где простой обслуживается охлаждением)
    let goal = toNum(getCharValue(service, HC.TargetTemperature))
    if (goal == null) goal = toNum(getCharValue(service, HC.CoolingThresholdTemperature))
    if (goal == null) return true
    const offpoint = goal - h
    return room >= (running ? offpoint - h : offpoint)
}

// Обдув без компрессора активен: окно по времени И комната в рабочей зоне по температуре.
function isFanOnlyActive(service, options, mode, variables) {
    return isFanOnlyWindowActive(options) && isRoomInWorkingZone(service, options, mode, variables)
}

// Целевая температура кондиционера в активной фазе (нагрев/охлаждение).
// При включённой опции «Плавная целевая температура» — каскад со смещением:
// собственная температура кондиционера, скорректированная на отставание комнаты
// от цели (шаг 1°). Иначе — фиксированные значения из опций.
function getAcActiveTemp(ac, state, service, options) {
    if (options && options.acSmoothTarget == true && ac) {
        const t = computeSmoothAcTemp(ac, state, service, options)
        if (t != null) return t
    }
    return state == 1 ? getAcHeatTemp(options) : getAcCoolTemp(options)
}

function computeSmoothAcTemp(ac, state, service, options) {
    const acInternal = toNum(getCharValue(ac, HC.CurrentTemperature))
    const ext = toNum(getCharValue(service, HC.CurrentTemperature))
    const goal = toNum(getCharValue(service, HC.TargetTemperature))
    if (acInternal == null || ext == null || goal == null) return null
    // Требуем от кондиционера сместить его собственное показание на отставание
    // комнаты (по внешнему датчику) от цели, умноженное на «Силу плавного режима».
    // Работает и для нагрева, и для охлаждения. Шаг кондиционера — 1°C.
    // Округляем в сторону более сильной коррекции: при охлаждении — ВНИЗ (холоднее),
    // при нагреве — ВВЕРХ (теплее). Раньше был Math.round (ничьи .5 — вверх), из-за чего
    // у пика жары целевая «съедала» полградуса и охлаждение недодавало (собств. 25.5 →
    // целевая 25 при силе 2 = почти простой). Floor при охлаждении даёт целевую 24 и
    // компрессор реально тянет вниз.
    let factor = toNum(options.acSmoothFactor)
    if (factor == null || factor < 1) factor = 1
    const raw = acInternal + factor * (goal - ext)
    const result = toNum(state) == 1 ? Math.ceil(raw) : Math.floor(raw)
    logDebug(`Плавная целевая: собств.${acInternal} + сила ${factor}·(цель ${goal} − комната ${ext}) = ${result}°C`, service.getCharacteristic(HC.CurrentTemperature), options.debug)
    return result
}

// Целевая температура кондиционера в режиме «вентилятор без компрессора»:
// чуть выше собственного показания при охлаждении (компрессор останавливается,
// вентилятор работает), чуть ниже — при нагреве. Кламп к диапазону устройства
// выполняет setAcMode.
function getAcStandbyTemp(ac, state, options) {
    const acInternal = toNum(getCharValue(ac, HC.CurrentTemperature))
    if (acInternal == null) return state == 1 ? -99 : 99
    return state == 1 ? Math.round(acInternal) - AC_STANDBY_TEMP_OFFSET : Math.round(acInternal) + AC_STANDBY_TEMP_OFFSET
}

// Ожидаемая сценарием целевая температура кондиционера прямо сейчас
// (для распознавания эха в подписке). null — определить нельзя.
function computeExpectedAcTemp(acService, service, options, desired, variables) {
    if (desired == null || desired == 0) return null
    const currentChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
    const current = currentChar ? toNum(currentChar.getValue()) : null
    if (isFanOnlyActive(service, options, desired, variables) && current == 0) {
        return getAcStandbyTemp(acService, desired, options)
    }
    return getAcActiveTemp(acService, desired, service, options)
}

// Ограничивает значение реальным диапазоном характеристики (min/max устройства).
function clampToCharRange(value, characteristic) {
    let result = toNum(value)
    const minValue = toNum(characteristic.getMinValue())
    const maxValue = toNum(characteristic.getMaxValue())
    if (minValue != null && result < minValue) result = minValue
    if (maxValue != null && result > maxValue) result = maxValue
    return result
}

// Подписка на изменения кондиционера НЕ из сценария (пульт, приложение, интерфейс хаба).
// Синхронизация по питанию:
// • Термостат активен, кондиционер изменили вручную (режим/уставка) — термостат
//   выключается (TargetHCState=0), ставится acManualOverride, сценарий перестаёт
//   трогать кондиционер.
// • Термостат выключен, кондиционер ВКЛЮЧИЛИ вручную — термостат включается
//   в соответствующий режим (Нагрев/Охлаждение/Авто) и берёт управление.
// Эхо собственных команд и запоздалые подтверждения устройства отфильтровываются.
function subscribeToAcState(service, variables, options) {
    const acThermostat = getAcThermostat(service, options)
    if (!acThermostat) return
    if (variables.acSubscribe && variables.acSubscribed == true) return

    const thermostatSource = service.getCharacteristic(HC.TargetHeatingCoolingState)
    logDebug(`Создаём подписку на ручные изменения кондиционера (UUID ${options.acThermostat})`, thermostatSource, options.debug)

    let subscribe = Hub.subscribeWithCondition("", "", [HS.Thermostat], [HC.TargetHeatingCoolingState, HC.TargetTemperature], function (acSource, acValue) {
        try {
            const acService = acSource.getService()
            if (acService.getUUID() != options.acThermostat) return

            const type = acSource.getType()
            // ВАЖНО: значения сравниваем и «сырыми» через ==, и приведёнными к числу —
            // в Sprut.Hub значения характеристик могут приходить как Java-объекты.
            const numValue = toNum(acValue)
            // Состояние кондиционера, которого сценарий сам сейчас добивается.
            // Это проверка БЕЗ опоры на память (variables): если событие совпадает
            // с желаемым состоянием — это эхо собственной команды, а не пользователь.
            const desired = computeDesiredAcState(service, options, variables)

            logDebug(`AC-событие: ${type} = ${acValue} (typeof ${typeof acValue}, num ${numValue}), lastSetState=${variables.acLastSetState}, lastSetTemp=${variables.acLastSetTemp}, desired=${desired}, override=${variables.acManualOverride}`, thermostatSource, options.debug)

            // Окно подавления после собственной команды. Реальные интеграции (например,
            // VIOMI) подтверждают команды асинхронно и могут переизлучить СТАРОЕ состояние
            // через несколько секунд после нашей записи — это не ручное вмешательство.
            const sinceCmd = variables.acLastCommandTime != null ? (Date.now() - variables.acLastCommandTime) : null
            const inEchoWindow = sinceCmd != null && sinceCmd >= 0 && sinceCmd < AC_ECHO_WINDOW_MS

            const hasPowerSwitch = options.acPowerSwitch != null && options.acPowerSwitch !== ''

            // Пользователь перевёл кондиционер в Осушитель (-2) / Вентилятор (-1):
            // сценарий их не регулирует — отступаем. Реагируем именно на СМЕНУ режима
            // (свежее событие), а не на текущее состояние: иначе на возврате, когда
            // кондей ещё физически в Dry, любое эхо снова увело бы в ручной режим.
            if (type === HC.TargetHeatingCoolingState && (numValue == -1 || numValue == -2)) {
                handAcToManualForDryFan(service, variables, thermostatSource)
                return
            }

            if (type === HC.TargetHeatingCoolingState) {
                // При выключателе питания выключенность определяется питанием, а не
                // режимом термостат-сервиса: устройства вроде VIOMI продолжают
                // сообщать режим 2 даже выключенными — это не ручное включение.
                if (hasPowerSwitch && desired == 0) return
                // Событие совпадает с тем, чего сценарий сам добивается — эхо/подтверждение
                if (desired != null && (acValue == desired || numValue == desired)) {
                    if (!inEchoWindow) variables.acReassertCount = 0
                    return
                }
                // Эхо последней команды — учитываем только внутри окна: вне окна
                // совпадение со старой командой ничего не значит (память устарела)
                if (inEchoWindow && variables.acLastSetState != null && (acValue == variables.acLastSetState || numValue == toNum(variables.acLastSetState))) return
            }
            if (type === HC.TargetTemperature) {
                const lastTemp = toNum(variables.acLastSetTemp)
                if (inEchoWindow && lastTemp != null && numValue != null && Math.abs(numValue - lastTemp) < 0.05) return
                // Кондиционер выключен сценарием: изменение уставки неважно (некоторые
                // интеграции сами обновляют её при выключении). Ручное ВКЛЮЧЕНИЕ придёт
                // отдельным событием смены целевого режима и будет обработано.
                if (variables.acLastSetState != null && toNum(variables.acLastSetState) == 0) return
                if (desired == 0) return
                // Целевая температура совпадает с той, что выставил бы сценарий — эхо.
                // Допуск 1.5° покрывает шаг кондиционера 1° и дрейф плавного расчёта.
                if (desired != null && numValue != null) {
                    const wantTemp = computeExpectedAcTemp(acService, service, options, desired, variables)
                    if (wantTemp != null) {
                        const tempChar = acService.getCharacteristic(HC.TargetTemperature)
                        const clamped = tempChar ? clampToCharRange(wantTemp, tempChar) : wantTemp
                        if (Math.abs(numValue - clamped) < 1.5) return
                    }
                }
            }

            // Запоздалые расхождения внутри окна не наказываем выключением термостата,
            // а мягко повторяем команду (не более AC_REASSERT_MAX раз, дальше — ручной режим).
            if (inEchoWindow) {
                if (type === HC.TargetHeatingCoolingState && desired != null && numValue != desired) {
                    const count = (variables.acReassertCount || 0) + 1
                    if (count <= AC_REASSERT_MAX) {
                        variables.acReassertCount = count
                        // Без деления и слэшей внутри шаблонной строки: парсер Nashorn в Sprut.Hub
                        // принимает '/' рядом с ${} за начало регулярного выражения.
                        const sinceSec = Math.round(sinceCmd * 0.001)
                        logWarn("Кондиционер сообщил режим " + numValue + ", ожидается " + desired + " (через " + sinceSec + "с после команды) — повторяю команду (" + count + " из " + AC_REASSERT_MAX + ")", thermostatSource)
                        const temp = computeExpectedAcTemp(acService, service, options, desired, variables)
                        setAcMode(acService, desired, temp, thermostatSource, options, variables)
                        return
                    }
                    // Лимит переотправок исчерпан — считаем настоящим ручным вмешательством
                } else {
                    // Любые другие события в окне — запоздалые подтверждения устройства
                    return
                }
            } else {
                variables.acReassertCount = 0
            }

            const targetChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
            const virtualTarget = targetChar ? toNum(targetChar.getValue()) : 0

            // Термостат выключен, а кондиционер включили не из сценария —
            // включаем виртуальный термостат в соответствующий режим (синхронизация
            // по питанию). Дальше термостат берёт управление: применит свою логику
            // по внешнему датчику и форсированную уставку.
            if (virtualTarget == 0) {
                // Включение термостата по ручному включению кондиционера — только ВНЕ окна
                // подавления: внутри окна «включённость» может быть запоздалым состоянием
                // устройства, которое не успело применить нашу команду выключения.
                if (!inEchoWindow && type === HC.TargetHeatingCoolingState && numValue != null && (numValue == 1 || numValue == 2 || numValue == 3)) {
                    turnOnVirtualThermostat(service, numValue, variables, thermostatSource)
                }
                // Остальные изменения (уставка, вентиляция/осушение) при выключенном
                // термостате — пользователь свободно управляет кондиционером
                return
            }

            // Если уже в ручном режиме — ничего не делаем
            if (variables.acManualOverride) return

            variables.acManualOverride = true
            const what = type === HC.TargetTemperature ? `целевая температура → ${acValue}°C` : `целевой режим → ${acValue}`
            logWarn(`Кондиционер изменён вручную (${what}) — выключаю виртуальный термостат и отдаю управление. Чтобы вернуть автоматику, включите термостат снова.`, thermostatSource)
            targetChar.setValue(0)
        } catch (e) {
            logError("Ошибка обработки ручного изменения кондиционера: " + e.toString())
        }
    })
    variables.acSubscribe = subscribe
    variables.acSubscribed = true
}

// Включает виртуальный термостат в указанный режим (синхронизация с ручным
// включением кондиционера). Снимает ручной режим.
// ВАЖНО: значение НЕ перечитывается после записи — в Sprut.Hub setValue
// применяется асинхронно, и немедленный getValue возвращает старое значение
// (ложное «не применилось»). Если режим выключен в настройках виртуального
// устройства, запись просто не применится и термостат останется выключенным —
// это видно в журнале по отсутствию дальнейшей реакции.
function turnOnVirtualThermostat(service, mode, variables, source) {
    const targetChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
    if (!targetChar) return
    variables.acManualOverride = false
    variables.acReassertCount = 0
    logWarn("Кондиционер включён вручную (режим " + mode + ") — включаю виртуальный термостат", source)
    targetChar.setValue(mode)
}

// Подписка на выключатель питания кондиционера (опция acPowerSwitch).
// Ручное выключение питания при активном термостате → термостат выключается.
// Ручное включение питания при выключенном термостате → термостат включается
// (в последний выбранный пользователем режим, по умолчанию — Охлаждение).
function subscribeToAcPower(service, variables, options) {
    const power = getDevice(options, "acPowerSwitch")
    if (!power) return
    if (variables.acPowerSubscribe && variables.acPowerSubscribed == true) return

    const thermostatSource = service.getCharacteristic(HC.TargetHeatingCoolingState)
    logDebug(`Создаём подписку на выключатель кондиционера (UUID ${options.acPowerSwitch})`, thermostatSource, options.debug)

    let subscribe = Hub.subscribeWithCondition("", "", [power.getType()], [HC.On, HC.Active], function (powerSource, powerValue) {
        try {
            const powerService = powerSource.getService()
            if (powerService.getUUID() != options.acPowerSwitch) return

            const isOn = toBool(powerValue)
            const desired = computeDesiredAcState(service, options, variables)
            const desiredPower = desired != null ? desired != 0 : null

            const sinceCmd = variables.acLastCommandTime != null ? (Date.now() - variables.acLastCommandTime) : null
            const inEchoWindow = sinceCmd != null && sinceCmd >= 0 && sinceCmd < AC_ECHO_WINDOW_MS

            logDebug(`AC-питание: ${powerValue} (isOn ${isOn}), lastSetPower=${variables.acLastSetPower}, desiredPower=${desiredPower}, inWindow=${inEchoWindow}, override=${variables.acManualOverride}`, thermostatSource, options.debug)

            // Осушитель/Вентилятор при ВЫКЛЮЧЕННОМ термостате: кондей сам держит питание
            // в режиме, который сценарий не регулирует. Не реассертим и не включаем
            // термостат — отступаем, иначе пинг-понг «вкл/выкл». Если же термостат
            // активен (target!=0), значит пользователь хочет охлаждение/нагрев —
            // сценарий владеет кондеем и выведет его из Dry, тут не вмешиваемся.
            const vtChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
            const vTarget = vtChar ? toNum(vtChar.getValue()) : 0
            if (vTarget == 0 && acIsDryOrFan(service, options)) {
                handAcToManualForDryFan(service, variables, thermostatSource)
                return
            }

            // Совпадает с желаемым — эхо/подтверждение
            if (desiredPower != null && isOn === desiredPower) {
                if (!inEchoWindow) variables.acReassertCount = 0
                return
            }
            // Эхо собственной команды внутри окна
            if (inEchoWindow && variables.acLastSetPower != null && isOn === variables.acLastSetPower) return

            // Запоздалое расхождение внутри окна — мягко переотправляем питание
            if (inEchoWindow) {
                if (desiredPower != null) {
                    const count = (variables.acReassertCount || 0) + 1
                    if (count <= AC_REASSERT_MAX) {
                        variables.acReassertCount = count
                        logWarn("Кондиционер сообщил питание " + isOn + ", ожидается " + desiredPower + " — повторяю команду (" + count + " из " + AC_REASSERT_MAX + ")", thermostatSource)
                        writePower(power, desiredPower, thermostatSource, options, variables)
                        return
                    }
                } else {
                    return
                }
            }

            const targetChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
            const virtualTarget = targetChar ? toNum(targetChar.getValue()) : 0

            // Термостат выключен, питание включили вручную → включаем термостат
            if (virtualTarget == 0) {
                if (isOn === true && !inEchoWindow) {
                    // Режим берём С САМОГО КОНДИЦИОНЕРА (что выставил пульт: обогрев →
                    // Нагрев и т.д.) — события питания и режима приходят в произвольном
                    // порядке, и память термостата может не совпадать с желанием
                    // пользователя. Fallback: последний режим термостата, затем Охлаждение.
                    let mode = null
                    const acThermostat = getAcThermostat(service, options)
                    if (acThermostat) {
                        const acModeChar = acThermostat.getCharacteristic(HC.TargetHeatingCoolingState)
                        const acMode = acModeChar ? toNum(acModeChar.getValue()) : null
                        if (acMode == 1 || acMode == 2 || acMode == 3) mode = acMode
                    }
                    if (mode == null) {
                        mode = toNum(variables.lastUserTargetState)
                        if (mode != 1 && mode != 2 && mode != 3) mode = 2
                    }
                    turnOnVirtualThermostat(service, mode, variables, thermostatSource)
                }
                return
            }

            if (variables.acManualOverride) return

            // Термостат активен, питание изменили вручную → ручное вмешательство:
            // выключаем термостат и отдаём кондиционер пользователю.
            // • isOn=false: пользователь выключил кондиционер.
            // • isOn=true: термостат в простое (desired=0), а кондиционер включили
            //   пультом — без этой ветки сценарий молча выключил бы его при следующем
            //   пересчёте, воюя с пользователем.
            if (isOn === false) {
                variables.acManualOverride = true
                logWarn("Кондиционер выключен вручную (выключатель) — выключаю виртуальный термостат и отдаю управление. Чтобы вернуть автоматику, включите термостат или кондиционер снова.", thermostatSource)
                targetChar.setValue(0)
            } else if (isOn === true) {
                variables.acManualOverride = true
                logWarn("Кондиционер включён вручную, хотя термостат в простое — выключаю виртуальный термостат и отдаю управление. Чтобы вернуть автоматику, включите термостат снова.", thermostatSource)
                targetChar.setValue(0)
            }
        } catch (e) {
            logError("Ошибка обработки выключателя кондиционера: " + e.toString())
        }
    })
    variables.acPowerSubscribe = subscribe
    variables.acPowerSubscribed = true
}

function setRelayValue(relay, value, source, debug) {
    if (!relay) return

    try {
        const onChar = relay.getCharacteristic(HC.On)
        const relayAccessory = relay.getAccessory()
        const status = relayAccessory.getService(HS.AccessoryInformation).getCharacteristic(HC.C_Online).getValue() == true
        if (!status)
            logError(`Реле ${getDeviceName(relay)} не в сети`, source)
        const prev = onChar.getValue()
        if (prev !== value) {
            logDebug(`Реле ${getDeviceName(relay)}: ${prev} → ${value}`, source, debug)
        }
        onChar.setValue(value)
    } catch (e) {
        logError(`Ошибка при установке значения реле ${getDeviceName(relay)}: ${e.toString()}`, source)
    }
}

function updateFanSpeed(service, variables, options) {
    updateVirtualFanSpeed(service, variables, options)
    updateAcFanSpeed(service, variables, options)
}

// Вычисляет скорость вентилятора (1..5) по разнице текущей и целевой температур.
// 0 до step - скорость 1, step до 2*step - 2, 2*step до 3*step - 3, и т.д.
// Возвращает null, если температуры неизвестны.
function computeFanSpeedByDiff(service, options) {
    const currentTempChar = service.getCharacteristic(HC.CurrentTemperature)
    const targetTempChar = service.getCharacteristic(HC.TargetTemperature)
    const currentTemp = currentTempChar ? currentTempChar.getValue() : null
    const targetTemp = targetTempChar ? targetTempChar.getValue() : null
    if (currentTemp == null || targetTemp == null) {
        return null
    }
    const fanTempStep = options.fanTempStep || 0.5
    const diff = Math.abs(currentTemp - targetTemp)

    let speed = 1
    if (diff >= 4 * fanTempStep) {
        speed = 5
    } else if (diff >= 3 * fanTempStep) {
        speed = 4
    } else if (diff >= 2 * fanTempStep) {
        speed = 3
    } else if (diff >= fanTempStep) {
        speed = 2
    }
    return { speed: speed, diff: diff, step: fanTempStep }
}

function updateVirtualFanSpeed(service, variables, options) {
    try {
        const fanSpeedChar = service.getCharacteristic(HC.C_FanSpeed)
        if (!fanSpeedChar) {
            // Термостат не поддерживает C_FanSpeed — debug пропускаем (это норма)
            return
        }

        if (variables.fanSpeedManuallySet) {
            logDebug(`Скорость вентилятора зафиксирована пользователем (fanSpeedManuallySet=true) — пропуск. Поставьте Авто (0), чтобы вернуть автоматический режим.`, fanSpeedChar, options.debug)
            return
        }

        const maxSpeed = fanSpeedChar.getMaxValue()

        // Если термостат выключен, устанавливаем минимальную скорость вентилятора
        const currentStateChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
        const currentState = currentStateChar ? currentStateChar.getValue() : 0
        if (currentState == 0) {
            const currentSpeed = fanSpeedChar.getValue()
            if (currentSpeed != 1) {
                fanSpeedChar.setValue(1)
                logDebug(`Скорость вентилятора установлена: 1 (текущий режим = Выключен)`, fanSpeedChar, options.debug)
            } else {
                logDebug(`Текущий режим = Выключен → скорость остаётся 1`, fanSpeedChar, options.debug)
            }
            return
        }

        const computed = computeFanSpeedByDiff(service, options)
        if (computed == null) {
            logDebug(`Скорость вентилятора: текущая/целевая температура неизвестна — пропуск`, fanSpeedChar, options.debug)
            return
        }

        // Ограничиваем скорость максимальным значением
        let speed = computed.speed
        if (speed > maxSpeed) {
            speed = maxSpeed
        }

        const currentSpeed = fanSpeedChar.getValue()
        if (currentSpeed != speed) {
            fanSpeedChar.setValue(speed)
            logDebug(`Скорость вентилятора: ${currentSpeed} → ${speed} (разница ${computed.diff.toFixed(2)}°C, шаг ${computed.step})`, fanSpeedChar, options.debug)
        } else {
            logDebug(`Скорость вентилятора остаётся ${speed} (разница ${computed.diff.toFixed(2)}°C, шаг ${computed.step})`, fanSpeedChar, options.debug)
        }
    } catch (e) {
        logError("Ошибка обновления скорости вентилятора: " + e.toString())
    }
}

// Управление скоростью вентилятора кондиционера по разнице температур
// виртуального термостата. Работает, только если включена опция acFanControl
// и у кондиционера есть характеристика C_FanSpeed.
// Ручная фиксация: если текущее значение отличается от последнего установленного
// сценарием — считаем, что скорость изменил пользователь (пультом или из интерфейса),
// и не трогаем её (при включённой опции fanSpeedManualLock). Возврат в авто — установкой 0 (Авто).
function updateAcFanSpeed(service, variables, options) {
    try {
        if (options.acFanControl != true) return
        if (variables.acManualOverride) return
        const ac = getAcThermostat(service, options)
        if (!ac) return
        const acFanChar = ac.getCharacteristic(HC.C_FanSpeed)
        if (!acFanChar) return

        const currentStateChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
        const currentState = currentStateChar ? currentStateChar.getValue() : 0
        if (currentState == 0) {
            // Кондиционер выключен — вентилятор не трогаем
            return
        }

        const acCurrentSpeed = toNum(acFanChar.getValue())

        // Пользователь вернул Авто (0) — снимаем фиксацию
        if (acCurrentSpeed == 0 && toNum(acFanChar.getMinValue()) == 0) {
            if (variables.acFanSpeedManuallySet) {
                logDebug(`Вентилятор кондиционера: пользователь поставил Авто (0) — снимаем фиксацию`, acFanChar, options.debug)
                variables.acFanSpeedManuallySet = false
            }
        } else if (variables.acLastSetFanSpeed != null && acCurrentSpeed != toNum(variables.acLastSetFanSpeed)) {
            // Значение изменилось не сценарием — ручное вмешательство
            if (options.fanSpeedManualLock == true && !variables.acFanSpeedManuallySet) {
                logDebug(`Вентилятор кондиционера: скорость ${acCurrentSpeed} установлена вручную — фиксируем`, acFanChar, options.debug)
                variables.acFanSpeedManuallySet = true
            }
        }

        if (variables.acFanSpeedManuallySet) {
            logDebug(`Вентилятор кондиционера зафиксирован пользователем — пропуск. Поставьте Авто (0), чтобы вернуть автоматический режим.`, acFanChar, options.debug)
            return
        }

        const computed = computeFanSpeedByDiff(service, options)
        if (computed == null) {
            return
        }

        let speed = computed.speed
        const maxSpeed = acFanChar.getMaxValue()
        const minSpeed = acFanChar.getMinValue()
        if (toNum(maxSpeed) != null && speed > toNum(maxSpeed)) speed = toNum(maxSpeed)
        if (toNum(minSpeed) != null && speed < toNum(minSpeed)) speed = toNum(minSpeed)

        if (acCurrentSpeed != speed) {
            acFanChar.setValue(speed)
            logDebug(`Вентилятор кондиционера: ${acCurrentSpeed} → ${speed} (разница ${computed.diff.toFixed(2)}°C, шаг ${computed.step})`, acFanChar, options.debug)
        }
        variables.acLastSetFanSpeed = speed
    } catch (e) {
        logError("Ошибка обновления скорости вентилятора кондиционера: " + e.toString())
    }
}

function setValueFromSensor(sensorSource, variables, options, currentTemperatureCharacteristic) {
    try {
        const sensorService = sensorSource.getService()
        const sensorAccessory = sensorService.getAccessory()
        const status = sensorAccessory.getService(HS.AccessoryInformation).getCharacteristic(HC.C_Online).getValue() == true;
        if (!status) {
            logWarn(`Датчик ${getDeviceName(sensorService)} не в сети`, sensorSource)
        }
        const sensorValue = sensorSource.getValue()
        currentTemperatureCharacteristic.setValue(sensorValue)
        if (variables.lastTemp != sensorValue) {
            logDebug(`Значение на термостат установлено: ${sensorValue}°C`, sensorSource, options.debug)
            variables.lastTemp = sensorValue
            variables.lastUpdateTime = Date.now();
        }
    } catch (e) {
        logError(`Не удалось получить температуру с датчика ${options.sensor}: ${e.toString()}`, sensorSource)
    }
}

function showSubscribeMessage(options, context) {
    if (context.toString().indexOf("HUB[OnStart]") >= 0) {
        return
    }
    const sensorService = getDevice(options, "sensor")

    try {
        const accessory = sensorService.getAccessory()
        const accessoryName = accessory.getName()
        const serviceName = sensorService.getName()
        console.message(`Подключен датчик: ${(accessoryName == serviceName ? accessoryName : accessoryName + " " + serviceName)}`)
    } catch (e) {
        // Игнорируем ошибки при выводе сообщения
    }
}

// Описание поведения при отказе датчика для логов
function describeFailureBehavior(behavior) {
    if (behavior == 1) return "включаем реле нагрева"
    if (behavior == 2) return "включаем реле охлаждения"
    if (behavior == 3) return "состояние не меняем"
    return "отключаем термостат и реле"
}

// Нормализует failureTimeout: минимум 15 мин, кратность 15
function getFailureTimeoutMinutes(options) {
    let minutes = options.failureTimeout != null ? options.failureTimeout : 240
    if (minutes < FAILURE_TIMEOUT_STEP_MIN) minutes = FAILURE_TIMEOUT_STEP_MIN
    minutes = Math.round(minutes / FAILURE_TIMEOUT_STEP_MIN) * FAILURE_TIMEOUT_STEP_MIN
    return minutes
}

// Применяет поведение при отказе датчика.
// 0 — Отключить: TargetHCState=0, оба реле OFF.
// 1 — Нагрев: оставить TargetHCState как есть, реле нагрева ON, реле охлаждения OFF.
// 2 — Охлаждение: оставить TargetHCState как есть, реле нагрева OFF, реле охлаждения ON.
// 3 — Ничего не делать: ни реле, ни режим не трогаем.
function applyFailureBehavior(service, options, source, variables) {
    const behavior = options.failureBehavior
    if (behavior == 3) {
        logDebug("Отказ датчика: режим 'Ничего не делать' — состояние не меняем", source, options.debug)
        return
    }

    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")
    const acThermostat = getAcThermostat(service, options)

    if (behavior == 1) {
        logDebug("Отказ датчика: режим 'Нагрев' — реле нагрева ON, охлаждения OFF, кондиционер → Нагрев (целевой режим не меняем)", source, options.debug)
        setRelayValue(heatingRelay, true, source, options.debug)
        setRelayValue(coolingRelay, false, source, options.debug)
        setAcMode(acThermostat, 1, getAcHeatTemp(options), source, options, variables)
        return
    }

    if (behavior == 2) {
        logDebug("Отказ датчика: режим 'Охлаждение' — реле охлаждения ON, нагрева OFF, кондиционер → Охлаждение (целевой режим не меняем)", source, options.debug)
        setRelayValue(heatingRelay, false, source, options.debug)
        setRelayValue(coolingRelay, true, source, options.debug)
        setAcMode(acThermostat, 2, getAcCoolTemp(options), source, options, variables)
        return
    }

    // 0 — Отключить: целевой режим в OFF + оба реле OFF + кондиционер OFF
    logDebug("Отказ датчика: режим 'Отключить' — TargetHCState=0, оба реле OFF, кондиционер OFF", source, options.debug)
    const targetChar = service ? service.getCharacteristic(HC.TargetHeatingCoolingState) : null
    if (targetChar && targetChar.getValue() !== 0) {
        targetChar.setValue(0)
    }
    setRelayValue(heatingRelay, false, source, options.debug)
    setRelayValue(coolingRelay, false, source, options.debug)
    setAcMode(acThermostat, 0, null, source, options, variables)
}

// Восстановление после отказа датчика.
// Сбрасывает флаг sensorFailed и в режиме «Отключить» возвращает Целевой режим, который пользователь
// выбрал последним (до или во время отказа).
function recoverFromSensorFailure(service, variables, options, source) {
    if (!variables.sensorFailed) return
    variables.sensorFailed = false
    logWarn("Датчик температуры восстановлен. Управление реле возвращено в обычный режим.", source)

    // В режиме «Отключить» сценарий ранее сбросил TargetHCState в 0 — восстанавливаем сохранённый.
    if (options.failureBehavior == 0 && variables.lastUserTargetState != null) {
        const targetChar = service ? service.getCharacteristic(HC.TargetHeatingCoolingState) : null
        if (targetChar && targetChar.getValue() !== variables.lastUserTargetState) {
            logWarn(`Восстанавливаем Целевой режим: ${variables.lastUserTargetState}`, source)
            targetChar.setValue(variables.lastUserTargetState)
        }
    }

    // Прогоним обычную логику управления реле (sensorFailed уже false).
    const currentTempChar = service ? service.getCharacteristic(HC.CurrentTemperature) : null
    if (currentTempChar) {
        handleHeatingCoolingLogic(currentTempChar, options, variables)
    }
}

// Проверка состояния датчика. Срабатывает по cron каждые 15 минут.
// Онлайн-статус аксессуара датчика температуры (характеристика C_Online).
// null — определить нельзя (тогда считаем как «неизвестно», не онлайн).
function isSensorOnline(options) {
    try {
        const sensorService = getDevice(options, "sensor")
        if (!sensorService) return false
        const info = sensorService.getAccessory().getService(HS.AccessoryInformation)
        if (!info) return false
        const onlineChar = info.getCharacteristic(HC.C_Online)
        if (!onlineChar) return false
        return onlineChar.getValue() == true
    } catch (e) {
        return false
    }
}

function checkSensorFailure(service, variables, options) {
    try {
        if (!options.sensor || options.sensor === '') return
        if (!service) return
        const timeoutMs = getFailureTimeoutMinutes(options) * 60 * 1000
        const sensorChar = service.getCharacteristic(HC.CurrentTemperature)
        if (!variables.lastUpdateTime) {
            // Если ни одного обновления не было — отсчитываем от запуска
            variables.lastUpdateTime = Date.now()
            logDebug("Проверка датчика: lastUpdateTime неизвестно, инициализируем", sensorChar, options.debug)
            return
        }
        const elapsed = Date.now() - variables.lastUpdateTime
        const elapsedMin = Math.round(elapsed / 60000)
        const timeoutMin = Math.round(timeoutMs / 60000)
        logDebug(`Проверка датчика: с последнего обновления ${elapsedMin} мин (timeout ${timeoutMin} мин)`, sensorChar, options.debug)
        if (elapsed <= timeoutMs) {
            recoverFromSensorFailure(service, variables, options, sensorChar)
            return
        }
        // Тишина при стабильной температуре — норма для Zigbee-датчиков, которые
        // шлют данные только при изменении (eWeLink SNZB-02D и подобные). Пока
        // аксессуар датчика в сети, отказом это не считаем — обновляем отметку
        // времени и продолжаем работу. Реальный отказ (сел аккумулятор, выдернули)
        // проявляется уходом в офлайн.
        if (isSensorOnline(options)) {
            logDebug(`Датчик молчит ${elapsedMin} мин, но он в сети — считаем живым (датчик шлёт данные только при изменении)`, sensorChar, options.debug)
            variables.lastUpdateTime = Date.now()
            recoverFromSensorFailure(service, variables, options, sensorChar)
            return
        }
        if (!variables.sensorFailed) {
            variables.sensorFailed = true
            const sensorService = getDevice(options, "sensor")
            const sensorName = sensorService ? getDeviceName(sensorService) : options.sensor
            const behaviorText = describeFailureBehavior(options.failureBehavior)
            logError(`Нет показаний от датчика температуры (${sensorName}) уже ${elapsedMin} мин. Отказ датчика: ${behaviorText}`, sensorChar)
        }
        applyFailureBehavior(service, options, sensorChar, variables)
    } catch (e) {
        logError("Ошибка проверки отказа датчика: " + e.toString())
    }
}

// Запускает периодическую проверку отказа датчика (раз в 15 минут).
function startFailureCheckCron(service, variables, options) {
    if (variables.failureCheckTask) return
    logDebug(`Создаём cron 'каждые 15 мин' для проверки отказа датчика (timeout ${getFailureTimeoutMinutes(options)} мин)`, service.getCharacteristic(HC.CurrentTemperature), options.debug)
    variables.failureCheckTask = Cron.schedule("0 */15 * * * *", function () {
        checkSensorFailure(service, variables, options)
        // Пересчёт состояния по расписанию: границы временного окна режима
        // «вентилятор без компрессора» применяются даже без событий датчика.
        // Идемпотентно — команды уходят только при реальных изменениях.
        if (!variables.sensorFailed) {
            const src = service.getCharacteristic(HC.CurrentTemperature)
            if (src) handleHeatingCoolingLogic(src, options, variables)
        }
    })
}

function getDevice(options, name) {
    if (!options[name] || options[name] === '') {
        return undefined
    }

    try {
        const cdata = options[name].split('.');
        if (cdata.length < 2) {
            return undefined
        }
        const aid = cdata[0];
        const sid = cdata[1];
        const accessory = Hub.getAccessory(aid)
        if (!accessory) {
            return undefined
        }
        const service = accessory.getService(sid)
        if (!service) {
            logError("Выбранное устройство не найдено: " + options[name], undefined)
            return undefined
        }
        return service
    } catch (e) {
        logError("Ошибка при получении устройства: " + e.toString(), undefined)
        return undefined
    }
}

function logWarn(text, source) {
    console.warn(getLogText(text, source));
}
function logError(text, source) {
    console.error(getLogText(text, source));
}
// Отладочный лог. Пишет только если options.debug=true (передаётся третьим аргументом).
// Используем console.info (а не console.log) — в Sprut.Hub это уровень "Информация".
function logDebug(text, source, debug) {
    if (!debug) return
    console.info(getLogText(text, source));
}
function getLogText(text, source) {
    if (source) {
        return `${text} | ${DEBUG_TITLE} ${getDeviceName(source.getService())}`
    } else {
        return `${text} | ${DEBUG_TITLE}`
    }
}

function getDeviceName(service) {
    const acc = service.getAccessory();
    const room = acc.getRoom().getName()
    const accName = acc.getName()
    const sName = service.getName()
    return room + " -> " + (accName === sName ? accName : accName + " " + sName) + " (" + service.getUUID() + ")" + (!service.isVisible() ? ". Скрыт" : "")
}

// подготовка списка характеристик для выбора в настройке логики
function getServicesByServiceAndCharacteristicType(serviceTypes, characteristicTypes) {
    let unsortedServicesList = [];
    Hub.getAccessories().forEach((a) => {
        a.getServices()
            .filter((s) => serviceTypes.indexOf(s.getType()) >= 0)
            .filter((s) => characteristicTypes.some((c) => s.getCharacteristic(c)))
            .forEach((s) => {
                let name = getDeviceName(s);
                unsortedServicesList.push({
                    name: { ru: name, en: name },
                    value: s.getUUID()
                });
            });
    });
    let sortedServicesList = [{ name: { ru: "Не выбрано", en: "Not selected" }, value: '' }];
    unsortedServicesList.sort((a, b) => a.name.ru.localeCompare(b.name.ru)).forEach((s) => sortedServicesList.push(s));
    return sortedServicesList;
}

// Минимальный интервал обновления целевой температуры кондиционера при плавном
// режиме (мс). Резкие изменения (смена режима, скачок ≥2°) проходят сразу.
const AC_TEMP_UPDATE_MIN_MS = 120000
// На сколько градусов поднимать (охлаждение) / опускать (нагрев) целевую
// температуру кондиционера относительно его собственного датчика в режиме
// «вентилятор без компрессора».
const AC_STANDBY_TEMP_OFFSET = 2
// Окно подавления запоздалых событий кондиционера после собственной команды (мс).
// Реальные интеграции подтверждают команды асинхронно и могут переизлучить старое
// состояние спустя несколько секунд — внутри окна такие события не считаются ручным
// вмешательством. Ручное изменение в течение окна будет мягко перезаписано сценарием.
const AC_ECHO_WINDOW_MS = 30000
// Максимум мягких переотправок команды внутри окна, после — ручной режим.
const AC_REASSERT_MAX = 3
// Список ВСЕХ сервисов (любого типа), имеющих хотя бы одну из указанных
// характеристик. Используется для выбора выключателя кондиционера: тип сервиса
// питания у разных интеграций свой (Fan, Switch, кастомные).
function getServicesByCharacteristicTypes(characteristicTypes) {
    let unsortedServicesList = [];
    Hub.getAccessories().forEach((a) => {
        a.getServices()
            .filter((s) => s.getType() != HS.AccessoryInformation)
            .filter((s) => characteristicTypes.some((c) => s.getCharacteristic(c)))
            .forEach((s) => {
                let name = getDeviceName(s);
                unsortedServicesList.push({
                    name: { ru: name, en: name },
                    value: s.getUUID()
                });
            });
    });
    let sortedServicesList = [{ name: { ru: "Не выбрано", en: "Not selected" }, value: '' }];
    unsortedServicesList.sort((a, b) => a.name.ru.localeCompare(b.name.ru)).forEach((s) => sortedServicesList.push(s));
    return sortedServicesList;
}

// Минимальный шаг времени до отказа датчика (минуты). См. опцию failureTimeout.
const FAILURE_TIMEOUT_STEP_MIN = 15
// Константа для отладки
const DEBUG_TITLE = "Виртуальный термостат: ";

function getAccessoryIdFromUUID(uuid) {
    if (!uuid) {
        return undefined
    }
    const parts = uuid.toString().split('.')
    if (parts.length >= 1) {
        return parts[0]
    }
    return undefined
}

// Системное переигрывание характеристик — НЕ действие пользователя.
// Признаки: контекст старта хаба (HUB[OnStart]) или цепочка вида
// 'LOGIC[...] <- WEB/CLOUD[...]' без звена C[...] между ними — так выглядит
// пересохранение настроек привязки логики, когда хаб переотправляет значения
// всех характеристик скопом.
function isSystemReplayContext(context) {
    const ctx = context.toString()
    if (ctx.indexOf('HUB[OnStart]') >= 0) return true
    const elements = ctx.split(' <- ')
    return elements.length >= 2 &&
        elements[0].indexOf('LOGIC') == 0 &&
        elements[1].indexOf('C[') != 0
}

function isSelfChangeByContext(context) {
    // Проверяем, что изменение произошло сценарием (self change)
    // Шаблон: 'LOGIC <- C <- LOGIC'
    const elements = context.toString().split(' <- ')
    return elements.length >= 3 &&
        elements[0].startsWith('LOGIC') &&
        elements[1].startsWith('C') &&
        elements[2] === elements[0];
}
