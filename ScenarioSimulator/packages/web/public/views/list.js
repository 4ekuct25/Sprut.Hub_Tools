// Список сценариев + панель прогонов тестов.
// — Сортировка по name (ru-локаль).
// — Дерево тестов свёрнуто по умолчанию, разворачивается шевроном.
// — Для сценариев с логикой добавлена кнопка "Ручная проверка" → /manual/:id.
// — Логи стримятся живьём из bus (исправлено в core/LogCapture).
import { html, useState, useEffect, useMemo } from "../lib.js";
import { navigate } from "../router.js";
import { listUploads, saveUpload, deleteUpload, clearAll } from "../storage.js";

export function ListView() {
  const [scenarios, setScenarios] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [activeRun, setActiveRun] = useState(null);
  const [tab, setTab] = useState("logs");
  const [grep, setGrep] = useState("");
  const [sseConnected, setSseConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [statusByName, setStatusByName] = useState({});
  const [selectedTest, setSelectedTest] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [uploadsTick, setUploadsTick] = useState(0);
  const uploads = useMemo(() => listUploads(), [uploadsTick]);

  const refresh = () =>
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((builtin) => {
        const merged = [
          ...builtin,
          ...listUploads().map((u) => ({
            id: u.id,
            name: u.name,
            path: "(browser)",
            kind: "upload",
            hasLogic: (u.logic ?? []).length > 0,
            hasGlobals: (u.globals ?? []).length > 0,
            hasPreset: u.preset != null,
            testCount: (u.tests ?? []).reduce(
              (acc, t) => acc + countTests(t.source),
              0,
            ),
            files: (u.tests ?? []).map((t) => ({ file: t.file, tests: [] })),
          })),
        ];
        merged.sort((a, b) => a.name.localeCompare(b.name, "ru"));
        setScenarios(merged);
      })
      .catch(() => setScenarios([]));

  useEffect(() => {
    refresh();
  }, [uploadsTick]);

  const summary = useMemo(() => {
    let pass = 0,
      fail = 0,
      skip = 0;
    for (const e of events) {
      if (e.kind === "test:pass") pass++;
      else if (e.kind === "test:fail") fail++;
      else if (e.kind === "test:skip") skip++;
    }
    return { pass, fail, skip };
  }, [events]);

  const logs = useMemo(
    () => events.filter((e) => ["log", "test:fail"].includes(e.kind)),
    [events],
  );
  const results = useMemo(
    () => events.filter((e) => ["test:pass", "test:fail", "test:skip"].includes(e.kind)),
    [events],
  );

  const toggleScenario = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleExpand = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const runSelected = async (all = false) => {
    const body = all
      ? { grep, bail: false }
      : { scenarioIds: [...selected], grep, bail: false };
    setEvents([]);
    setStatusByName({});
    setSelectedTest(null);
    const r = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { runId } = await r.json();
    setActiveRun(runId);
  };

  // Запуск тестов одного сценария без зависимости от состояния `selected`,
  // которое обновляется асинхронно.
  const runSelectedFor = async (ids) => {
    setEvents([]);
    setStatusByName({});
    setSelectedTest(null);
    const r = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioIds: ids, grep, bail: false }),
    });
    const { runId } = await r.json();
    setActiveRun(runId);
  };

  useEffect(() => {
    if (!activeRun) return;
    const es = new EventSource(`/api/runs/${activeRun}/stream`);
    setSseConnected(true);
    const handleEvent = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setEvents((prev) => [...prev, payload]);
        const fullKey = (ev) => `${ev.scenario}::${[...ev.suite, ev.name].join(" › ")}`;
        if (payload.kind === "test:pass") setStatusByName((s) => ({ ...s, [fullKey(payload)]: "pass" }));
        else if (payload.kind === "test:fail") setStatusByName((s) => ({ ...s, [fullKey(payload)]: "fail" }));
        else if (payload.kind === "test:skip") setStatusByName((s) => ({ ...s, [fullKey(payload)]: "skip" }));
        else if (payload.kind === "test:start") setStatusByName((s) => ({ ...s, [fullKey(payload)]: "running" }));
        if (payload.kind === "run:end") {
          es.close();
          setSseConnected(false);
        }
      } catch {
        /* ignore */
      }
    };
    [
      "run:start",
      "run:end",
      "scenario:start",
      "scenario:end",
      "file:start",
      "file:end",
      "test:start",
      "test:pass",
      "test:fail",
      "test:skip",
      "log",
    ].forEach((k) => es.addEventListener(k, handleEvent));
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, [activeRun]);

  const failedTests = useMemo(() => results.filter((r) => r.kind === "test:fail"), [results]);

  return html`
    <header>
      <h1>ScenarioSimulator</h1>
      <div class="actions">
        <input
          type="text"
          placeholder="--grep filter"
          value=${grep}
          onInput=${(e) => setGrep(e.target.value)}
        />
        <button
          class="secondary"
          title="Открыть эмулятор хаба без сценария"
          onClick=${() => navigate("/manual/__blank__")}
        >
          🛠 Эмулятор
        </button>
        <button class="secondary" onClick=${() => setUploadOpen(true)}>Загрузить сценарий</button>
        <button
          class="danger"
          title="Очистить localStorage (загрузки, тесты, preset, активные сессии)"
          onClick=${() => {
            if (confirm("Удалить все загруженные сценарии, локальные тесты и preset из браузера?")) {
              clearAll();
              setUploadsTick((n) => n + 1);
            }
          }}
        >
          Очистить
        </button>
        <button class="secondary" onClick=${() => runSelected(true)}>Run all</button>
        <button onClick=${() => runSelected(false)} disabled=${selected.size === 0}>
          Run selected (${selected.size})
        </button>
        <span class=${`sse ${sseConnected ? "connected" : "disconnected"}`}>
          ${sseConnected ? "SSE ●" : "SSE ○"}
        </span>
      </div>
    </header>
    <main>
      <aside class="tree">
        <h2>Сценарии</h2>
        ${scenarios.map((s) => {
          const open = expanded.has(s.id);
          return html`
            <div class="scenario" key=${s.id}>
              <div class="scenario-header">
                <span class="chevron" onClick=${() => toggleExpand(s.id)}>${open ? "▾" : "▸"}</span>
                <input
                  type="checkbox"
                  checked=${selected.has(s.id)}
                  onClick=${(e) => {
                    e.stopPropagation();
                    toggleScenario(s.id);
                  }}
                />
                <span class="scenario-name" onClick=${() => toggleExpand(s.id)}>
                  ${s.name}
                  ${s.kind === "upload" ? html`<span class="badge upload">Загружен</span>` : null}
                </span>
                <span class="count" title="Количество тестов">${s.testCount}</span>
                <button
                  class="run-one"
                  title="Запустить тесты сценария"
                  disabled=${s.kind === "upload"}
                  onClick=${(e) => {
                    e.stopPropagation();
                    setSelected(new Set([s.id]));
                    // Сразу запустим: setSelected асинхронен, поэтому передаём явно.
                    runSelectedFor([s.id]);
                  }}
                >
                  ▶
                </button>
                <button
                  class="manual"
                  title="Ручная проверка"
                  onClick=${(e) => {
                    e.stopPropagation();
                    navigate(`/manual/${encodeURIComponent(s.id)}`);
                  }}
                >
                  🎮
                </button>
              </div>
              ${open
                ? s.files.map(
                    (f) => html`
                      <div class="file" key=${f.file}>${f.file.split("/").pop()}</div>
                      ${f.tests.map((t) => {
                        const key = `${s.name}::${[...t.suite, t.name].join(" › ")}`;
                        const status = statusByName[key] ?? "";
                        return html`
                          <div
                            class=${`test ${status}`}
                            key=${key}
                            onClick=${() =>
                              setSelectedTest({ scenario: s.name, suite: t.suite, name: t.name })}
                          >
                            <span class="marker"></span>
                            <span>${[...t.suite, t.name].join(" › ")}</span>
                          </div>
                        `;
                      })}
                    `,
                  )
                : null}
            </div>
          `;
        })}
      </aside>
      <section class="center">
        <div class="tabs">
          <button class=${tab === "logs" ? "active" : ""} onClick=${() => setTab("logs")}>Logs</button>
          <button class=${tab === "results" ? "active" : ""} onClick=${() => setTab("results")}>
            Results (${results.length})
          </button>
        </div>
        ${tab === "logs"
          ? html`<div class="panel logs">
              ${logs.length === 0 ? html`<div class="empty">No logs yet</div>` : null}
              ${logs.map((e, idx) => {
                if (e.kind === "log") {
                  return html`<div key=${idx} class=${`log-line ${e.level}`}>
                    <span class="meta">${e.scenario}</span>${e.message}
                  </div>`;
                }
                if (e.kind === "test:fail") {
                  return html`<div key=${idx} class="log-line error">
                    FAIL: ${[...e.suite, e.name].join(" › ")} — ${e.error.message}
                  </div>`;
                }
                return null;
              })}
            </div>`
          : html`<div class="panel results">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Test</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  ${results.map(
                    (r, idx) => html`
                      <tr
                        key=${idx}
                        class=${r.kind === "test:pass"
                          ? "pass"
                          : r.kind === "test:fail"
                            ? "fail"
                            : "skip"}
                      >
                        <td>
                          <span class="status"
                            >${r.kind === "test:pass"
                              ? "✓"
                              : r.kind === "test:fail"
                                ? "✗"
                                : "↓"}</span
                          >
                        </td>
                        <td>${r.scenario} › ${[...r.suite, r.name].join(" › ")}</td>
                        <td>${r.durationMs !== undefined ? r.durationMs.toFixed(0) + " ms" : ""}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>`}
        <div class="summary">
          <span class="label">Tests</span>
          <span class="pass">${summary.pass} passed</span>
          <span class="fail">${summary.fail} failed</span>
          <span class="skip">${summary.skip} skipped</span>
        </div>
      </section>
      <aside class="details">
        <h3>Детали</h3>
        ${selectedTest
          ? html`<div>
              <div><strong>${selectedTest.scenario}</strong></div>
              <div>${[...selectedTest.suite, selectedTest.name].join(" › ")}</div>
              ${failedTests.find((t) => t.name === selectedTest.name)
                ? html`<div class="stack">
                    ${failedTests.find((t) => t.name === selectedTest.name)?.error?.message}
                  </div>`
                : html`<div class="empty">— нет провалов —</div>`}
            </div>`
          : failedTests.length > 0
            ? html`<div>
                <strong>Падения:</strong>
                ${failedTests.map(
                  (t, idx) => html`
                    <div key=${idx} class="captured-log">
                      <strong>${[...t.suite, t.name].join(" › ")}</strong>
                      <div class="stack">${t.error.message}</div>
                      ${t.logs.length > 0
                        ? html`<div class="captured">
                            ${t.logs.map(
                              (l, i) => html`<div key=${i} class=${`captured-log ${l.level}`}>
                                <span class="meta">[${l.level}]</span>${l.message}
                              </div>`,
                            )}
                          </div>`
                        : null}
                    </div>
                  `,
                )}
              </div>`
            : html`<div class="empty">Кликни на тест в дереве слева для просмотра деталей.</div>`}
      </aside>
    </main>
    ${uploadOpen
      ? html`<${UploadDialog}
          onClose=${() => setUploadOpen(false)}
          onUploaded=${() => setUploadsTick((n) => n + 1)}
        />`
      : null}
  `;
}

function countTests(source) {
  const matches = String(source ?? "").match(/\bit\s*\(/g);
  return matches ? matches.length : 0;
}

function UploadDialog({ onClose, onUploaded }) {
  const [name, setName] = useState("");
  const [logicFiles, setLogicFiles] = useState([]);
  const [globalFiles, setGlobalFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const readFiles = async (fileList) => {
    const out = [];
    for (const f of fileList) {
      out.push({ file: f.name, source: await f.text() });
    }
    return out;
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) {
      setError("Укажи название сценария");
      return;
    }
    if (logicFiles.length === 0 && globalFiles.length === 0) {
      setError("Выбери хотя бы один файл");
      return;
    }
    setBusy(true);
    try {
      const id = `upload:${name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
      saveUpload({
        id,
        name: name.trim(),
        kind: "upload",
        createdAt: Date.now(),
        logic: logicFiles,
        globals: globalFiles,
        tests: [],
        preset: null,
      });
      onUploaded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div class="modal-backdrop" onClick=${onClose}>
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <h2>Загрузка сценария</h2>
        <label
          >Название
          <input
            type="text"
            value=${name}
            placeholder="MyScenario"
            onInput=${(e) => setName(e.target.value)}
          />
        </label>
        <label
          >Логические файлы (.js)
          <input
            type="file"
            multiple
            accept=".js"
            onChange=${async (e) => setLogicFiles(await readFiles(e.target.files))}
          />
          <span class="hint">${logicFiles.length} файл(ов)</span>
        </label>
        <label
          >Глобальные файлы (.js)
          <input
            type="file"
            multiple
            accept=".js"
            onChange=${async (e) => setGlobalFiles(await readFiles(e.target.files))}
          />
          <span class="hint">${globalFiles.length} файл(ов)</span>
        </label>
        ${error ? html`<div class="error">${error}</div>` : null}
        <div class="actions">
          <button class="secondary" onClick=${onClose} disabled=${busy}>Отмена</button>
          <button onClick=${submit} disabled=${busy}>Загрузить</button>
        </div>
      </div>
    </div>
  `;
}
