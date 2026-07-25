import type { RetrievalResult } from "./types";

export type EvidenceDecision =
  | { answerable: true; confidence: number; reason: "sufficient_evidence" }
  | { answerable: false; confidence: number; reason: "no_evidence" | "low_confidence" };

export function evaluateEvidence(
  results: RetrievalResult[],
  threshold = 0.55,
): EvidenceDecision {
  if (results.length === 0) return { answerable: false, confidence: 0, reason: "no_evidence" };
  const top = results.slice(0, 3);
  const confidence = top.reduce((sum, item, index) => sum + item.confidence / (index + 1), 0) /
    top.reduce((sum, _, index) => sum + 1 / (index + 1), 0);
  return confidence >= threshold
    ? { answerable: true, confidence, reason: "sufficient_evidence" }
    : { answerable: false, confidence, reason: "low_confidence" };
}
