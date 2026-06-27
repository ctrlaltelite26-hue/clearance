"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import type { InboxRow } from "@/lib/api";
import { SettingsShell } from "@/components/layout/settings-shell";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function SettingsInboxesPage() {
  const api = useApi();
  const [inboxes, setInboxes] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listInboxes()
      .then(setInboxes)
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <SettingsShell
      title="Inboxes"
      description="Manage your connected support channels and AI autopilot settings."
      action={
        <LinkButton href="/onboarding/inbox">
          <Plus className="size-4" />
          Create Inbox
        </LinkButton>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}

        {!loading && inboxes.length === 0 && (
          <Card className="border-border shadow-none">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No inboxes yet.</p>
              <LinkButton href="/onboarding/inbox" className="mt-4">
                Create your first inbox
              </LinkButton>
            </CardContent>
          </Card>
        )}

        {inboxes.map((inbox) => (
          <Card key={inbox.id} className="border-border shadow-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {inbox.displayName ?? "Inbox"}
                </CardTitle>
                <Badge variant="secondary">Active</Badge>
              </div>
              <CardDescription className="font-mono">
                {inbox.emailAddress ?? "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              AgentMail ID: {inbox.agentmailInboxId ?? "pending"}
            </CardContent>
          </Card>
        ))}
      </div>
    </SettingsShell>
  );
}
