import type { HttpRequestRecord } from "../capture/HttpRecorder.js";

export type HttpResponseTemplate = {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  binary?: number[];
};

export type HttpPredicate = (req: HttpRequestRecord) => boolean;

type Rule = { predicate: HttpPredicate; response: HttpResponseTemplate };

export class HttpMatcher {
  private rules: Rule[] = [];
  private fallback: HttpResponseTemplate | null = null;

  on(predicate: HttpPredicate, response: HttpResponseTemplate): this {
    this.rules.push({ predicate, response });
    return this;
  }

  onMethodUrl(method: string, urlPattern: string | RegExp, response: HttpResponseTemplate): this {
    const isRegex = HttpMatcher.isRegex(urlPattern);
    const pred: HttpPredicate = (req) => {
      if (req.method.toUpperCase() !== method.toUpperCase()) return false;
      if (isRegex) return (urlPattern as RegExp).test(req.url);
      return req.url === urlPattern || req.url.startsWith(urlPattern as string);
    };
    return this.on(pred, response);
  }

  /**
   * Cross-realm `instanceof RegExp` не работает: RegExp создан в vm-контексте
   * теста, а matcher живёт в Node-realm. Используем duck-typing —
   * наличие `.test` и `.source` достаточно.
   */
  private static isRegex(p: unknown): p is RegExp {
    if (p instanceof RegExp) return true;
    if (p === null || typeof p !== "object") return false;
    const obj = p as { test?: unknown; source?: unknown };
    return typeof obj.test === "function" && typeof obj.source === "string";
  }

  onGet(urlPattern: string | RegExp, response: HttpResponseTemplate): this {
    return this.onMethodUrl("GET", urlPattern, response);
  }
  onPost(urlPattern: string | RegExp, response: HttpResponseTemplate): this {
    return this.onMethodUrl("POST", urlPattern, response);
  }
  onPut(urlPattern: string | RegExp, response: HttpResponseTemplate): this {
    return this.onMethodUrl("PUT", urlPattern, response);
  }
  onDelete(urlPattern: string | RegExp, response: HttpResponseTemplate): this {
    return this.onMethodUrl("DELETE", urlPattern, response);
  }

  default(response: HttpResponseTemplate): this {
    this.fallback = response;
    return this;
  }

  resolve(req: HttpRequestRecord): HttpResponseTemplate {
    for (const r of this.rules) if (r.predicate(req)) return r.response;
    return this.fallback ?? { status: 0, body: "" };
  }

  reset(): void {
    this.rules.length = 0;
    this.fallback = null;
  }
}
