"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { KnowledgeSource } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { KnowledgeSourcesList } from "@/components/knowledge/knowledge-sources-list";
import { KnowledgeUploadForm } from "@/components/knowledge/knowledge-upload-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OnboardingKnowledgePage() {
  const api = useApi();
  const router = useRouter();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);

  const load = useCallback(async () => {
    try {
      setSources(await api.listKnowledgeSources());
    } catch {
      /* optional during onboarding */
    } finally {
      setLoadingSources(false);
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
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-border shadow-none">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/30" />
        <CardHeader>
          <CardTitle className="text-xl">Teach your autopilot</CardTitle>
          <CardDescription>
            Upload documents and/or paste FAQ text so Qwen can draft accurate
            replies. You can add more sources later in Settings → Knowledge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <KnowledgeUploadForm
            sources={sources}
            showSkip
            onSkip={() => router.push("/onboarding/complete")}
            onSuccess={() => {
              load();
              router.push("/onboarding/complete");
            }}
            submitLabel="Save & continue"
          />
        </CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Uploaded sources</CardTitle>
          <CardDescription>
            Indexing runs in the background — status updates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeSourcesList
            sources={sources}
            loading={loadingSources}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
    </div>
  );
}
