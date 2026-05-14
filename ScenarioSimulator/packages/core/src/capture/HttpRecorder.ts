export type HttpRequestRecord = {
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body?: string;
  form?: Record<string, string>;
  ts: number;
};

export class HttpRecorder {
  readonly requests: HttpRequestRecord[] = [];

  push(r: HttpRequestRecord): void {
    this.requests.push(r);
  }

  reset(): void {
    this.requests.length = 0;
  }
}
