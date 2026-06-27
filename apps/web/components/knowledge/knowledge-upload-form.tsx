"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { KnowledgeSource } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import {
  KNOWLEDGE_ACCEPT,
  fileToKnowledgePayload,
  formatFileSize,
  validateKnowledgeFile,
} from "@/lib/knowledge-files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type QueuedFile = {
  id: string;
  file: File;
};

type UploadMode = "add" | "replace";

type KnowledgeUploadFormProps = {
  sources?: KnowledgeSource[];
  onSuccess?: () => void;
  showSkip?: boolean;
  onSkip?: () => void;
  submitLabel?: string;
};

function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return base || name;
}

export function KnowledgeUploadForm({
  sources = [],
  onSuccess,
  showSkip,
  onSkip,
  submitLabel = "Save & index",
}: KnowledgeUploadFormProps) {
  const api = useApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("FAQ");
  const [text, setText] = useState("");
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("add");
  const [replaceSourceId, setReplaceSourceId] = useState("");

  const replaceableSources = useMemo(
    () => sources.filter((source) => source.status !== "indexing"),
    [sources],
  );

  useEffect(() => {
    if (uploadMode !== "replace") return;
    if (replaceableSources.length === 0) {
      setUploadMode("add");
      return;
    }
    if (
      !replaceSourceId ||
      !replaceableSources.some((source) => source.id === replaceSourceId)
    ) {
      setReplaceSourceId(replaceableSources[0].id);
    }
  }, [uploadMode, replaceSourceId, replaceableSources]);

  useEffect(() => {
    if (uploadMode !== "replace" || !replaceSourceId) return;
    const selected = sources.find((source) => source.id === replaceSourceId);
    if (selected) setTitle(selected.title);
  }, [uploadMode, replaceSourceId, sources]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (uploadMode === "replace" && list.length > 1) {
        toast.error("Replace mode accepts one file at a time");
        return;
      }
      if (uploadMode === "replace" && list.length === 1) {
        setTitle(titleFromFileName(list[0].name));
      }

      const next: QueuedFile[] = [];
      for (const file of list) {
        const error = validateKnowledgeFile(file);
        if (error) {
          toast.error(error);
          continue;
        }
        next.push({ id: `${file.name}-${file.size}-${Date.now()}`, file });
      }
      if (next.length) {
        setQueued(uploadMode === "replace" ? next.slice(0, 1) : next);
      }
    },
    [uploadMode],
  );

  async function ingestPayload(
    payload: {
      title: string;
      text?: string;
      base64Content?: string;
      contentType?: string;
    },
    replaceId?: string,
  ) {
    await api.ingestKnowledge({
      ...payload,
      replaceSourceId: replaceId,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && queued.length === 0) {
      toast.error("Upload a file or paste knowledge text");
      return;
    }

    if (uploadMode === "replace") {
      if (!replaceSourceId) {
        toast.error("Select a source to replace");
        return;
      }
      if (text.trim() && queued.length > 0) {
        toast.error("Replace one source at a time — use a file or pasted text, not both");
        return;
      }
      if (queued.length > 1) {
        toast.error("Replace mode accepts one file at a time");
        return;
      }
    }

    setLoading(true);
    try {
      const replaceId =
        uploadMode === "replace" ? replaceSourceId : undefined;

      if (text.trim()) {
        await ingestPayload({ title, text: text.trim() }, replaceId);
      } else if (uploadMode === "replace" && queued.length === 1) {
        const payload = await fileToKnowledgePayload(queued[0].file);
        await ingestPayload(payload, replaceId);
      } else {
        for (const item of queued) {
          const payload = await fileToKnowledgePayload(item.file);
          await ingestPayload(payload);
        }
      }

      setText("");
      setQueued([]);
      toast.success(
        uploadMode === "replace"
          ? "Knowledge source updated — re-indexing"
          : "Knowledge queued for indexing",
      );
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {sources.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <Label>Upload mode</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={uploadMode === "add" ? "default" : "outline"}
              onClick={() => {
                setUploadMode("add");
                setQueued([]);
              }}
            >
              Add new source
            </Button>
            <Button
              type="button"
              size="sm"
              variant={uploadMode === "replace" ? "default" : "outline"}
              disabled={replaceableSources.length === 0}
              onClick={() => {
                setUploadMode("replace");
                setQueued((prev) => prev.slice(0, 1));
              }}
            >
              Replace existing
            </Button>
          </div>
          {uploadMode === "replace" && (
            <div className="space-y-2">
              <Label htmlFor="replace-source">Source to replace</Label>
              <Select
                value={replaceSourceId}
                onValueChange={(value) => {
                  if (value) setReplaceSourceId(value);
                }}
              >
                <SelectTrigger id="replace-source" className="bg-background">
                  <SelectValue placeholder="Select a source" />
                </SelectTrigger>
                <SelectContent>
                  {replaceableSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.title}
                      {source.chunkCount != null && source.chunkCount > 0
                        ? ` (${source.chunkCount} chunks)`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Replaces the selected source in place — old chunks are removed
                when re-indexing finishes. Sources still indexing cannot be
                replaced.
              </p>
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors",
          dragOver && "border-primary bg-primary/5",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="mx-auto mb-3 size-8 text-primary" />
        <p className="font-medium">Drag & drop files here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF, DOCX, Markdown, CSV, or plain text · max 25MB each
          {uploadMode === "replace" ? " · one file when replacing" : ""}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={KNOWLEDGE_ACCEPT}
          multiple={uploadMode === "add"}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queued.length > 0 && (
        <ul className="space-y-2">
          {queued.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(item.file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  setQueued((prev) => prev.filter((f) => f.id !== item.id))
                }
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          or paste text
        </span>
        <Separator className="flex-1" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="paste-title">
          {uploadMode === "replace" ? "Source title" : "Paste title"}
        </Label>
        <Input
          id="paste-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="FAQ"
          className="bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="paste-text">Paste FAQ or policy text</Label>
        <Textarea
          id="paste-text"
          className="min-h-[140px] bg-background"
          placeholder="Paste internal runbooks, macros, or common answers…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? uploadMode === "replace"
              ? "Updating…"
              : "Uploading…"
            : uploadMode === "replace"
              ? "Replace & re-index"
              : submitLabel}
        </Button>
        {showSkip && onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
      </div>
    </form>
  );
}
