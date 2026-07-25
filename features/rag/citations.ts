import type { Citation, RetrievalResult } from "./types";

export function buildCitations(results: RetrievalResult[], max = 8): Citation[] {
  return results.slice(0, max).map((result, index) => ({
    chunkId: result.chunkId,
    fileId: result.fileId,
    label: `[${index + 1}] ${result.fileName ?? "مستند"}` +
      (result.page ? ` — صفحة ${result.page}` : result.section ? ` — ${result.section}` : ""),
    excerpt: result.content.slice(0, 500),
    page: result.page,
    section: result.section,
  }));
}

export function buildRetrievedContext(results: RetrievalResult[]) {
  return results
    .map((result, index) =>
      `<source id="${index + 1}" file="${escapeAttribute(result.fileName ?? result.fileId)}">` +
      `${result.content}</source>`,
    )
    .join("\n\n");
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, "");
}
