"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import type { InboxRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function OnboardingCompletePage() {
  const api = useApi();
  const [inbox, setInbox] = useState<InboxRow | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.listInboxes().then((rows) => setInbox(rows[0] ?? null)).catch(() => {});
  }, [api]);

  const email = inbox?.emailAddress ?? "support@agentmail.to";

  async function copyAddress() {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    toast.success("Copied inbox address");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-success/15">
        <Check className="size-7 text-brand-success" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your inbox is live
        </h1>
        <p className="mt-1 text-muted-foreground">
          Send a test email to start the autopilot demo.
        </p>
      </div>

      <Card className="border-border text-left shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Inbox address</CardTitle>
          <CardDescription>
            Use this address in your demo — it comes from AgentMail, not a guess.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm">
            {email}
          </code>
          <Button variant="outline" size="sm" onClick={copyAddress}>
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            Copy
          </Button>
          {inbox?.displayName && (
            <Badge variant="secondary">{inbox.displayName}</Badge>
          )}
        </CardContent>
      </Card>

      <LinkButton href="/inbox" size="lg">
        Open inbox
      </LinkButton>
    </div>
  );
}
