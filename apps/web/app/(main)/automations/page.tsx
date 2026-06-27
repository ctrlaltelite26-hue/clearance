"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Zap } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import {
  AUTOMATION_RULE_CATALOG,
  DEFAULT_AUTOMATION_RULES,
  type AutomationRules,
} from "@/lib/automation-rules";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function ruleTrigger(ruleId: string, automations: AutomationRules) {
  if (ruleId === "directReplyFaqs") {
    return `Confidence ≥ ${automations.faqDirectConfidencePercent}% + grounded KB answer`;
  }
  return AUTOMATION_RULE_CATALOG.find((rule) => rule.id === ruleId)?.trigger ?? "";
}

export default function AutomationsPage() {
  const api = useApi();
  const [automations, setAutomations] = useState<AutomationRules>(
    DEFAULT_AUTOMATION_RULES,
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const policy = await api.getPolicies();
      setAutomations(policy.automations);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-end justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Autopilot rules that run across your connected inboxes
          </p>
        </div>
        <LinkButton href="/settings/policies#automations" size="sm">
          <Plus className="size-4" />
          Configure rules
        </LinkButton>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}

          {!loading &&
            AUTOMATION_RULE_CATALOG.map((rule) => {
              const active = automations[rule.id];
              return (
                <Card
                  key={rule.id}
                  className="border-border shadow-none transition-colors hover:border-primary/30"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                          <Zap className="size-4 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{rule.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {rule.description}
                          </CardDescription>
                          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                            Trigger: {ruleTrigger(rule.id, automations)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          active
                            ? "bg-brand-success/15 text-brand-success"
                            : "text-muted-foreground"
                        }
                      >
                        {active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Link
                      href={`/settings/policies#automations`}
                      className="text-xs text-primary hover:underline"
                    >
                      Configure in Policies →
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>
    </div>
  );
}
