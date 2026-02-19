"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Bot, Loader2, UploadCloud, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ACCEPTED_LABEL = "PDF, JPEG, PNG or WebP";
const MAX_MB = 10;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OcrUploadTrigger() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ taskId: number } | { error: string } | null>(null);

  const accept = (incoming: File | null | undefined) => {
    if (!incoming) return;
    if (!ACCEPTED_TYPES.includes(incoming.type)) {
      setResult({ error: `Unsupported file type. Please upload a ${ACCEPTED_LABEL}.` });
      return;
    }
    if (incoming.size > MAX_MB * 1024 * 1024) {
      setResult({ error: `File too large. Maximum size is ${MAX_MB} MB.` });
      return;
    }
    setFile(incoming);
    setResult(null);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    accept(e.target.files?.[0]);
    // reset so the same file can be re-selected
    e.target.value = "";
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setResult(null);
  };

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/agents/ocr", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
      if (res.ok && "taskId" in data) {
        setFile(null);
        router.refresh();
      }
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload invoice file"
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !loading && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer select-none",
          dragging
            ? "border-primary bg-primary/5"
            : file
              ? "border-primary/40 bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50",
          loading && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleInputChange}
          disabled={loading}
        />

        {file ? (
          <>
            <FileText className="h-10 w-10 text-primary" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate max-w-xs">{file.name}</span>
              <button
                type="button"
                onClick={clearFile}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
          </>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Drop your invoice here, or{" "}
                <span className="text-primary underline-offset-4 hover:underline">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">{ACCEPTED_LABEL} · max {MAX_MB} MB</p>
            </div>
          </>
        )}
      </div>

      {/* Upload button — only visible once a file is selected */}
      {file && (
        <Button className="w-full" onClick={handleUpload} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Bot className="h-4 w-4 mr-2" />
          )}
          {loading ? "Extracting with AI…" : "Extract Invoice Data"}
        </Button>
      )}

      {/* Feedback messages */}
      {result && "error" in result && (
        <p className="text-sm text-destructive text-center">{result.error}</p>
      )}
      {result && "taskId" in result && (
        <p className="text-sm text-green-700 text-center">Extracted! Review the card below.</p>
      )}
    </div>
  );
}
