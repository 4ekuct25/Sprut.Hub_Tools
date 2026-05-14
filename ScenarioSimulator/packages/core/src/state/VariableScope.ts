export type VarBag = Record<string, unknown>;

export class VariableScope {
  readonly globalVars: VarBag = {};
  readonly localVars: VarBag = {};

  resetGlobal(): void {
    this.clearBag(this.globalVars);
  }

  resetLocal(): void {
    this.clearBag(this.localVars);
  }

  private clearBag(bag: VarBag): void {
    for (const key of Object.keys(bag)) delete bag[key];
  }
}
