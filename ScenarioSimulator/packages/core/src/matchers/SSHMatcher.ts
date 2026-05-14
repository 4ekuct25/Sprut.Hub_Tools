export type SSHPredicate = (command: string) => boolean;

export type SSHMatch = {
  predicate: SSHPredicate;
  response: string;
};

export class SSHMatcher {
  private readonly matches: SSHMatch[] = [];
  private defaultResponse = "";

  onCommand(predicate: SSHPredicate | string | RegExp, response: string): this {
    const pred = SSHMatcher.toPredicate(predicate);
    this.matches.push({ predicate: pred, response });
    return this;
  }

  default(response: string): this {
    this.defaultResponse = response;
    return this;
  }

  resolve(command: string): string {
    for (const m of this.matches) {
      if (m.predicate(command)) return m.response;
    }
    return this.defaultResponse;
  }

  reset(): void {
    this.matches.length = 0;
    this.defaultResponse = "";
  }

  private static toPredicate(p: SSHPredicate | string | RegExp): SSHPredicate {
    if (typeof p === "function") return p;
    // Duck-typing: RegExp может быть создан в другом vm-realm (cross-realm
    // `instanceof RegExp` не работает), поэтому проверяем по форме объекта.
    if (
      p !== null &&
      typeof p === "object" &&
      typeof (p as { test?: unknown }).test === "function" &&
      typeof (p as { source?: unknown }).source === "string"
    ) {
      const rx = p as RegExp;
      return (c) => rx.test(c);
    }
    return (c) => c.includes(p as string);
  }
}
