"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";

type TriggerResult =
  | { taskId: number }
  | { message: string }
  | { error: string };

export function ReorderTrigger() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/reorder", { method: "POST" });
      const data = (await res.json()) as TriggerResult;
      if (!res.ok || "error" in data) {
        toast.error("error" in data ? (data as { error: string }).error : "Failed to run reorder check");
      } else if ("message" in data) {
        toast.info((data as { message: string }).message);
        router.refresh();
      } else {
        toast.success("AI Reorder check completed successfully");
        // Re-fetch server data to show the new pending recommendation
        router.refresh();
      }
    } catch {
      toast.error("Network error. Please try again.");
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
    </div>
  );
}
