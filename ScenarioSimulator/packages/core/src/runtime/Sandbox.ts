import * as vm from "node:vm";
import { parse, type Node } from "acorn";
import { Validator, type ValidationResult, type ValidatorOptions } from "./Validator.js";

export type SandboxFile = {
  filename: string;
  source: string;
};

export type SandboxOptions = {
  context: vm.Context;
  validator?: ValidatorOptions;
  /** Таймаут любого вызова в vm (мс). */
  vmTimeoutMs?: number;
};

export type ValidationFailure = {
  filename: string;
  result: ValidationResult;
};

export class Sandbox {
  private readonly validator: Validator;
  private readonly loadedFiles: SandboxFile[] = [];

  constructor(private readonly options: SandboxOptions) {
    this.validator = new Validator(options.validator ?? { mode: "es5+" });
  }

  /**
   * Валидирует и загружает один скрипт в vm-контекст. Возвращает null
   * при успехе или объект с issues — при ошибке.
   */
  load(file: SandboxFile): ValidationFailure | null {
    const result = this.validator.validate(file.source);
    if (!result.valid) {
      return { filename: file.filename, result };
    }
    const exported = Sandbox.extractTopLevelNames(file.source);
    // Оборачиваем в IIFE для изоляции lexical scope: реальный Nashorn
    // даёт каждому сценарию свой scope, поэтому `const X = ...` в двух
    // разных файлах не конфликтуют. V8 же в одном vm-контексте бросает
    // SyntaxError "Identifier already declared". IIFE решает это.
    //
    // Экспортируем top-level имена в globalThis и в GlobalVariables/global,
    // чтобы:
    //   - sandbox.callExported("trigger") нашёл функцию;
    //   - логический сценарий мог обратиться к `global.foo(...)` из глобального.
    const exportBody = exported
      .map((n) => `if(typeof ${n}!=="undefined"){globalThis[${JSON.stringify(n)}]=${n};if(globalThis.GlobalVariables)globalThis.GlobalVariables[${JSON.stringify(n)}]=${n};}`)
      .join("");
    const wrapped = `(function(){\n${file.source}\ntry{${exportBody}}catch(_e){}\n}).call(globalThis);`;
    const script = new vm.Script(wrapped, { filename: file.filename });
    script.runInContext(this.options.context, {
      timeout: this.options.vmTimeoutMs,
      displayErrors: true,
    });
    this.loadedFiles.push(file);
    return null;
  }

  /**
   * Собирает имена `function`/`var`/`let`/`const`, объявленные на верхнем
   * уровне. Они дописываются в `globalThis` после исполнения, чтобы другие
   * скрипты и тесты могли их видеть — это эмулирует поведение Nashorn,
   * где сценарии шарят глобальные имена.
   */
  private static extractTopLevelNames(source: string): string[] {
    let ast: Node;
    try {
      ast = parse(source, { ecmaVersion: 2020, sourceType: "script", allowReturnOutsideFunction: true }) as Node;
    } catch {
      return [];
    }
    const program = ast as Node & { body: Array<Node & { type: string }> };
    const names = new Set<string>();
    for (const stmt of program.body) {
      if (stmt.type === "FunctionDeclaration") {
        const fn = stmt as Node & { id?: { name?: string } };
        if (fn.id?.name) names.add(fn.id.name);
      } else if (stmt.type === "VariableDeclaration") {
        const decl = stmt as Node & { declarations: Array<{ id: { type: string; name?: string } }> };
        for (const d of decl.declarations) {
          if (d.id.type === "Identifier" && d.id.name) names.add(d.id.name);
        }
      }
    }
    return [...names];
  }

  /** Загрузить несколько файлов подряд, останавливаясь на первой ошибке. */
  loadAll(files: SandboxFile[]): ValidationFailure | null {
    for (const f of files) {
      const fail = this.load(f);
      if (fail) return fail;
    }
    return null;
  }

  /** Вызвать функцию из vm-контекста по имени. */
  callExported(name: string, args: unknown[] = []): unknown {
    const fn = (this.options.context as Record<string, unknown>)[name];
    if (typeof fn !== "function") {
      throw new Error(`No exported function "${name}" in scenario context`);
    }
    return (fn as (...a: unknown[]) => unknown).apply(undefined, args);
  }

  /** Вызвать trigger(source, value, variables, options, context) сценария. */
  invokeTrigger(args: unknown[]): unknown {
    return this.callExported("trigger", args);
  }

  /** Вызвать compute(...) сценария. */
  invokeCompute(args: unknown[]): unknown {
    return this.callExported("compute", args);
  }

  /** Прочитать значение `info` (метаданные сценария) — это plain object. */
  readInfo(): Record<string, unknown> | null {
    const info = (this.options.context as Record<string, unknown>).info;
    return info && typeof info === "object" ? (info as Record<string, unknown>) : null;
  }

  /** Список файлов, успешно загруженных в контекст. */
  getLoadedFiles(): SandboxFile[] {
    return [...this.loadedFiles];
  }

  /** Доступ к низкоуровневому контексту — для тестов и инспекции. */
  context(): vm.Context {
    return this.options.context;
  }
}
