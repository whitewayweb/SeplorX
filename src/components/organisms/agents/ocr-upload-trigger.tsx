"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDropzone } from "@/components/ui/dropzone";
import { FileUploadDropzone } from "@/components/molecules/file-upload-dropzone";
import { defaultDocumentDropzoneValidation, normalizeDropzoneFile } from "@/lib/dropzone";

export function OcrUploadTrigger() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ taskId: number } | { error: string } | null>(null);

  const clearFile = () => {
    setFile(null);
    setResult(null);
  };

  const dropzone = useDropzone<{ file: File }, string>({
    onDropFile: async (incomingFile) => {
      // Eagerly normalize the file into memory to strip native filesystem handle bindings
      const memoryFile = await normalizeDropzoneFile(incomingFile);
      
      setFile(memoryFile);
      setResult(null);
      return { status: "success", result: { file: memoryFile } };
    },
    onRemoveFile: async () => clearFile(),
    validation: defaultDocumentDropzoneValidation,
    shiftOnMaxFiles: true,
  });

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/agents/ocr", { method: "POST", body: formData });

      if (!res.ok) {
        try {
          const errorData = await res.json();
          setResult({ error: errorData.error || `Server error: ${res.status}` });
        } catch {
          setResult({ error: `Server error: ${res.status}` });
        }
        return;
      }

      const data = await res.json();
      setResult(data);
      if ("taskId" in data) {
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
      <FileUploadDropzone dropzone={dropzone} title="Drop your invoice here, or browse" />

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
