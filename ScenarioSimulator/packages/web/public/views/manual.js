// Ручная проверка сценария — отдельная страница (URL #/manual/<id>).
// Слева 70% — эмулятор хаба (комнаты, тайлы сервисов с характеристиками).
// Снизу — стрим логов из VM-сессии.
// Справа 30% — настройки времени, опции, переменные сценария, действия записи.
// Сверху — переключатели на редактор тестов и просмотр исходников.
//
// Состояние сессии живёт на сервере (ManualSession). Клиент держит sessionId
// в localStorage, чтобы после F5 не терять прогресс. Если сессия истекла —
// просто стартуем новую.
import { html, useState, useEffect, useMemo, useRef } from "../lib.js";
import { navigate } from "../router.js";
import {
  getUpload,
  saveUpload,
  getScenarioTests,
  saveScenarioTests,
  getScenarioPreset,
  saveScenarioPreset,
  getActiveSession,
  setActiveSession,
  clearScenarioData,
} from "../storage.js";

export function ManualView({ scenarioId }) {
  const [state, setState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [pane, setPane] = useState("emulator");
  const sessionIdRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const metaRes = await fetch("/api/meta").then((r) => r.json());
        if (cancelled) return;
        setMeta(metaRes);

        const upload = scenarioId.startsWith("upload:") ? getUpload(scenarioId) : null;
        const isBlank = scenarioId === "__blank__";
        let preset = getScenarioPreset(scenarioId);
        let body;
        if (isBlank) {
          body = {
            scenarioName: "Пустой эмулятор",
            sources: { logic: [], globals: [] },
            preset: preset ?? null,
            onStart: false,
          };
        } else if (upload) {
          body = {
            scenarioName: upload.name,
            sources: { logic: upload.logic ?? [], globals: upload.globals ?? [] },
            preset: preset ?? upload.preset ?? null,
            onStart: true,
          };
        } else {
          const existing = getActiveSession(scenarioId);
          if (existing) {
            const r = await fetch(`/api/manual/${existing}`);
            if (r.ok) {
              sessionIdRef.current = existing;
              const st = await r.json();
              setState(st);
              if (!cancelled) connectStream(existing);
              return;
            }
            setActiveSession(scenarioId, null);
          }
          if (!preset) {
            const r = await fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}/preset`);
            preset = r.ok ? await r.json() : null;
          }
          body = { scenarioId, preset, onStart: true };
        }

        const r = await fetch("/api/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        const { id, state: initialState } = await r.json();
        if (cancelled) return;
        sessionIdRef.current = id;
        setActiveSession(scenarioId, id);
        setState(initialState);
        connectStream(id);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    function connectStream(id) {
      const es = new EventSource(`/api/manual/${id}/stream`);
      esRef.current = es;
      es.addEventListener("state", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setState(payload.state);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("log", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLogs((prev) => [...prev.slice(-499), payload.entry]);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("closed", () => {
        es.close();
        setActiveSession(scenarioId, null);
        sessionIdRef.current = null;
      });
      es.onerror = () => {};
    }
    init();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [scenarioId]);

  const post = async (path, body) => {
    const id = sessionIdRef.current;
    if (!id) return null;
    const r = await fetch(`/api/manual/${id}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
  };
  const del = async (path) => {
    const id = sessionIdRef.current;
    if (!id) return null;
    const r = await fetch(`/api/manual/${id}${path}`, { method: "DELETE" });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
  };

  if (error)
    return html`<div class="manual-error">
      <h2>Не удалось запустить сессию</h2>
      <pre>${error}</pre>
      <button onClick=${() => navigate("/")}>← на главную</button>
    </div>`;
  if (!state || !meta) return html`<div class="manual-loading">Запускаю сессию…</div>`;

  return html`
    <div class="manual-page">
      <header class="manual-header">
        <button class="back" onClick=${() => navigate("/")}>←</button>
        <h1>${state.scenarioName}</h1>
        <button
          class="reset"
          title="Удалить preset/tests/сессию из браузера и загрузить заново с бэка"
          onClick=${async () => {
            if (
              !confirm(
                "Сбросить локальные данные сценария (preset, тесты, активная сессия) и перезагрузить с бэка?",
              )
            )
              return;
            try {
              const sid = sessionIdRef.current;
              if (sid) await fetch(`/api/manual/${sid}`, { method: "DELETE" });
            } catch {
              /* игнорим: сессия и так пропадёт после reload */
            }
            clearScenarioData(scenarioId);
            window.location.reload();
          }}
        >
          🧹 Сброс
        </button>
        <div class="tabs">
          <button class=${pane === "emulator" ? "active" : ""} onClick=${() => setPane("emulator")}>
            Эмулятор
          </button>
          <button class=${pane === "tests" ? "active" : ""} onClick=${() => setPane("tests")}>
            Тесты
          </button>
          <button class=${pane === "sources" ? "active" : ""} onClick=${() => setPane("sources")}>
            Исходники
          </button>
        </div>
        <${RecordingControls} state=${state} post=${post} scenarioId=${scenarioId} />
      </header>
      ${pane === "emulator"
        ? html`<${EmulatorPane} state=${state} meta=${meta} post=${post} del=${del} logs=${logs} />`
        : pane === "tests"
          ? html`<${TestsPane} scenarioId=${scenarioId} />`
          : html`<${SourcesPane} scenarioId=${scenarioId} />`}
    </div>
  `;
}

function EmulatorPane({ state, meta, post, del, logs }) {
  const [openRoom, setOpenRoom] = useState(new Set());
  const [adding, setAdding] = useState(null);
  const [logsOpen, setLogsOpen] = useState(true);

  const toggleRoom = (name) => {
    const next = new Set(openRoom);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setOpenRoom(next);
  };

  const grouped = useMemo(() => {
    const byRoom = new Map();
    for (const a of state.accessories) {
      const r = a.room ?? "Без комнаты";
      if (!byRoom.has(r)) byRoom.set(r, []);
      byRoom.get(r).push(a);
    }
    for (const r of state.rooms) if (!byRoom.has(r.name)) byRoom.set(r.name, []);
    return [...byRoom.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [state]);

  return html`
    <div class="manual-main">
      <div class="manual-hub">
        <div class="manual-hub-actions">
          <button onClick=${() => setAdding({ kind: "room" })}>+ Комната</button>
          <button onClick=${() => setAdding({ kind: "accessory" })}>+ Устройство</button>
          <button
            class="reboot"
            title="Сбросить variables, очистить cron/подписки, прибавить 5 минут"
            onClick=${() => {
              if (!confirm("Перезагрузить хаб? Variables очистятся, время +5мин.")) return;
              post("/reboot").catch((e) => alert(e.message));
            }}
          >
            🔁 Перезагрузка хаба
          </button>
          ${state.targetAccessoryId !== null
            ? html`<span class="hint"
                >Target: <strong>#${state.targetAccessoryId}</strong></span
              >`
            : null}
        </div>
        ${grouped.map(([roomName, accs]) => {
          const closed = openRoom.has(roomName);
          // Удаляем только настоящие комнаты (которые есть в state.rooms).
          // "Без комнаты" — псевдо-группа, кнопки удаления у неё нет.
          const isRealRoom = state.rooms.some((r) => r.name === roomName);
          return html`
            <div class="hub-room" key=${roomName}>
              <div class="hub-room-header" onClick=${() => toggleRoom(roomName)}>
                <span class="chev">${closed ? "▸" : "▾"}</span>
                <span class="name">${roomName}</span>
                <span class="count">${accs.length} устр.</span>
                ${isRealRoom
                  ? html`<button
                      class="del-btn"
                      title="Удалить комнату"
                      onClick=${(e) => {
                        e.stopPropagation();
                        if (!confirm(`Удалить комнату «${roomName}»? Устройства останутся без комнаты.`)) return;
                        del(`/room/${encodeURIComponent(roomName)}`).catch((er) =>
                          alert(er.message),
                        );
                      }}
                    >
                      ×
                    </button>`
                  : null}
              </div>
              ${!closed
                ? html`<div class="hub-room-body">
                    ${accs.map(
                      (a) => html`<${AccessoryBlock}
                        key=${a.id}
                        acc=${a}
                        post=${post}
                        del=${del}
                        onAddSvc=${() => setAdding({ kind: "service", aid: a.id })}
                        meta=${meta}
                      />`,
                    )}
                  </div>`
                : null}
            </div>
          `;
        })}
      </div>
      <aside class="manual-side">
        <${TimeControls} state=${state} post=${post} />
        <${OptionsCard} state=${state} post=${post} />
        <${VariablesCard} state=${state} post=${post} />
        <${SchedulersPanel}
          schedulers=${state.schedulers || { cron: [], timers: [], subscriptions: [] }}
          now=${state.time.ms}
        />
      </aside>
      <div class=${`manual-logs ${logsOpen ? "open" : "collapsed"}`}>
        <div class="manual-logs-header" onClick=${() => setLogsOpen((v) => !v)}>
          <span class="chev">${logsOpen ? "▾" : "▸"}</span>
          <span>Логи (${logs.length})</span>
          ${logsOpen
            ? html`<button
                class="link"
                onClick=${(e) => {
                  e.stopPropagation();
                  post("/recording", { clear: true });
                }}
              >
                Очистить запись
              </button>`
            : null}
        </div>
        ${logsOpen
          ? html`<div class="manual-logs-body">
              ${logs.length === 0
                ? html`<div class="empty">Логов пока нет</div>`
                : logs.map(
                    (l, idx) =>
                      html`<div class=${`log-line ${l.level}`} key=${idx}>
                        <span class="ts">${new Date(l.ts).toLocaleTimeString()}</span>${l.message}
                      </div>`,
                  )}
            </div>`
          : null}
      </div>
      ${adding
        ? html`<${AddDialog}
            kind=${adding.kind}
            aid=${adding.aid}
            state=${state}
            meta=${meta}
            post=${post}
            onClose=${() => setAdding(null)}
          />`
        : null}
    </div>
  `;
}

function AccessoryBlock({ acc, post, del, onAddSvc, meta }) {
  return html`
    <div class=${`accessory ${acc.target ? "target" : ""}`}>
      <div class="accessory-title">
        <span class="name">${acc.name}</span>
        <span class="id">#${acc.id}</span>
        ${acc.target ? html`<span class="badge">TARGET</span>` : null}
        <button class="link" onClick=${onAddSvc}>+ Сервис</button>
        <button
          class="del-btn"
          title="Удалить устройство"
          onClick=${() => {
            if (!confirm(`Удалить устройство «${acc.name}» (#${acc.id})?`)) return;
            del(`/accessory/${acc.id}`).catch((e) => alert(e.message));
          }}
        >
          ×
        </button>
      </div>
      <div class="accessory-svcs">
        ${acc.services.map(
          (s) => html`<${ServiceCard}
            key=${`${acc.id}.${s.id}`}
            acc=${acc}
            svc=${s}
            post=${post}
            del=${del}
          />`,
        )}
      </div>
    </div>
  `;
}

function ServiceCard({ acc, svc, post, del }) {
  const primaryValueText = svc.primary
    ? formatValue(svc.primary.value, svc.primary.format, svc.primary.validValueDetails)
    : "";
  // UUID хаба для сервиса: `<aid>.<sid>` — то, что сценарии используют в getUUID().
  const uuid = `${acc.id}.${svc.id}`;
  return html`
    <div class=${`service ${svc.hasBoolean ? "has-bool" : ""}`}>
      <div class="service-head">
        <div class="service-name">
          ${svc.name}
          <button
            class="del-btn small"
            title="Удалить сервис"
            onClick=${() => {
              if (!confirm(`Удалить сервис «${svc.name}» (${uuid})?`)) return;
              del(`/service/${acc.id}/${svc.id}`).catch((e) => alert(e.message));
            }}
          >
            ×
          </button>
        </div>
        <div class="service-type">
          ${svc.type}
          <span class="svc-uuid" title="UUID (aid.sid)">${uuid}</span>
        </div>
        <div class="service-state">${primaryValueText}</div>
      </div>
      <div class="service-chars">
        ${svc.characteristics.map(
          (c) => html`<${CharRow}
            key=${c.id}
            acc=${acc}
            svc=${svc}
            char=${c}
            post=${post}
            del=${del}
          />`,
        )}
        <button
          class="link svc-add-char"
          onClick=${() => {
            const type = prompt("Тип характеристики (HC), например 'On', 'CurrentTemperature'", "");
            if (!type) return;
            post("/characteristic", { aid: acc.id, sid: svc.id, char: { type } }).catch((e) =>
              alert(e.message),
            );
          }}
        >
          + Характеристика
        </button>
      </div>
    </div>
  `;
}

function CharRow({ acc, svc, char, post, del }) {
  const [draft, setDraft] = useState(char.value);
  useEffect(() => setDraft(char.value), [char.value]);
  // В реальном хабе RO-характеристики менять нельзя. В симуляторе разрешаем —
  // полезно вручную ставить значения сенсорам, чтобы посмотреть реакцию логики.
  // Иконка-замок 🔒 рядом с именем — индикатор «не writable по спеке».
  const writable = char.writable !== false;
  const commit = (value) => {
    post("/char", { aid: acc.id, cid: char.id, value }).catch((e) => alert(e.message));
  };
  let input;
  if (char.isBoolean || char.format === "Boolean") {
    input = html`<input
      type="checkbox"
      checked=${!!draft}
      onChange=${(e) => {
        setDraft(e.target.checked);
        commit(e.target.checked);
      }}
    />`;
  } else if (Array.isArray(char.validValueDetails) && char.validValueDetails.length > 0) {
    input = html`<select
      value=${String(draft ?? "")}
      onChange=${(e) => {
        const v = Number(e.target.value);
        setDraft(v);
        commit(v);
      }}
    >
      ${char.validValueDetails.map(
        (vv) =>
          html`<option key=${vv.value} value=${vv.value}>
            ${vv.value} — ${vv.name || vv.key}
          </option>`,
      )}
    </select>`;
  } else if (Array.isArray(char.validValues) && char.validValues.length > 0) {
    input = html`<select
      value=${String(draft ?? "")}
      onChange=${(e) => {
        const v = Number(e.target.value);
        setDraft(v);
        commit(v);
      }}
    >
      ${char.validValues.map((v) => html`<option key=${v} value=${v}>${v}</option>`)}
    </select>`;
  } else if (char.format === "Integer" || char.format === "Double") {
    input = html`<input
      type="number"
      value=${draft ?? 0}
      step=${char.minStep ?? (char.format === "Double" ? 0.1 : 1)}
      min=${char.minValue ?? undefined}
      max=${char.maxValue ?? undefined}
      onChange=${(e) => {
        const v = Number(e.target.value);
        setDraft(v);
        commit(v);
      }}
    />`;
  } else {
    input = html`<input
      type="text"
      value=${String(draft ?? "")}
      onChange=${(e) => {
        setDraft(e.target.value);
        commit(e.target.value);
      }}
    />`;
  }
  return html`
    <div class=${`char-row ${writable ? "" : "ro"}`}>
      <div class="char-name" title=${writable ? char.type : char.type + " (read-only в реальном хабе)"}>
        ${!writable ? html`<span class="ro-mark" aria-label="read-only">🔒</span>` : null}
        ${char.name}
      </div>
      <div class="char-input">
        ${input}
        ${del
          ? html`<button
              class="del-btn tiny"
              title="Удалить характеристику"
              onClick=${() => {
                if (!confirm(`Удалить характеристику ${char.type}?`)) return;
                del(`/characteristic/${acc.id}/${svc.id}/${char.id}`).catch((e) =>
                  alert(e.message),
                );
              }}
            >
              ×
            </button>`
          : null}
      </div>
    </div>
  `;
}

function TimeControls({ state, post }) {
  // datetime-local с step="1" показывает секунды (формат "YYYY-MM-DDTHH:mm:ss").
  const [iso, setIso] = useState(toLocalInput(state.time.iso));
  useEffect(() => setIso(toLocalInput(state.time.iso)), [state.time.iso]);
  return html`
    <div class="card">
      <h3>Время</h3>
      <div class="row">
        <span class="label">Сейчас</span>
        <code>${formatLocalWithSeconds(state.time.ms)}</code>
      </div>
      <div class="row">
        <input
          type="datetime-local"
          step="1"
          value=${iso}
          onInput=${(e) => setIso(e.target.value)}
        />
        <button
          class="link"
          onClick=${() => post("/time", { iso: new Date(iso).toISOString() })}
        >
          Установить
        </button>
      </div>
      <div class="row">
        ${[
          { label: "+1s", ms: 1_000 },
          { label: "+10s", ms: 10_000 },
          { label: "+30s", ms: 30_000 },
          { label: "+1m", ms: 60_000 },
          { label: "+10m", ms: 600_000 },
          { label: "+1h", ms: 3_600_000 },
          { label: "+1d", ms: 86_400_000 },
        ].map(
          (t) =>
            html`<button class="link" onClick=${() => post("/time", { advanceMs: t.ms })}>
              ${t.label}
            </button>`,
        )}
      </div>
    </div>
  `;
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatLocalWithSeconds(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function OptionsCard({ state, post }) {
  const [open, setOpen] = useState(true);
  // Собираем все сервисы текущего хаба для подстановки в list-опции.
  const services = useMemo(() => {
    const out = [];
    for (const a of state.accessories ?? []) {
      for (const s of a.services ?? []) {
        out.push({
          value: `${a.id}.${s.id}`,
          label: `${a.name} / ${s.name} (${s.type})`,
          type: s.type,
        });
      }
    }
    return out;
  }, [state.accessories]);
  return html`
    <div class="card">
      <h3 onClick=${() => setOpen((v) => !v)} class="clickable">
        ${open ? "▾" : "▸"} Опции
        <small>(${Object.keys(state.options).length})</small>
      </h3>
      ${open
        ? html`<${OptionsEditor}
            values=${state.options}
            meta=${state.optionsMeta || {}}
            services=${services}
            onChange=${(name, value) => post("/options", { name, value })}
          />`
        : null}
    </div>
  `;
}

function OptionsEditor({ values, meta, services, onChange }) {
  const metaKeys = Object.keys(meta);
  const valKeys = Object.keys(values).filter((k) => !metaKeys.includes(k));
  const keys = [...metaKeys, ...valKeys];

  if (keys.length === 0) return html`<div class="empty">— нет опций —</div>`;

  return html`
    <div class="opt-list">
      ${keys.map((k) => {
        const m = meta[k] ?? {};
        const value = values[k];
        const label = pickLocalized(m.name) || k;
        const desc = pickLocalized(m.desc);
        return html`<${OptionRow}
          key=${k}
          name=${k}
          label=${label}
          desc=${desc}
          meta=${m}
          value=${value}
          services=${services}
          onChange=${(v) => onChange(k, v)}
        />`;
      })}
    </div>
  `;
}

function OptionRow({ name, label, desc, meta, value, services, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const t = meta.type || guessType(value);
  let input;
  if (t === "Boolean") {
    input = html`<input
      type="checkbox"
      checked=${!!draft}
      onChange=${(e) => {
        setDraft(e.target.checked);
        onChange(e.target.checked);
      }}
    />`;
  } else if (meta.formType === "list") {
    // list-опция: значения из meta.values (если есть) + список сервисов из хаба
    // (для опций типа "выбери сенсор/реле/лампу" — у них values = sensorsServicesList,
    // который сценарий вычисляет из Hub.getAccessories(), но он пуст при инициализации).
    const fromMeta = Array.isArray(meta.values)
      ? meta.values
          .map((v) => normalizeListItem(v))
          .filter((x) => x && x.value !== undefined)
      : [];
    const seen = new Set(fromMeta.map((x) => String(x.value)));
    const merged = [...fromMeta];
    for (const s of services ?? []) {
      if (!seen.has(s.value)) {
        merged.push({ value: s.value, label: s.label });
        seen.add(s.value);
      }
    }
    if (!seen.has(String(draft ?? "")) && (draft ?? "") !== "") {
      merged.push({ value: String(draft), label: String(draft) });
    }
    input = html`<select
      value=${String(draft ?? "")}
      onChange=${(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
    >
      ${merged.map(
        (it) =>
          html`<option key=${it.value} value=${it.value}>${it.label || it.value || "—"}</option>`,
      )}
    </select>`;
  } else if (t === "Integer" || t === "Double") {
    input = html`<input
      type="number"
      value=${draft ?? 0}
      step=${meta.minStep ?? (t === "Double" ? 0.1 : 1)}
      min=${meta.minValue ?? undefined}
      max=${meta.maxValue ?? undefined}
      onChange=${(e) => {
        const v = Number(e.target.value);
        setDraft(v);
        onChange(v);
      }}
    />`;
  } else {
    input = html`<input
      type="text"
      value=${typeof draft === "object" ? JSON.stringify(draft) : String(draft ?? "")}
      onChange=${(e) => {
        let v = e.target.value;
        try {
          v = JSON.parse(e.target.value);
        } catch {
          /* keep raw string */
        }
        setDraft(v);
        onChange(v);
      }}
    />`;
  }
  return html`
    <div class="opt-row">
      <div class="opt-label" title=${name}>
        <span class="opt-name">${label}</span>
        ${desc ? html`<span class="opt-desc">${desc}</span>` : null}
      </div>
      <div class="opt-input">${input}</div>
    </div>
  `;
}

function normalizeListItem(v) {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return { value: v, label: String(v) };
  }
  if (typeof v === "object") {
    const value = v.value !== undefined ? v.value : v.key !== undefined ? v.key : v.id;
    const label = pickLocalized(v.name) || v.label || v.title || String(value ?? "—");
    return { value, label };
  }
  return null;
}

function SchedulersPanel({ schedulers, now }) {
  const [open, setOpen] = useState(true);
  const c = schedulers.cron ?? [];
  const t = schedulers.timers ?? [];
  const s = schedulers.subscriptions ?? [];
  return html`
    <div class="card manual-schedulers">
      <h3 onClick=${() => setOpen((v) => !v)} class="clickable">
        ${open ? "▾" : "▸"} Планировщики
        <small>(cron ${c.length} · timers ${t.length} · subs ${s.length})</small>
      </h3>
      ${open
        ? html`
            <section>
              <h4>Cron</h4>
              ${c.length === 0 ? html`<div class="empty">— нет —</div>` : null}
              ${c.map(
                (e) => html`<div class="sched-item" key=${e.id}>
                  <span class="meta">#${e.id} ${e.kind}</span>
                  ${e.kind === "cron"
                    ? html`<code>${e.spec}</code>`
                    : html`<code>${e.kind}${e.offsetMinutes != null ? ` ${e.offsetMinutes >= 0 ? "+" : ""}${e.offsetMinutes}м` : ""}</code>`}
                  ${e.nextAtMs != null
                    ? html` · в ${new Date(e.nextAtMs).toLocaleString()}`
                    : null}
                </div>`,
              )}
            </section>
            <section>
              <h4>Таймеры</h4>
              ${t.length === 0 ? html`<div class="empty">— нет —</div>` : null}
              ${t.map(
                (it) => html`<div class="sched-item" key=${it.id}>
                  <span class="meta"
                    >#${it.id}${it.intervalMs ? " interval" : " timeout"}</span
                  >
                  через ${formatMs(it.inMs)}
                  ${it.intervalMs ? html` · каждые ${formatMs(it.intervalMs)}` : null}
                </div>`,
              )}
            </section>
            <section>
              <h4>Подписки Hub.subscribe</h4>
              ${s.length === 0 ? html`<div class="empty">— нет —</div>` : null}
              ${s.map(
                (sub) => html`<div class="sched-item" key=${sub.id}>
                  <span class="meta">#${sub.id} ${sub.kind}</span>
                  ${sub.cond
                    ? html` cond=<code>${sub.cond}</code> value=<code>${sub.value}</code>`
                    : null}
                  ${sub.hs && sub.hs.length ? html` · hs=${sub.hs.join(",")}` : null}
                  ${sub.hc && sub.hc.length ? html` · hc=${sub.hc.join(",")}` : null}
                </div>`,
              )}
            </section>
          `
        : null}
    </div>
  `;
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}мс`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}с`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}мин`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}ч`;
  return `${(ms / 86_400_000).toFixed(1)}д`;
}

function VariablesCard({ state, post }) {
  const [open, setOpen] = useState(false);
  return html`
    <div class="card">
      <h3 onClick=${() => setOpen((v) => !v)} class="clickable">
        ${open ? "▾" : "▸"} Переменные
        <small>(${Object.keys(state.variables).length})</small>
      </h3>
      ${open
        ? html`<${KeyValueEditor}
            values=${state.variables}
            onChange=${(name, value) => post("/variables", { name, value })}
          />`
        : null}
    </div>
  `;
}

function KeyValueEditor({ values, onChange }) {
  const keys = Object.keys(values).sort();
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  return html`
    <div class="kv">
      ${keys.length === 0 ? html`<div class="empty">— пусто —</div>` : null}
      ${keys.map((k) => {
        const v = values[k];
        const t = typeof v;
        return html`
          <div class="kv-row" key=${k}>
            <div class="kv-key">${k}</div>
            <div class="kv-val">
              ${t === "boolean"
                ? html`<input
                    type="checkbox"
                    checked=${v}
                    onChange=${(e) => onChange(k, e.target.checked)}
                  />`
                : t === "number"
                  ? html`<input
                      type="number"
                      value=${v}
                      onChange=${(e) => onChange(k, Number(e.target.value))}
                    />`
                  : html`<input
                      type="text"
                      value=${typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                      onChange=${(e) => {
                        let parsed = e.target.value;
                        try {
                          parsed = JSON.parse(e.target.value);
                        } catch {}
                        onChange(k, parsed);
                      }}
                    />`}
            </div>
          </div>
        `;
      })}
      <div class="kv-row new">
        <input placeholder="ключ" value=${newKey} onInput=${(e) => setNewKey(e.target.value)} />
        <input
          placeholder="значение (JSON или текст)"
          value=${newVal}
          onInput=${(e) => setNewVal(e.target.value)}
        />
        <button
          class="link"
          onClick=${() => {
            if (!newKey) return;
            let v = newVal;
            try {
              v = JSON.parse(newVal);
            } catch {}
            onChange(newKey, v);
            setNewKey("");
            setNewVal("");
          }}
        >
          +
        </button>
      </div>
    </div>
  `;
}

function RecordingControls({ state, post, scenarioId }) {
  const rec = state.recording;
  const [genSrc, setGenSrc] = useState("");
  const generate = async () => {
    const r = await fetch(`/api/manual/${state.id}/generate-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Запись " + new Date().toLocaleString() }),
    });
    const { source } = await r.json();
    setGenSrc(source);
  };
  const saveToTests = () => {
    if (!genSrc) return;
    const tests = getScenarioTests(scenarioId);
    tests.push({ file: `recorded-${Date.now()}.test.js`, source: genSrc });
    saveScenarioTests(scenarioId, tests);
    alert("Сохранено в локальные тесты сценария");
    setGenSrc("");
  };
  return html`
    <div class="rec">
      <button
        class=${rec.active ? "rec-on" : "rec-off"}
        onClick=${() => post("/recording", { on: !rec.active })}
        title=${rec.active ? "Остановить запись" : "Записать действия"}
      >
        ${rec.active ? "● Запись" : "○ Записать"}
      </button>
      <button class="link" onClick=${generate} disabled=${rec.actions.length === 0}>
        Сгенерировать тест (${rec.actions.length})
      </button>
      ${genSrc
        ? html`<div class="modal-backdrop" onClick=${() => setGenSrc("")}>
            <div class="modal large" onClick=${(e) => e.stopPropagation()}>
              <h2>Сгенерированный тест</h2>
              <textarea readonly value=${genSrc}></textarea>
              <div class="actions">
                <button class="secondary" onClick=${() => setGenSrc("")}>Закрыть</button>
                <button onClick=${saveToTests}>Сохранить в тесты сценария</button>
                <button
                  onClick=${() => {
                    navigator.clipboard.writeText(genSrc).then(
                      () => alert("Скопировано"),
                      () => {},
                    );
                  }}
                >
                  Скопировать
                </button>
              </div>
            </div>
          </div>`
        : null}
    </div>
  `;
}

function AddDialog({ kind, aid, state, meta, post, onClose }) {
  if (kind === "room") {
    return html`<${SimpleDialog} title="Новая комната" onClose=${onClose}>
      <${TextSubmit}
        placeholder="Имя"
        onSubmit=${(v) =>
          post("/room", { name: v })
            .then(onClose)
            .catch((e) => alert(e.message))}
      />
    <//>`;
  }
  if (kind === "accessory") {
    return html`<${AccessoryDialog} state=${state} meta=${meta} post=${post} onClose=${onClose} />`;
  }
  if (kind === "service") {
    return html`<${ServiceDialog} aid=${aid} meta=${meta} post=${post} onClose=${onClose} />`;
  }
  return null;
}

function SimpleDialog({ title, onClose, children }) {
  return html`
    <div class="modal-backdrop" onClick=${onClose}>
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <h2>${title}</h2>
        ${children}
        <div class="actions">
          <button class="secondary" onClick=${onClose}>Отмена</button>
        </div>
      </div>
    </div>
  `;
}

function TextSubmit({ placeholder, onSubmit }) {
  const [v, setV] = useState("");
  return html`<div class="row">
    <input
      type="text"
      placeholder=${placeholder}
      value=${v}
      onInput=${(e) => setV(e.target.value)}
    />
    <button onClick=${() => v && onSubmit(v)}>OK</button>
  </div>`;
}

function AccessoryDialog({ state, meta, post, onClose }) {
  const nextId = useMemo(() => {
    const ids = state.accessories.map((a) => a.id);
    return ids.length === 0 ? 100 : Math.max(...ids) + 1;
  }, [state.accessories]);
  const [id, setId] = useState(nextId);
  const [name, setName] = useState("Новое устройство");
  const [room, setRoom] = useState(state.rooms[0]?.name ?? "");
  const [target, setTarget] = useState(false);
  const submit = () => {
    post("/accessory", {
      accessory: { id: Number(id), name, room: room || undefined, target, services: [] },
    })
      .then(onClose)
      .catch((e) => alert(e.message));
  };
  return html`<div class="modal-backdrop" onClick=${onClose}>
    <div class="modal" onClick=${(e) => e.stopPropagation()}>
      <h2>Новое устройство</h2>
      <label
        >id
        <input type="number" value=${id} onInput=${(e) => setId(Number(e.target.value))} />
      </label>
      <label>Имя <input value=${name} onInput=${(e) => setName(e.target.value)} /></label>
      <label
        >Комната
        <select value=${room} onChange=${(e) => setRoom(e.target.value)}>
          <option value="">—</option>
          ${state.rooms.map((r) => html`<option key=${r.name} value=${r.name}>${r.name}</option>`)}
        </select>
      </label>
      <label>
        <input type="checkbox" checked=${target} onChange=${(e) => setTarget(e.target.checked)} />
        Целевое устройство (логика на нём)
      </label>
      <div class="actions">
        <button class="secondary" onClick=${onClose}>Отмена</button>
        <button onClick=${submit}>Создать</button>
      </div>
    </div>
  </div>`;
}

function ServiceDialog({ aid, meta, post, onClose }) {
  const [type, setType] = useState(meta.services[0]?.type ?? "Switch");
  const svc = meta.services.find((s) => s.type === type);
  const [name, setName] = useState("");
  const [chars, setChars] = useState([]);
  useEffect(() => {
    setChars((svc?.required ?? []).map((c) => ({ type: c, value: defaultValue(meta.chars[c]) })));
  }, [type]);
  const submit = () => {
    post("/service", {
      aid,
      service: { type, name: name || undefined, characteristics: chars },
    })
      .then(onClose)
      .catch((e) => alert(e.message));
  };
  return html`<div class="modal-backdrop" onClick=${onClose}>
    <div class="modal" onClick=${(e) => e.stopPropagation()}>
      <h2>Новый сервис</h2>
      <label
        >Тип
        <select value=${type} onChange=${(e) => setType(e.target.value)}>
          ${meta.services.map((s) => html`<option key=${s.type} value=${s.type}>${s.type}</option>`)}
        </select>
      </label>
      <label>Имя (опц.) <input value=${name} onInput=${(e) => setName(e.target.value)} /></label>
      <div class="kv">
        ${chars.map(
          (c, idx) =>
            html`<div class="kv-row" key=${idx}>
              <div class="kv-key">${c.type}</div>
              <div class="kv-val">
                <input
                  value=${typeof c.value === "object"
                    ? JSON.stringify(c.value)
                    : String(c.value ?? "")}
                  onInput=${(e) => {
                    let v = e.target.value;
                    try {
                      v = JSON.parse(e.target.value);
                    } catch {}
                    const next = [...chars];
                    next[idx] = { ...c, value: v };
                    setChars(next);
                  }}
                />
              </div>
            </div>`,
        )}
      </div>
      <div class="actions">
        <button class="secondary" onClick=${onClose}>Отмена</button>
        <button onClick=${submit}>Создать</button>
      </div>
    </div>
  </div>`;
}

function TestsPane({ scenarioId }) {
  // Сливаем источники: реальные .test.js файлы со стороны бэка (read-only) +
  // локальные из localStorage (редактируемые/добавляемые).
  const [remote, setRemote] = useState([]);
  const [local, setLocal] = useState(() => getScenarioTests(scenarioId));
  const [active, setActive] = useState(null);
  const isBlank = scenarioId === "__blank__";

  useEffect(() => {
    if (isBlank) {
      setRemote([]);
      return;
    }
    const upload = scenarioId.startsWith("upload:") ? getUpload(scenarioId) : null;
    if (upload) {
      setRemote([]);
      return;
    }
    fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}/tests`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) =>
        setRemote(
          (arr ?? []).map((t) => ({
            id: `remote:${t.file}`,
            file: (t.file ?? "").split("/").pop() || t.file,
            path: t.file,
            source: t.source,
            kind: "remote",
          })),
        ),
      )
      .catch(() => setRemote([]));
  }, [scenarioId]);

  const localItems = local.map((t) => ({
    id: `local:${t.file}`,
    file: t.file,
    source: t.source,
    kind: "local",
  }));
  const allTests = [...remote, ...localItems];
  const cur = allTests.find((t) => t.id === active) ?? allTests[0] ?? null;

  const updateLocal = (file, patch) => {
    const next = local.map((t) => (t.file === file ? { ...t, ...patch } : t));
    setLocal(next);
    saveScenarioTests(scenarioId, next);
  };
  const addTest = () => {
    const file = `local-${Date.now()}.test.js`;
    const seed = `describe(${JSON.stringify(scenarioId)}, () => {\n  it('пример', ({ hub, scenario }) => {\n    // TODO\n  });\n});\n`;
    const next = [...local, { file, source: seed }];
    setLocal(next);
    saveScenarioTests(scenarioId, next);
    setActive(`local:${file}`);
  };
  const removeLocal = (file) => {
    if (!confirm(`Удалить ${file}?`)) return;
    const next = local.filter((t) => t.file !== file);
    setLocal(next);
    saveScenarioTests(scenarioId, next);
  };
  const download = () => {
    if (!cur) return;
    const blob = new Blob([cur.source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cur.file;
    a.click();
    URL.revokeObjectURL(url);
  };

  return html`
    <div class="tests-pane">
      <aside class="tests-list">
        <button onClick=${addTest}>+ Новый тест</button>
        ${allTests.length === 0 ? html`<div class="empty">Пока нет тестов</div>` : null}
        ${remote.length > 0
          ? html`<div class="tests-group">Из репозитория (read-only)</div>`
          : null}
        ${remote.map(
          (t) => html`
            <div
              class=${`tests-item ${cur && cur.id === t.id ? "active" : ""}`}
              key=${t.id}
              onClick=${() => setActive(t.id)}
            >
              <span class="badge ro">RO</span>
              <span>${t.file}</span>
            </div>
          `,
        )}
        ${localItems.length > 0 ? html`<div class="tests-group">Локальные</div>` : null}
        ${localItems.map(
          (t) => html`
            <div
              class=${`tests-item ${cur && cur.id === t.id ? "active" : ""}`}
              key=${t.id}
            >
              <span onClick=${() => setActive(t.id)}>${t.file}</span>
              <button class="link danger" onClick=${() => removeLocal(t.file)}>×</button>
            </div>
          `,
        )}
      </aside>
      <section class="tests-editor">
        ${cur
          ? html`<div class="row">
                ${cur.kind === "local"
                  ? html`<input
                      type="text"
                      value=${cur.file}
                      onChange=${(e) => {
                        const file = e.target.value;
                        const next = local.map((t) =>
                          t.file === cur.file ? { ...t, file } : t,
                        );
                        setLocal(next);
                        saveScenarioTests(scenarioId, next);
                        setActive(`local:${file}`);
                      }}
                    />`
                  : html`<span class="path">${cur.path ?? cur.file}</span>`}
                <button class="link" onClick=${download}>Скачать .js</button>
              </div>
              <textarea
                readonly=${cur.kind !== "local"}
                value=${cur.source}
                onInput=${(e) =>
                  cur.kind === "local" && updateLocal(cur.file, { source: e.target.value })}
              ></textarea>`
          : html`<div class="empty">Выбери тест слева или создай новый</div>`}
      </section>
    </div>
  `;
}

function SourcesPane({ scenarioId }) {
  const [files, setFiles] = useState(null);
  const isBlank = scenarioId === "__blank__";
  const upload = scenarioId.startsWith("upload:") ? getUpload(scenarioId) : null;
  useEffect(() => {
    if (isBlank) {
      setFiles({ globals: [], logic: [] });
      return;
    }
    if (upload) {
      setFiles({ globals: upload.globals ?? [], logic: upload.logic ?? [] });
      return;
    }
    fetch(`/api/scenarios/${encodeURIComponent(scenarioId)}/source`)
      .then((r) => r.json())
      .then((data) => {
        // backend возвращает {globals:[{path, content}], logic:[{path, content}]}
        const norm = (arr) =>
          (arr ?? []).map((f) => ({ file: f.path ?? f.file, source: f.content ?? f.source }));
        setFiles({ globals: norm(data.globals), logic: norm(data.logic) });
      })
      .catch(() => setFiles({ globals: [], logic: [] }));
  }, [scenarioId]);

  if (!files) return html`<div class="empty">Загрузка…</div>`;

  const updateUpload = (kind, file, source) => {
    if (!upload) return;
    const next = { ...upload };
    next[kind] = (next[kind] ?? []).map((f) => (f.file === file ? { ...f, source } : f));
    saveUpload(next);
    setFiles({ ...files, [kind]: next[kind] });
  };

  return html`
    <div class="sources-pane">
      <section>
        <h3>Логика</h3>
        ${files.logic.length === 0 ? html`<div class="empty">—</div>` : null}
        ${files.logic.map(
          (f) => html`
            <details key=${f.file} open=${true}>
              <summary>${(f.file ?? "").split("/").pop()}</summary>
              <textarea
                readonly=${!upload}
                value=${f.source}
                onInput=${(e) => upload && updateUpload("logic", f.file, e.target.value)}
              ></textarea>
            </details>
          `,
        )}
      </section>
      <section>
        <h3>Глобальные</h3>
        ${files.globals.length === 0 ? html`<div class="empty">—</div>` : null}
        ${files.globals.map(
          (f) => html`
            <details key=${f.file} open=${true}>
              <summary>${(f.file ?? "").split("/").pop()}</summary>
              <textarea
                readonly=${!upload}
                value=${f.source}
                onInput=${(e) => upload && updateUpload("globals", f.file, e.target.value)}
              ></textarea>
            </details>
          `,
        )}
      </section>
    </div>
  `;
}

function defaultValue(spec) {
  if (!spec) return null;
  if (spec.format === "Boolean") return false;
  if (spec.format === "Integer" || spec.format === "Double") return spec.minValue ?? 0;
  return "";
}

function formatValue(v, format, validValueDetails) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "ВКЛ" : "ВЫКЛ";
  if (typeof v === "number") {
    if (Array.isArray(validValueDetails)) {
      const hit = validValueDetails.find((d) => d.value === v);
      if (hit) return hit.name || hit.key || String(v);
    }
    return format === "Double" ? v.toFixed(2) : String(v);
  }
  return String(v);
}

function pickLocalized(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.ru || v.en || "";
  return "";
}

function guessType(v) {
  if (typeof v === "boolean") return "Boolean";
  if (typeof v === "number") return Number.isInteger(v) ? "Integer" : "Double";
  return "String";
}
