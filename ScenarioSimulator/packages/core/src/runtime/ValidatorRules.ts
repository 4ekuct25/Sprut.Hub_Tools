/**
 * Whitelist разрешённых конструкций (информативно). Фактически валидатор
 * работает по blacklist'у — но этот список служит документацией того,
 * что должно проходить.
 */
export const ALLOWED_ES6_FEATURES = [
  "ArrowFunctionExpression",
  "TemplateLiteral",
  "TaggedTemplateExpression",
  "VariableDeclaration(let,const)",
  "ForOfStatement",
  "new Map() / new Set()",
] as const;

/**
 * Блок-лист узлов AST, которые Nashorn в Sprut.Hub не исполнит. Сценарий,
 * содержащий любой из них, не сможет работать в хабе — поэтому валидатор
 * заваливает тест на этапе проверки, ещё до vm-исполнения.
 */
export const BLOCKED_NODE_TYPES = new Set<string>([
  "ClassDeclaration",
  "ClassExpression",
  "ImportDeclaration",
  "ImportExpression",
  "ImportDefaultSpecifier",
  "ImportNamespaceSpecifier",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration",
  "AwaitExpression",
  "YieldExpression",
  "MetaProperty",
  "ChainExpression",
  "SpreadElement",
  "RestElement",
]);

/**
 * Узлы паттернов проверяются отдельно, потому что они валидны в некоторых
 * контекстах (catch clause), но не в декларациях/параметрах — Nashorn
 * не поддерживает destructuring.
 */
export const PATTERN_NODE_TYPES = new Set<string>(["ObjectPattern", "ArrayPattern"]);

/**
 * Async-функции: AwaitExpression в теле уже блокируется, но сам флаг
 * async тоже нужно отвергать (генератор/async без await).
 */
export const ASYNC_KEYWORD = "async";
