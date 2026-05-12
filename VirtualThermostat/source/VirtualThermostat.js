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
    sourceCharacteristics: [HC.CurrentHeatingCoolingState, HC.TargetHeatingCoolingState, HC.CurrentTemperature, HC.TargetTemperature, HC.C_FanSpeed],

    options: {
        desc: {
            name: {
                en: "DESCRIPTION",
                ru: "ОПИСАНИЕ"
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
        forceRelayState: {
            name: {
                en: "Force relay state on temperature change",
                ru: "Принудительно устанавливать состояние реле при изменении температуры"
            },
            desc: {
                ru: "Если включено, состояние реле будет принудительно устанавливаться при каждом изменении температуры, а не только при изменении режима термостата. Сценарий сам отслеживает, когда реле не в сети и устанавливает нужное состояние, когда оно подключается к хабу - для этого эту опцию включать не нужно.",
                en: "If enabled, relay state will be forcibly set on every temperature change, not only when thermostat mode changes. The scenario itself monitors when the relay is not online and sets the appropriate state when it connects to the hub - for this, this option does not need to be enabled."
            },
            type: "Boolean",
            value: false
        },
        failureBehavior: {
            name: {
                en: "Sensor failure behavior",
                ru: "Поведение при отказе датчика температуры"
            },
            desc: {
                ru: "Что делать с реле, если от датчика температуры не поступали данные дольше заданного времени. 'Отключать' — выключить оба реле (нагрев и охлаждение). 'Включать' — включить реле, соответствующее целевому режиму термостата (нагрев или охлаждение). После восстановления данных с датчика управление реле возвращается в обычный режим.",
                en: "What to do with the relay if no data has been received from the temperature sensor for longer than the specified time. 'Turn off' — turn off both relays (heating and cooling). 'Turn on' — turn on the relay corresponding to the thermostat's target mode (heating or cooling). After the sensor data is restored, relay control returns to normal mode."
            },
            type: "Integer",
            value: 0,
            formType: "list",
            values: [
                { value: 0, name: { en: "Turn off", ru: "Отключать" } },
                { value: 1, name: { en: "Turn on", ru: "Включать" } }
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
        sensorFailed: false
    }
};

// Вывод в лог информационные сообщения о работе сценария
let debug = false

function trigger(source, value, variables, options, context) {
    try {
        const characteristicType = source.getType()
        const service = source.getService()

        if (characteristicType === HC.CurrentHeatingCoolingState || characteristicType === HC.TargetHeatingCoolingState) {
            // Логика управления реле нагрева/охлаждения
            handleHeatingCoolingLogic(source, options, variables)
            updateFanSpeed(service, variables, options)
        } else if (characteristicType === HC.CurrentTemperature || characteristicType === HC.TargetTemperature) {
            // Логика управления вентилятором на основе разницы температур
            updateFanSpeed(service, variables, options)
            if (options.forceRelayState) {
                handleHeatingCoolingLogic(source, options, variables)
            }
        } else if (characteristicType === HC.C_FanSpeed) {
            // Изменение скорости вентилятора
            handleFanSpeedChange(service, value, variables, options, context)
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
    // Если изменение сделал НЕ сам сценарий - это ручное изменение пользователем
    if (!isSelfChange) {
        if (value == 0) {
            // Пользователь установил Авто (0) - сбрасываем флаг
            variables.fanSpeedManuallySet = false
            updateFanSpeed(service, variables, options)
        } else {
            // Пользователь установил конкретную скорость - ставим флаг только если включена ручная фиксация
            const fanSpeedChar = service.getCharacteristic(HC.C_FanSpeed)
            if (fanSpeedChar.getMinValue() > 0) return
            if (options.fanSpeedManualLock == true) {
                variables.fanSpeedManuallySet = true
            }
        }
    }
}

function handleHeatingCoolingLogic(source, options, variables) {
    // При отказе датчика управление реле берёт на себя applyFailureBehavior
    if (variables && variables.sensorFailed) {
        applyFailureBehavior(source.getService(), options, source)
        return
    }

    const service = source.getService()
    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")

    const currentState = service.getCharacteristic(HC.CurrentHeatingCoolingState).getValue()
    const targetState = service.getCharacteristic(HC.TargetHeatingCoolingState).getValue()

    // Выключено
    if (targetState == 0 || currentState == 0) {
        setRelayValue(heatingRelay, false, source)
        setRelayValue(coolingRelay, false, source)
        return
    }
    // Нагрев
    if ((targetState == 1 || targetState == 3) && currentState == 1) {
        setRelayValue(heatingRelay, true, source)
        setRelayValue(coolingRelay, false, source)
        return
    }
    // Охлаждение
    if ((targetState == 2 || targetState == 3) && currentState == 2) {
        setRelayValue(heatingRelay, false, source)
        setRelayValue(coolingRelay, true, source)
    }
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
        let subscribe = Hub.subscribeWithCondition("", "", [HS.TemperatureSensor, HS.Thermostat], [HC.CurrentTemperature], function (sensorSource, sensorValue) {
            let sensorService = sensorSource.getService()
            let isSelected = sensorService.getUUID() == options.sensor
            if (isSelected && currentTemperatureCharacteristic) {
                setValueFromSensor(sensorSource, variables, options, currentTemperatureCharacteristic)
            }
        })
        variables.subscribe = subscribe
        variables.subscribed = true
    }
    if (!variables.midnightTask) {
        variables.midnightTask = Cron.schedule("0 0 0 * * *", function () {
            setValueFromSensor(tempSensorSource, variables, options, currentTemperatureCharacteristic)
            logInfo("Полуночное обновление", source, debug)
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

        let subscribe = Hub.subscribeWithCondition("", "", [HS.AccessoryInformation], [HC.C_Online], function (onlineSource, onlineValue) {
            if (onlineValue != true) return

            // Получаем идентификатор аксессуара и сравниваем с нашими реле
            const accessoryId = getAccessoryIdFromUUID(onlineSource.getUUID())
            if (accessoryId == heatingRelayAccessoryId || accessoryId == coolingRelayAccessoryId)
                handleHeatingCoolingLogic(thermostatSource, options, variables)
        })
        variables.relaySubscribe = subscribe
        variables.relaySubscribed = true
    }
}

function setRelayValue(relay, value, source) {
    if (!relay) return

    try {
        const onChar = relay.getCharacteristic(HC.On)
        const relayAccessory = relay.getAccessory()
        const status = relayAccessory.getService(HS.AccessoryInformation).getCharacteristic(HC.C_Online).getValue() == true
        if (!status)
            logError(`Реле ${getDeviceName(relay)} не в сети`, source)
        onChar.setValue(value)
    } catch (e) {
        logError(`Ошибка при установке значения реле ${getDeviceName(relay)}: ${e.toString()}`, source)
    }
}

function updateFanSpeed(service, variables, options) {
    try {
        if (variables.fanSpeedManuallySet) return

        const fanSpeedChar = service.getCharacteristic(HC.C_FanSpeed)
        if (!fanSpeedChar) return

        const maxSpeed = fanSpeedChar.getMaxValue()

        // Если термостат выключен, устанавливаем минимальную скорость вентилятора
        const currentState = service.getCharacteristic(HC.CurrentHeatingCoolingState).getValue()
        if (currentState == 0) {
            const currentSpeed = fanSpeedChar.getValue()
            if (currentSpeed != 1) {
                fanSpeedChar.setValue(1)
                logInfo(`Скорость вентилятора установлена: 1 (термостат выключен)`, fanSpeedChar, debug)
            }
            return
        }

        const currentTemp = service.getCharacteristic(HC.CurrentTemperature).getValue()
        const targetTemp = service.getCharacteristic(HC.TargetTemperature).getValue()
        const fanTempStep = options.fanTempStep || 0.5

        if (currentTemp == null || targetTemp == null) {
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
            // Используем fanSpeedChar для логирования, так как это источник изменения
            logInfo(`Скорость вентилятора установлена: ${speed} (разница температур: ${diff.toFixed(2)}°C)`, fanSpeedChar, debug)
        }
    } catch (e) {
        // Игнорируем ошибки - это опциональная функция
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
            logInfo(`Значение на термостат установлено: ${sensorValue}°C`, sensorSource, debug)
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

// Нормализует failureTimeout: минимум 15 мин, кратность 15
function getFailureTimeoutMinutes(options) {
    let minutes = options.failureTimeout != null ? options.failureTimeout : 240
    if (minutes < FAILURE_TIMEOUT_STEP_MIN) minutes = FAILURE_TIMEOUT_STEP_MIN
    minutes = Math.round(minutes / FAILURE_TIMEOUT_STEP_MIN) * FAILURE_TIMEOUT_STEP_MIN
    return minutes
}

// Применяет поведение при отказе датчика к реле в зависимости от целевого режима термостата
function applyFailureBehavior(service, options, source) {
    const heatingRelay = getDevice(options, "heatingRelay")
    const coolingRelay = getDevice(options, "coolingRelay")
    // Если у термостата нет TargetHeatingCoolingState — targetState останется undefined,
    // тогда в режиме "Включать" по умолчанию включаем нагрев (защита от замерзания).
    const targetChar = service ? service.getCharacteristic(HC.TargetHeatingCoolingState) : null
    const targetState = targetChar ? targetChar.getValue() : undefined

    if (options.failureBehavior == 1) {
        // Включать: включаем реле, соответствующее целевому режиму
        if (targetState == 1 || targetState == 3 || targetState === undefined) {
            setRelayValue(heatingRelay, true, source)
            setRelayValue(coolingRelay, false, source)
        } else if (targetState == 2) {
            setRelayValue(heatingRelay, false, source)
            setRelayValue(coolingRelay, true, source)
        } else {
            // Термостат выключен — нечего включать
            setRelayValue(heatingRelay, false, source)
            setRelayValue(coolingRelay, false, source)
        }
        return
    }
    // Отключать: оба реле выкл
    setRelayValue(heatingRelay, false, source)
    setRelayValue(coolingRelay, false, source)
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
            return
        }
        const elapsed = Date.now() - variables.lastUpdateTime
        if (elapsed <= timeoutMs) {
            if (variables.sensorFailed) {
                variables.sensorFailed = false
                logWarn(`Датчик температуры восстановлен. Управление реле возвращено в обычный режим`, sensorChar)
                handleHeatingCoolingLogic(sensorChar, options, variables)
            }
            return
        }
        const minutes = Math.round(elapsed / 60000)
        if (!variables.sensorFailed) {
            variables.sensorFailed = true
            const sensorService = getDevice(options, "sensor")
            const sensorName = sensorService ? getDeviceName(sensorService) : options.sensor
            const behaviorText = options.failureBehavior == 1 ? "включаем реле по целевому режиму" : "отключаем реле"
            logError(`Нет показаний от датчика температуры (${sensorName}) уже ${minutes} мин. Отказ датчика: ${behaviorText}`, sensorChar)
        }
        applyFailureBehavior(service, options, sensorChar)
    } catch (e) {
        logError("Ошибка проверки отказа датчика: " + e.toString())
    }
}

// Запускает периодическую проверку отказа датчика (раз в 15 минут).
function startFailureCheckCron(service, variables, options) {
    if (variables.failureCheckTask) return
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

function logInfo(text, source, show) {
    if (show) console.info(getLogText(text, source));
}
function logWarn(text, source) {
    console.warn(getLogText(text, source));
}
function logError(text, source) {
    console.error(getLogText(text, source));
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
    if (elements.length >= 3 &&
        elements[0].startsWith('LOGIC') &&
        elements[1].startsWith('C') &&
        elements[2] === elements[0]) {
        return true
    }
    return false
}
