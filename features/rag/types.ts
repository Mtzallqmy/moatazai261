export type RetrievalCandidate = {
  chunkId: string;
  fileId: string;
  content: string;
  fileName?: string;
  page?: number;
  section?: string;
  keywordRank?: number;
  semanticRank?: number;
  rerankScore?: number;
  metadata?: Record<string, unknown>;
};

export type RetrievalResult = RetrievalCandidate & {
  score: number;
  confidence: number;
};

export type Citation = {
  chunkId: string;
  fileId: string;
  label: string;
  excerpt: string;
  page?: number;
  section?: string;
};
