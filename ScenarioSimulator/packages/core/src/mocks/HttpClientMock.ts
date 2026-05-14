import { spawnSync } from "node:child_process";
import type { HttpClient, HttpRequest, HttpResponse } from "../types/api.js";
import type { HttpRecorder, HttpRequestRecord } from "../capture/HttpRecorder.js";
import type { HttpMatcher, HttpResponseTemplate } from "../matchers/HttpMatcher.js";

/**
 * Делает синхронный HTTP-запрос через `curl`. Используется, когда
 * тест включил `passThrough()` — обычно для intеграционных тестов,
 * подтверждающих работу со внешним API (например, isdayoff.ru).
 *
 * Сценарий вызывает `HttpClient.GET(url).send()` синхронно — это
 * единственный способ дождаться реального ответа в синхронном API без
 * переписывания сценариев.
 */
function curlSync(record: HttpRequestRecord): HttpResponseTemplate {
  const args: string[] = ["-sS", "-X", record.method, "--max-time", "30"];
  for (const [k, v] of Object.entries(record.headers)) {
    args.push("-H", `${k}: ${v}`);
  }
  for (const [k, v] of Object.entries(record.cookies)) {
    args.push("--cookie", `${k}=${v}`);
  }
  if (record.body !== undefined) {
    args.push("--data-raw", record.body);
  } else if (record.form) {
    for (const [k, v] of Object.entries(record.form)) args.push("--data-urlencode", `${k}=${v}`);
  }
  args.push("-w", "\\n<<<STATUS:%{http_code}>>>");
  args.push(buildUrl(record));

  const result = spawnSync("curl", args, { encoding: "utf-8" });
  if (result.error) {
    return { status: 0, statusText: result.error.message, body: "" };
  }
  const raw = result.stdout ?? "";
  const m = raw.match(/\n<<<STATUS:(\d+)>>>$/);
  const status = m ? Number(m[1]) : 0;
  const body = m ? raw.slice(0, m.index) : raw;
  return { status, body };
}

function buildUrl(record: HttpRequestRecord): string {
  const q = Object.entries(record.query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  if (!q) return record.url;
  return record.url.includes("?") ? `${record.url}&${q}` : `${record.url}?${q}`;
}

class HttpResponseMock implements HttpResponse {
  constructor(
    private readonly request: HttpRequest,
    private readonly tpl: HttpResponseTemplate,
  ) {}
  back(): HttpRequest {
    return this.request;
  }
  getStatus(): number {
    return this.tpl.status ?? 200;
  }
  getStatusText(): string {
    return this.tpl.statusText ?? (this.tpl.status === 0 ? "No matcher" : "OK");
  }
  getHeaders(): Record<string, string> {
    return { ...(this.tpl.headers ?? {}) };
  }
  getCookies(): Record<string, string> {
    return {};
  }
  getBody(): string {
    return this.tpl.body ?? "";
  }
  getBinary(): number[] {
    return this.tpl.binary ?? [];
  }
  getHistory(): HttpResponse[] {
    return [];
  }
}

class HttpRequestMock implements HttpRequest {
  private state: {
    method: string;
    url: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    cookies: Record<string, string>;
    body?: string;
    form?: Record<string, string>;
  };

  constructor(
    method: string,
    url: string,
    private readonly recorder: HttpRecorder,
    private readonly matcher: HttpMatcher,
    private readonly clock: () => number,
    private readonly isPassThrough: () => boolean,
  ) {
    this.state = { method, url, query: {}, headers: {}, cookies: {} };
  }

  setURL(url: string): HttpRequest {
    this.state.url = String(url);
    return this;
  }
  queryString(name: string, value: unknown): HttpRequest {
    this.state.query[String(name)] = String(value);
    return this;
  }
  path(segment: string): HttpRequest {
    const u = this.state.url.endsWith("/") ? this.state.url.slice(0, -1) : this.state.url;
    const s = String(segment).startsWith("/") ? String(segment) : `/${segment}`;
    this.state.url = u + s;
    return this;
  }
  userInfo(_info: string): HttpRequest {
    return this;
  }
  port(num: number): HttpRequest {
    try {
      const u = new URL(this.state.url);
      u.port = String(num);
      this.state.url = u.toString();
    } catch {
      // ignore unparseable URL
    }
    return this;
  }
  header(name: string, value: unknown): HttpRequest {
    this.state.headers[String(name)] = String(value);
    return this;
  }
  cookie(name: string, value: string): HttpRequest {
    this.state.cookies[String(name)] = String(value);
    return this;
  }
  reset(name: string): HttpRequest {
    delete this.state.headers[String(name)];
    return this;
  }
  method(method: string): HttpRequest {
    this.state.method = String(method).toUpperCase();
    return this;
  }
  field(name: string, value: unknown): HttpRequest {
    this.state.form ??= {};
    this.state.form[String(name)] = String(value);
    return this;
  }
  fieldMultipart(name: string, value: unknown): HttpRequest {
    return this.field(name, value);
  }
  body(textOrArr: string | unknown[]): HttpRequest {
    this.state.body = Array.isArray(textOrArr) ? JSON.stringify(textOrArr) : String(textOrArr);
    return this;
  }
  timeout(_c: number, _r: number): HttpRequest {
    return this;
  }
  connectTimeout(_c: number): HttpRequest {
    return this;
  }
  readTimeout(_r: number): HttpRequest {
    return this;
  }
  noCheckCertificate(_f: boolean): HttpRequest {
    return this;
  }
  send(): HttpResponse {
    const record: HttpRequestRecord = {
      method: this.state.method,
      url: this.state.url,
      query: { ...this.state.query },
      headers: { ...this.state.headers },
      cookies: { ...this.state.cookies },
      body: this.state.body,
      form: this.state.form,
      ts: this.clock(),
    };
    this.recorder.push(record);
    const tpl = this.isPassThrough() ? curlSync(record) : this.matcher.resolve(record);
    return new HttpResponseMock(this, tpl);
  }
}

export class HttpClientMock implements HttpClient {
  private passThroughEnabled = false;

  constructor(
    private readonly recorder: HttpRecorder,
    private readonly matcher: HttpMatcher,
    private readonly clock: () => number,
  ) {}

  setPassThrough(enabled: boolean): void {
    this.passThroughEnabled = enabled;
  }

  isPassThrough(): boolean {
    return this.passThroughEnabled;
  }

  private make(method: string, url: string): HttpRequest {
    return new HttpRequestMock(method, url, this.recorder, this.matcher, this.clock, () => this.passThroughEnabled);
  }

  GET(url: string): HttpRequest {
    return this.make("GET", url);
  }
  POST(url: string): HttpRequest {
    return this.make("POST", url);
  }
  PUT(url: string): HttpRequest {
    return this.make("PUT", url);
  }
  HEAD(url: string): HttpRequest {
    return this.make("HEAD", url);
  }
  DELETE(url: string): HttpRequest {
    return this.make("DELETE", url);
  }
  OPTIONS(url: string): HttpRequest {
    return this.make("OPTIONS", url);
  }
  PATCH(url: string): HttpRequest {
    return this.make("PATCH", url);
  }
}
