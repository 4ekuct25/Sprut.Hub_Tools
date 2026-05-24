/** Подавление ложных кнопка/импульс сразу после авто-включения по датчику. */
const DEBOUNCE_MANUAL_AFTER_SENSOR_MS = 5000;

/** Сколько слотов датчиков движения / присутствия / касания создаётся в опциях. */
const MAX_MOTION_SLOTS = 3;
/** Сколько слотов ручного ввода (выключатель, кнопка, импульсы) создаётся в опциях. */
const MAX_MANUAL_CONTROL_SLOTS = 3;

const scenarioName = {
    ru: "💡 Автоматизация света по движению",
    en: "💡 Motion-based light automation"
};

const scenarioDescription = {
    ru: "Автоматически включает свет при срабатывании настроенных датчиков движения.\n\n" +
        "Поддерживает автоматический и ручной режимы работы.\n",
    en: "Automatically turns on the light when motion sensors are triggered.\n\n" +
        "Supports automatic and manual modes.\n"
};

info = {
    name: scenarioName.ru,
    description: scenarioDescription.ru,
    version: "1.0",
    author: "@BOOMikru",
    onStart: true,

    sourceServices: [HS.Lightbulb, HS.Switch],
    sourceCharacteristics: [HC.On],

    options: createOptions(),

    variables: {
        cachedLightService: undefined,
        externalSubscribed: false,
        manualHold: false,
        offTimerId: undefined,
        manualHoldSafetyTimerId: undefined,
        lastSensorAutoOnAt: undefined
    }
};

function trigger(source, value, variables, options, context) {
    try {
        var svc = source.getService();
        variables.cachedLightService = svc;

        ensureExternalSubscription(variables, options);

        logInfo(
            "trigger: On=" + value + ", manualHold=" + variables.manualHold + ", occupancy=" + computeOccupancyActive(options) + ", context=" + context,
            source,
            options.debug
        );

        if (isSelfChanged(context)) {
            return;
        }

        if (value === true) {
            logInfo("trigger: привязанный On=да — проверка таймера выкл при отсутствии активности датчиков", source, options.debug);
            if (options.noAutoOffWhenManualOn === true && !variables.manualHold) {
                variables.manualHold = true;
                logInfo("trigger: внешнее включение лампы — активируем ручное удержание (noAutoOffWhenManualOn=true)", source, options.debug);
            }
            syncOffTimerWhenLightOnWithoutOccupancy(variables, options);
        } else {
            logInfo("trigger: привязанный On=нет — сброс manualHold и отложенного выключения", source, options.debug);
            variables.manualHold = false;
            variables.lastSensorAutoOnAt = undefined;
            clearOffTimer(variables, options);
            clearManualHoldSafetyTimer(variables, options);
        }
    } catch (e) {
        logError("Ошибка: " + e.message, source);
    }
}

function ensureExternalSubscription(variables, options) {
    if (variables.externalSubscribed) {
        return;
    }
    variables.externalSubscribed = true;

    logInfo("Подписка: создан subscribeWithCondition на датчики, выключатели, люксы, импульсы", null, options.debug);

    Hub.subscribeWithCondition(
        "",
        "",
        [
            HS.MotionSensor,
            HS.OccupancySensor,
            HS.ContactSensor,
            HS.LightSensor,
            HS.Switch,
            HS.StatelessProgrammableSwitch,
            HS.C_PulseMeter
        ],
        [
            HC.MotionDetected,
            HC.OccupancyDetected,
            HC.ContactSensorState,
            HC.CurrentAmbientLightLevel,
            HC.On,
            HC.ProgrammableSwitchEvent,
            HC.C_PulseCount
        ],
        function (extSource, extValue) {
            try {
                handleExternalCharacteristicEvent(extSource, extValue, variables, options);
            } catch (err) {
                logError("Внешняя подписка: " + err.message, extSource);
            }
        }
    );
}

function handleExternalCharacteristicEvent(src, val, variables, options) {
    var svc = src.getService();
    if (!svc) {
        return;
    }
    var uuid = svc.getUUID();
    var st = svc.getType();
    var ct = src.getType();

    if (isLuxSensorOption(options, uuid) && ct === HC.CurrentAmbientLightLevel) {
        logInfo("Ветка: датчик освещённости, occupancy=" + computeOccupancyActive(options), src, options.debug);
        if (computeOccupancyActive(options)) {
            tryAutoTurnOn(variables, options, src);
        }
        return;
    }

    if (isGateSwitchOption(options, uuid) && st === HS.Switch && ct === HC.On) {
        logInfo("Ветка: разрешитель автоматики On=" + val + ", occupancy=" + computeOccupancyActive(options), src, options.debug);
        if (computeOccupancyActive(options)) {
            tryAutoTurnOn(variables, options, src);
        }
        return;
    }

    if (isManualControlOption(options, uuid)) {
        if (st === HS.Switch && ct === HC.On) {
            if (val === true) {
                logInfo("Ручной выключатель On=да — вкл привязанного сервиса", src, options.debug);
                manualTurnOn(variables, options, src);
            } else if (isAnyManualSwitchOn(options, uuid)) {
                logInfo("Ручной выключатель On=нет — другой Switch в On, свет остаётся включён", src, options.debug);
            } else {
                logInfo("Ручной выключатель On=нет — выкл привязанного сервиса, сброс hold", src, options.debug);
                variables.manualHold = false;
                variables.lastSensorAutoOnAt = undefined;
                clearOffTimer(variables, options, src);
                clearManualHoldSafetyTimer(variables, options, src);
                setLightOn(variables.cachedLightService, false, options, src);
            }
            return;
        }
        if (st === HS.StatelessProgrammableSwitch && ct === HC.ProgrammableSwitchEvent && val === 0) {
            manualToggleFromButtonOrPulse(variables, options, src);
            return;
        }
        if (st === HS.C_PulseMeter && ct === HC.C_PulseCount && val > 0) {
            manualToggleFromButtonOrPulse(variables, options, src);
            return;
        }
    }

    if (isMotionSlotOption(options, uuid)) {
        logInfo("Датчик движения/присутствия/касания активен: " + val, src, options.debug);
        applyOccupancyState(variables, options, src);
        return;
    }
}

function shouldSuppressManualButtonOrPulseAfterSensorAuto(variables, options) {
    if (options.ignoreManualWithin5sAfterSensorOn === false) {
        return false;
    }
    var t = variables.lastSensorAutoOnAt;
    if (t === undefined || t === null) {
        return false;
    }
    return Date.now() - t < DEBOUNCE_MANUAL_AFTER_SENSOR_MS;
}

function manualToggleFromButtonOrPulse(variables, options, logSource) {
    if (shouldSuppressManualButtonOrPulseAfterSensorAuto(variables, options)) {
        logInfo("Кнопка/импульс игнор (окно " + DEBOUNCE_MANUAL_AFTER_SENSOR_MS + " мс после авто-вкл)", logSource, options.debug);
        return;
    }
    var lit = isLightCurrentlyOn(variables);
    if (!lit) {
        logInfo("Кнопка/импульс → вкл", logSource, options.debug);
        manualTurnOn(variables, options, logSource);
        return;
    }
    logInfo("Кнопка/импульс → выкл", logSource, options.debug);
    manualTurnOffFromButtonOrPulse(variables, options, logSource);
}

function manualTurnOffFromButtonOrPulse(variables, options, logSource) {
    clearOffTimer(variables, options, logSource);
    clearManualHoldSafetyTimer(variables, options, logSource);
    variables.lastSensorAutoOnAt = undefined;
    variables.manualHold = false;
    setLightOn(variables.cachedLightService, false, options, logSource);
}

function manualTurnOn(variables, options, logSource) {
    clearOffTimer(variables, options, logSource);
    clearManualHoldSafetyTimer(variables, options, logSource);
    variables.lastSensorAutoOnAt = undefined;
    var switchHold = isAnyManualSwitchOn(options);
    if (switchHold) {
        variables.manualHold = true;
        logInfo("manualHold := true (manualControl-выключатель в On — свет следует за выключателем)", logSource, options.debug);
    } else if (options.noAutoOffWhenManualOn === true) {
        variables.manualHold = true;
        logInfo("manualHold := true (опция не гасить после ручного)", logSource, options.debug);
    } else {
        variables.manualHold = false;
    }
    setLightOn(variables.cachedLightService, true, options, logSource);
    if (switchHold) {
        return;
    }
    if (!computeOccupancyActive(options) && variables.manualHold) {
        scheduleManualHoldSafetyTimer(variables, options, logSource);
    }
    if (!variables.manualHold && !computeOccupancyActive(options)) {
        scheduleOffTimer(variables, options, logSource);
    }
}

function applyOccupancyState(variables, options, logSource) {
    var occ = computeOccupancyActive(options);
    if (occ) {
        logInfo("Занятость: да — снятие таймера выкл, попытка авто-вкл", logSource, options.debug);
        clearOffTimer(variables, options, logSource);
        clearManualHoldSafetyTimer(variables, options, logSource);
        tryAutoTurnOn(variables, options, logSource);
        return;
    }
    logInfo("Занятость: нет — планирование выкл если привязанный On и нет manualHold", logSource, options.debug);
    if (!isLightCurrentlyOn(variables)) {
        return;
    }
    if (!variables.manualHold) {
        scheduleOffTimer(variables, options, logSource);
        return;
    }
    scheduleManualHoldSafetyTimer(variables, options, logSource);
}

function tryAutoTurnOn(variables, options, logSource) {
    if (!isAutoAutomationAllowed(options)) {
        logInfo("Авто-вкл отклонено: автоматика запрещена текущим состоянием выключателя «Разрешение автоматики»", logSource, options.debug);
        return;
    }
    if (!isLuxAllowsAutoOn(options)) {
        logInfo("Авто-вкл отклонено: люксы (текущие " + readLux(options) + ", порог max " + options.maxAmbientLux + ")", logSource, options.debug);
        return;
    }
    if (!variables.cachedLightService) {
        logInfo("Авто-вкл отклонено: нет кэша привязанного сервиса (ждём trigger)", logSource, options.debug);
        return;
    }
    if (isLightCurrentlyOn(variables)) {
        logInfo("Авто-вкл пропущен: привязанный сервис уже включён", logSource, options.debug);
        return;
    }
    variables.lastSensorAutoOnAt = Date.now();
    logInfo("Авто-вкл: включение привязанного сервиса по датчику", logSource, options.debug);
    setLightOn(variables.cachedLightService, true, options, logSource);
}

function syncOffTimerWhenLightOnWithoutOccupancy(variables, options) {
    if (variables.manualHold && !computeOccupancyActive(options)) {
        logInfo("Таймер при вкл привязанного On: manualHold, запуск защитного таймера", null, options.debug);
        scheduleManualHoldSafetyTimer(variables, options, null);
        return;
    }
    if (variables.manualHold) {
        logInfo("Таймер при вкл привязанного On: пропуск (manualHold, датчики активны)", null, options.debug);
        return;
    }
    if (computeOccupancyActive(options)) {
        logInfo("Таймер при вкл привязанного On: пропуск (датчики активны)", null, options.debug);
        return;
    }
    logInfo("Таймер при вкл привязанного On: запуск отложенного выкл", null, options.debug);
    scheduleOffTimer(variables, options, null);
}

function isAutoAutomationAllowed(options) {
    var g = options.gateAutoSwitch;
    if (!g || g === "") {
        return true;
    }
    var svc = getServiceFromListOption(options, "gateAutoSwitch");
    if (!svc) {
        return true;
    }
    var invert = options.gateAutoSwitchInvert === true;
    var gateIsOn = svc.getCharacteristic(HC.On).getValue() === true;
    return invert ? !gateIsOn : gateIsOn;
}

function computeOccupancyActive(options) {
    var anyConfigured = false;
    for (var i = 1; i <= MAX_MOTION_SLOTS; i++) {
        var key = "motion" + i;
        if (!options[key] || options[key] === "") {
            continue;
        }
        anyConfigured = true;
        var svc = getServiceFromListOption(options, key);
        if (!svc) {
            continue;
        }
        var t = svc.getType();
        if (t === HS.MotionSensor) {
            if (svc.getCharacteristic(HC.MotionDetected).getValue() === true) {
                return true;
            }
        } else if (t === HS.OccupancySensor) {
            if (svc.getCharacteristic(HC.OccupancyDetected).getValue() === 1) {
                return true;
            }
        } else if (t === HS.ContactSensor) {
            if (svc.getCharacteristic(HC.ContactSensorState).getValue() === 1) {
                return true;
            }
        }
    }
    if (!anyConfigured) {
        return false;
    }
    return false;
}

function readLux(options) {
    var svc = getServiceFromListOption(options, "luxSensor");
    if (!svc) {
        return null;
    }
    return svc.getCharacteristic(HC.CurrentAmbientLightLevel).getValue();
}

function isLuxAllowsAutoOn(options) {
    var lux = readLux(options);
    if (lux === null) {
        return true;
    }
    return lux <= options.maxAmbientLux;
}

function getOffDelaySeconds(options) {
    return options.offDelaySeconds;
}

function scheduleOffTimer(variables, options, logSource) {
    clearOffTimer(variables, options, logSource);
    if (isAnyManualSwitchOn(options)) {
        logInfo("Таймер выключения: пропуск (manualControl-выключатель в On удерживает свет)", logSource, options.debug);
        return;
    }
    var sec = getOffDelaySeconds(options);
    if (sec === 0) {
        logInfo("Таймер выключения: 0 с, выполняем проверку и выключение сразу", logSource, options.debug);
        if (variables.manualHold) {
            logInfo("Таймер выключения (0 с): отмена (manualHold)", logSource, options.debug);
            return;
        }
        if (computeOccupancyActive(options)) {
            logInfo("Таймер выключения (0 с): отмена (появилась активность датчиков)", logSource, options.debug);
            return;
        }
        logInfo("Таймер выключения (0 с): выключение привязанного сервиса", logSource, options.debug);
        setLightOn(variables.cachedLightService, false, options, logSource);
        return;
    }
    logInfo("Таймер выключения: через " + sec + " с", logSource, options.debug);
    var self = variables;
    var opts = options;
    self.offTimerId = setTimeout(function () {
        self.offTimerId = undefined;
        logInfo("Таймер выключения: сработал", null, opts.debug);
        if (isAnyManualSwitchOn(opts)) {
            logInfo("Таймер выключения: отмена (manualControl-выключатель в On)", null, opts.debug);
            return;
        }
        if (self.manualHold) {
            logInfo("Таймер выключения: отмена (manualHold)", null, opts.debug);
            return;
        }
        if (computeOccupancyActive(opts)) {
            logInfo("Таймер выключения: отмена (появилась активность датчиков)", null, opts.debug);
            return;
        }
        logInfo("Таймер выключения: выключение привязанного сервиса", null, opts.debug);
        setLightOn(self.cachedLightService, false, opts, null);
    }, sec * 1000);
}

function clearOffTimer(variables, options, logSource) {
    if (variables.offTimerId) {
        logInfo("Таймер выключения: сброшен", logSource, options.debug);
        clearTimeout(variables.offTimerId);
        variables.offTimerId = undefined;
    }
}

function getManualHoldSafetyOffDelaySeconds(options) {
    return options.manualHoldSafetyOffDelayMinutes * 60;
}

function scheduleManualHoldSafetyTimer(variables, options, logSource) {
    clearManualHoldSafetyTimer(variables, options, logSource);
    if (isAnyManualSwitchOn(options)) {
        logInfo("Защитный таймер manualHold: пропуск (manualControl-выключатель в On удерживает свет)", logSource, options.debug);
        return;
    }
    var sec = getManualHoldSafetyOffDelaySeconds(options);
    if (sec <= 0) {
        logInfo("Защитный таймер manualHold: выключен (<= 0 с)", logSource, options.debug);
        return;
    }
    logInfo("Защитный таймер manualHold: через " + sec + " с", logSource, options.debug);
    var self = variables;
    var opts = options;
    self.manualHoldSafetyTimerId = setTimeout(function () {
        self.manualHoldSafetyTimerId = undefined;
        logInfo("Защитный таймер manualHold: сработал", null, opts.debug);
        if (isAnyManualSwitchOn(opts)) {
            logInfo("Защитный таймер manualHold: отмена (manualControl-выключатель в On)", null, opts.debug);
            return;
        }
        if (!self.manualHold) {
            logInfo("Защитный таймер manualHold: отмена (manualHold снят)", null, opts.debug);
            return;
        }
        if (computeOccupancyActive(opts)) {
            logInfo("Защитный таймер manualHold: отмена (появилась активность датчиков)", null, opts.debug);
            return;
        }
        self.manualHold = false;
        self.lastSensorAutoOnAt = undefined;
        logInfo("Защитный таймер manualHold: выключение привязанного сервиса", null, opts.debug);
        setLightOn(self.cachedLightService, false, opts, null);
    }, sec * 1000);
}

function clearManualHoldSafetyTimer(variables, options, logSource) {
    if (variables.manualHoldSafetyTimerId) {
        logInfo("Защитный таймер manualHold: сброшен", logSource, options.debug);
        clearTimeout(variables.manualHoldSafetyTimerId);
        variables.manualHoldSafetyTimerId = undefined;
    }
}

function setLightOn(lightSvc, on, options, logSource) {
    if (!lightSvc) {
        logInfo("setLightOn: нет привязанного сервиса", logSource, options.debug);
        return;
    }
    var ch = lightSvc.getCharacteristic(HC.On);
    ch.setValue(on === true);
    logInfo("Лампа On := " + (on === true), ch, options.debug);
}

function logInfo(text, source, show) {
    if (show) {
        console.info(getLogText(text, source));
    }
}

function logError(text, source) {
    console.error(getLogText(text, source));
}

function getLogText(text, source) {
    if (source) {
        try {
            var service = source.getService();
            return text + " | " + DEBUG_TITLE + getDeviceName(service);
        } catch (e) {
            return text + " | " + DEBUG_TITLE;
        }
    }
    return text + " | " + DEBUG_TITLE;
}

function isLightCurrentlyOn(variables) {
    var light = variables.cachedLightService;
    if (!light) {
        return false;
    }
    return light.getCharacteristic(HC.On).getValue() === true;
}

function getServiceFromListOption(options, optionKey) {
    if (!options[optionKey] || options[optionKey] === "") {
        return undefined;
    }
    var cdata = options[optionKey].split(".");
    if (cdata.length < 2) {
        return undefined;
    }
    var accessory = Hub.getAccessory(cdata[0]);
    if (!accessory) {
        return undefined;
    }
    return accessory.getService(cdata[1]);
}

function isMotionSlotOption(options, serviceUuid) {
    for (var i = 1; i <= MAX_MOTION_SLOTS; i++) {
        var v = options["motion" + i];
        if (v && v !== "" && v === serviceUuid) {
            return true;
        }
    }
    return false;
}

function isManualControlOption(options, serviceUuid) {
    for (var i = 1; i <= MAX_MANUAL_CONTROL_SLOTS; i++) {
        var v = options["manualControl" + i];
        if (v && v !== "" && v === serviceUuid) {
            return true;
        }
    }
    return false;
}

function isAnyManualSwitchOn(options, excludeUuid) {
    for (var i = 1; i <= MAX_MANUAL_CONTROL_SLOTS; i++) {
        var key = "manualControl" + i;
        var v = options[key];
        if (!v || v === "") {
            continue;
        }
        if (excludeUuid && v === excludeUuid) {
            continue;
        }
        var svc = getServiceFromListOption(options, key);
        if (!svc) {
            continue;
        }
        if (svc.getType() !== HS.Switch) {
            continue;
        }
        if (svc.getCharacteristic(HC.On).getValue() === true) {
            return true;
        }
    }
    return false;
}

function isGateSwitchOption(options, serviceUuid) {
    var g = options.gateAutoSwitch;
    return !!(g && g !== "" && g === serviceUuid);
}

function isLuxSensorOption(options, serviceUuid) {
    var l = options.luxSensor;
    return !!(l && l !== "" && l === serviceUuid);
}

function isSelfChanged(context) {
    if (!context) {
        return false;
    }
    var elements = context.toString().split(CONTEXT_CONSTANTS.DELIMITER);
    return elements.length >= CONTEXT_CONSTANTS.MIN_ELEMENTS &&
        elements[0].startsWith(CONTEXT_CONSTANTS.LOGIC_PREFIX) &&
        elements[1].startsWith(CONTEXT_CONSTANTS.CHARACTERISTIC_PREFIX) &&
        elements[2] === elements[0];
}

function mergeListsWithHeader() {
    var seen = {};
    var items = [];
    for (var a = 0; a < arguments.length; a++) {
        var list = arguments[a];
        for (var i = 1; i < list.length; i++) {
            var row = list[i];
            if (!row.value || row.value === "") {
                continue;
            }
            if (seen[row.value]) {
                continue;
            }
            seen[row.value] = true;
            items.push(row);
        }
    }
    items.sort(function (x, y) {
        return x.name.ru.localeCompare(y.name.ru);
    });
    var outAssemble = [{name: {ru: "Не выбрано", en: "Not selected"}, value: ""}];
    for (var j = 0; j < items.length; j++) {
        outAssemble.push(items[j]);
    }
    return outAssemble;
}

function getDeviceName(service) {
    if (!service) {
        return "";
    }
    var acc = service.getAccessory();
    var room = acc.getRoom().getName();
    var accName = acc.getName();
    var sName = service.getName();
    return room + " -> " + (accName === sName ? accName : accName + " " + sName) + " (" + service.getUUID() + ")";
}

function getServicesByServiceAndCharacteristicType(serviceTypes, characteristicTypes) {
    var unsortedServicesList = [];
    Hub.getAccessories().forEach(function (a) {
        a.getServices()
            .filter(function (s) {
                return serviceTypes.indexOf(s.getType()) >= 0;
            })
            .filter(function (s) {
                return characteristicTypes.some(function (c) {
                    return s.getCharacteristic(c);
                });
            })
            .forEach(function (s) {
                var name = getDeviceName(s);
                unsortedServicesList.push({
                    name: {ru: name, en: name},
                    value: s.getUUID()
                });
            });
    });
    var sortedServicesList = [{name: {ru: "Не выбрано", en: "Not selected"}, value: ""}];
    unsortedServicesList.sort(function (a, b) {
        return a.name.ru.localeCompare(b.name.ru);
    }).forEach(function (s) {
        sortedServicesList.push(s);
    });
    return sortedServicesList;
}

function createOptions() {
    const motionPickerList = mergeListsWithHeader(
        getServicesByServiceAndCharacteristicType([HS.MotionSensor], [HC.MotionDetected]),
        getServicesByServiceAndCharacteristicType([HS.OccupancySensor], [HC.OccupancyDetected]),
        getServicesByServiceAndCharacteristicType([HS.ContactSensor], [HC.ContactSensorState])
    );
    const manualPickerList = mergeListsWithHeader(
        getServicesByServiceAndCharacteristicType([HS.Switch], [HC.On]),
        getServicesByServiceAndCharacteristicType([HS.StatelessProgrammableSwitch], [HC.ProgrammableSwitchEvent]),
        getServicesByServiceAndCharacteristicType([HS.C_PulseMeter], [HC.C_PulseCount])
    );
    const gateList = getServicesByServiceAndCharacteristicType([HS.Switch], [HC.On]);
    const luxList = getServicesByServiceAndCharacteristicType([HS.LightSensor], [HC.CurrentAmbientLightLevel]);

    const options = {};

    options.desc = {
        name: {en: "  DESCRIPTION", ru: "  ОПИСАНИЕ"},
        desc: scenarioDescription,
        type: "String",
        value: "",
        formType: "status"
    };

    options.groupSensors = {
        name: {ru: "  ДАТЧИКИ АКТИВНОСТИ", en: "  ACTIVITY SENSORS"},
        type: "String",
        value: "",
        formType: "status"
    };

    for (var mi = 1; mi <= MAX_MOTION_SLOTS; mi++) {
        var motionOpt = {
            name: {
                ru: "Датчик движения или присутствия " + mi,
                en: "Motion or occupancy sensor " + mi
            },
            type: "String",
            value: "",
            formType: "list",
            values: motionPickerList
        };
        if (mi === 1) {
            motionOpt.desc = {
                ru: "Выберите один датчик: движение, присутствие или касание. Для касания активным считается состояние «Открыто».",
                en: "Select one sensor: motion, occupancy, or contact. For contact, the active state is \"Open\"."
            };
        }
        options["motion" + mi] = motionOpt;
    }

    options.groupManualControl = {
        name: {ru: "  РУЧНЫЕ ВХОДЫ", en: "  MANUAL INPUTS"},
        type: "String",
        value: "",
        formType: "status"
    };

    for (var hi = 1; hi <= MAX_MANUAL_CONTROL_SLOTS; hi++) {
        var manualOpt = {
            name: {
                ru: "Выключатель " + hi,
                en: "Switch " + hi
            },
            type: "String",
            value: "",
            formType: "list",
            values: manualPickerList
        };
        if (hi === 1) {
            manualOpt.desc = {
                ru: "Устройство для ручного включения света. Выключатель: лампа повторяет его состояние; пока выключатель в On, авто-выключение по таймауту и защитный таймер не действуют — свет следует за выключателем. Кнопка и импульсы переключают привязанный свет.\nВнимание: не указывайте тут выключатель, на который активируется логика!",
                en: "Device for manual light on. Switch: the bound lamp follows its state; while the switch is On, auto-off and safety timer are disabled — the light follows the switch. Button and pulse toggle the bound output.\nAttention: do not specify the switch that activates the logic here!"
            };
        }
        options["manualControl" + hi] = manualOpt;
    }

    options.groupLight = {
        name: {ru: "  ОСВЕЩЁННОСТЬ", en: "  LIGHT SENSOR"},
        type: "String",
        value: "",
        formType: "status"
    };

    options.luxSensor = {
        name: {ru: "Датчик освещённости", en: "Light sensor"},
        desc: {
            ru: "Необязательно. Если выбран — при освещённости выше порога автоматическое включение по датчикам не выполняется. Ручное включение не ограничивается.",
            en: "Optional. If set, auto-on by sensors is skipped when ambient light is above the threshold. Manual on is not blocked."
        },
        type: "String",
        value: "",
        formType: "list",
        values: luxList
    };

    options.maxAmbientLux = {
        name: {ru: "Порог освещённости (люкс)", en: "Ambient light threshold (lux)"},
        desc: {
            ru: "При значении датчика освещённости выше этого числа свет не включается автоматически. Если датчик не выбран — опция не используется.",
            en: "If ambient light is above this value, auto-on is blocked. Unused if no light sensor is set."
        },
        type: "Integer",
        value: 50,
        minValue: 0,
        maxValue: 100000,
        step: 1
    };

    options.groupAutomationLimits = {
        name: {ru: "  ОГРАНИЧЕНИЯ АВТОМАТИКИ", en: "  AUTOMATION LIMITS"},
        type: "String",
        value: "",
        formType: "status"
    };

    options.gateAutoSwitch = {
        name: {ru: "Разрешение автоматики", en: "Allow automation"},
        desc: {
            ru: "Необязательно. Пока этот выключатель включён, разрешено автоматическое включение по датчикам, иначе только ручное включение. Пример: выключатель «День/Ночь», где «Ночь» = включён = ночная подсветка по движению. Если поле пустое — ограничения нет.",
            en: "Optional. While this switch is ON, auto-on by sensors is allowed; while OFF, only manual on. Example: Day/Night where Night=ON enables motion light. Empty = no gate."
        },
        type: "String",
        value: "",
        formType: "list",
        values: gateList
    };

    options.gateAutoSwitchInvert = {
        name: {ru: "Инвертировать выключатель «Разрешение автоматики»", en: "Invert the \"Allow automation\" switch"},
        desc: {
            ru: "Если включено, логика выключателя «Разрешение автоматики» инвертируется: пока он отключен, разрешено автоматическое включение по датчикам, иначе только ручное включение.",
            en: "If enabled, the logic of the \"Allow automation\" switch is inverted: while the switch is OFF, auto-on by sensors is allowed; otherwise only manual turn-on is allowed."
        },
        type: "Boolean",
        value: false
    };

    options.groupManualHold = {
        name: {ru: "  РУЧНОЕ УДЕРЖАНИЕ", en: "  MANUAL HOLD"},
        type: "String",
        value: "",
        formType: "status"
    };

    options.noAutoOffWhenManualOn = {
        name: {
            ru: "Не отключать свет автоматически после ручного включения",
            en: "Do not auto-turn off after manual on"
        },
        desc: {
            ru: "Если включено, то при включении света кнопкой/импульсом, а также при внешнем включении лампы (физический выключатель, привязанный к лампе, сцена, голосовая команда) свет не отключается по обычному таймауту — действует только защитный таймер «Задержка выключения после ручного включения».",
            en: "If enabled, when turning the light on with a button/pulse, or when the bound lamp is turned on externally (a physical switch directly wired to the lamp, scene, voice command), the light is not turned off by the regular timeout — only the safety timer «Safety off delay after manual turn-on» is used."
        },
        type: "Boolean",
        value: false
    };

    options.ignoreManualWithin5sAfterSensorOn = {
        name: {
            ru: "Игнорировать кнопку/импульс 5 секунд после включения по датчику",
            en: "Ignore button/pulse for 5s after sensor auto-on"
        },
        desc: {
            ru: "Если включено, то попытка включить лампу кнопкой/импульсом в течение 5 секунд после авто-включения по датчику игнорируется. Служит в качестве защиты от ложного отключения сразу после авто-включения по датчику.",
            en: "If enabled, an attempt to turn the lamp on with a button/pulse within 5 seconds after sensor auto-on is ignored. This protects against false triggering immediately after sensor auto-on."
        },
        type: "Boolean",
        value: true
    };

    options.groupTimers = {
        name: {ru: "  ТАЙМЕРЫ ВЫКЛЮЧЕНИЯ", en: "  OFF TIMERS"},
        type: "String",
        value: "",
        formType: "status"
    };

    options.offDelaySeconds = {
        name: {ru: "Задержка выключения (с)", en: "Off delay (sec)"},
        desc: {
            ru: "Секунды до выключения после того, как все датчики перестали видеть активность; также после включения привязанного устройства, если датчики ничего не видят. Рекомендуется ставить не менее 30 секунд — этого достаточно, чтобы человек был обнаружен повторно после короткой паузы, и снижает ложные выключения.",
            en: "Seconds until off after all sensors are inactive; also after on of the bound device while sensors show no activity. Recommended at least 30 seconds — enough for a person to be detected again after a short pause and reduces false turn-offs."
        },
        type: "Integer",
        value: 30,
        minValue: 0,
        maxValue: 86400,
        step: 1
    };

    options.manualHoldSafetyOffDelayMinutes = {
        name: {
            ru: "Задержка выключения после ручного включения (мин)",
            en: "Safety off delay after manual turn-on (min)"
        },
        desc: {
            ru: "Защита от постоянно включённого света. Когда включена опция «Не отключать свет автоматически после ручного включения», а движения долго нет, свет всё равно выключается по этому таймеру. Значение 0 отключает защитный таймер. (По умолчанию 240 минут = 4 часа)",
            en: "Prevents permanently ON light. When «Do not auto-turn off after manual on» is enabled and there is no motion for long, light is still turned off by this timer. Set 0 to disable. (Default 240 minutes = 4 hours)"
        },
        type: "Integer",
        value: 240,
        minValue: 0,
        maxValue: 10080,
        step: 1
    };

    options.groupOther = {
        name: {ru: "  ПРОЧЕЕ", en: "  OTHER"},
        type: "String",
        value: "",
        formType: "status"
    };

    options.debug = {
        name: {
            ru: "Режим отладки",
            en: "Debug mode"
        },
        desc: {
            ru: "Включить вывод подробных информационных сообщений о событиях и действиях сценария в лог.",
            en: "Enable detailed informational messages about scenario events and actions in the log."
        },
        type: "Boolean",
        value: false
    };

    return options;
}

const DEBUG_TITLE = "Автоматизация света по движению: ";

const CONTEXT_CONSTANTS = {
    DELIMITER: " <- ",
    LOGIC_PREFIX: "LOGIC",
    CHARACTERISTIC_PREFIX: "C",
    MIN_ELEMENTS: 3
};
