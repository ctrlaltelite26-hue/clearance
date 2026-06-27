"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { KnowledgeSource } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { SettingsShell } from "@/components/layout/settings-shell";
import { KnowledgeSourcesList } from "@/components/knowledge/knowledge-sources-list";
import { KnowledgeUploadForm } from "@/components/knowledge/knowledge-upload-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsKnowledgePage() {
  const api = useApi();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.listKnowledgeSources();
      setSources(rows);
    } catch {
      /* best-effort refresh */
    } finally {
      setLoading(false);
    }
  }, [api]);

  const handleDelete = useCallback(
    async (source: KnowledgeSource) => {
      await api.deleteKnowledgeSource(source.id);
      toast.success(`Removed “${source.title}”`);
      await load();
    },
    [api, load],
  );

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <SettingsShell
      title="Knowledge"
      description="Upload docs and FAQs so the agent can cite real company knowledge."
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Indexed sources</CardTitle>
            <CardDescription>
              Files are chunked and embedded for RAG search during drafting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KnowledgeSourcesList
              sources={sources}
              loading={loading}
              onDelete={handleDelete}
            />
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Add knowledge</CardTitle>
            <CardDescription>
              Upload PDF, DOCX, or Markdown — or paste FAQ text directly.
              Replace an existing source to update in place without duplicates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KnowledgeUploadForm
              sources={sources}
              onSuccess={load}
              submitLabel="Upload & index"
            />
          </CardContent>
        </Card>
      </div>
    </SettingsShell>
  );
}
