"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import {
  AUTOMATION_RULE_CATALOG,
  DEFAULT_AUTOMATION_RULES,
  type AutomationRules,
} from "@/lib/automation-rules";
import { SettingsShell } from "@/components/layout/settings-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

function parseBlockedRoles(input: string): string[] {
  return input
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

export default function SettingsPoliciesPage() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confidencePercent, setConfidencePercent] = useState("75");
  const [blockedRolesText, setBlockedRolesText] = useState(
    "admin, owner, superuser",
  );
  const [automations, setAutomations] = useState<AutomationRules>(
    DEFAULT_AUTOMATION_RULES,
  );

  const load = useCallback(async () => {
    try {
      const policy = await api.getPolicies();
      setConfidencePercent(String(policy.confidenceThresholdPercent));
      setBlockedRolesText(policy.blockedRoles.join(", "));
      setAutomations(policy.automations);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load policies",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleAutomation(
    id: keyof Omit<AutomationRules, "faqDirectConfidencePercent">,
    checked: boolean,
  ) {
    setAutomations((current) => ({ ...current, [id]: checked }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const percent = Number(confidencePercent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      toast.error("Confidence threshold must be between 1 and 100.");
      return;
    }

    const blockedRoles = parseBlockedRoles(blockedRolesText);
    if (blockedRoles.length === 0) {
      toast.error("Add at least one blocked role.");
      return;
    }

    const faqPercent = Number(automations.faqDirectConfidencePercent);
    if (!Number.isInteger(faqPercent) || faqPercent < 1 || faqPercent > 100) {
      toast.error("FAQ confidence threshold must be between 1 and 100.");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updatePolicies({
        confidenceThresholdPercent: percent,
        blockedRoles,
        automations: {
          ...automations,
          faqDirectConfidencePercent: faqPercent,
        },
      });
      setConfidencePercent(String(updated.confidenceThresholdPercent));
      setBlockedRolesText(updated.blockedRoles.join(", "));
      setAutomations(updated.automations);
      toast.success("Policies saved. New threads use these rules.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save policies");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsShell
      title="Policies"
      description="Define how the AI Autopilot handles sensitive communications and when manual intervention is mandatory."
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <form onSubmit={handleSave} className="space-y-6">
          <Card className="border-border shadow-none" id="approval-thresholds">
            <CardHeader>
              <CardTitle className="text-base">Approval thresholds</CardTitle>
              <CardDescription>
                Actions marked risky always require human approval before
                execution. Low-confidence analysis also routes to approvals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="confidence">
                      Minimum confidence for auto-label (%)
                    </Label>
                    <Input
                      id="confidence"
                      type="number"
                      min={1}
                      max={100}
                      value={confidencePercent}
                      onChange={(e) => setConfidencePercent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="blocked">Blocked roles (comma-separated)</Label>
                    <Input
                      id="blocked"
                      value={blockedRolesText}
                      onChange={(e) => setBlockedRolesText(e.target.value)}
                      placeholder="admin, owner, superuser"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none" id="automations">
            <CardHeader>
              <CardTitle className="text-base">Automation rules</CardTitle>
              <CardDescription>
                Toggle autopilot behaviors shown on the Automations page. With
                &quot;Direct reply to known FAQs&quot; enabled, high-confidence
                how-to and incident threads auto-send after drafting when confidence
                meets your FAQ threshold. Changes apply to newly processed threads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                AUTOMATION_RULE_CATALOG.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{rule.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {rule.description}
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                        Trigger: {rule.trigger}
                      </p>
                      {rule.id === "directReplyFaqs" && automations.directReplyFaqs && (
                        <div className="mt-3 max-w-[200px] space-y-1">
                          <Label htmlFor="faq-confidence" className="text-xs">
                            FAQ confidence threshold (%)
                          </Label>
                          <Input
                            id="faq-confidence"
                            type="number"
                            min={1}
                            max={100}
                            value={automations.faqDirectConfidencePercent}
                            onChange={(e) =>
                              setAutomations((current) => ({
                                ...current,
                                faqDirectConfidencePercent: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                    <Checkbox
                      checked={automations[rule.id]}
                      onCheckedChange={(checked) =>
                        toggleAutomation(rule.id, checked === true)
                      }
                      aria-label={`Toggle ${rule.title}`}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Button type="submit" disabled={loading || saving}>
            {saving ? "Saving…" : "Save policies"}
          </Button>
        </form>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Knowledge</CardTitle>
            <CardDescription>
              Manage indexed sources used for RAG citations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton variant="outline" href="/settings/knowledge">
              Manage knowledge library
            </LinkButton>
          </CardContent>
        </Card>

        <Separator />

        <p className="text-sm text-muted-foreground">
          View the automation overview on{" "}
          <Link href="/automations" className="text-primary hover:underline">
            Automations →
          </Link>
        </p>
      </div>
    </SettingsShell>
  );
}
