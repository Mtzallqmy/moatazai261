import type { RetrievalCandidate, RetrievalResult } from "./types";

export type HybridSearchOptions = {
  keywordWeight?: number;
  semanticWeight?: number;
  rerankWeight?: number;
  rrfK?: number;
  limit?: number;
};

export function reciprocalRankFusion(
  candidates: RetrievalCandidate[],
  options: HybridSearchOptions = {},
): RetrievalResult[] {
  const keywordWeight = options.keywordWeight ?? 1;
  const semanticWeight = options.semanticWeight ?? 1;
  const rerankWeight = options.rerankWeight ?? 0.4;
  const k = options.rrfK ?? 50;
  const scored = candidates.map((candidate) => {
    const keyword = candidate.keywordRank ? keywordWeight / (k + candidate.keywordRank) : 0;
    const semantic = candidate.semanticRank ? semanticWeight / (k + candidate.semanticRank) : 0;
    const rerank = Math.max(0, Math.min(1, candidate.rerankScore ?? 0)) * rerankWeight;
    const score = keyword + semantic + rerank;
    const evidenceChannels =
      Number(Boolean(candidate.keywordRank)) +
      Number(Boolean(candidate.semanticRank)) +
      Number(candidate.rerankScore !== undefined);
    const confidence = Math.min(1, score * 2 + evidenceChannels * 0.12);
    return { ...candidate, score, confidence };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 12);
}
