"use client";



import Link from "next/link";

import { useParams, useRouter } from "next/navigation";

import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowLeft, Send } from "lucide-react";

import { toast } from "sonner";

import { useApi } from "@/hooks/use-api";

import { Button } from "@/components/ui/button";

import { LinkButton } from "@/components/ui/link-button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";

import { useThreadDetail } from "@/components/clearance/thread-detail";

import { parseSubject } from "@/components/clearance/thread-ui";



const AGENTMAIL_UUID_RE =

  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;



function isAgentMailDraftId(id: string | null | undefined): id is string {

  return Boolean(id?.trim() && AGENTMAIL_UUID_RE.test(id.trim()));

}



export default function DraftReviewPage() {

  const params = useParams();

  const router = useRouter();

  const threadId = params.threadId as string;

  const api = useApi();

  const { detail, loading, error } = useThreadDetail(threadId);

  const [subject, setSubject] = useState("");

  const [body, setBody] = useState("");

  const [draftId, setDraftId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [sending, setSending] = useState(false);



  // Tracks the draft body we last hydrated the editor with. Background polling
  // refreshes `detail` every few seconds; without this guard each poll would
  // overwrite whatever the user is currently typing.
  const hydratedDraftBodyRef = useRef<string | null>(null);

  useEffect(() => {
    const draft = detail?.thread.draftReplyJson;
    if (draft?.body?.trim()) {
      if (isAgentMailDraftId(draft.id)) {
        setDraftId(draft.id);
      }
      const incomingBody = draft.body ?? "";
      const isNewDraft = hydratedDraftBodyRef.current !== incomingBody;
      // Only (re)hydrate when this is a draft we haven't applied yet AND the user
      // hasn't started editing (current body still matches what we last applied).
      const userHasEdited =
        hydratedDraftBodyRef.current !== null &&
        body !== hydratedDraftBodyRef.current;
      if (isNewDraft && !userHasEdited) {
        setSubject(draft.subject ?? "");
        setBody(incomingBody);
        hydratedDraftBodyRef.current = incomingBody;
      }
      return;
    }

    const threadSubject = detail
      ? parseSubject(detail.rawInput, detail.thread.subject)
      : "";
    if (threadSubject) {
      setSubject((current) => current || `Re: ${threadSubject}`);
    }
  }, [detail, body]);



  useEffect(() => {

    async function loadDraft() {

      try {

        const { draft } = await api.getDraft(threadId);

        if (isAgentMailDraftId(draft?.id)) {

          setDraftId(draft.id);

        }

      } catch {

        /* draft endpoint optional */

      }

    }

    loadDraft();

  }, [api, threadId]);



  const syncDraft = useCallback(async () => {

    if (!subject.trim() || !body.trim()) {

      throw new Error("Subject and body are required");

    }

    const { draft, source } = await api.updateDraft(threadId, { subject, body });

    if (source === "local" || !isAgentMailDraftId(draft?.id)) {

      throw new Error(

        "AgentMail is not configured — connect an inbox before sending",

      );

    }

    setDraftId(draft.id);

    return draft.id;

  }, [api, threadId, subject, body]);



  const handleSave = useCallback(async () => {

    setSaving(true);

    try {

      await syncDraft();

      toast.success("Draft saved");

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to save");

    } finally {

      setSaving(false);

    }

  }, [syncDraft]);



  const handleSend = useCallback(async () => {

    setSending(true);

    try {

      const id = await syncDraft();

      await api.sendDraft(threadId, id);

      toast.success("Reply sent");

      router.push(`/inbox/${threadId}`);

    } catch (err) {

      toast.error(err instanceof Error ? err.message : "Failed to send");

    } finally {

      setSending(false);

    }

  }, [api, threadId, router, syncDraft]);



  if (error && !detail && !loading) {

    return (

      <div className="p-6 text-destructive">{error}</div>

    );

  }



  const threadSubject = detail

    ? parseSubject(detail.rawInput, detail.thread.subject)

    : "";



  return (

    <div className="flex h-svh flex-col">

      <header className="flex items-center justify-between border-b border-border px-6 py-4">

        <div className="flex items-center gap-2">

          <LinkButton variant="ghost" size="sm" href={`/inbox/${threadId}`}>

            <ArrowLeft className="size-4" />

            Thread

          </LinkButton>

          <div>

            <h1 className="text-lg font-semibold">Draft review</h1>

            {threadSubject && (

              <p className="text-sm text-muted-foreground">{threadSubject}</p>

            )}

          </div>

        </div>

        <div className="flex gap-2">

          <Button variant="outline" onClick={handleSave} disabled={saving || sending}>

            {saving ? "Saving…" : "Save"}

          </Button>

          <Button onClick={handleSend} disabled={sending || !body}>

            <Send className="size-4" />

            {sending ? "Sending…" : "Confirm & send"}

          </Button>

        </div>

      </header>



      <div className="grid min-h-0 flex-1 lg:grid-cols-2">

        <div className="border-r border-border p-6">

          <h2 className="mb-4 text-sm font-medium text-muted-foreground">

            Original message

          </h2>

          {loading ? (

            <Skeleton className="h-48 w-full" />

          ) : (

            <Card className="border-border bg-card shadow-none">

              <CardContent className="p-4">

                <pre className="whitespace-pre-wrap text-sm">

                  {detail?.rawInput}

                </pre>

              </CardContent>

            </Card>

          )}

        </div>



        <div className="flex flex-col p-6">

          <h2 className="mb-4 text-sm font-medium text-muted-foreground">

            Edit reply

          </h2>

          {loading ? (

            <Skeleton className="h-64 w-full" />

          ) : (

            <Card className="flex flex-1 flex-col border-border shadow-none">

              <CardHeader>

                <CardTitle className="text-base">Outbound draft</CardTitle>

              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-4">

                <div className="space-y-2">

                  <Label htmlFor="subject">Subject</Label>

                  <Input

                    id="subject"

                    value={subject}

                    onChange={(e) => setSubject(e.target.value)}

                  />

                </div>

                <div className="flex flex-1 flex-col space-y-2">

                  <Label htmlFor="body">Body</Label>

                  <Textarea

                    id="body"

                    className="min-h-[280px] flex-1 resize-none"

                    value={body}

                    onChange={(e) => setBody(e.target.value)}

                  />

                </div>

              </CardContent>

            </Card>

          )}

        </div>

      </div>

    </div>

  );

}


