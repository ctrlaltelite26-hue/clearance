import type { CaseAnalysis } from "./schemas.js";

export type KnowledgeCitation = {
  chunkId: string;
  sourceTitle: string;
  excerpt: string;
  score: number;
};

export type DraftReplyContext = {
  ticketId?: string;
  user?: unknown;
  citations?: KnowledgeCitation[];
};

export type KnowledgeIdentity = {
  companyName: string;
  supportEmail: string | null;
};

const TRAILING_SIGN_OFF =
  /\n\n(?:(?:Thanks|Thank you|Best regards|Best|Regards|Sincerely|Cheers)[^\n]*(?:\n[^\n]+){0,4})\s*$/i;

function buildCorpus(citations?: KnowledgeCitation[]): string {
  const parts: string[] = [];
  for (const citation of citations ?? []) {
    if (citation.sourceTitle) parts.push(citation.sourceTitle);
    if (citation.excerpt) parts.push(citation.excerpt);
  }
  return parts.join("\n");
}

function companyFromSourceTitles(citations?: KnowledgeCitation[]): string | null {
  for (const citation of citations ?? []) {
    const fromTitle = citation.sourceTitle.match(/^([^—–-]+)\s*[—–-]/);
    if (fromTitle?.[1]?.trim()) return fromTitle[1].trim();
  }
  return null;
}

/** Parse customer-facing company name and support email from knowledge excerpts. */
export function extractKnowledgeIdentity(
  citations?: KnowledgeCitation[],
): KnowledgeIdentity | null {
  const corpus = buildCorpus(citations);
  if (!corpus.trim()) return null;

  const explicitName = corpus
    .match(/\*\*Customer-facing brand name[^*]*\*\*:?\s*([^\n*]+)/i)?.[1]
    ?.trim();
  const explicitEmail = corpus
    .match(/\*\*Primary support email[^*]*\*\*:?\s*([\w.+-]+@[\w.-]+)/i)?.[1]
    ?.trim();

  const dbaName = corpus.match(/dba \*\*([^*]+)\*\*/i)?.[1]?.trim();
  const signOffLine = corpus
    .match(/Thanks,\s*\n\s*([^\n]+) Support/i)?.[1]
    ?.trim();
  const companyName =
    explicitName || dbaName || signOffLine || companyFromSourceTitles(citations);
  if (!companyName) return null;

  const signOffEmail = corpus
    .match(/Thanks,\s*\n\s*[^\n]+ Support\s*\n\s*([\w.+-]+@[\w.-]+)/i)?.[1]
    ?.trim();
  const channelEmail = corpus
    .match(/\|\s*Email\s*\|\s*(support@[\w.-]+)/i)?.[1]
    ?.trim();

  const supportEmail = explicitEmail || signOffEmail || channelEmail || null;

  return { companyName, supportEmail };
}

export function formatSupportSignOff(identity: KnowledgeIdentity): string {
  const teamLine = `${identity.companyName} Support`;
  return identity.supportEmail
    ? `Thanks,\n${teamLine}\n${identity.supportEmail}`
    : `Thanks,\n${teamLine}`;
}

export function resolveRequiredSignOff(context: DraftReplyContext): string {
  const identity = extractKnowledgeIdentity(context.citations);
  if (identity) return formatSupportSignOff(identity);
  return "Thanks,\nSupport";
}

export function stripTrailingSignOff(body: string): string {
  return body.replace(TRAILING_SIGN_OFF, "").trimEnd();
}

/** Replace any model-invented closing with the knowledge-base sign-off. */
export function applyRequiredSignOff(body: string, signOff: string): string {
  return `${stripTrailingSignOff(body)}\n\n${signOff}`;
}

const CUSTOMER_META_TERMS =
  /\b(?:knowledge\s+base|knowledge\s+excerpts?|internal\s+(?:documentation|docs|systems?)|our\s+macros?|indexed\s+sources?)\b/i;

/** Remove paragraphs that leak internal tooling language to the customer. */
export function sanitizeCustomerFacingDraft(body: string): string {
  const paragraphs = body.split(/\n\n+/);
  const kept = paragraphs.filter((paragraph) => !CUSTOMER_META_TERMS.test(paragraph));
  let cleaned = kept.join("\n\n").trim();

  cleaned = cleaned
    .replace(
      /\bUnfortunately,?\s*(?:the\s+)?knowledge\s+base[^.!?]*[.!?]\s*/gi,
      "",
    )
    .replace(/\b(?:I(?:'ve| have)\s+)?reviewed your inquiry[^.!?]*knowledge[^.!?]*[.!?]\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export const DRAFT_REPLY_SYSTEM = `Draft a professional customer support email reply.

Content rules (CRITICAL):
- Use ONLY facts, URLs, fees, timelines, and processes stated in the knowledge excerpts for the customer's question.
- Prefer approved macro language from excerpts when it applies.
- If excerpts do not cover the issue, acknowledge the customer's specific question or order reference and say our team is looking into it — do NOT invent policies, portals, fees, or deadlines.
- NEVER mention "knowledge base", "excerpts", "internal documentation", "macros", or any internal tooling to the customer.
- Never use placeholder domains (example.com) or generic IT support language.

Sign-off rules (CRITICAL):
- The user message includes "requiredSignOff" derived from the knowledge base company name — end the body with that text EXACTLY (same words, line breaks, and email).
- Never invent company or team names. Never use the customer's name or company in the signature.
- Do not use generic closings like "Customer Support Team", "Best regards", or invented outdoor-gear brand names.

Return JSON: { "subject": string, "body": string }`;

export function buildDraftReplyUserMessage(
  rawInput: string,
  analysis: CaseAnalysis,
  context: DraftReplyContext,
): string {
  const identity = extractKnowledgeIdentity(context.citations);
  const requiredSignOff = resolveRequiredSignOff(context);
  const citationBlock =
    context.citations && context.citations.length > 0
      ? context.citations
          .map(
            (c, i) =>
              `[${i + 1}] ${c.sourceTitle} (score ${c.score.toFixed(2)})\n${c.excerpt}`,
          )
          .join("\n\n")
      : "(none — do not mention this to the customer)";

  const noGroundedExcerpts =
    !context.citations?.length ||
    context.citations.every((c) => c.score < 0.5);

  return [
    `Inbound:\n${rawInput}`,
    `Analysis:\n${JSON.stringify(analysis)}`,
    `Context:\n${JSON.stringify({ ticketId: context.ticketId, user: context.user })}`,
    identity
      ? `Company for sign-off only (internal): ${identity.companyName}${
          identity.supportEmail ? ` <${identity.supportEmail}>` : ""
        }`
      : "Company for sign-off: (use requiredSignOff below)",
    `Knowledge excerpts (internal — never reference these labels in the reply):\n${citationBlock}`,
    noGroundedExcerpts
      ? `When excerpts are missing or weak: write a short, warm holding reply that references the customer's specific order or topic and promises a follow-up within one business day. Do not explain why you lack information.`
      : null,
    `requiredSignOff (copy verbatim at end of body):\n${requiredSignOff}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function finalizeDraftBody(
  body: string,
  context: DraftReplyContext,
): string {
  return applyRequiredSignOff(
    sanitizeCustomerFacingDraft(body),
    resolveRequiredSignOff(context),
  );
}
