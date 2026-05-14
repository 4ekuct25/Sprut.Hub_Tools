export type SSHCall = {
  host: string;
  port: number;
  username: string;
  command: string;
  timeout?: number;
  kind: "execute" | "request";
  result?: string;
};

export class SSHRecorder {
  readonly calls: SSHCall[] = [];

  push(call: SSHCall): void {
    this.calls.push(call);
  }

  reset(): void {
    this.calls.length = 0;
  }
}
