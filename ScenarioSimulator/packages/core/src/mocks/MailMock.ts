import type { Mail } from "../types/api.js";
import type { MailRecorder, MailRecord } from "../capture/MailRecorder.js";

export class MailMock implements Mail {
  private state: Partial<MailRecord> = {};
  constructor(private readonly recorder: MailRecorder) {}

  host(host: string): Mail {
    this.state.host = String(host);
    return this;
  }
  port(port: number): Mail {
    this.state.port = Number(port);
    return this;
  }
  username(username: string): Mail {
    this.state.username = String(username);
    return this;
  }
  from(from: string): Mail {
    this.state.from = String(from);
    return this;
  }
  password(_password: string): Mail {
    return this;
  }
  to(to: string): Mail {
    this.state.to = String(to);
    return this;
  }
  subject(subject: string): Mail {
    this.state.subject = String(subject);
    return this;
  }
  body(body: string): Mail {
    this.state.body = String(body);
    return this;
  }
  send(): void {
    const r: MailRecord = {
      host: this.state.host ?? "",
      port: this.state.port ?? 0,
      username: this.state.username ?? "",
      from: this.state.from ?? "",
      to: this.state.to ?? "",
      subject: this.state.subject ?? "",
      body: this.state.body ?? "",
    };
    this.recorder.push(r);
    this.state = {};
  }
}
