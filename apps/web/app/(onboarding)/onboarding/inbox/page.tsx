"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OnboardingInboxPage() {
  const api = useApi();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("Support");
  const [username, setUsername] = useState("");
  const [autopilotMode, setAutopilotMode] = useState("draft");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await api.createInbox({
        displayName,
        username: username || undefined,
      });
      toast.success(
        result.alreadyProvisioned
          ? `Inbox ready: ${result.emailAddress || "connected"}`
          : `Inbox created: ${result.emailAddress || "connected"}`,
      );
      router.push("/onboarding/knowledge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create inbox");
    } finally {
      setLoading(false);
    }
  }

  const preview = username
    ? `${username}@agentmail.to`
    : "your-name@agentmail.to";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your inbox
        </h1>
        <p className="mt-1 text-muted-foreground">
          Create a real AgentMail inbox for inbound support email.
        </p>
      </div>

      <Card className="border-border shadow-none">
        <CardHeader>
          <CardTitle>Inbox details</CardTitle>
          <CardDescription>
            Addresses use @agentmail.to on the free tier. The API returns your
            actual address after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Acme Support"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username (optional)</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="acme-support"
              />
              <p className="text-xs text-muted-foreground">
                Preview: <span className="font-mono">{preview}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Autopilot mode</Label>
              <Select
                value={autopilotMode}
                onValueChange={(v) => v && setAutopilotMode(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft only — human sends</SelectItem>
                  <SelectItem value="label">Auto-label threads</SelectItem>
                  <SelectItem value="full">Full autopilot (with approvals)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : "Create inbox"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
