import type { SSH, SSHSession } from "../types/api.js";
import type { SSHRecorder } from "../capture/SSHRecorder.js";
import type { SSHMatcher } from "../matchers/SSHMatcher.js";

class SSHSessionMock implements SSHSession {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly username: string,
    private readonly recorder: SSHRecorder,
    private readonly matcher: SSHMatcher,
  ) {}

  execute(command: string, timeout?: number): void {
    const result = this.matcher.resolve(command);
    this.recorder.push({
      host: this.host,
      port: this.port,
      username: this.username,
      command,
      timeout,
      kind: "execute",
      result,
    });
  }

  request(command: string, timeout?: number): string {
    const result = this.matcher.resolve(command);
    this.recorder.push({
      host: this.host,
      port: this.port,
      username: this.username,
      command,
      timeout,
      kind: "request",
      result,
    });
    return result;
  }
}

export class SSHMock implements SSH {
  private state = { host: "", port: 22, username: "" };

  constructor(private readonly recorder: SSHRecorder, private readonly matcher: SSHMatcher) {}

  host(host: string): SSH {
    this.state.host = String(host);
    return this;
  }
  port(port: number): SSH {
    this.state.port = Number(port);
    return this;
  }
  username(username: string): SSH {
    this.state.username = String(username);
    return this;
  }
  password(_password: string): SSH {
    return this;
  }
  connect(): SSHSession {
    return new SSHSessionMock(
      this.state.host,
      this.state.port,
      this.state.username,
      this.recorder,
      this.matcher,
    );
  }
}
