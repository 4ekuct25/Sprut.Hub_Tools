import type { Notifier, Notify, NotifyEntry } from "../types/api.js";
import type { NotifyCapture } from "../capture/NotifyCapture.js";
import { LogCapture } from "../capture/LogCapture.js";

class NotifyBuilder implements Notify {
  private imageData: Uint8Array | number[] | undefined;
  private silentFlag = false;
  private recipients: { channel: string; clients: string[] }[] = [];
  private debug: string | undefined;
  private sent = false;

  constructor(
    private readonly capture: NotifyCapture,
    private readonly text: string,
    private readonly textArgs: unknown[],
  ) {}

  image(image: Uint8Array | number[]): Notify {
    this.imageData = image;
    return this;
  }
  silent(silent: boolean): Notify {
    this.silentFlag = !!silent;
    return this;
  }
  to(index: string, ...clients: string[]): Notify {
    this.recipients.push({ channel: String(index), clients: clients.map(String) });
    return this;
  }
  debugText(text: string): Notify {
    this.debug = String(text);
    return this;
  }
  send(): void {
    if (this.sent) return;
    this.sent = true;
    const entry: NotifyEntry = {
      text: LogCapture.format(this.text, this.textArgs),
      args: this.textArgs,
      silent: this.silentFlag,
      recipients: this.recipients,
    };
    if (this.imageData !== undefined) entry.image = this.imageData;
    if (this.debug !== undefined) entry.debugText = this.debug;
    this.capture.push(entry);
  }
}

export class NotifierMock implements Notifier {
  constructor(private readonly capture: NotifyCapture) {}

  text(text: string, ...args: unknown[]): Notify {
    return new NotifyBuilder(this.capture, text, args);
  }
}
