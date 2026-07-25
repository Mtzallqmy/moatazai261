import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerRegistry } from "@/providers/provider-registry";
import { ProviderError, type ProviderCredential, type UnifiedChatMessage } from "@/providers/types";
import { loadProviderConfiguration } from "@/services/provider-config-service";
import { calculateEstimatedCost } from "@/services/cost-calculator";
import { assertCapabilities } from "@/services/capability-matrix-service";
import { modelCapabilities } from "@/services/model-capability-service";
import { memoryService } from "@/features/memory/memory-service";
import { toolRegistry } from "@/features/tools/tool-registry";
import { registerBuiltinTools } from "@/features/tools/builtin-tools";
import { toolExecutionService, type ToolBinding } from "@/features/tools/tool-execution-service";
import { agentPolicySchema, type AgentRunInput } from "./types";
import { retrievalService } from "@/features/rag/retrieval-service";
import { buildRetrievedContext } from "@/features/rag/citations";
import { inspectRetrievedText, wrapUntrustedContext } from "@/features/rag/prompt-injection";

type AgentRow = {
  id: string;
  name: string;
  current_version: number;
  default_model_id: string | null;
  knowledge_base_id: string | null;
  allowed_roles: string[];
  agent_versions: Array<{
    id: string;
    version: number;
    system_prompt: string;
    temperature: number;
    max_tokens: number;
    memory_enabled: boolean;
    policy: unknown;
  }>;
  agent_tools: Array<{ tools: ToolBinding | null }>;
};

type ModelRow = {
  id: string;
  model_key: string;
  capabilities: unknown;
  pricing_metadata: unknown;
  ai_providers: {
    id: string;
    name: string;
    provider_type: string;
    base_url: string | null;
    enabled: boolean;
    auth_type?: ProviderCredential["authType"];
    configuration?: unknown;
  };
};

export class AgentRunManager {
  async run(userId: string, input: AgentRunInput) {
    registerBuiltinTools();
    const admin = createAdminClient();
    const { data: rawAgent, error: agentError } = await admin
      .from("agents")
      .select("id,name,current_version,default_model_id,knowledge_base_id,allowed_roles,agent_versions(*),agent_tools(tools(id,slug,tool_type,input_schema,enabled,mcp_tools(id,enabled)))")
      .eq("id", input.agentId)
      .eq("status", "active")
      .single();
    if (agentError || !rawAgent) throw new ProviderError("Agent is unavailable", "MODEL_UNAVAILABLE", false, 404);
    const agent = rawAgent as unknown as AgentRow;
    const { data: assignedRoles, error: roleError } = await admin.from("user_roles")
      .select("roles!inner(name)").eq("user_id", userId);
    if (roleError) throw new Error("Could not resolve agent permissions");
    const roleNames = (assignedRoles ?? []).map((row) => (row.roles as unknown as { name: string }).name);
    if (!agent.allowed_roles.some((role) => roleNames.includes(role))) {
      throw new ProviderError("Agent access is not granted", "CAPABILITY_UNSUPPORTED", false, 403);
    }
    const version = agent.agent_versions.find((item) => item.version === agent.current_version);
    if (!version || !agent.default_model_id) throw new ProviderError("Agent configuration is incomplete", "INVALID_CONFIGURATION", false, 409);
    const policy = agentPolicySchema.parse(version.policy);

    const { data: rawModel, error: modelError } = await admin
      .from("ai_models")
      .select("id,model_key,capabilities,pricing_metadata,ai_providers!inner(*)")
      .eq("id", agent.default_model_id)
      .eq("enabled", true)
      .single();
    if (modelError || !rawModel) throw new ProviderError("Agent model is unavailable", "MODEL_UNAVAILABLE", false, 409);
    const model = rawModel as unknown as ModelRow;
    if (!model.ai_providers.enabled) throw new ProviderError("Agent provider is disabled", "PROVIDER_UNAVAILABLE", false, 409);

    const tools = agent.agent_tools
      .map((item) => item.tools)
      .filter((tool): tool is ToolBinding => Boolean(tool?.enabled));
    const toolNames = tools.map((tool) => tool.slug);
    const capabilities = modelCapabilities(model.capabilities);
    assertCapabilities(capabilities, { tools: toolNames.length > 0 });

    const existing = input.idempotencyKey
      ? await admin.from("agent_runs").select("id,status,safe_output,error_code").eq("user_id", userId).eq("idempotency_key", input.idempotencyKey).maybeSingle()
      : { data: null };
    if (existing.data) return existing.data;

    const { data: run, error: runError } = await admin.from("agent_runs").insert({
      user_id: userId,
      agent_id: agent.id,
      agent_version_id: version.id,
      conversation_id: input.conversationId,
      status: "running",
      started_at: new Date().toISOString(),
      input: { prompt: input.prompt, fileIds: input.fileIds, knowledgeBaseId: input.knowledgeBaseId ?? agent.knowledge_base_id },
      idempotency_key: input.idempotencyKey,
    }).select("id,correlation_id").single();
    if (runError || !run) throw new Error("Could not create agent run");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      const memories = version.memory_enabled ? await memoryService.list(userId) : [];
      const knowledgeBaseId = input.knowledgeBaseId ?? agent.knowledge_base_id ?? undefined;
      const retrieval = knowledgeBaseId
        ? await retrievalService.retrieve(userId, input.prompt, knowledgeBaseId, input.conversationId)
        : null;
      if (retrieval && policy.requireEvidence && !retrieval.decision.answerable) {
        const output = {
          content: "لا توجد أدلة كافية في مصادر المعرفة للإجابة بثقة. أضف مصدرًا أو أعد صياغة السؤال.",
          citations: [],
          confidence: retrieval.decision.confidence,
        };
        await admin.from("agent_runs").update({
          status: "completed",
          safe_output: output,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
        return { id: run.id, status: "completed", safe_output: output, usage: {}, estimatedCost: 0 };
      }
      const retrievedContext = retrieval?.decision.answerable
        ? buildRetrievedContext(retrieval.results.slice(0, 8))
        : "";
      const suspicious = retrievedContext ? inspectRetrievedText(retrievedContext) : { suspicious: false };
      const systemPrompt = [
        version.system_prompt,
        memories.length ? `تفضيلات المستخدم المراجعة:\n${memories.map((memory) => `- ${memory.key}: ${memory.value}`).join("\n")}` : "",
        retrievedContext ? wrapUntrustedContext(retrievedContext) : "",
        retrieval?.citations.length ? "استخدم معرفات المصادر [1] و[2] داخل الإجابة عند الاستناد إليها." : "",
      ].filter(Boolean).join("\n\n");
      const messages: UnifiedChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.prompt },
      ];
      const configuration = await loadProviderConfiguration(model.ai_providers,userId);
      const adapter = providerRegistry.get(configuration.type);
      const definitions = tools.length ? tools.map((tool) =>
        tool.tool_type === "internal"
          ? toolRegistry.definitions([tool.slug])[0]
          : { name: tool.slug, description: tool.slug, parameters: tool.input_schema },
      ) : undefined;
      let finalContent = "";
      let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};

      for (let sequence = 1; sequence <= policy.maxSteps; sequence += 1) {
        await this.assertNotCancelled(run.id);
        const stepType = sequence === 1 ? "model" : "tool";
        const { data: step, error: stepError } = await admin.from("agent_run_steps").insert({
          run_id: run.id,
          sequence,
          step_type: stepType,
          status: "running",
          started_at: new Date().toISOString(),
          safe_input: { messageCount: messages.length, toolCount: definitions?.length ?? 0 },
        }).select("id").single();
        if (stepError || !step) throw new Error("Could not persist agent step");

        const response = await adapter.complete(configuration, {
          model: model.model_key,
          messages,
          temperature: Number(version.temperature),
          maxOutputTokens: version.max_tokens,
          tools: definitions,
        }, { requestId: run.correlation_id, userId, signal: controller.signal, timeoutMs: policy.timeoutMs });
        usage = response.usage ?? usage;

        if (!response.toolCalls?.length) {
          finalContent = response.content;
          await admin.from("agent_run_steps").update({
            status: "completed",
            safe_output: { finishReason: response.finishReason, contentLength: response.content.length },
            completed_at: new Date().toISOString(),
          }).eq("id", step.id);
          break;
        }

        messages.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });
        for (const call of response.toolCalls) {
          const tool = tools.find((candidate) => candidate.slug === call.name);
          if (!tool) throw new ProviderError("Agent requested an unauthorized tool", "CAPABILITY_UNSUPPORTED", false, 403);
          const result = await toolExecutionService.execute({
            tool,
            arguments: call.arguments,
            userId,
            agentRunId: run.id,
            modelId: model.id,
            roleNames,
            signal: controller.signal,
          });
          messages.push({ role: "tool", name: call.name, toolCallId: call.id, content: [{ type: "tool-result", toolCallId: call.id, result }] });
        }
        await admin.from("agent_run_steps").update({
          status: "completed",
          safe_output: { toolCalls: response.toolCalls.map((call) => call.name) },
          completed_at: new Date().toISOString(),
        }).eq("id", step.id);
      }
      if (!finalContent) throw new ProviderError("Agent reached its step limit", "PROVIDER_UNAVAILABLE", false, 409);
      const estimatedCost = calculateEstimatedCost(usage, model.pricing_metadata);
      const output = {
        content: finalContent,
        citations: retrieval?.citations ?? [],
        confidence: retrieval?.decision.confidence,
      };
      if (retrieval?.citations.length) {
        const citationRows = retrieval.citations.map((citation) => ({
          agent_run_id: run.id,
          retrieval_result_id: retrieval.resultIds.get(citation.chunkId) ?? null,
          file_id: citation.fileId,
          chunk_id: citation.chunkId,
          label: citation.label,
          excerpt: citation.excerpt,
          page_number: citation.page ?? null,
          section: citation.section ?? null,
        }));
        const { error: citationError } = await admin.from("citations").insert(citationRows);
        if (citationError) throw citationError;
      }
      await admin.from("agent_runs").update({
        status: "completed",
        safe_output: output,
        usage_metadata: { ...usage, retrievalRunId: retrieval?.runId, suspiciousRetrievedInstructions: suspicious.suspicious },
        estimated_cost: estimatedCost,
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      return { id: run.id, status: "completed", safe_output: output, usage, estimatedCost };
    } catch (cause) {
      const cancelled = controller.signal.aborted;
      const error = cause instanceof ProviderError ? cause : new ProviderError("Agent run failed", "UNKNOWN", false, 500);
      await admin.from("agent_runs").update({
        status: cancelled ? "cancelled" : "failed",
        error_code: error.code,
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async cancel(userId: string, runId: string) {
    const { data, error } = await createAdminClient().from("agent_runs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", runId).eq("user_id", userId).in("status", ["queued", "running", "waiting"])
      .select("id,status").maybeSingle();
    if (error) throw error;
    return data;
  }

  private async assertNotCancelled(runId: string) {
    const { data } = await createAdminClient().from("agent_runs").select("status").eq("id", runId).single();
    if (data?.status === "cancelled") throw new ProviderError("Agent run was cancelled", "ABORTED", false, 409);
  }
}

export const agentRunManager = new AgentRunManager();
