import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embeddingService } from "./embedding-service";
import { evaluateEvidence } from "./confidence";
import { buildCitations } from "./citations";
import { reciprocalRankFusion } from "./hybrid-search";
import type { RetrievalCandidate } from "./types";

type KnowledgeBaseRow = {
  id: string;
  owner_user_id: string | null;
  embedding_model_id: string | null;
  embedding_dimensions: number;
  retrieval_configuration: unknown;
};

export class RetrievalService {
  async retrieve(userId: string, query: string, knowledgeBaseId?: string, conversationId?: string) {
    const admin = createAdminClient();
    const { data: run, error: runError } = await admin.from("retrieval_runs").insert({
      user_id: userId,
      knowledge_base_id: knowledgeBaseId ?? null,
      conversation_id: conversationId ?? null,
      query,
      strategy: "hybrid",
      status: "running",
    }).select("id").single();
    if (runError || !run) throw new Error("Could not start retrieval");
    try {
    let knowledgeBase: KnowledgeBaseRow | null = null;
    if (knowledgeBaseId) {
      const { data, error } = await admin.from("knowledge_bases")
        .select("id,owner_user_id,embedding_model_id,embedding_dimensions,retrieval_configuration")
        .eq("id", knowledgeBaseId).eq("enabled", true).single();
      if (error || !data || (data.owner_user_id && data.owner_user_id !== userId)) throw new Error("Knowledge base is unavailable");
      knowledgeBase = data as KnowledgeBaseRow;
    }
    const embedding = knowledgeBase?.embedding_model_id
      ? (await embeddingService.embed(knowledgeBase.embedding_model_id, [query], knowledgeBase.embedding_dimensions,userId)).embeddings[0]
      : null;

    let candidates: RetrievalCandidate[] = [];
    if (embedding) {
      const { data, error } = await admin.rpc("hybrid_search_file_chunks", {
        p_user_id: userId,
        p_query_text: query,
        p_query_embedding: embedding,
        p_match_count: 12,
        p_knowledge_base_id: knowledgeBaseId ?? null,
      });
      if (error) throw error;
      candidates = (data ?? []).map((row: Record<string, unknown>) => ({
        chunkId: String(row.chunk_id),
        fileId: String(row.file_id),
        content: String(row.content),
        keywordRank: row.keyword_rank ? Number(row.keyword_rank) : undefined,
        semanticRank: row.semantic_rank ? Number(row.semantic_rank) : undefined,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      }));
    } else {
      const terms = query.split(/\s+/).filter((term) => term.length > 2).slice(0, 8);
      if (terms.length) {
        let request = admin.from("file_chunks")
          .select("id,file_id,content,metadata,files!inner(owner_user_id,status,original_name)")
          .eq("files.owner_user_id", userId).eq("files.status", "ready").limit(24);
        request = request.textSearch("search_vector", terms.join(" | "), { config: "simple", type: "websearch" });
        const { data, error } = await request;
        if (error) throw error;
        candidates = (data ?? []).map((row, index) => ({
          chunkId: row.id,
          fileId: row.file_id,
          content: row.content,
          fileName: (row.files as unknown as { original_name?: string })?.original_name,
          keywordRank: index + 1,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        }));
      }
    }
    const results = reciprocalRankFusion(candidates);
    const decision = evaluateEvidence(results, Number((knowledgeBase?.retrieval_configuration as Record<string, unknown> | undefined)?.minimumConfidence ?? 0.55));
    const stored = results.length
      ? await admin.from("retrieval_results").insert(results.map((result, index) => ({
        retrieval_run_id: run.id,
        chunk_id: result.chunkId,
        rank: index + 1,
        keyword_score: result.keywordRank ? 1 / result.keywordRank : null,
        semantic_score: result.semanticRank ? 1 / result.semanticRank : null,
        rerank_score: result.rerankScore ?? null,
        combined_score: result.score,
        selected: decision.answerable && index < 8,
      }))).select("id,chunk_id")
      : { data: [], error: null };
    if (stored.error) throw stored.error;
    await admin.from("retrieval_runs").update({
      status: "completed",
      confidence: decision.confidence,
      diagnostics: {
        answerable: decision.answerable,
        reason: decision.reason,
        candidateCount: candidates.length,
        selectedCount: Math.min(results.length, 8),
      },
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    const resultIds = new Map((stored.data ?? []).map((item) => [item.chunk_id, item.id]));
    return { runId: run.id, results, citations: buildCitations(results), decision, resultIds };
    } catch (cause) {
      await admin.from("retrieval_runs").update({
        status: "failed",
        diagnostics: { errorCode: "RETRIEVAL_FAILED" },
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      throw cause;
    }
  }
}

export const retrievalService = new RetrievalService();
