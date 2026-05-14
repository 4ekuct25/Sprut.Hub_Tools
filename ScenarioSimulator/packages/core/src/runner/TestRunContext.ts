import { HC } from "../generated/HC.js";
import { HS } from "../generated/HS.js";
import type { AccessoryRegistry } from "../state/AccessoryRegistry.js";
import type { LogCapture } from "../capture/LogCapture.js";
import type { NotifyCapture } from "../capture/NotifyCapture.js";
import type { HttpRecorder } from "../capture/HttpRecorder.js";
import type { MailRecorder } from "../capture/MailRecorder.js";
import type { SSHRecorder } from "../capture/SSHRecorder.js";
import type { HttpMatcher } from "../matchers/HttpMatcher.js";
import type { SSHMatcher } from "../matchers/SSHMatcher.js";
import type { CronScheduler } from "../time/CronScheduler.js";
import type { TimeController } from "../time/TimeController.js";
import type { SunCalculator } from "../time/SunCalculator.js";
import type { VariableScope } from "../state/VariableScope.js";
import type { HubMock } from "../mocks/HubMock.js";
import type { FixtureLoader } from "../state/FixtureLoader.js";
import type { CharacteristicMock } from "../mocks/CharacteristicMock.js";
import type { AccessoryMock } from "../mocks/AccessoryMock.js";
import type { Sandbox } from "../runtime/Sandbox.js";

export type ScenarioInvoker = {
  /** Вызвать `trigger(source, value, variables, options, context)` сценария. */
  run(args: {
    source: CharacteristicMock | unknown;
    value?: unknown;
    variables?: Record<string, unknown>;
    options?: Record<string, unknown>;
    context?: unknown;
  }): unknown;
  /**
   * Вызвать `compute(source, value, variables, options, context)`.
   * Используется для логических сценариев с синхронной функцией compute,
   * возвращающей значение, которое хаб запишет в характеристику.
   */
  compute(args: {
    source: CharacteristicMock | unknown;
    value?: unknown;
    variables?: Record<string, unknown>;
    options?: Record<string, unknown>;
    context?: unknown;
  }): unknown;
  /** Вызвать функцию (обычно из глобального сценария) по имени. */
  call(name: string, args?: unknown[]): unknown;
  /** Доступ к глобальной функции из vm-контекста как к JS-функции. */
  global<T = unknown>(name: string): T;
  /** Доступ к мета-блоку `info` сценария. */
  info(): Record<string, unknown> | null;
};

export type AccessoryShortcuts = {
  /**
   * Возвращает аксессуар по id (с короткими хелперами `.char(hs, hc)`).
   * Бросает если аксессуара нет — это упрощает ассерты в тестах.
   */
  acc(id: number): AccessoryShortcut;
};

export type AccessoryShortcut = AccessoryMock & {
  char(hs: HS, hc: HC): CharacteristicMock;
};

export type HubFacade = AccessoryShortcuts & {
  addAccessory(fixture: Parameters<FixtureLoader["addAccessory"]>[0]): AccessoryMock;
  addRoom(fixture: Parameters<FixtureLoader["addRoom"]>[0]): ReturnType<FixtureLoader["addRoom"]>;
  /** Сырой объект Hub, как его видит сценарий (для прямого setCharacteristicValue и т.п.). */
  raw: HubMock;
};

export type TimeFacade = {
  now(): number;
  /** Продвинуть время на N миллисекунд (или строку "5s"/"2m"/"1h"). */
  tick(ms: number): void;
  advance(spec: number | string): void;
  set(iso: string): void;
  runAllTimers(): void;
  pendingCount(): number;
};

export type LogsFacade = {
  all(): ReturnType<LogCapture["tail"]>;
  byLevel(level: "message" | "info" | "warn" | "error"): ReturnType<LogCapture["byLevel"]>;
  containing(s: string): ReturnType<LogCapture["containing"]>;
  tail(n: number): ReturnType<LogCapture["tail"]>;
  clear(): void;
};

export type NotifyFacade = {
  sent: NotifyCapture["entries"];
  reset(): void;
};

export type HttpFacade = {
  requests: HttpRecorder["requests"];
  mock: HttpMatcher;
  /** Включить реальный HTTP через curl (для integration-тестов). */
  passThrough(enabled?: boolean): void;
  reset(): void;
};

export type MailFacade = {
  sent: MailRecorder["sent"];
  reset(): void;
};

export type SSHFacade = {
  calls: SSHRecorder["calls"];
  mock: SSHMatcher;
  reset(): void;
};

export type CronFacade = {
  listScheduled(): ReturnType<CronScheduler["listScheduled"]>;
  tickNow(): void;
};

export type SunFacade = {
  setSunrise(hhmm: string): void;
  setSunset(hhmm: string): void;
};

export type VariablesFacade = {
  global: Record<string, unknown>;
  local: Record<string, unknown>;
  resetGlobal(): void;
  resetLocal(): void;
};

export type TestRunContextValue = {
  hub: HubFacade;
  scenario: ScenarioInvoker;
  time: TimeFacade;
  logs: LogsFacade;
  notify: NotifyFacade;
  http: HttpFacade;
  mail: MailFacade;
  ssh: SSHFacade;
  cron: CronFacade;
  sun: SunFacade;
  variables: VariablesFacade;
  HC: typeof HC;
  HS: typeof HS;
};

export type TestRunContextDeps = {
  registry: AccessoryRegistry;
  fixtureLoader: FixtureLoader;
  hub: HubMock;
  time: TimeController;
  cron: CronScheduler;
  sun: SunCalculator;
  logs: LogCapture;
  notify: NotifyCapture;
  http: HttpRecorder;
  httpMatcher: HttpMatcher;
  httpClient: { setPassThrough(enabled: boolean): void };
  mail: MailRecorder;
  ssh: SSHRecorder;
  sshMatcher: SSHMatcher;
  scope: VariableScope;
  sandbox: Sandbox;
};

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i;

function parseDuration(spec: number | string): number {
  if (typeof spec === "number") return spec;
  const m = spec.match(DURATION_RE);
  if (!m) throw new Error(`Bad duration: ${spec}`);
  const value = Number(m[1]);
  const unit = (m[2] ?? "ms").toLowerCase();
  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return value;
  }
}

export function buildTestRunContext(deps: TestRunContextDeps): TestRunContextValue {
  const {
    registry,
    fixtureLoader,
    hub,
    time,
    cron,
    sun,
    logs,
    notify,
    http,
    httpMatcher,
    httpClient,
    mail,
    ssh,
    sshMatcher,
    scope,
    sandbox,
  } = deps;

  const decorate = (acc: AccessoryMock): AccessoryShortcut => {
    const shortcut = acc as AccessoryShortcut;
    if (!("char" in (acc as object) && typeof (acc as AccessoryShortcut).char === "function")) {
      shortcut.char = (hs: HS, hc: HC) => {
        const svc = acc.getService(hs);
        if (!svc) throw new Error(`Accessory ${acc.id}: no service ${hs}`);
        const ch = svc.getCharacteristic(hc);
        if (!ch) throw new Error(`Accessory ${acc.id} service ${hs}: no char ${hc}`);
        return ch as CharacteristicMock;
      };
    }
    return shortcut;
  };

  const hubFacade: HubFacade = {
    raw: hub,
    addAccessory: (fix) => decorate(fixtureLoader.addAccessory(fix)),
    addRoom: (fix) => fixtureLoader.addRoom(fix),
    acc: (id) => {
      const a = registry.getAccessory(id);
      if (!a) throw new Error(`No accessory ${id} in registry`);
      return decorate(a);
    },
  };

  const scenario: ScenarioInvoker = {
    run: ({ source, value, variables, options, context }) =>
      sandbox.invokeTrigger([source, value, variables ?? {}, options ?? {}, context ?? ""]),
    compute: ({ source, value, variables, options, context }) =>
      sandbox.invokeCompute([source, value, variables ?? {}, options ?? {}, context ?? ""]),
    call: (name, args) => sandbox.callExported(name, args ?? []),
    global: <T,>(name: string) => (sandbox.context() as Record<string, unknown>)[name] as T,
    info: () => sandbox.readInfo(),
  };

  const timeFacade: TimeFacade = {
    now: () => time.now(),
    tick: (ms) => time.advance(ms),
    advance: (spec) => time.advance(parseDuration(spec)),
    set: (iso) => time.setNow(new Date(iso).getTime()),
    runAllTimers: () => time.runAllTimers(),
    pendingCount: () => time.pendingCount(),
  };

  return {
    hub: hubFacade,
    scenario,
    time: timeFacade,
    logs: {
      all: () => logs.entries.slice(),
      byLevel: (l) => logs.byLevel(l),
      containing: (s) => logs.containing(s),
      tail: (n) => logs.tail(n),
      clear: () => logs.clear(),
    },
    notify: { sent: notify.entries, reset: () => notify.reset() },
    http: {
      requests: http.requests,
      mock: httpMatcher,
      passThrough: (enabled = true) => httpClient.setPassThrough(enabled),
      reset: () => http.reset(),
    },
    mail: { sent: mail.sent, reset: () => mail.reset() },
    ssh: { calls: ssh.calls, mock: sshMatcher, reset: () => ssh.reset() },
    cron: { listScheduled: () => cron.listScheduled(), tickNow: () => cron.tickNow() },
    sun: { setSunrise: (s) => sun.setSunrise(s), setSunset: (s) => sun.setSunset(s) },
    variables: {
      global: scope.globalVars,
      local: scope.localVars,
      resetGlobal: () => scope.resetGlobal(),
      resetLocal: () => scope.resetLocal(),
    },
    HC,
    HS,
  };
}
