"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Edit3,
  Forward,
  Verified,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import type { ThreadListItem } from "@/lib/api";
import { analysisFlagsHumanReview } from "@/lib/inbox-display";
import {
  parseSender,
  parseSubject,
  StatusBadge,
} from "@/components/clearance/thread-ui";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function threadConfidence(row: ThreadListItem) {
  const analysis = row.thread.analysisJson as { confidence?: number } | null;
  if (typeof analysis?.confidence === "number") {
    return Math.round(analysis.confidence * 100);
  }
  return null;
}

function formatThreadId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function greetingName(firstName?: string | null) {
  if (firstName) return firstName;
  return "there";
}

export default function AnalyticsPage() {
  const { user } = useUser();
  const api = useApi();
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [threadRows, approvals, inboxes] = await Promise.all([
          api.listThreads(),
          api.listApprovals(),
          api.listInboxes(),
        ]);
        if (!cancelled) {
          setThreads(threadRows);
          setPendingCount(approvals.length);
          setInboxCount(inboxes.length);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api]);

  const metrics = useMemo(() => {
    const open = threads.filter(
      (t) => !["COMPLETED", "SENT"].includes(t.thread.status),
    ).length;
    const draftsReady = threads.filter(
      (t) => t.thread.status === "COMPLETED",
    ).length;
    return { open, draftsReady };
  }, [threads]);

  const recent = threads.slice(0, 8);
  const feed = recent.slice(0, 4);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Operational overview and autopilot activity
          </p>
        </div>
        <LinkButton href="/onboarding/inbox" size="sm">
          Create inbox
        </LinkButton>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">
            Good morning, {greetingName(user?.firstName)}.
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-brand-success" />
            Autopilot is active across {inboxCount || "no"} inbox
            {inboxCount === 1 ? "" : "es"}.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Open Threads"
            value={loading ? "—" : String(metrics.open)}
            suffix="Active"
            loading={loading}
          />
          <MetricCard
            label="Awaiting Approval"
            value={loading ? "—" : String(pendingCount)}
            highlight="warning"
            loading={loading}
          />
          <MetricCard
            label="Drafts ready"
            value={loading ? "—" : String(metrics.draftsReady)}
            suffix="Awaiting send"
            highlight="teal"
            loading={loading}
          />
          <MetricCard
            label="Avg Response"
            value="—"
            suffix="Real-time"
            highlight="teal"
            loading={loading}
          />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <Card className="min-w-0 flex-1 border-border shadow-none">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-semibold">Recent Threads</h3>
              <Link
                href="/inbox"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Thread ID</th>
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))}
                  {!loading && recent.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No threads yet. Connect an inbox to get started.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    recent.map((row) => {
                      const confidence = threadConfidence(row);
                      return (
                        <tr
                          key={row.thread.id}
                          className="transition-colors hover:bg-muted/40"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-primary">
                            <Link href={`/inbox/${row.thread.id}`}>
                              {formatThreadId(row.thread.id)}
                            </Link>
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3">
                            {parseSubject(row.rawInput, row.thread.subject)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {parseSender(row.fromName, row.fromEmail, row.rawInput)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={row.thread.status}
                              sentBy={row.thread.sentBy}
                              requiresHumanReview={analysisFlagsHumanReview(
                                row.thread.analysisJson,
                              )}
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {confidence != null ? `${confidence}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="w-full shrink-0 border-border shadow-none lg:w-80">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-xs font-bold uppercase tracking-tight text-muted-foreground">
                Live Autopilot Feed
              </h3>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            </div>
            <div className="space-y-4 p-4">
              {loading && <Skeleton className="h-24 w-full" />}
              {!loading && feed.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Activity will appear here as threads are processed.
                </p>
              )}
              {!loading &&
                feed.map((row, i) => (
                  <FeedItem key={row.thread.id} row={row} variant={i} />
                ))}
            </div>
            <div className="mt-auto border-t border-border p-4">
              <div className="rounded border border-border bg-background p-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">System Load</span>
                  <span className="font-mono text-primary">
                    {loading ? "—" : `${Math.min(threads.length * 3, 100)}%`}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(threads.length * 3, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  highlight,
  loading,
}: {
  label: string;
  value: string;
  suffix?: string;
  highlight?: "warning" | "success" | "teal";
  loading?: boolean;
}) {
  return (
    <Card
      className={cn(
        "border-border shadow-none transition-colors hover:border-muted-foreground/30",
        highlight === "warning" && "border-l-4 border-l-brand-warning",
      )}
    >
      <CardContent className="p-5">
        <p className="mb-1 text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-2xl font-semibold",
                highlight === "warning" && "text-brand-warning",
                highlight === "success" && "text-brand-success",
                highlight === "teal" && "text-primary",
              )}
            >
              {value}
            </span>
            {suffix && (
              <span className="text-xs text-muted-foreground">{suffix}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedItem({
  row,
  variant,
}: {
  row: ThreadListItem;
  variant: number;
}) {
  const icons = [Brain, Edit3, Verified, Forward];
  const colors = [
    "text-primary",
    "text-brand-warning",
    "text-brand-success",
    "text-muted-foreground",
  ];
  const labels = [
    `Analyzed ${formatThreadId(row.thread.id)}`,
    `Drafted response for ${parseSender(row.fromName, row.fromEmail, row.rawInput)}`,
    "Verified policy rules",
    `Processed ${formatThreadId(row.thread.id)}`,
  ];
  const Icon = icons[variant % icons.length] ?? Brain;

  return (
    <div className={cn("flex gap-3", variant === 3 && "opacity-60")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", colors[variant % colors.length])} />
      <div>
        <p className="text-sm">{labels[variant % labels.length]}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Just now</p>
      </div>
    </div>
  );
}
