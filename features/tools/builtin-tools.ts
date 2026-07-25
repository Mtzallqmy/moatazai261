import { z } from "zod";
import { profileDataset } from "@/features/data-analysis/profiler";
import { retrievalService } from "@/features/rag/retrieval-service";
import { toolRegistry } from "./tool-registry";

let registered = false;
export function registerBuiltinTools() {
  if (registered) return;
  registered = true;
  toolRegistry.register({
    name: "knowledge.search",
    description: "Search the user's permitted files or knowledge base and return cited evidence.",
    inputSchema: z.object({ query: z.string().min(1).max(10_000), knowledgeBaseId: z.uuid().optional() }),
    execute: (input, context) => retrievalService.retrieve(context.userId, input.query, input.knowledgeBaseId),
  });
  toolRegistry.register({
    name: "data.profile",
    description: "Compute safe descriptive statistics for a structured dataset without executing generated code.",
    inputSchema: z.object({
      columns: z.array(z.string()).min(1).max(500),
      rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(50_000),
    }),
    execute: async (input) => profileDataset(input),
  });
}
