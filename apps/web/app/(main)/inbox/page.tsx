"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import type { ThreadListItem } from "@/lib/api";
import { isAuthErrorMessage, isTransientLoadError } from "@/lib/api";
import { cacheThreadListItem } from "@/lib/thread-cache";
import { InboxStatusBadge } from "@/components/clearance/inbox-status-badge";
import { parseSubject } from "@/components/clearance/thread-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  confidenceDisplay,
  formatInboxTime,
  formatThreadId,
  inboxStatus,
  matchesInboxFilter,
  messagePreview,
  type InboxFilter,
} from "@/lib/inbox-display";
import { cn } from "@/lib/utils";

const filters: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "needs-approval", label: "Needs Approval" },
  { id: "ai-handled", label: "AI-handled" },
];

export default function InboxPage() {
  const api = useApi();
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (background = false) => {
      if (!api.isAuthReady) {
        if (!background) {
          setLoading(false);
        }
        return;
      }

      if (!background) {
        setLoading(true);
      }

      try {
        const rows = await api.listThreads();
        setThreads(rows);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load inbox";
        if (message === "Auth is still loading") {
          return;
        }
        if (!background) {
          setError((prev) => {
            if (isAuthErrorMessage(message)) {
              return prev ?? message;
            }
            return message;
          });
        }
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [api],
  );

  useEffect(() => {
    if (api.isAuthLoading) {
      setLoading(true);
      return;
    }
    if (!api.isAuthReady) {
      setLoading(false);
      setError("Not signed in");
      return;
    }
    void load(false);
    void api.syncAgentMail(true).catch(() => {});
    const interval = setInterval(() => {
      void load(true);
    }, 10_000);
    const syncInterval = setInterval(() => {
      void api.syncAgentMail(true).catch(() => {});
    }, 60_000);
    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, [api.isAuthLoading, api.isAuthReady, api.syncAgentMail, load]);

  const filtered = useMemo(() => {
    return threads.filter((row) => {
      if (!matchesInboxFilter(row, activeFilter)) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      const subject = parseSubject(row.rawInput, row.thread.subject);
      return (
        subject.toLowerCase().includes(q) ||
        row.rawInput.toLowerCase().includes(q) ||
        formatThreadId(row.thread.id).toLowerCase().includes(q)
      );
    });
  }, [threads, activeFilter, query]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.thread.id));

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((r) => r.thread.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search threads…"
              className="h-10 border-border bg-brand-elevated pl-9 pr-16"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-brand-elevated hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
            </button>
            <UserButton />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === filter.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-brand-elevated text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-border bg-background">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all threads"
                />
              </th>
              <th className="w-28 px-2 py-3">Thread ID</th>
              <th className="px-2 py-3">Subject &amp; latest message</th>
              <th className="w-32 px-2 py-3">Status</th>
              <th className="w-24 px-2 py-3 text-right">Confidence</th>
              <th className="w-24 px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-4" colSpan={6}>
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ))}

            {error && threads.length === 0 && !loading && (
              <tr>
                <td className="px-6 py-8 text-sm text-destructive" colSpan={6}>
                  <p>{error}</p>
                  {isTransientLoadError(error) && (
                    <p className="mt-2 text-muted-foreground">
                      Check that the API is running and{" "}
                      <code className="text-xs">DATABASE_URL</code> uses the Supabase pooler
                      (port 6543). Retrying automatically…
                    </p>
                  )}
                  <button
                    type="button"
                    className="mt-3 text-sm text-primary hover:underline"
                    onClick={() => void load(false)}
                  >
                    Retry now
                  </button>
                </td>
              </tr>
            )}

            {!loading && !error && filtered.length === 0 && (
              <tr>
                <td className="px-6 py-24 text-center" colSpan={6}>
                  <p className="text-lg font-medium">No threads yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    Send a test email to your AgentMail inbox address to see
                    conversations appear here.
                  </p>
                  <Link
                    href="/onboarding/complete"
                    className="mt-3 inline-block text-sm text-primary hover:underline"
                  >
                    View inbox address →
                  </Link>
                </td>
              </tr>
            )}

            {!loading &&
              (threads.length > 0 || !error) &&
              filtered.map(({ thread, rawInput, fromEmail, fromName }) => {
                const analysis = thread.analysisJson as {
                  confidence?: number;
                } | null;
                const subject = parseSubject(rawInput, thread.subject);
                const preview = messagePreview(rawInput);
                const status = inboxStatus({
                  status: thread.status,
                  sentBy: thread.sentBy,
                  draftReplyJson: thread.draftReplyJson,
                  analysisJson: thread.analysisJson,
                });
                const isSelected = selected.has(thread.id);

                return (
                  <tr
                    key={thread.id}
                    className={cn(
                      "group border-b border-border transition-colors",
                      isSelected
                        ? "bg-primary/5"
                        : "hover:bg-brand-elevated/60",
                    )}
                  >
                    <td className="px-4 py-3 align-middle">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) =>
                          toggleOne(thread.id, v === true)
                        }
                        aria-label={`Select ${subject}`}
                      />
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <Link
                        href={`/inbox/${thread.id}`}
                        onClick={() => cacheThreadListItem({ thread, rawInput, fromEmail, fromName })}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {formatThreadId(thread.id)}
                      </Link>
                    </td>
                    <td className="max-w-0 px-2 py-3 align-middle">
                      <Link
                        href={`/inbox/${thread.id}`}
                        onClick={() => cacheThreadListItem({ thread, rawInput, fromEmail, fromName })}
                        className="block min-w-0"
                      >
                        <p className="truncate text-sm font-medium text-foreground">
                          {subject}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {preview}
                        </p>
                      </Link>
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <InboxStatusBadge
                        label={status.label}
                        variant={status.variant}
                      />
                    </td>
                    <td className="px-2 py-3 align-middle text-right font-mono text-xs text-muted-foreground">
                      {confidenceDisplay(
                        thread.status,
                        analysis?.confidence,
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-right text-xs text-muted-foreground">
                      {formatInboxTime(thread.updatedAt)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-border bg-brand-surface px-6 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" />
            Systems Operational
          </span>
          {selected.size > 0 && (
            <span className="text-foreground">
              {selected.size} thread{selected.size === 1 ? "" : "s"} selected
            </span>
          )}
        </div>
        <div className="hidden items-center gap-4 sm:flex">
          <span>
            <kbd className="rounded border border-border px-1">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="rounded border border-border px-1">E</kbd> Archive
          </span>
          <span>
            <kbd className="rounded border border-border px-1">F</kbd> Filter
          </span>
        </div>
      </footer>
    </div>
  );
}
