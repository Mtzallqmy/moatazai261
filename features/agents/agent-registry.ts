import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentPolicySchema, type AgentDefinition } from "./types";

export class AgentRegistry {
  async getEnabled(agentId: string): Promise<AgentDefinition> {
    const { data, error } = await createAdminClient().from("agents")
      .select("id,name,description,current_version,default_model_id,knowledge_base_id,agent_versions(*),agent_tools(tools(id,slug,enabled))")
      .eq("id", agentId).eq("status", "active").single();
    if (error || !data) throw new Error("Agent is unavailable");
    const versions = data.agent_versions as Array<{ version: number; system_prompt: string; memory_enabled: boolean; policy: unknown }>;
    const version = versions.find((item) => item.version === data.current_version);
    if (!version) throw new Error("Agent version is unavailable");
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      systemPrompt: version.system_prompt,
      modelId: data.default_model_id,
      knowledgeBaseId: data.knowledge_base_id,
      memoryEnabled: version.memory_enabled,
      policy: agentPolicySchema.parse(version.policy),
      toolIds: (data.agent_tools as unknown as Array<{ tools: { id: string; enabled: boolean } | Array<{ id: string; enabled: boolean }> | null }>)
        .flatMap((item) => Array.isArray(item.tools) ? item.tools : item.tools ? [item.tools] : [])
        .filter((tool) => tool.enabled)
        .map((tool) => tool.id),
      version: data.current_version,
    };
  }
}

export const agentRegistry = new AgentRegistry();
