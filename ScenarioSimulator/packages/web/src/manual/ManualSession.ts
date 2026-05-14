import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import {
  CHAR_METADATA,
  ScenarioConfigSchema,
  TestRunFactory,
  type LoadedConfig,
  type ScenarioSources,
  type ServiceMock,
  type TestRunSession,
  type AccessoryMock,
  type CharacteristicMock,
} from "@scenario-simulator/core";
import type {
  ScenarioPreset,
  PresetAccessory,
  ServiceFixture,
  CharacteristicFixture,
} from "@scenario-simulator/core";
import type { HC } from "@scenario-simulator/core";
import type { HS } from "@scenario-simulator/core";

export type ManualOptions = {
  scenarioName: string;
  sources: ScenarioSources;
  preset: ScenarioPreset | null;
  onStart?: boolean;
};

export type ManualLog = {
  level: string;
  message: string;
  ts: number;
};

export type ManualAction =
  | { kind: "init"; ts: number; preset: ScenarioPreset | null }
  | { kind: "reboot"; ts: number }
  | { kind: "setChar"; ts: number; aid: number; sid: number; cid: number; hc: string; value: unknown }
  | { kind: "setOption"; ts: number; name: string; value: unknown }
  | { kind: "setVariable"; ts: number; name: string; value: unknown }
  | { kind: "time"; ts: number; iso?: string; advanceMs?: number }
  | { kind: "sun"; ts: number; sunrise?: string; sunset?: string }
  | { kind: "addRoom"; ts: number; name: string }
  | { kind: "addAccessory"; ts: number; accessory: PresetAccessory }
  | { kind: "addService"; ts: number; aid: number; service: { type: string; name?: string; characteristics?: { type: string; value?: unknown }[] } }
  | { kind: "addChar"; ts: number; aid: number; sid: number; char: { type: string; value?: unknown } }
  | { kind: "removeRoom"; ts: number; name: string }
  | { kind: "removeAccessory"; ts: number; aid: number }
  | { kind: "removeService"; ts: number; aid: number; sid: number }
  | { kind: "removeChar"; ts: number; aid: number; sid: number; cid: number }
  | { kind: "trigger"; ts: number; aid: number; cid: number };

export type ManualEvent =
  | { kind: "state"; state: ManualState }
  | { kind: "log"; entry: ManualLog }
  | { kind: "closed" };

export type ManualCharSnapshot = {
  id: number;
  type: string;
  name: string;
  format: string;
  value: unknown;
  writable: boolean;
  readable: boolean;
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  validValues?: number[];
  /** [{ value, key, name? }] — для select-показа имён значений. */
  validValueDetails?: { value: number; key: string; name?: string }[];
  isBoolean: boolean;
};

export type ManualServiceSnapshot = {
  id: number;
  type: string;
  name: string;
  primary: ManualCharSnapshot | null;
  hasBoolean: boolean;
  characteristics: ManualCharSnapshot[];
};

export type ManualAccessorySnapshot = {
  id: number;
  name: string;
  room: string | null;
  target: boolean;
  services: ManualServiceSnapshot[];
};

export type OptionMeta = {
  /** Локализованное имя (ru/en) или просто строка. */
  name?: string | { ru?: string; en?: string };
  /** Описание (ru/en). */
  desc?: string | { ru?: string; en?: string };
  /** Тип значения по info-блоку — Boolean/Integer/Double/String/list. */
  type?: string;
  /** Стиль контрола: list, status и т.д. */
  formType?: string;
  /** Минимум/максимум/шаг (для числовых). */
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  /** Для type=list — { key: label } или массив {key,name}. */
  values?: unknown;
};

export type ManualSchedulers = {
  cron: { id: number; kind: "cron" | "sunrise" | "sunset"; spec: string; offsetMinutes?: number; nextAtMs: number | null }[];
  timers: { id: number; dueAt: number; intervalMs?: number; inMs: number }[];
  subscriptions: { id: number; kind: string; cond?: string; value?: string; hs?: string[]; hc?: string[] }[];
};

export type ManualState = {
  id: string;
  scenarioName: string;
  createdAt: number;
  targetAccessoryId: number | null;
  options: Record<string, unknown>;
  /** Метаданные опций из info.options сценария: имя, описание, type, formType, values. */
  optionsMeta: Record<string, OptionMeta>;
  variables: Record<string, unknown>;
  time: { iso: string; ms: number; sunrise: string | null; sunset: string | null };
  recording: { active: boolean; actions: ManualAction[] };
  rooms: { id: number; name: string }[];
  accessories: ManualAccessorySnapshot[];
  schedulers: ManualSchedulers;
  logs: ManualLog[];
};

const BOOLEAN_HC_HINTS = new Set([
  "On",
  "Active",
  "C_Boolean",
  "InUse",
  "MotionDetected",
  "OccupancyDetected",
  "ContactSensorState",
  "LeakDetected",
  "SmokeDetected",
  "C_Online",
  "C_Scan",
]);

function buildLoadedConfig(scenarioName: string, sources: ScenarioSources): LoadedConfig {
  const raw = ScenarioConfigSchema.parse({ scenario: { globals: [], logic: [] } });
  return {
    configPath: "",
    testsDir: "",
    scenarioDir: "",
    name: scenarioName,
    raw,
    globalFiles: sources.globals.map((g) => g.file),
    logicFiles: sources.logic.map((l) => l.file),
  };
}

export class ManualSession {
  readonly id: string;
  readonly scenarioName: string;
  readonly createdAt: number;
  private readonly session: TestRunSession;
  private readonly sources: ScenarioSources;
  private targetAccessoryId: number | null = null;
  private options: Record<string, unknown>;
  private variables: Record<string, unknown>;
  /**
   * Текущая цепочка контекста (в формате реального Sprut.Hub):
   * `LOGIC[scenario_Service aid.sid] <- C[aid.sid.cid HS.HC] <- ... <- WEB[...]_<ts>`.
   * Сценарий читает его 5-м аргументом в trigger() и через isSelfChangeByContext
   * различает change "от себя" vs "извне".
   */
  private currentContext: string = "";
  private readonly listeners = new Set<(e: ManualEvent) => void>();
  private readonly logs: ManualLog[] = [];
  private recording = false;
  private readonly recorded: ManualAction[] = [];
  private closed = false;

  constructor(opts: ManualOptions) {
    this.id = randomUUID();
    this.scenarioName = opts.scenarioName;
    this.createdAt = Date.now();
    this.sources = opts.sources;

    const cfg = buildLoadedConfig(opts.scenarioName, opts.sources);
    const factory = new TestRunFactory({
      config: cfg,
      sources: opts.sources,
      onLog: (entry) => this.pushLog(entry),
    });
    this.session = factory.build();
    if (this.session.validationFailure) {
      const issues = this.session.validationFailure.result.issues
        .map((i) => `  ${this.session.validationFailure!.filename}:${i.line}:${i.column}  ${i.nodeType}  ${i.message}`)
        .join("\n");
      throw new Error(`Scenario AST validation failed:\n${issues}`);
    }

    // Опции и переменные: сначала дефолты из info-блока сценария (поля .value
    // в info.options / info.variables), затем override из preset.
    this.options = this.collectInfoDefaults("options");
    this.variables = this.collectInfoDefaults("variables");
    if (opts.preset?.options) Object.assign(this.options, opts.preset.options);
    if (opts.preset?.variables) Object.assign(this.variables, opts.preset.variables);

    if (opts.preset?.time) {
      try {
        this.session.ctx.time.set(opts.preset.time);
      } catch {
        /* ignore bad ISO */
      }
    }
    if (opts.preset?.sunrise) this.session.ctx.sun.setSunrise(opts.preset.sunrise);
    if (opts.preset?.sunset) this.session.ctx.sun.setSunset(opts.preset.sunset);

    for (const r of opts.preset?.rooms ?? []) {
      this.session.ctx.hub.addRoom(r);
    }
    for (const a of opts.preset?.accessories ?? []) {
      const { target, ...rest } = a;
      this.session.ctx.hub.addAccessory(rest);
      if (target) this.targetAccessoryId = a.id;
    }

    this.recorded.push({ kind: "init", ts: Date.now(), preset: opts.preset ?? null });

    // Подписка-имитация хаба: при изменении любой характеристики, у которой тип
    // сервиса попадает в info.sourceServices и тип char в info.sourceCharacteristics,
    // вызывается trigger("DEVICE"). Без этого подписки сценария на сторонние
    // устройства работают, но триггер на target-устройстве не дёргается.
    this.installScenarioSubscription();

    // Эмуляция загрузки хаба: trigger("HUB[OnStart]") при info.onStart=true.
    // opts.onStart=false из клиента подавляет вызов (для blank-режима).
    if (opts.onStart !== false) this.triggerOnStart();
  }

  /** Подписка на события сессии. Заодно реплеит лог. */
  subscribe(fn: (e: ManualEvent) => void): () => void {
    this.listeners.add(fn);
    for (const l of this.logs) fn({ kind: "log", entry: l });
    fn({ kind: "state", state: this.state() });
    return () => this.listeners.delete(fn);
  }

  state(): ManualState {
    const t = this.session.ctx.time.now();
    const info = (() => {
      try {
        return this.session.ctx.scenario.info();
      } catch {
        return null;
      }
    })();
    const rawOptsMeta = (info?.options as Record<string, unknown> | undefined) ?? {};
    const optionsMeta: Record<string, OptionMeta> = {};
    for (const [k, v] of Object.entries(rawOptsMeta)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const meta: OptionMeta = {};
      if (o.name !== undefined) meta.name = o.name as OptionMeta["name"];
      if (o.desc !== undefined) meta.desc = o.desc as OptionMeta["desc"];
      if (typeof o.type === "string") meta.type = o.type;
      if (typeof o.formType === "string") meta.formType = o.formType;
      if (typeof o.minValue === "number") meta.minValue = o.minValue;
      if (typeof o.maxValue === "number") meta.maxValue = o.maxValue;
      if (typeof o.minStep === "number") meta.minStep = o.minStep;
      if (o.values !== undefined) meta.values = o.values;
      optionsMeta[k] = meta;
    }
    return {
      id: this.id,
      scenarioName: this.scenarioName,
      createdAt: this.createdAt,
      targetAccessoryId: this.targetAccessoryId,
      options: { ...this.options },
      optionsMeta,
      variables: { ...this.variables },
      time: {
        iso: new Date(t).toISOString(),
        ms: t,
        sunrise: null,
        sunset: null,
      },
      recording: { active: this.recording, actions: [...this.recorded] },
      rooms: this.session.ctx.hub.raw.getRooms().map((r) => ({
        id: (r as unknown as { id: number }).id,
        name: r.getName(),
      })),
      accessories: this.session.ctx.hub.raw.getAccessories().map((a) => this.snapshotAccessory(a as AccessoryMock)),
      schedulers: this.snapshotSchedulers(),
      logs: this.logs.slice(-500),
    };
  }

  /**
   * Собирает дефолты из info.options или info.variables сценария — берём поле
   * `.value` каждой записи. Используется при инициализации сессии и при reboot.
   */
  private collectInfoDefaults(kind: "options" | "variables"): Record<string, unknown> {
    let info: Record<string, unknown> | null = null;
    try {
      info = this.session.ctx.scenario.info();
    } catch {
      return {};
    }
    const raw = info?.[kind] as Record<string, unknown> | undefined;
    const out: Record<string, unknown> = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      const meta = v as Record<string, unknown>;
      if ("value" in meta) out[k] = meta.value;
    }
    return out;
  }

  private snapshotSchedulers(): ManualSchedulers {
    const now = this.session.ctx.time.now();
    const cron = this.session.cron.listScheduled().map((e) => {
      const item: ManualSchedulers["cron"][number] = {
        id: e.id,
        kind: e.kind,
        spec: e.spec,
        nextAtMs: e.nextAtMs,
      };
      if (e.offsetMinutes !== undefined) item.offsetMinutes = e.offsetMinutes;
      return item;
    });
    const timers = this.session.time.listTimers().map((t) => {
      const item: ManualSchedulers["timers"][number] = {
        id: t.id,
        dueAt: t.dueAt,
        inMs: Math.max(0, t.dueAt - now),
      };
      if (t.intervalMs !== undefined) item.intervalMs = t.intervalMs;
      return item;
    });
    const subscriptions = this.session.subs.list();
    return { cron, timers, subscriptions };
  }

  setChar(aid: number, cid: number, value: unknown): void {
    const char = this.findChar(aid, cid);
    if (!char) throw new Error(`Char ${aid}.?.${cid} not found`);
    const svc = char.getService() as ServiceMock;
    if (this.recording) {
      this.recorded.push({
        kind: "setChar",
        ts: Date.now(),
        aid,
        sid: svc.id,
        cid,
        hc: String(char.getType()),
        value,
      });
    }
    // char.setValue → SubscriptionManager.fireChange → попадает в нашу
    // scenarioSubscription, которая фильтрует по info.sourceServices/sourceCharacteristics
    // и вызывает trigger ровно как в реальном хабе. Не дёргаем runTrigger явно,
    // чтобы избежать двойных вызовов.
    // Перед setValue выставляем начальный контекст "C[...] <- WEB[...]_ts",
    // чтобы isSelfChangeByContext в сценарии получил полную цепочку.
    const savedContext = this.currentContext;
    this.currentContext = this.webContextFor(char);
    try {
      char.setValue(value);
    } finally {
      this.currentContext = savedContext;
    }
    this.emitState();
  }

  setOption(name: string, value: unknown): void {
    this.options[name] = value;
    if (this.recording) this.recorded.push({ kind: "setOption", ts: Date.now(), name, value });
    this.emitState();
  }

  setVariable(name: string, value: unknown): void {
    this.variables[name] = value;
    if (this.recording) this.recorded.push({ kind: "setVariable", ts: Date.now(), name, value });
    this.emitState();
  }

  setTime(opts: { iso?: string; advanceMs?: number }): void {
    if (opts.iso) {
      this.session.ctx.time.set(opts.iso);
    } else if (typeof opts.advanceMs === "number" && opts.advanceMs > 0) {
      this.session.ctx.time.tick(opts.advanceMs);
    }
    if (this.recording) {
      const rec: ManualAction = { kind: "time", ts: Date.now() };
      if (opts.iso) rec.iso = opts.iso;
      if (typeof opts.advanceMs === "number") rec.advanceMs = opts.advanceMs;
      this.recorded.push(rec);
    }
    this.emitState();
  }

  setSun(opts: { sunrise?: string; sunset?: string }): void {
    if (opts.sunrise) this.session.ctx.sun.setSunrise(opts.sunrise);
    if (opts.sunset) this.session.ctx.sun.setSunset(opts.sunset);
    if (this.recording) {
      const rec: ManualAction = { kind: "sun", ts: Date.now() };
      if (opts.sunrise) rec.sunrise = opts.sunrise;
      if (opts.sunset) rec.sunset = opts.sunset;
      this.recorded.push(rec);
    }
    this.emitState();
  }

  addRoom(name: string): void {
    this.session.ctx.hub.addRoom({ name });
    if (this.recording) this.recorded.push({ kind: "addRoom", ts: Date.now(), name });
    this.emitState();
  }

  addAccessory(a: PresetAccessory): void {
    const { target, ...rest } = a;
    this.session.ctx.hub.addAccessory(rest);
    if (target) this.targetAccessoryId = a.id;
    if (this.recording) this.recorded.push({ kind: "addAccessory", ts: Date.now(), accessory: a });
    this.emitState();
  }

  addService(
    aid: number,
    service: {
      type: string;
      name?: string;
      characteristics?: { type: string; value?: unknown }[];
    },
  ): void {
    const acc = this.session.registry.getAccessory(aid);
    if (!acc) throw new Error(`Accessory ${aid} not found`);
    const fixture: ServiceFixture = {
      type: service.type as HS,
      ...(service.name !== undefined ? { name: service.name } : {}),
      characteristics: (service.characteristics ?? []).map((c) => ({
        type: c.type as HC,
        ...(c.value !== undefined ? { value: c.value } : {}),
      })),
    };
    this.session.fixtureLoader.addServiceTo(acc, fixture);
    if (this.recording) this.recorded.push({ kind: "addService", ts: Date.now(), aid, service });
    this.emitState();
  }

  addCharacteristic(aid: number, sid: number, char: { type: string; value?: unknown }): void {
    const acc = this.session.registry.getAccessory(aid);
    if (!acc) throw new Error(`Accessory ${aid} not found`);
    const svc = acc.getServiceMocks().find((s) => s.id === sid);
    if (!svc) throw new Error(`Service ${aid}.${sid} not found`);
    const fixture: CharacteristicFixture = {
      type: char.type as HC,
      ...(char.value !== undefined ? { value: char.value } : {}),
    };
    this.session.fixtureLoader.addCharacteristicTo(acc, svc, fixture);
    if (this.recording) this.recorded.push({ kind: "addChar", ts: Date.now(), aid, sid, char });
    this.emitState();
  }

  removeRoom(name: string): void {
    const ok = this.session.registry.removeRoom(name);
    if (!ok) throw new Error(`Комната "${name}" не найдена`);
    if (this.recording) this.recorded.push({ kind: "removeRoom", ts: Date.now(), name });
    this.emitState();
  }

  removeAccessory(aid: number): void {
    const ok = this.session.registry.removeAccessory(aid);
    if (!ok) throw new Error(`Устройство #${aid} не найдено`);
    if (this.targetAccessoryId === aid) this.targetAccessoryId = null;
    if (this.recording) this.recorded.push({ kind: "removeAccessory", ts: Date.now(), aid });
    this.emitState();
  }

  removeService(aid: number, sid: number): void {
    const acc = this.session.registry.getAccessory(aid);
    if (!acc) throw new Error(`Устройство #${aid} не найдено`);
    const ok = acc.removeService(sid);
    if (!ok) throw new Error(`Сервис ${aid}.${sid} не найден`);
    if (this.recording) this.recorded.push({ kind: "removeService", ts: Date.now(), aid, sid });
    this.emitState();
  }

  removeCharacteristic(aid: number, sid: number, cid: number): void {
    const acc = this.session.registry.getAccessory(aid);
    if (!acc) throw new Error(`Устройство #${aid} не найдено`);
    const svc = acc.getServiceMocks().find((s) => s.id === sid);
    if (!svc) throw new Error(`Сервис ${aid}.${sid} не найден`);
    const ok = svc.removeCharacteristic(cid);
    if (!ok) throw new Error(`Характеристика ${aid}.${sid}.${cid} не найдена`);
    if (this.recording) this.recorded.push({ kind: "removeChar", ts: Date.now(), aid, sid, cid });
    this.emitState();
  }

  /**
   * Имитация перезагрузки хаба: variables (local + globalScope) очищаются,
   * подписки/cron сбрасываются, исходники сценария загружаются заново
   * (top-level state глобальных пересоздаётся), время продвигается +5 минут,
   * если есть target — re-onStart.
   */
  rebootHub(): void {
    this.session.ctx.variables.resetLocal();
    this.session.ctx.variables.resetGlobal();
    this.session.dispose(); // subs.reset + cron.reset
    for (const f of this.sources.globals) {
      this.session.sandbox.load({ filename: f.file, source: f.source });
    }
    for (const f of this.sources.logic) {
      this.session.sandbox.load({ filename: f.file, source: f.source });
    }
    // Перечитываем info-дефолты variables (если глобальные сценарии успели
    // переопределить info — учтём). Опции пользователя сохраняем.
    this.variables = this.collectInfoDefaults("variables");
    // subs.reset() в dispose() удалил scenarioSubscription — переустанавливаем.
    this.installScenarioSubscription();
    this.session.ctx.time.tick(5 * 60_000);
    this.pushLog({
      level: "info",
      message: "🔁 Перезагрузка хаба: variables очищены, время +5 минут",
      ts: Date.now(),
    });
    this.triggerOnStart();
    if (this.recording) this.recorded.push({ kind: "reboot", ts: Date.now() });
    this.emitState();
  }

  trigger(aid: number, cid: number): void {
    const char = this.findChar(aid, cid);
    if (!char) throw new Error(`Char ${aid}.?.${cid} not found`);
    this.runTrigger(char, char.getValue());
    if (this.recording) this.recorded.push({ kind: "trigger", ts: Date.now(), aid, cid });
    this.emitState();
  }

  setRecording(on: boolean): void {
    this.recording = on;
    this.emitState();
  }

  clearRecording(): void {
    this.recorded.length = 0;
    this.emitState();
  }

  recordedActions(): ManualAction[] {
    return [...this.recorded];
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.session.dispose();
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) {
      try {
        l({ kind: "closed" });
      } catch {
        /* ignore */
      }
    }
    this.listeners.clear();
  }

  private runTrigger(source: CharacteristicMock, value: unknown, context: string = "manual"): void {
    try {
      const start = performance.now();
      this.session.ctx.scenario.run({
        source,
        value,
        variables: this.variables,
        options: this.options,
        context,
      });
      this.pushLog({
        level: "info",
        message: `trigger(${source.getType()}, ${JSON.stringify(value)}, ${JSON.stringify(context)}) → ${(performance.now() - start).toFixed(1)}ms`,
        ts: Date.now(),
      });
    } catch (err) {
      this.pushLog({
        level: "error",
        message: `trigger throw: ${(err as Error)?.message ?? String(err)}`,
        ts: Date.now(),
      });
    }
  }

  /**
   * Подписаться через SubscriptionManager на изменения характеристик, попадающих
   * в info.sourceServices × info.sourceCharacteristics. На каждое такое
   * изменение вызывается scenario.trigger() — это эмулирует поведение хаба,
   * который сам дергает trigger у логического сценария при изменении
   * источника. Подписка переустанавливается при rebootHub() (после subs.reset).
   */
  private installScenarioSubscription(): void {
    let info: Record<string, unknown> | null = null;
    try {
      info = this.session.ctx.scenario.info();
    } catch {
      return;
    }
    if (!info) return;
    const hs = Array.isArray(info.sourceServices) ? (info.sourceServices as string[]) : [];
    const hc = Array.isArray(info.sourceCharacteristics)
      ? (info.sourceCharacteristics as string[])
      : [];
    if (hs.length === 0 && hc.length === 0) return;
    this.session.subs.subscribeWithCondition(
      "",
      "",
      hs as unknown as never[],
      hc as unknown as never[],
      (source, value) => {
        const ch = source as CharacteristicMock;
        const prev = this.currentContext;
        const cLink = this.charLink(ch);
        // Если предыдущее звено уже описывает именно эту характеристику,
        // не дублируем C[...]. Иначе добавляем перед текущей цепочкой.
        const base = prev
          ? prev.startsWith(cLink + " ") || prev.startsWith(cLink)
            ? prev
            : `${cLink} <- ${prev}`
          : `${cLink} <- WEB[ScenarioSimulator]_${Date.now()}`;
        const next = `${this.logicLink(ch)} <- ${base}`;
        const saved = this.currentContext;
        this.currentContext = next;
        try {
          this.runTrigger(ch, value, next);
        } finally {
          this.currentContext = saved;
        }
      },
    );
  }

  /** Сегмент `C[aid.sid.cid HS.HC]` для звена цепочки. */
  private charLink(char: CharacteristicMock): string {
    const acc = char.getAccessory() as unknown as { id: number };
    const svc = char.getService() as unknown as { id: number };
    return `C[${acc.id}.${svc.id}.${char.id} ${String(char.getService().getType())}.${String(char.getType())}]`;
  }

  /** Сегмент `LOGIC[scenario_Service aid.sid]` — наша «текущая логика». */
  private logicLink(char: CharacteristicMock): string {
    const acc = char.getAccessory() as unknown as { id: number };
    const svc = char.getService() as unknown as { id: number };
    const name = this.scenarioName.replace(/\s+/g, "_");
    return `LOGIC[${name}_Service ${acc.id}.${svc.id}]`;
  }

  /** WEB-источник для setChar из UI: первое звено цепочки. */
  private webContextFor(char: CharacteristicMock): string {
    return `${this.charLink(char)} <- WEB[ScenarioSimulator]_${Date.now()}`;
  }

  /**
   * Эмулирует поведение реального хаба: если у сценария `info.onStart === true`,
   * хаб вызывает `trigger(source, value, variables, options, "HUB[OnStart]")`
   * при загрузке/перезагрузке. Source — первая характеристика target-устройства.
   * Возвращает true, если триггер был вызван.
   */
  private triggerOnStart(): boolean {
    if (this.targetAccessoryId === null) return false;
    let info: Record<string, unknown> | null = null;
    try {
      info = this.session.ctx.scenario.info();
    } catch {
      info = null;
    }
    if (!info || info.onStart !== true) return false;
    const acc = this.session.ctx.hub.raw.getAccessory(this.targetAccessoryId) as AccessoryMock | null;
    if (!acc) return false;
    const source = pickOnStartSource(acc, info);
    if (!source) return false;
    this.runTrigger(source, source.getValue(), "HUB[OnStart]");
    return true;
  }

  private findChar(aid: number, cid: number): CharacteristicMock | null {
    return (this.session.ctx.hub.raw.getCharacteristic(aid, cid) as CharacteristicMock | null) ?? null;
  }

  private snapshotAccessory(acc: AccessoryMock): ManualAccessorySnapshot {
    const svcs = (acc as unknown as { getServiceMocks?: () => ServiceMock[] }).getServiceMocks?.() ?? [];
    return {
      id: acc.id,
      name: acc.getName(),
      room: acc.getRoom()?.getName() ?? null,
      target: acc.id === this.targetAccessoryId,
      services: svcs.map((s) => this.snapshotService(s)),
    };
  }

  private snapshotService(s: ServiceMock): ManualServiceSnapshot {
    const chars = s.getCharacteristicMocks().map((c) => this.snapshotChar(c));
    const primary = pickPrimary(chars);
    return {
      id: s.id,
      type: String(s.getType()),
      name: s.getName(),
      primary,
      hasBoolean: chars.some((c) => c.isBoolean),
      characteristics: chars,
    };
  }

  private snapshotChar(c: CharacteristicMock): ManualCharSnapshot {
    const spec = c.spec;
    const hc = String(c.getType());
    const isBoolean = spec.format === "Boolean" || BOOLEAN_HC_HINTS.has(hc);
    const snap: ManualCharSnapshot = {
      id: c.id,
      type: hc,
      name: c.getName(),
      format: spec.format,
      value: c.getValue(),
      writable: spec.writable,
      readable: spec.readable,
      isBoolean,
    };
    if (typeof spec.minValue === "number") snap.minValue = spec.minValue;
    if (typeof spec.maxValue === "number") snap.maxValue = spec.maxValue;
    if (typeof spec.minStep === "number") snap.minStep = spec.minStep;
    if (Array.isArray(spec.validValues) && spec.validValues.length > 0) snap.validValues = spec.validValues;
    if (Array.isArray(spec.validValueDetails) && spec.validValueDetails.length > 0) {
      snap.validValueDetails = spec.validValueDetails;
    }
    return snap;
  }

  private pushLog(entry: ManualLog): void {
    this.logs.push(entry);
    if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000);
    for (const l of this.listeners) {
      try {
        l({ kind: "log", entry });
      } catch {
        /* ignore */
      }
    }
  }

  private emitState(): void {
    const s = this.state();
    for (const l of this.listeners) {
      try {
        l({ kind: "state", state: s });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Источник для onStart-trigger: характеристика, к которой реально привязан
 * сценарий (info.sourceServices + info.sourceCharacteristics). Если в info нет
 * — берём первый писабельный сервис, кроме AccessoryInformation.
 */
function pickOnStartSource(acc: AccessoryMock, info: Record<string, unknown>): CharacteristicMock | null {
  const svcs = acc.getServiceMocks();
  const wantedSvc = Array.isArray(info.sourceServices) ? (info.sourceServices as string[]) : [];
  const wantedChar = Array.isArray(info.sourceCharacteristics)
    ? (info.sourceCharacteristics as string[])
    : [];

  const matchByInfo = (): CharacteristicMock | null => {
    for (const s of svcs) {
      if (wantedSvc.length > 0 && !wantedSvc.includes(String(s.getType()))) continue;
      for (const c of s.getCharacteristicMocks()) {
        if (wantedChar.length === 0 || wantedChar.includes(String(c.getType()))) return c;
      }
    }
    return null;
  };
  const matchByHeuristic = (): CharacteristicMock | null => {
    for (const s of svcs) {
      if (String(s.getType()) === "AccessoryInformation") continue;
      const c = s.getCharacteristicMocks()[0];
      if (c) return c;
    }
    const first = svcs[0]?.getCharacteristicMocks()[0];
    return first ?? null;
  };
  return matchByInfo() ?? matchByHeuristic();
}

function pickPrimary(chars: ManualCharSnapshot[]): ManualCharSnapshot | null {
  if (chars.length === 0) return null;
  // Сначала пробуем булеву характеристику с записью, потом просто writable, иначе первую.
  const boolWritable = chars.find((c) => c.isBoolean && c.writable);
  if (boolWritable) return boolWritable;
  const writable = chars.find((c) => c.writable && c.type !== "Name");
  if (writable) return writable;
  const nonName = chars.find((c) => c.type !== "Name");
  return nonName ?? chars[0] ?? null;
}

export { CHAR_METADATA };
