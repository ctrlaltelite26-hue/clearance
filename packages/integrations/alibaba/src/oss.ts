import "@clearance/config";
import OSS from "ali-oss";

export type OssConfig = {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
};

let client: OSS | null = null;

function readOssConfig(): OssConfig | null {
  const region = process.env.OSS_REGION?.trim();
  const bucket = process.env.OSS_BUCKET?.trim();
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim();
  const endpoint = process.env.OSS_ENDPOINT?.trim();

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    return null;
  }

  return { region, bucket, accessKeyId, accessKeySecret, endpoint };
}

export function isOssConfigured(): boolean {
  return readOssConfig() !== null;
}

export function requireOssConfigured(): OssConfig {
  const config = readOssConfig();
  if (!config) {
    throw new Error(
      "Alibaba OSS is not configured — set OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, and OSS_ACCESS_KEY_SECRET",
    );
  }
  return config;
}

function getOssClient(): OSS {
  if (client) return client;

  const config = requireOssConfigured();
  client = new OSS({
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
  return client;
}

export function knowledgeObjectKey(input: {
  organizationId: string;
  sourceId: string;
  contentType: string;
}): string {
  const ext = extensionForContentType(input.contentType);
  return `knowledge/${input.organizationId}/${input.sourceId}/source${ext}`;
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "application/pdf":
      return ".pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "text/markdown":
      return ".md";
    case "text/plain":
      return ".txt";
    default:
      return ".bin";
  }
}

export function contentTypeFromStoragePath(storagePath: string): string | null {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  return null;
}

export async function uploadKnowledgeObject(input: {
  organizationId: string;
  sourceId: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const key = knowledgeObjectKey(input);
  const oss = getOssClient();
  await oss.put(key, input.body, {
    headers: {
      "Content-Type": input.contentType,
    },
  });
  return key;
}

export async function downloadKnowledgeObject(
  storagePath: string,
): Promise<{ body: Buffer; contentType?: string }> {
  const oss = getOssClient();
  const result = await oss.get(storagePath);
  const body = Buffer.isBuffer(result.content)
    ? result.content
    : Buffer.from(result.content);
  const headers = result.res?.headers as Record<string, string | undefined> | undefined;
  const contentType =
    typeof headers?.["content-type"] === "string" ? headers["content-type"] : undefined;
  return { body, contentType };
}

export async function deleteKnowledgeObject(storagePath: string): Promise<void> {
  const oss = getOssClient();
  try {
    await oss.delete(storagePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("NoSuchKey") || message.includes("404")) {
      return;
    }
    throw error;
  }
}
