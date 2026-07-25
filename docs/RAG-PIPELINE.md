# RAG pipeline

1. The upload route validates count, size, extension, MIME declaration, and known signatures.
2. Storage uses an internal UUID path under the authenticated user prefix.
3. File metadata is persisted before processing.
4. Safe text formats are extracted inline; rich formats create durable processing jobs.
5. Extracted text is normalized and divided into overlapping chunks with page/section metadata.
6. The configured embedding adapter generates vectors; vectors remain in PostgreSQL through pgvector.
7. Retrieval applies owner and knowledge-base filters before keyword and semantic ranking.
8. Reciprocal-rank fusion combines channels; an optional reranker may reorder bounded candidates.
9. Confidence gating refuses document-grounded answers when evidence is inadequate.
10. Context assembly deduplicates chunks and stays within a token budget.
11. Citations persist deterministic file, chunk, page, section, and excerpt references.
12. Private source links are returned only as short-lived signed URLs after an ownership check.

Retrieved text is always wrapped as untrusted data, separate from system instructions. Instructions found inside files cannot authorize tools or override the system prompt.

The web runtime persists jobs but does not pretend to process CPU-heavy PDF, Office, OCR, audio, or video work. Those job types require a deployed worker implementing the documented background-job contract.
