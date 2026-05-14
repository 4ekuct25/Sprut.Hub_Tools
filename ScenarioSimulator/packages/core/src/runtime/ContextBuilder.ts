import * as vm from "node:vm";
import { HC } from "../generated/HC.js";
import { HS } from "../generated/HS.js";
import type { ConsoleMock } from "../mocks/ConsoleMock.js";
import type { HubMock } from "../mocks/HubMock.js";
import type { CronScheduler } from "../time/CronScheduler.js";
import type { TimerScheduler } from "../time/TimerScheduler.js";
import type { NotifierMock } from "../mocks/NotifyMock.js";
import type { HttpClientMock } from "../mocks/HttpClientMock.js";
import type { MailMock } from "../mocks/MailMock.js";
import type { SSHMock } from "../mocks/SSHMock.js";
import type { UtilsMock, UtilsNetMock } from "../mocks/UtilsMock.js";
import type { VariableScope } from "../state/VariableScope.js";
import { createDateProxy } from "../time/DateProxy.js";
import type { TimeController } from "../time/TimeController.js";

export type SprutGlobals = {
  hub: HubMock;
  cron: CronScheduler;
  timers: TimerScheduler;
  time: TimeController;
  consoleMock: ConsoleMock;
  notifier: NotifierMock;
  http: HttpClientMock;
  mail: MailMock;
  ssh: SSHMock;
  utils: UtilsMock;
  utilsNet: UtilsNetMock;
  scope: VariableScope;
};

export class ContextBuilder {
  build(g: SprutGlobals): vm.Context {
    const timerBindings = g.timers.bind();
    const ctx: Record<string, unknown> = {
      HC,
      HS,
      Hub: g.hub,
      Cron: g.cron,
      Notify: g.notifier,
      HttpClient: g.http,
      Mail: g.mail,
      SSH: g.ssh,
      Utils: g.utils,
      UtilsNet: g.utilsNet,
      console: g.consoleMock,
      log: g.consoleMock,
      setTimeout: timerBindings.setTimeout,
      setInterval: timerBindings.setInterval,
      clearTimeout: timerBindings.clearTimeout,
      clearInterval: timerBindings.clearInterval,
      clear: timerBindings.clear,
      GlobalVariables: g.scope.globalVars,
      LocalVariables: g.scope.localVars,
      global: g.scope.globalVars,
      Date: createDateProxy(g.time),
      Math,
      JSON,
      Map,
      Set,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      TypeError,
      RangeError,
      Promise: undefined,
      undefined: undefined,
      NaN,
      Infinity,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
    };
    // self-references so a scenario can call `global.x = ...` and read it back as GlobalVariables
    return vm.createContext(ctx);
  }
}
