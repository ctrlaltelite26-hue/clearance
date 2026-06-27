const MAX_BYTES = 25 * 1024 * 1024;

export const KNOWLEDGE_ACCEPT = ".pdf,.docx,.md,.txt,.csv,text/plain,text/markdown";

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function contentTypeForFile(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === "md") return "text/markdown";
  return "text/plain";
}

export function isTextKnowledgeFile(file: File) {
  const type = contentTypeForFile(file);
  return type === "text/plain" || type === "text/markdown";
}

export function validateKnowledgeFile(file: File): string | null {
  if (file.size > MAX_BYTES) {
    return `${file.name} exceeds 25MB limit`;
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["pdf", "docx", "md", "txt", "csv"].includes(ext)) {
    return `${file.name}: use PDF, DOCX, Markdown, or text files`;
  }
  return null;
}

export type KnowledgeFilePayload =
  | { title: string; text: string }
  | { title: string; base64Content: string; contentType: string };

export async function fileToKnowledgePayload(file: File): Promise<KnowledgeFilePayload> {
  const title = file.name.replace(/\.[^.]+$/, "") || file.name;
  if (isTextKnowledgeFile(file)) {
    return { title, text: await readFileAsText(file) };
  }
  return {
    title,
    base64Content: await fileToBase64(file),
    contentType: contentTypeForFile(file),
  };
}
