import type { HC } from "../generated/HC.js";
import type { HS } from "../generated/HS.js";

export interface Task {
  clear(): void;
}

export interface Log {
  message(format: string, ...args: unknown[]): void;
  info(format: string, ...args: unknown[]): void;
  warn(format: string, ...args: unknown[]): void;
  error(format: string, ...args: unknown[]): void;
}

export interface Room {
  getAccessories(): Accessory[];
  getName(): string;
  setName(name: string): void;
}

export interface Characteristic {
  getAccessory(): Accessory;
  getService(): Service;
  getValue(): unknown;
  setValue(value: unknown): void;
  toggle(): void;
  isStatusVisible(): boolean;
  setStatusVisible(statusVisible: boolean): void;
  isNotify(): boolean;
  setNotify(notify: boolean): void;
  getType(): HC;
  getUUID(): string;
  format(): string;
  getMinValue(): number;
  getMaxValue(): number;
  getMinStep(): number;
  getName(): string;
}

export interface Service {
  getAccessory(): Accessory;
  getCharacteristic(idOrType: number | HC): Characteristic | null;
  getCharacteristics(): Characteristic[];
  getType(): HS;
  isVisible(): boolean;
  setVisible(visible: boolean): void;
  getUUID(): string;
  getName(): string;
  setName(name: string): void;
}

export interface Accessory {
  getServices(visible?: boolean, hs?: HS): Service[];
  getService(idOrType: number | HS): Service | null;
  getCharacteristic(id: number): Characteristic | null;
  getRoom(): Room | null;
  getUUID(): string;
  getName(): string;
  setName(name: string): void;
  getModel(): string;
  getModelId(): string;
  getManufacturer(): string;
  getManufacturerId(): string;
  getSerial(): string;
  getFirmware(): string;
  getSnapshot(width?: number, height?: number): number[];
}

export interface Hub {
  getAccessory(id: number): Accessory | null;
  getAccessories(): Accessory[];
  getCharacteristicValue(aid: number, cid: number): unknown;
  setCharacteristicValue(aid: number, cid: number, value: unknown): void;
  toggleCharacteristicValue(aid: number, cid: number): void;
  getCharacteristic(aid: number, cid: number): Characteristic | null;
  getRooms(): Room[];
  subscribe(handler: (...args: unknown[]) => void, ...args: unknown[]): Task;
  subscribeWithCondition(
    cond: string,
    value: string,
    hs: HS[],
    hc: HC[],
    handler: (...args: unknown[]) => void,
    ...args: unknown[]
  ): Task;
}

export interface Cron {
  schedule(spec: string, handler: (...args: unknown[]) => void, ...args: unknown[]): Task;
  sunrise(spec: string, offset: number, handler: (...args: unknown[]) => void, ...args: unknown[]): Task;
  sunset(spec: string, offset: number, handler: (...args: unknown[]) => void, ...args: unknown[]): Task;
}

export interface HttpResponse {
  back(): HttpRequest;
  getStatus(): number;
  getStatusText(): string;
  getHeaders(): Record<string, string>;
  getCookies(): Record<string, string>;
  getBody(): string;
  getBinary(): number[];
  getHistory(): HttpResponse[];
}

export interface HttpRequest {
  setURL(url: string): HttpRequest;
  queryString(name: string, value: unknown): HttpRequest;
  path(segment: string): HttpRequest;
  userInfo(info: string): HttpRequest;
  port(num: number): HttpRequest;
  header(name: string, value: unknown): HttpRequest;
  cookie(name: string, value: string): HttpRequest;
  reset(name: string): HttpRequest;
  method(method: string): HttpRequest;
  field(name: string, value: unknown): HttpRequest;
  fieldMultipart(name: string, value: unknown): HttpRequest;
  body(textOrArr: string | unknown[]): HttpRequest;
  timeout(connectTimeout: number, readTimeout: number): HttpRequest;
  connectTimeout(connectTimeout: number): HttpRequest;
  readTimeout(readTimeout: number): HttpRequest;
  noCheckCertificate(flag: boolean): HttpRequest;
  send(): HttpResponse;
}

export interface HttpClient {
  GET(url: string): HttpRequest;
  POST(url: string): HttpRequest;
  PUT(url: string): HttpRequest;
  HEAD(url: string): HttpRequest;
  DELETE(url: string): HttpRequest;
  OPTIONS(url: string): HttpRequest;
  PATCH(url: string): HttpRequest;
}

export interface Notify {
  image(image: Uint8Array | number[]): Notify;
  silent(silent: boolean): Notify;
  to(index: string, ...clients: string[]): Notify;
  debugText(text: string): Notify;
  send(): void;
}

export interface Notifier {
  text(text: string, ...args: unknown[]): Notify;
}

export interface Mail {
  host(host: string): Mail;
  port(port: number): Mail;
  username(username: string): Mail;
  from(from: string): Mail;
  password(password: string): Mail;
  to(to: string): Mail;
  subject(subject: string): Mail;
  body(body: string): Mail;
  send(): void;
}

export interface SSHSession {
  execute(command: string, timeout?: number): void;
  request(command: string, timeout?: number): string;
}

export interface SSH {
  host(host: string): SSH;
  port(port: number): SSH;
  username(username: string): SSH;
  password(password: string): SSH;
  connect(): SSHSession;
}

export interface Utils {
  uuid(): string;
}

export interface UtilsNet {
  wakeOnLan(mac: string): void;
  getMacAddress(host: string): string;
  ping(host: string): boolean;
}

export type LogLevel = "message" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  args: unknown[];
  ts: number;
};

export type NotifyEntry = {
  text: string;
  args: unknown[];
  image?: Uint8Array | number[];
  silent: boolean;
  recipients: { channel: string; clients: string[] }[];
  debugText?: string;
};
