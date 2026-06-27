"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import type { PendingApproval } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AgentChip,
  parseSubject,
} from "@/components/clearance/thread-ui";

export default function ApprovalsPage() {
  const api = useApi();
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.listApprovals();
      setItems(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setDeciding(id);
    try {
      await api.decideApproval(id, decision);
      toast.success(decision === "approved" ? "Approved" : "Rejected");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review risky actions before the agent executes them
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="mx-auto max-w-3xl space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        )}

        {error && <p className="text-destructive">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg font-medium">All clear</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No pending approvals right now.
            </p>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {items.map(({ approval, case: caseRow, action }) => {
            const analysis = caseRow.analysisJson as {
              intent?: string;
              confidence?: number;
            } | null;
            const subject = parseSubject(caseRow.rawInput);
            const confidence = analysis?.confidence;

            return (
              <Card
                key={approval.id}
                className="border-border border-l-4 border-l-brand-warning bg-card shadow-none"
              >
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-brand-warning/15 text-brand-warning">
                      Risky
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {action.tool}
                    </span>
                    {analysis?.intent && (
                      <AgentChip intent={analysis.intent} />
                    )}
                  </div>
                  <p className="font-medium">{subject}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {action.rationale && (
                    <p className="text-muted-foreground">{action.rationale}</p>
                  )}
                  {confidence != null && (
                    <p className="font-mono text-xs text-muted-foreground">
                      Confidence {Math.round(confidence * 100)}%
                    </p>
                  )}
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    onClick={() => decide(approval.id, "approved")}
                    disabled={deciding === approval.id}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => decide(approval.id, "rejected")}
                    disabled={deciding === approval.id}
                  >
                    Reject
                  </Button>
                  <LinkButton variant="ghost" href={`/inbox/${caseRow.id}`} className="ml-auto">
                    Open thread
                  </LinkButton>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
