/** OpenAI-compatible Qwen Cloud API base (intl endpoint for hackathon keys). */
export function qwenCompatBaseUrl(): string {
  const override = process.env.QWEN_BASE_URL?.replace(/\/$/, "");
  if (override) return override;
  return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
}

export function qwenChatCompletionsUrl(): string {
  return `${qwenCompatBaseUrl()}/chat/completions`;
}

export function qwenEmbeddingsUrl(): string {
  return `${qwenCompatBaseUrl()}/embeddings`;
}
