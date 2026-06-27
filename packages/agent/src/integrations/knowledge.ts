import type { ToolContext } from "../tools.js";
import { searchKnowledge } from "@clearance/knowledge";

export type KnowledgeCitation = {
  chunkId: string;
  sourceTitle: string;
  excerpt: string;
  score: number;
};

export async function knowledgeSearch(
  ctx: ToolContext,
  params: { query: string; topK?: number },
): Promise<{ chunks: KnowledgeCitation[]; query: string }> {
  const chunks = await searchKnowledge({
    organizationId: ctx.organizationId,
    inboxId: ctx.inboxId,
    query: params.query,
    topK: params.topK,
  });
  return {
    query: params.query,
    chunks,
  };
}
