/**
 * Anti-hallucination grounding check.
 *
 * This is intentionally narrow: it only answers "did the knowledge base return a
 * substantive, relevant answer for this email?". It does NOT decide human review
 * based on any hardcoded KB markers or per-scenario patterns — that judgment is
 * the agent's (see `analysis.requiresHumanReview`). The grounding result is used
 * only to decide whether a confident, unambiguous draft may be auto-sent or must
 * instead be held for human review because it was written from general knowledge.
 */
export type GroundingCitation = {
  score: number;
  excerpt: string;
};

/** Minimum vector-similarity score for a citation to count as a real answer. */
export const MIN_KNOWLEDGE_GROUNDING_SCORE = 0.5;

/**
 * True when an excerpt carries only identity/contact details (emails, names,
 * order/SKU identifiers) and no substantive policy or answer content. Such a
 * match should not count as a grounded answer.
 */
export function isIdentityOnlyExcerpt(excerpt: string | null | undefined): boolean {
  const text = (excerpt ?? "").trim();
  if (!text) return true;

  const substantive = text
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, " ") // emails
    .replace(/#?\b[A-Za-z]{1,}-?\d{2,}[A-Za-z0-9-]*\b/g, " ") // order/SKU ids
    .replace(/[^a-zA-Z]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 3);

  // A genuine answer carries a few meaningful words. Keep this low so short but
  // valid policy statements (e.g. "Returns accepted within 30 days") still count.
  return substantive.length < 3;
}

/**
 * Whether the knowledge base returned at least one substantive, sufficiently
 * relevant answer for the email. When false, the agent may still draft from
 * general knowledge, but the reply should be held for human review.
 */
export function hasGroundedKnowledgeAnswer(
  citations?: GroundingCitation[] | null,
): boolean {
  if (!citations || citations.length === 0) return false;
  return citations.some(
    (citation) =>
      Number.isFinite(citation.score) &&
      citation.score >= MIN_KNOWLEDGE_GROUNDING_SCORE &&
      !isIdentityOnlyExcerpt(citation.excerpt),
  );
}
