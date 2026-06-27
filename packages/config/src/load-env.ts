import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadFile(path: string, override = false): void {
  if (existsSync(path)) {
    config({ path, override });
  }
}

/** Load `.env` then `.env.local` from the monorepo root (local overrides). */
export function loadEnv(): void {
  const startDir = dirname(fileURLToPath(import.meta.url));
  let dir = startDir;

  for (let i = 0; i < 6; i++) {
    const envPath = resolve(dir, ".env");
    const localPath = resolve(dir, ".env.local");
    if (existsSync(envPath) || existsSync(localPath)) {
      loadFile(envPath);
      loadFile(localPath, true);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  config();
}

loadEnv();

export { qwenChatCompletionsUrl, qwenEmbeddingsUrl, qwenCompatBaseUrl } from "./qwen.js";
