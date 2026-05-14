// Браузерное хранилище для пользовательских данных:
// — загруженные сценарии (logic/globals/tests/preset),
// — текущие сессии ручной проверки (sessionId + scenarioId),
// — последний открытый preset/опции/переменные на странице ручной проверки.
//
// Всё живёт в localStorage. Кнопка "Очистить" удаляет ключи namespace `simulator.`.

const PREFIX = "simulator.";

export function getRaw(key) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? null : v;
  } catch {
    return null;
  }
}

export function getJSON(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn("storage.setJSON failed", e);
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function clearAll() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// ---- Пользовательские сценарии ----
// uploads: { [id]: { id, name, kind:"upload", createdAt, logic: [{file,source}], globals: [{file,source}],
//   tests: [{file,source}], preset: ScenarioPreset|null } }
export function listUploads() {
  const u = getJSON("uploads", {});
  return Object.values(u).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function getUpload(id) {
  const u = getJSON("uploads", {});
  return u[id] ?? null;
}

export function saveUpload(upload) {
  const u = getJSON("uploads", {});
  u[upload.id] = upload;
  setJSON("uploads", u);
  return upload;
}

export function deleteUpload(id) {
  const u = getJSON("uploads", {});
  delete u[id];
  setJSON("uploads", u);
}

// ---- Хранение тестов и preset, привязанных к сценарию (включая встроенные) ----
// Ключ: tests.<scenarioId>  → [{name, source}]
//       preset.<scenarioId> → ScenarioPreset
export function getScenarioTests(scenarioId) {
  return getJSON(`tests.${scenarioId}`, []);
}

export function saveScenarioTests(scenarioId, tests) {
  setJSON(`tests.${scenarioId}`, tests);
}

export function getScenarioPreset(scenarioId) {
  return getJSON(`preset.${scenarioId}`, null);
}

export function saveScenarioPreset(scenarioId, preset) {
  if (preset == null) remove(`preset.${scenarioId}`);
  else setJSON(`preset.${scenarioId}`, preset);
}

// ---- Активная manual-сессия для сценария ----
export function getActiveSession(scenarioId) {
  return getJSON(`session.${scenarioId}`, null);
}

export function setActiveSession(scenarioId, sessionId) {
  if (sessionId == null) remove(`session.${scenarioId}`);
  else setJSON(`session.${scenarioId}`, sessionId);
}

/** Удалить все локальные данные по конкретному сценарию (preset/tests/session). */
export function clearScenarioData(scenarioId) {
  remove(`preset.${scenarioId}`);
  remove(`tests.${scenarioId}`);
  remove(`session.${scenarioId}`);
}
