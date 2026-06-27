import type { ThreadDetail, ThreadListItem } from "@/lib/api";

const CACHE_KEY = "clearance-thread-preview-v1";

type PreviewMap = Record<string, ThreadListItem>;

function readMap(): PreviewMap {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PreviewMap;
  } catch {
    return {};
  }
}

function writeMap(map: PreviewMap) {
  try {
    const keys = Object.keys(map);
    const trimmed =
      keys.length > 40
        ? Object.fromEntries(keys.slice(-40).map((k) => [k, map[k]]))
        : map;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota / private mode
  }
}

export function cacheThreadListItem(item: ThreadListItem) {
  const map = readMap();
  map[item.thread.id] = item;
  writeMap(map);
}

export function readThreadListItem(threadId: string): ThreadListItem | null {
  return readMap()[threadId] ?? null;
}

/** Minimal detail for instant paint while the API loads full actions/runs. */
export function previewToThreadDetail(item: ThreadListItem): ThreadDetail {
  return {
    thread: item.thread,
    rawInput: item.rawInput,
    fromEmail: item.fromEmail,
    fromName: item.fromName,
    actions: [],
    approvals: [],
    audit: [],
    agentRuns: [],
  };
}
