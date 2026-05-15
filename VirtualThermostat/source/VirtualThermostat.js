let servicesList = getServicesByServiceAndCharacteristicType([HS.Switch, HS.Outlet], [HC.On]);
let sensorsServicesList = getServicesByServiceAndCharacteristicType([HS.TemperatureSensor, HS.Thermostat], [HC.CurrentTemperature]);

// Выносим описание в переменную для использования в info и options
let scenarioDescription = {
    ru: "Позволяет реализовать логику виртуального термостата, указав датчик температуры и реле для нагрева или охлаждения. Сценарий получает и устанавливает температуру в помещении, а также включает и отключает реле нагрева и охлаждения в зависимости от текущей и целевой температуры. Поддерживает целевые режимы: Нагрев, Охлаждение, Автоматический и Выключен. Автоматически управляет скоростью вентилятора (если доступна характеристика C_FanSpeed) на основе разницы между текущей и целевой температурой.",
    en: "Allows you to implement virtual thermostat logic by specifying a temperature sensor and relays for heating or cooling. The scenario receives and sets the temperature in the room, and also turns heating and cooling relays on and off depending on the current and target temperatures. Supports target modes: Heating, Cooling, Automatic and Off. Automatically controls fan speed (if C_FanSpeed characteristic is available) based on the difference between current and target temperature."
};

info = {
    name: "🌡️ Виртуальный термостат",
    description: scenarioDescription.ru,
    version: "3.0",
    author: "@BOOMikru",
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
        applyFailureBehavior(source.getService(), options, source)
        return
    }

    const service = source.getService()
    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")

    const currentStateChar = service.getCharacteristic(HC.CurrentHeatingCoolingState)
    const targetStateChar = service.getCharacteristic(HC.TargetHeatingCoolingState)
    const currentState = currentStateChar ? currentStateChar.getValue() : 0
    const targetState = targetStateChar ? targetStateChar.getValue() : 0

    // Выключено / Вентилятор / Осушитель — оба реле выкл
    if (targetState == 0 || targetState == -1 || targetState == -2) {
        logDebug(`Целевой режим ${targetState} (Off/Fan/Dry) — отключаем оба реле`, source, options.debug)
        setRelayValue(heatingRelay, false, source, options.debug)
        setRelayValue(coolingRelay, false, source, options.debug)
        return
    }
    // Дальше решает CurrentHeatingCoolingState (значения 0/1/2)
    if (currentState == 1) {
        logDebug(`Текущий режим = Нагрев → реле нагрева ON, охлаждения OFF`, source, options.debug)
        setRelayValue(heatingRelay, true, source, options.debug)
        setRelayValue(coolingRelay, false, source, options.debug)
        return
    }
    if (currentState == 2) {
        logDebug(`Текущий режим = Охлаждение → реле охлаждения ON, нагрева OFF`, source, options.debug)
        setRelayValue(heatingRelay, false, source, options.debug)
        setRelayValue(coolingRelay, true, source, options.debug)
        return
    }
    // currentState == 0
    logDebug(`Текущий режим = Выключен (target=${targetState}) → оба реле OFF`, source, options.debug)
    setRelayValue(heatingRelay, false, source, options.debug)
    setRelayValue(coolingRelay, false, source, options.debug)
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

    // Используем любую характеристику термостата для создания source в callback
    const thermostatSource = service.getCharacteristic(HC.CurrentHeatingCoolingState)

    // Создаем одну подписку на онлайн статус для обоих реле
    if ((heatingRelay || coolingRelay) && (!variables.relaySubscribe || variables.relaySubscribed != true) && thermostatSource) {
        const heatingRelayAccessoryId = getAccessoryIdFromUUID(options.heatingRelay)
        const coolingRelayAccessoryId = getAccessoryIdFromUUID(options.coolingRelay)
        logDebug(`Создаём подписку на онлайн-статус реле (heat=${heatingRelayAccessoryId}, cool=${coolingRelayAccessoryId})`, thermostatSource, options.debug)

        let subscribe = Hub.subscribeWithCondition("", "", [HS.AccessoryInformation], [HC.C_Online], function (onlineSource, onlineValue) {
            if (onlineValue != true) return

            // Получаем идентификатор аксессуара и сравниваем с нашими реле
            const accessoryId = getAccessoryIdFromUUID(onlineSource.getUUID())
            if (accessoryId == heatingRelayAccessoryId || accessoryId == coolingRelayAccessoryId) {
                logDebug(`Реле ${accessoryId} вернулось в сеть — пересчитываем состояние`, thermostatSource, options.debug)
                handleHeatingCoolingLogic(thermostatSource, options, variables)
            }
        })
        variables.relaySubscribe = subscribe
        variables.relaySubscribed = true
    }
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
    try {
        const fanSpeedChar = service.getCharacteristic(HC.C_FanSpeed)
        if (!fanSpeedChar) {
            // Termостат не поддерживает C_FanSpeed — debug пропускаем (это норма)
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

        const currentTemp = service.getCharacteristic(HC.CurrentTemperature).getValue()
        const targetTemp = service.getCharacteristic(HC.TargetTemperature).getValue()
        const fanTempStep = options.fanTempStep || 0.5

        if (currentTemp == null || targetTemp == null) {
            logDebug(`Скорость вентилятора: temp/target = ${currentTemp}/${targetTemp} (null) — пропуск`, fanSpeedChar, options.debug)
            return
        }

        const diff = Math.abs(currentTemp - targetTemp)

        // Вычисляем скорость вентилятора на основе разницы температур
        // 0 до step - скорость 1, step до 2*step - 2, 2*step до 3*step - 3, и т.д.
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

        // Ограничиваем скорость максимальным значением
        if (speed > maxSpeed) {
            speed = maxSpeed
        }

        const currentSpeed = fanSpeedChar.getValue()
        if (currentSpeed != speed) {
            fanSpeedChar.setValue(speed)
            logDebug(`Скорость вентилятора: ${currentSpeed} → ${speed} (разница ${diff.toFixed(2)}°C, шаг ${fanTempStep})`, fanSpeedChar, options.debug)
        } else {
            logDebug(`Скорость вентилятора остаётся ${speed} (разница ${diff.toFixed(2)}°C, шаг ${fanTempStep})`, fanSpeedChar, options.debug)
        }
    } catch (e) {
        logError("Ошибка обновления скорости вентилятора: " + e.toString())
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
function applyFailureBehavior(service, options, source) {
    const behavior = options.failureBehavior
    if (behavior == 3) {
        logDebug("Отказ датчика: режим 'Ничего не делать' — состояние не меняем", source, options.debug)
        return
    }

    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")

    if (behavior == 1) {
        logDebug("Отказ датчика: режим 'Нагрев' — реле нагрева ON, охлаждения OFF (целевой режим не меняем)", source, options.debug)
        setRelayValue(heatingRelay, true, source, options.debug)
        setRelayValue(coolingRelay, false, source, options.debug)
        return
    }

    if (behavior == 2) {
        logDebug("Отказ датчика: режим 'Охлаждение' — реле охлаждения ON, нагрева OFF (целевой режим не меняем)", source, options.debug)
        setRelayValue(heatingRelay, false, source, options.debug)
        setRelayValue(coolingRelay, true, source, options.debug)
        return
    }

    // 0 — Отключить: целевой режим в OFF + оба реле OFF
    logDebug("Отказ датчика: режим 'Отключить' — TargetHCState=0, оба реле OFF", source, options.debug)
    const targetChar = service ? service.getCharacteristic(HC.TargetHeatingCoolingState) : null
    if (targetChar && targetChar.getValue() !== 0) {
        targetChar.setValue(0)
    }
    setRelayValue(heatingRelay, false, source, options.debug)
    setRelayValue(coolingRelay, false, source, options.debug)
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
        if (!variables.sensorFailed) {
            variables.sensorFailed = true
            const sensorService = getDevice(options, "sensor")
            const sensorName = sensorService ? getDeviceName(sensorService) : options.sensor
            const behaviorText = describeFailureBehavior(options.failureBehavior)
            logError(`Нет показаний от датчика температуры (${sensorName}) уже ${elapsedMin} мин. Отказ датчика: ${behaviorText}`, sensorChar)
        }
        applyFailureBehavior(service, options, sensorChar)
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

function isSelfChangeByContext(context) {
    // Проверяем, что изменение произошло сценарием (self change)
    // Шаблон: 'LOGIC <- C <- LOGIC'
    const elements = context.toString().split(' <- ')
    return elements.length >= 3 &&
        elements[0].startsWith('LOGIC') &&
        elements[1].startsWith('C') &&
        elements[2] === elements[0];
}
