import { z } from "zod";

export type ToolContext = {
  userId: string;
  runId: string;
  signal?: AbortSignal;
};

export type RegisteredTool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
  sanitize?: (output: TOutput) => unknown;
};

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register<TInput, TOutput>(tool: RegisteredTool<TInput, TOutput>) {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool as RegisteredTool);
  }

  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool is not registered: ${name}`);
    return tool;
  }

  definitions(names?: string[]) {
    const selected = names ? names.map((name) => this.get(name)) : [...this.tools.values()];
    return selected.map(({ name, description, inputSchema }) => ({
      name,
      description,
      parameters: z.toJSONSchema(inputSchema),
    }));
  }

  async execute(name: string, input: unknown, context: ToolContext) {
    const tool = this.get(name);
    const value = await tool.inputSchema.parseAsync(input);
    const result = await tool.execute(value, context);
    return sanitizeToolOutput(tool.sanitize ? tool.sanitize(result) : result);
  }
}

export function sanitizeToolOutput(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length > 100_000) return { truncated: true, content: text.slice(0, 100_000) };
  return JSON.parse(text.replace(/(sk-|ghp_|github_pat_|Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1[REDACTED]")) as unknown;
}

export const toolRegistry = new ToolRegistry();
