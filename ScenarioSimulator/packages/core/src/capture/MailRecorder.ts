export type MailRecord = {
  host: string;
  port: number;
  username: string;
  from: string;
  to: string;
  subject: string;
  body: string;
};

export class MailRecorder {
  readonly sent: MailRecord[] = [];

  push(r: MailRecord): void {
    this.sent.push(r);
  }

  reset(): void {
    this.sent.length = 0;
  }
}
