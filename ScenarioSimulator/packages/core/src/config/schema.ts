import { z } from "zod";

export const ScenarioFilesSchema = z.object({
  globals: z.array(z.string()).default([]),
  logic: z.array(z.string()).default([]),
});

export const ExecutionSchema = z
  .object({
    timeoutMs: z.number().int().positive().default(5000),
    hookTimeoutMs: z.number().int().positive().default(10000),
    strictMode: z.enum(["off", "es5", "es5+"]).default("es5+"),
    encoding: z.enum(["utf-8", "cp1251"]).default("utf-8"),
    isolation: z.enum(["per-file", "per-test"]).default("per-test"),
  })
  .default({});

export const MocksSchema = z
  .object({
    http: z
      .object({
        defaultDelayMs: z.number().int().nonnegative().default(0),
      })
      .default({}),
    notify: z
      .object({
        captureToConsole: z.boolean().default(false),
      })
      .default({}),
    mail: z
      .object({
        drop: z.boolean().default(true),
      })
      .default({}),
    ssh: z
      .object({
        scriptedResponses: z.string().optional(),
      })
      .default({}),
  })
  .default({});

export const ScenarioConfigSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().optional(),
  scenario: ScenarioFilesSchema,
  tests: z.array(z.string()).default(["*.test.js"]),
  fixtures: z
    .object({
      accessories: z.string().optional(),
      rooms: z.string().optional(),
    })
    .optional(),
  execution: ExecutionSchema,
  mocks: MocksSchema,
  reporters: z.array(z.string()).optional(),
});

export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionSchema>;
