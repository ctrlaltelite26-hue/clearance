"use client";

import { useMemo, useState } from "react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { KnowledgeSource } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

function statusBadge(status: string) {
  switch (status) {
    case "indexed":
      return (
        <Badge className="bg-brand-success/15 text-brand-success hover:bg-brand-success/20">
          Indexed
        </Badge>
      );
    case "indexing":
      return (
        <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
          Indexing
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20">
          Failed
        </Badge>
      );
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

export function KnowledgeSourcesList({
  sources,
  loading,
  onDelete,
}: {
  sources: KnowledgeSource[];
  loading?: boolean;
  onDelete?: (source: KnowledgeSource) => Promise<void>;
}) {
  const [pendingDelete, setPendingDelete] = useState<KnowledgeSource | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete);
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No knowledge sources yet. Upload a document or paste FAQ text below.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {sources.map((source) => (
          <li key={source.id}>
            <Card className="border-border bg-background shadow-none">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                    {source.status === "indexing" ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <FileText className="size-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{source.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {source.sourceType}
                      {source.chunkCount != null && source.chunkCount > 0
                        ? ` · ${source.chunkCount} chunks`
                        : ""}
                    </p>
                    {source.error && (
                      <p className="mt-0.5 truncate text-xs text-destructive">
                        {source.error}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {statusBadge(source.status)}
                  {onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={
                        source.status === "indexing" || deleting
                      }
                      aria-label={`Remove ${source.title}`}
                      onClick={() => setPendingDelete(source)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove knowledge source?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `“${pendingDelete.title}” and its ${pendingDelete.chunkCount ?? 0} indexed chunks will be deleted. The agent will no longer cite this source.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
