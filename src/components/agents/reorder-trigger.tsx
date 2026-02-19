"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bot, Loader2 } from "lucide-react";

type TriggerResult =
  | { taskId: number }
  | { message: string }
  | { error: string };

export function ReorderTrigger() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriggerResult | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/agents/reorder", { method: "POST" });
      const data = (await res.json()) as TriggerResult;
      setResult(data);
      if (!res.ok || "error" in data) {
        // keep error visible; no page refresh needed
      } else {
        // Re-fetch server data to show the new pending recommendation
        router.refresh();
      }
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleClick} disabled={loading} variant="outline" size="sm">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Bot className="h-4 w-4 mr-2" />
        )}
        {loading ? "Checking inventory…" : "AI Reorder Check"}
      </Button>
      {"error" in (result ?? {}) && (
        <p className="text-sm text-destructive">
          {"error" in result! ? result.error : ""}
        </p>
      )}
      {"message" in (result ?? {}) && (
        <p className="text-sm text-muted-foreground">
          {"message" in result! ? result.message : ""}
        </p>
      )}
    </div>
  );
}
