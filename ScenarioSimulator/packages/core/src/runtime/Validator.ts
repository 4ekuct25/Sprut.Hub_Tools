import { parse, type Node } from "acorn";
import { simple as walkSimple } from "acorn-walk";
import {
  BLOCKED_NODE_TYPES,
  PATTERN_NODE_TYPES,
} from "./ValidatorRules.js";

export type ValidationIssue = {
  line: number;
  column: number;
  nodeType: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type ValidatorOptions = {
  /** "off" — пропускает любую проверку; "es5"/"es5+" — Nashorn-набор. */
  mode?: "off" | "es5" | "es5+";
};

export class Validator {
  constructor(private readonly options: ValidatorOptions = {}) {}

  validate(source: string): ValidationResult {
    if (this.options.mode === "off") {
      return { valid: true, issues: [] };
    }

    let ast: Node;
    try {
      ast = parse(source, {
        ecmaVersion: 2020,
        sourceType: "script",
        locations: true,
        allowReturnOutsideFunction: true,
      }) as Node;
    } catch (err) {
      const e = err as { message?: string; loc?: { line: number; column: number } };
      return {
        valid: false,
        issues: [
          {
            line: e.loc?.line ?? 1,
            column: e.loc?.column ?? 0,
            nodeType: "ParseError",
            message: e.message ?? String(err),
          },
        ],
      };
    }

    const issues: ValidationIssue[] = [];

    const visitor: Record<string, (node: Node) => void> = {};

    const addIssue = (node: Node, message: string): void => {
      const loc = (node as Node & { loc?: { start: { line: number; column: number } } }).loc;
      issues.push({
        line: loc?.start.line ?? 1,
        column: loc?.start.column ?? 0,
        nodeType: node.type,
        message,
      });
    };

    for (const blocked of BLOCKED_NODE_TYPES) {
      visitor[blocked] = (node) => {
        addIssue(node, `Forbidden in Nashorn ES5+: ${blocked}`);
      };
    }

    for (const pat of PATTERN_NODE_TYPES) {
      visitor[pat] = (node) => {
        addIssue(node, `Destructuring (${pat}) is not supported in Nashorn`);
      };
    }

    visitor.FunctionDeclaration = (node) => {
      const fn = node as Node & { async?: boolean; generator?: boolean };
      if (fn.async) addIssue(node, "Async functions are not supported in Nashorn");
      if (fn.generator) addIssue(node, "Generator functions are not supported in Nashorn");
    };
    visitor.FunctionExpression = visitor.FunctionDeclaration;
    visitor.ArrowFunctionExpression = (node) => {
      const fn = node as Node & { async?: boolean };
      if (fn.async) addIssue(node, "Async arrow functions are not supported in Nashorn");
    };

    walkSimple(ast as unknown as Parameters<typeof walkSimple>[0], visitor);

    return { valid: issues.length === 0, issues };
  }
}
