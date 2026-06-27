import "@clearance/config";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  getDb,
  knowledgeChunks,
  knowledgeSources,
} from "@clearance/db";

export type KnowledgeCitation = {
  chunkId: string;
  sourceTitle: string;
  excerpt: string;
  score: number;
};

function getApiKey(): string | undefined {
  return process.env.QWEN_CLOUD_API_KEY ?? process.env.DASHSCOPE_API_KEY;
}

const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-v4";
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER ?? "dashscope";
const EMBEDDING_TIMEOUT_MS = Number(process.env.EMBEDDING_TIMEOUT_MS ?? 30_000);
const KNOWLEDGE_SEARCH_TIMEOUT_MS = Number(
  process.env.KNOWLEDGE_SEARCH_TIMEOUT_MS ?? 45_000,
);
import { qwenEmbeddingsUrl } from "@clearance/config";

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function fallbackEmbedding(text: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const out = Array.from({ length: dims }, () => 0);
  for (let i = 0; i < text.length; i++) {
    const idx = i % dims;
    out[idx] += ((text.charCodeAt(i) % 31) - 15) / 100;
  }
  return normalize(out);
}

const EMBEDDING_BATCH_SIZE = Math.max(
  1,
  Math.min(Number(process.env.EMBEDDING_BATCH_SIZE ?? 10), 25),
);

async function embedTextsBatch(inputs: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch(qwenEmbeddingsUrl(), {
    method: "POST",
    signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
  };
  const vectors = data.data?.map((d) => d.embedding) ?? [];
  if (vectors.length !== inputs.length) {
    throw new Error(
      `Embedding count mismatch: got ${vectors.length}, expected ${inputs.length}`,
    );
  }
  return vectors.map(normalize);
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];

  const apiKey = getApiKey();
  if (!apiKey || EMBEDDING_PROVIDER === "local") {
    return inputs.map((t) => fallbackEmbedding(t));
  }

  const results: number[][] = [];
  for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);
    const vectors = await embedTextsBatch(batch, apiKey);
    results.push(...vectors);
  }
  return results;
}

export async function embedQuery(input: string): Promise<number[]> {
  const [vector] = await embedTexts([input]);
  return vector;
}

export function chunkText(text: string, approxCharsPerChunk = 2200, overlap = 300): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= approxCharsPerChunk) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + approxCharsPerChunk, clean.length);
    chunks.push(clean.slice(start, end).trim());
    if (end === clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** Build a search query from inbound email text (subject + body). */
export function buildKnowledgeSearchQuery(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  const subjectMatch = trimmed.match(/^Subject:\s*(.+?)(?:\n\n|\n$)/i);
  const subject = subjectMatch?.[1]?.trim() ?? "";
  const body = subjectMatch
    ? trimmed.slice(subjectMatch[0].length).trim()
    : trimmed;

  const parts = [subject, body].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 1200);
}

export function mergeKnowledgeCitations(
  ...groups: KnowledgeCitation[][]
): KnowledgeCitation[] {
  const byId = new Map<string, KnowledgeCitation>();
  for (const group of groups) {
    for (const citation of group) {
      const existing = byId.get(citation.chunkId);
      if (!existing || citation.score > existing.score) {
        byId.set(citation.chunkId, citation);
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

export async function searchKnowledgeWithSupplements(input: {
  organizationId: string;
  inboxId: string;
  rawInput: string;
  topK?: number;
}): Promise<{ query: string; chunks: KnowledgeCitation[] }> {
  const query = buildKnowledgeSearchQuery(input.rawInput) || input.rawInput.slice(0, 500);
  const topK = input.topK ?? 5;
  const chunks = await searchKnowledge({
    organizationId: input.organizationId,
    inboxId: input.inboxId,
    query,
    topK,
  });

  return { query, chunks };
}

export async function searchKnowledge(input: {
  organizationId: string;
  inboxId: string;
  query: string;
  topK?: number;
}): Promise<KnowledgeCitation[]> {
  return withTimeout(
    searchKnowledgeInner(input),
    KNOWLEDGE_SEARCH_TIMEOUT_MS,
    "Knowledge search timed out",
  );
}

async function searchKnowledgeInner(input: {
  organizationId: string;
  inboxId: string;
  query: string;
  topK?: number;
}): Promise<KnowledgeCitation[]> {
  const db = getDb();
  const topK = Math.max(1, Math.min(input.topK ?? 5, 20));
  const queryEmbedding = await embedQuery(input.query);
  const literal = vectorLiteral(queryEmbedding);

  const rows = await db
    .select({
      chunkId: knowledgeChunks.id,
      content: knowledgeChunks.content,
      title: knowledgeSources.title,
      distance: sql<number>`${knowledgeChunks.embedding} <=> ${sql.raw(`'${literal}'::vector`)}`,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeChunks.sourceId))
    .where(
      and(
        eq(knowledgeChunks.organizationId, input.organizationId),
        eq(knowledgeChunks.inboxId, input.inboxId),
      ),
    )
    .orderBy(asc(sql`${knowledgeChunks.embedding} <=> ${sql.raw(`'${literal}'::vector`)}`))
    .limit(topK);

  return rows.map((row) => ({
    chunkId: row.chunkId,
    sourceTitle: row.title,
    excerpt: row.content.slice(0, 320),
    score: Math.max(0, 1 - row.distance),
  }));
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function ingestKnowledgeSource(input: {
  sourceId: string;
  text: string;
}): Promise<{ chunkCount: number }> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, input.sourceId))
    .limit(1);

  if (!source) {
    throw new Error(`Knowledge source not found: ${input.sourceId}`);
  }

  const chunks = chunkText(input.text);
  if (!chunks.length) {
    await db
      .update(knowledgeSources)
      .set({
        status: "failed",
        error: "No text extracted from source",
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, source.id));
    return { chunkCount: 0 };
  }

  await db
    .update(knowledgeSources)
    .set({ status: "indexing", updatedAt: new Date(), error: null })
    .where(eq(knowledgeSources.id, source.id));

  const embeddings = await embedTexts(chunks);

  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
  for (let i = 0; i < chunks.length; i++) {
    await db.insert(knowledgeChunks).values({
      sourceId: source.id,
      organizationId: source.organizationId,
      inboxId: source.inboxId,
      chunkIndex: i,
      content: chunks[i],
      embedding: embeddings[i],
      metadata: { embeddingModel: EMBEDDING_MODEL, dims: EMBEDDING_DIMENSIONS },
    });
  }

  await db
    .update(knowledgeSources)
    .set({
      status: "indexed",
      chunkCount: chunks.length,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSources.id, source.id));

  return { chunkCount: chunks.length };
}

function stripPdfLikeText(input: string): string {
  // Basic heuristic fallback when pdf parser is unavailable.
  return input.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function extractTextFromBuffer(buffer: Buffer, contentType?: string | null): string {
  if (!buffer.length) return "";

  if (contentType === "application/pdf") {
    return stripPdfLikeText(buffer.toString("utf8"));
  }
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return stripPdfLikeText(buffer.toString("utf8"));
  }

  return buffer.toString("utf8");
}

export function extractKnowledgeTextFromBuffer(input: {
  buffer: Buffer;
  contentType?: string | null;
}): string {
  return extractTextFromBuffer(input.buffer, input.contentType);
}

export async function extractKnowledgeText(input: {
  text?: string | null;
  base64Content?: string | null;
  contentType?: string | null;
}): Promise<string> {
  if (input.text?.trim()) return input.text;
  if (!input.base64Content) return "";

  const buffer = Buffer.from(input.base64Content, "base64");
  if (!buffer.length) return "";

  return extractTextFromBuffer(buffer, input.contentType);
}
