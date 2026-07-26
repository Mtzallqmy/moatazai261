import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerRegistry } from "@/providers/provider-registry";
import { ProviderError, type ProviderCredential, type StreamingEvent, type UnifiedChatMessage } from "@/providers/types";
import type { ChatRequestInput } from "@/schemas/chat";
import { calculateEstimatedCost } from "./cost-calculator";
import { modelCapabilities, validateModelCapabilities } from "./model-capability-service";
import { assertProviderCircuitAvailable, loadProviderConfiguration, recordProviderHealth } from "./provider-config-service";
import { finalizeUsage, reserveUsage } from "./quota-service";
import { resolveFallbackTarget, type FallbackTarget } from "./provider-fallback-manager";

type ModelRow = {
  id: string;
  provider_id: string;
  model_key: string;
  model_alias: string | null;
  display_name: string;
  enabled: boolean;
  visible_to_users: boolean;
  max_message_chars: number;
  max_output_tokens: number | null;
  capabilities: unknown;
  pricing_metadata: unknown;
  ai_providers: {
    id: string;
    name: string;
    provider_type: string;
    base_url: string | null;
    enabled: boolean;
    auth_type?: ProviderCredential["authType"];
    chat_endpoint?: string;
    models_endpoint?: string;
    embeddings_endpoint?: string;
    api_version?: string | null;
    timeout_ms?: number;
    retry_count?: number;
    fallback_provider_id?: string | null;
    configuration?: unknown;
  };
};

export async function prepareChat(userId: string, input: ChatRequestInput, signal?: AbortSignal) {
  const admin = createAdminClient();
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  if (input.idempotencyKey) {
    const replay = await findReplay(userId, input.idempotencyKey);
    if (replay) return replay;
  }

  const { data: modelRaw, error: modelError } = await admin.from("ai_models")
    .select("id,provider_id,model_key,model_alias,display_name,enabled,visible_to_users,max_message_chars,max_output_tokens,capabilities,pricing_metadata,ai_providers!inner(*)")
    .eq("id", input.modelId).single();
  if (modelError || !modelRaw) throw new ProviderError("Model is unavailable", "MODEL_UNAVAILABLE", false, 404);
  const model = modelRaw as unknown as ModelRow;
  if (!model.enabled || !model.visible_to_users || !model.ai_providers.enabled) {
    throw new ProviderError("Model is unavailable", "MODEL_UNAVAILABLE", false, 409);
  }
  if (input.message.length > model.max_message_chars) {
    throw new ProviderError("Message is too long for this model", "CAPABILITY_UNSUPPORTED", false, 422);
  }
  const capabilities = modelCapabilities(model.capabilities);
  validateModelCapabilities(capabilities, input.contentParts);

  let conversationId = input.conversationId;
  let activeBranchId: string | null = null;
  if (conversationId) {
    const { data } = await admin.from("conversations").select("id,active_branch_id").eq("id", conversationId)
      .eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!data) throw new ProviderError("Conversation not found", "UNKNOWN", false, 404);
    activeBranchId = data.active_branch_id;
  } else {
    const { data, error } = await admin.from("conversations").insert({
      user_id: userId,
      title: input.message.slice(0, 80),
      selected_model_id: model.id,
      last_message_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !data) throw new Error("Could not create conversation");
    conversationId = data.id;
  }

  let parentSequence: number | null = null;
  let parentBranchId: string | null = null;
  if (input.parentMessageId) {
    const { data: parent } = await admin.from("messages")
      .select("id,sequence_number,branch_id,conversations!inner(user_id)")
      .eq("id", input.parentMessageId).eq("conversation_id", conversationId)
      .eq("conversations.user_id", userId).maybeSingle();
    if (!parent) throw new ProviderError("Branch root is unavailable", "INVALID_REQUEST", false, 404);
    parentSequence = parent.sequence_number;
    parentBranchId = parent.branch_id;
    const { data: branch, error: branchError } = await admin.from("message_branches").insert({
      conversation_id: conversationId,
      root_message_id: parent.id,
      parent_branch_id: parentBranchId,
      name: `فرع ${new Date().toISOString()}`,
      created_by: userId,
    }).select("id").single();
    if (branchError || !branch) throw new Error("Could not create conversation branch");
    activeBranchId = branch.id;
    await admin.from("conversations").update({ active_branch_id: activeBranchId }).eq("id", conversationId);
  }

  let historyQuery = admin.from("messages")
    .select("id,role,content,content_parts,sequence_number")
    .eq("conversation_id", conversationId).eq("status", "completed")
    .order("sequence_number").limit(100);
  if (parentSequence !== null) {
    historyQuery = historyQuery.lte("sequence_number", parentSequence);
    historyQuery = parentBranchId
      ? historyQuery.or(`branch_id.is.null,branch_id.eq.${parentBranchId}`)
      : historyQuery.is("branch_id", null);
  }
  else if (activeBranchId) historyQuery = historyQuery.or(`branch_id.is.null,branch_id.eq.${activeBranchId}`);
  const { data: history } = await historyQuery;
  const sequence = parentSequence !== null
    ? parentSequence + 1
    : (history?.reduce((maximum, message) => Math.max(maximum, Number((message as { sequence_number?: number }).sequence_number ?? 0)), 0) ?? 0) + 1;
  const outputLimit = Math.min(
    input.maxOutputTokens ?? model.max_output_tokens ?? 4096,
    model.max_output_tokens ?? 128_000,
  );
  const reservationId = await reserveUsage({
    userId,
    modelId: model.id,
    providerId: model.provider_id,
    idempotencyKey,
    reservedTokens: outputLimit,
  });

  const userParts = input.contentParts.length
    ? [{ type: "text" as const, text: input.message }, ...input.contentParts]
    : [];
  const { data: userMessage, error: userError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content: input.message,
    content_parts: userParts,
    model_id: model.id,
    provider_id: model.provider_id,
    parent_message_id: input.parentMessageId,
    branch_id: activeBranchId,
    sequence_number: sequence,
    status: "completed",
  }).select("id").single();
  if (userError || !userMessage) {
    await finalizeUsage(reservationId, 0, 0, true);
    throw new Error("Could not save user message");
  }
  const { data: assistant, error: assistantError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: "",
    content_parts: [],
    model_id: model.id,
    provider_id: model.provider_id,
    parent_message_id: userMessage.id,
    branch_id: activeBranchId,
    sequence_number: sequence + 1,
    status: "streaming",
  }).select("id").single();
  if (assistantError || !assistant) {
    await finalizeUsage(reservationId, 0, 0, true);
    throw new Error("Could not create assistant message");
  }
  await admin.from("message_versions").insert([
    { message_id: userMessage.id, version: 1, content: input.message, content_parts: userParts, edited_by: userId },
    { message_id: assistant.id, version: 1, content: "", content_parts: [], edited_by: null },
  ]);
  const requestId = crypto.randomUUID();
  const { data: run, error: runError } = await admin.from("chat_runs").insert({
    conversation_id: conversationId,
    user_message_id: userMessage.id,
    assistant_message_id: assistant.id,
    provider_id: model.provider_id,
    model_id: model.id,
    status: "streaming",
    idempotency_key: idempotencyKey,
    request_id: requestId,
    request_metadata: { requestId, idempotencyKey },
  }).select("id,started_at").single();
  if (runError || !run) {
    await finalizeUsage(reservationId, 0, 0, true);
    throw new Error("Could not create chat run");
  }

  const fallback = await resolveFallbackTarget({
    fallbackProviderId: model.ai_providers.fallback_provider_id,
    modelAlias: model.model_alias,
    modelKey: model.model_key,
    contentParts: input.contentParts,
  });
  const targets: FallbackTarget[] = [model as unknown as FallbackTarget, ...(fallback ? [fallback] : [])];
  const messages: UnifiedChatMessage[] = (history ?? []).map((message) => ({
    id: message.id,
    role: message.role as UnifiedChatMessage["role"],
    content: Array.isArray(message.content_parts) && message.content_parts.length
      ? message.content_parts as UnifiedChatMessage["content"]
      : message.content,
  }));
  messages.push({ id: userMessage.id, role: "user", content: userParts.length ? userParts : input.message });
  const started = Date.now();

  async function* events(): AsyncIterable<StreamingEvent> {
    let content = "";
    let firstTokenMs: number | undefined;
    let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
    let activeTarget = targets[0];
    let fallbackUsed = false;
    try {
      for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
        activeTarget = targets[targetIndex];
        try {
          await assertProviderCircuitAvailable(activeTarget.provider_id);
          const configuration = await loadProviderConfiguration(activeTarget.ai_providers,userId);
          const adapter = providerRegistry.get(configuration.type);
          for await (const event of adapter.streamChat(configuration, {
            model: activeTarget.model_key,
            messages,
            temperature: input.temperature,
            maxOutputTokens: outputLimit,
            stream: true,
          }, { requestId: run!.id, userId, signal })) {
            if (event.type === "error" && event.error) {
              throw new ProviderError(event.error.message, event.error.code, true, 502);
            }
            if (event.type === "delta" && event.content) {
              if (firstTokenMs === undefined) firstTokenMs = Date.now() - started;
              content += event.content;
            }
            if (event.type === "usage" && event.usage) usage = event.usage;
            yield event;
          }
          break;
        } catch (targetError) {
          const normalized = targetError instanceof ProviderError
            ? targetError
            : new ProviderError("Provider unavailable", "PROVIDER_UNAVAILABLE", true, 503);
          await recordProviderHealth(activeTarget.provider_id, {
            ok: false,
            latencyMs: Date.now() - started,
            errorCode: normalized.code,
          }).catch(() => undefined);
          const canFallback = !content && targetIndex + 1 < targets.length &&
            (normalized.retryable || ["PROVIDER_UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "NETWORK_ERROR"].includes(normalized.code));
          if (!canFallback) throw normalized;
          fallbackUsed = true;
        }
      }
      if (!content.trim()) throw new ProviderError("Provider returned an empty stream", "INVALID_RESPONSE", true, 502);
      const latency = Date.now() - started;
      const cost = calculateEstimatedCost(usage, activeTarget.pricing_metadata);
      const writes = await Promise.all([
        admin.from("messages").update({
          content,
          status: "completed",
          model_id: activeTarget.id,
          provider_id: activeTarget.provider_id,
          input_tokens: usage.inputTokens ?? null,
          output_tokens: usage.outputTokens ?? null,
          total_tokens: usage.totalTokens ?? null,
          cost_estimate: cost,
          latency_ms: latency,
          updated_at: new Date().toISOString(),
        }).eq("id", assistant!.id),
        admin.from("message_versions").update({
          content,
          content_parts: [],
        }).eq("message_id", assistant!.id).eq("version", 1),
        admin.from("chat_runs").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          latency_ms: latency,
          first_token_ms: firstTokenMs ?? null,
          model_id: activeTarget.id,
          provider_id: activeTarget.provider_id,
          fallback_from_provider_id: fallbackUsed ? model.provider_id : null,
          usage_metadata: usage,
          estimated_cost: cost,
        }).eq("id", run!.id),
        admin.from("provider_usage_records").insert({
          user_id: userId,
          provider_id: activeTarget.provider_id,
          model_id: activeTarget.id,
          conversation_id: conversationId,
          chat_run_id: run!.id,
          input_tokens: usage.inputTokens ?? 0,
          output_tokens: usage.outputTokens ?? 0,
          total_tokens: usage.totalTokens ?? 0,
          estimated_cost: cost,
          fallback_used: fallbackUsed,
        }),
        admin.from("conversations").update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", conversationId!),
      ]);
      if (writes.some((write) => write.error)) throw new Error("Generation persistence failed");
      await finalizeUsage(reservationId, usage.totalTokens ?? 0, cost);
      await recordProviderHealth(activeTarget.provider_id, { ok: true, latencyMs: latency }).catch(() => undefined);
    } catch (cause) {
      const error = cause instanceof ProviderError
        ? cause
        : new ProviderError("Generation failed", "UNKNOWN", false, 500);
      await Promise.allSettled([
        admin.from("messages").update({
          content,
          status: signal?.aborted ? "cancelled" : "failed",
          error_code: error.code,
          error_message: error.message.slice(0, 300),
        }).eq("id", assistant!.id),
        admin.from("chat_runs").update({
          status: signal?.aborted ? "cancelled" : "failed",
          completed_at: new Date().toISOString(),
          error_code: error.code,
          latency_ms: Date.now() - started,
        }).eq("id", run!.id),
        finalizeUsage(reservationId, 0, 0, true),
        recordProviderHealth(activeTarget.provider_id, {
          ok: false,
          latencyMs: Date.now() - started,
          errorCode: error.code,
        }),
      ]);
      yield { type: "error", error: { code: error.code, message: safeMessage(error.code), errorId: error.errorId } };
    }
  }

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistant.id,
    events: events(),
  };
}

async function findReplay(userId: string, idempotencyKey: string) {
  const admin = createAdminClient();
  const { data: run } = await admin.from("chat_runs")
    .select("id,status,conversation_id,user_message_id,assistant_message_id")
    .eq("idempotency_key", idempotencyKey).maybeSingle();
  if (!run) return null;
  const { data: conversation } = await admin.from("conversations")
    .select("id").eq("id", run.conversation_id).eq("user_id", userId).maybeSingle();
  if (!conversation) return null;
  if (run.status !== "completed") {
    throw new ProviderError("An identical request is already in progress", "PROVIDER_UNAVAILABLE", true, 409);
  }
  const { data: message } = await admin.from("messages").select("content").eq("id", run.assistant_message_id).single();
  async function* replay(): AsyncIterable<StreamingEvent> {
    yield { type: "start" };
    if (message?.content) yield { type: "delta", content: message.content };
    yield { type: "done" };
  }
  return {
    conversationId: run.conversation_id,
    userMessageId: run.user_message_id,
    assistantMessageId: run.assistant_message_id,
    events: replay(),
  };
}

function safeMessage(code: string) {
  if (code === "RATE_LIMITED") return "تم بلوغ حد الاستخدام، حاول لاحقًا.";
  if (code === "TIMEOUT") return "انتهت مهلة المزود.";
  if (code === "ABORTED") return "تم إيقاف التوليد.";
  if (code === "INVALID_RESPONSE") return "انقطع رد المزود قبل اكتماله.";
  return "تعذر إكمال الرد. احتفظ بمعرّف الخطأ للمراجعة.";
}
