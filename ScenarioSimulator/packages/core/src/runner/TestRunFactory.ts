import type { LoadedConfig } from "../config/ConfigLoader.js";
import { HttpRecorder } from "../capture/HttpRecorder.js";
import { LogCapture } from "../capture/LogCapture.js";
import { MailRecorder } from "../capture/MailRecorder.js";
import { NotifyCapture } from "../capture/NotifyCapture.js";
import { SSHRecorder } from "../capture/SSHRecorder.js";
import { CharMetadataRegistry } from "../metadata/CharMetadataRegistry.js";
import { ValueCoercer } from "../metadata/ValueCoercer.js";
import { ConsoleMock } from "../mocks/ConsoleMock.js";
import { HttpClientMock } from "../mocks/HttpClientMock.js";
import { HubMock } from "../mocks/HubMock.js";
import { MailMock } from "../mocks/MailMock.js";
import { NotifierMock } from "../mocks/NotifyMock.js";
import { SSHMock } from "../mocks/SSHMock.js";
import { UtilsMock, UtilsNetMock } from "../mocks/UtilsMock.js";
import { ContextBuilder } from "../runtime/ContextBuilder.js";
import { Sandbox, type ValidationFailure } from "../runtime/Sandbox.js";
import { HttpMatcher } from "../matchers/HttpMatcher.js";
import { SSHMatcher } from "../matchers/SSHMatcher.js";
import { AccessoryRegistry } from "../state/AccessoryRegistry.js";
import { FixtureLoader } from "../state/FixtureLoader.js";
import { VariableScope } from "../state/VariableScope.js";
import { SubscriptionManager } from "../subscriptions/SubscriptionManager.js";
import { CronScheduler } from "../time/CronScheduler.js";
import { SunCalculator } from "../time/SunCalculator.js";
import { TimeController } from "../time/TimeController.js";
import { TimerScheduler } from "../time/TimerScheduler.js";
import {
  buildTestRunContext,
  type TestRunContextValue,
} from "./TestRunContext.js";
import type { ScenarioSources } from "./ScenarioLoader.js";

export type TestRunSession = {
  ctx: TestRunContextValue;
  sandbox: Sandbox;
  validationFailure: ValidationFailure | null;
  logs: LogCapture;
  /** FixtureLoader, чтобы внешние компоненты (manual mode) могли in-place
   *  добавлять сервисы/характеристики в уже зарегистрированные аксессуары. */
  fixtureLoader: FixtureLoader;
  /** Реестр устройств — для прямого доступа в ManualSession. */
  registry: AccessoryRegistry;
  /** Виртуальные часы — для listing активных setTimeout/Interval. */
  time: TimeController;
  /** Cron — для listing активных задач. */
  cron: CronScheduler;
  /** Подписки Hub.subscribe — listing для UI. */
  subs: SubscriptionManager;
  dispose(): void;
};

export type TestRunFactoryOptions = {
  config: LoadedConfig;
  sources: ScenarioSources;
  /** Зеркалить console сценария в реальный stdout (для отладки). */
  mirrorConsole?: boolean;
  /** Колбэк на каждую запись в LogCapture — для стрима логов в bus/SSE. */
  onLog?: (entry: { level: string; message: string; ts: number }) => void;
};

export class TestRunFactory {
  constructor(private readonly opts: TestRunFactoryOptions) {}

  /**
   * Создаёт независимый TestRunSession: свежие моки, vm-контекст,
   * загруженный сценарий. Используется для каждого теста (per-test isolation).
   */
  build(): TestRunSession {
    const time = new TimeController();
    const sun = new SunCalculator();
    const cron = new CronScheduler(time, sun);
    const timers = new TimerScheduler(time);
    const logs = new LogCapture(() => time.now());
    if (this.opts.onLog) logs.subscribe(this.opts.onLog);
    const mirror = this.opts.mirrorConsole
      ? {
          message: (f: string, ...a: unknown[]) => console.log(f, ...a),
          info: (f: string, ...a: unknown[]) => console.info(f, ...a),
          warn: (f: string, ...a: unknown[]) => console.warn(f, ...a),
          error: (f: string, ...a: unknown[]) => console.error(f, ...a),
        }
      : undefined;
    const consoleMock = new ConsoleMock(logs, mirror);
    const scope = new VariableScope();
    const metadata = CharMetadataRegistry.get();
    const coercer = new ValueCoercer();

    const registry = new AccessoryRegistry();
    const subs = new SubscriptionManager({
      onWarn: (m) => consoleMock.warn(m),
    });
    const hub = new HubMock(registry, subs);

    const fixtureLoader = new FixtureLoader({
      registry,
      metadata,
      coercer,
      hostFor: (charRef, service, accessory) => hub.hostFor(charRef, service, accessory),
    });

    const notify = new NotifyCapture();
    const notifier = new NotifierMock(notify);

    const http = new HttpRecorder();
    const httpMatcher = new HttpMatcher();
    const httpClient = new HttpClientMock(http, httpMatcher, () => time.now());

    const mail = new MailRecorder();
    const mailMock = new MailMock(mail);

    const ssh = new SSHRecorder();
    const sshMatcher = new SSHMatcher();
    const sshMock = new SSHMock(ssh, sshMatcher);

    const utils = new UtilsMock();
    const utilsNet = new UtilsNetMock();

    const ctxBuilder = new ContextBuilder();
    const vmContext = ctxBuilder.build({
      hub,
      cron,
      timers,
      time,
      consoleMock,
      notifier,
      http: httpClient,
      mail: mailMock,
      ssh: sshMock,
      utils,
      utilsNet,
      scope,
    });

    const sandbox = new Sandbox({
      context: vmContext,
      validator: { mode: this.opts.config.raw.execution.strictMode },
      vmTimeoutMs: this.opts.config.raw.execution.timeoutMs,
    });

    let validationFailure: ValidationFailure | null = null;

    // Загружаем сценарий в порядке: сначала глобальные, потом логические.
    for (const f of this.opts.sources.globals) {
      const r = sandbox.load({ filename: f.file, source: f.source });
      if (r) {
        validationFailure = r;
        break;
      }
    }
    if (!validationFailure) {
      for (const f of this.opts.sources.logic) {
        const r = sandbox.load({ filename: f.file, source: f.source });
        if (r) {
          validationFailure = r;
          break;
        }
      }
    }

    const ctx = buildTestRunContext({
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
    });

    return {
      ctx,
      sandbox,
      validationFailure,
      logs,
      fixtureLoader,
      registry,
      time,
      cron,
      subs,
      dispose: () => {
        subs.reset();
        cron.reset();
      },
    };
  }
}
