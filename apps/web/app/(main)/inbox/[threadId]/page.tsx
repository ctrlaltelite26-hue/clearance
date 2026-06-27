"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import {
  AutopilotPanel,
  ThreadConversation,
  useThreadDetail,
} from "@/components/clearance/thread-detail";

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  const { detail, loading, synced, error, retry, retrying } =
    useThreadDetail(threadId);

  if (error && !detail && !loading) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error}</p>
        {error.includes("session expired") && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your Clerk login is still active, but the API token expired. Refresh
            the page to continue.
          </p>
        )}
        <LinkButton variant="link" href="/inbox" className="mt-2 px-0">
          ← Back to inbox
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <LinkButton variant="ghost" size="sm" href="/inbox">
          <ArrowLeft className="size-4" />
          Inbox
        </LinkButton>
        {error && detail && (
          <p className="ml-auto text-xs text-destructive">{error}</p>
        )}
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_380px]">
        <ThreadConversation detail={detail} loading={loading} />
        <AutopilotPanel
          detail={detail}
          threadId={threadId}
          onRetry={retry}
          retrying={retrying}
          synced={synced}
          syncError={error}
        />
      </div>
    </div>
  );
}
