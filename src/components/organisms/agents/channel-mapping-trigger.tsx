"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ChannelMappingTriggerProps {
  channelId: number;
}

export function ChannelMappingTrigger({ channelId }: ChannelMappingTriggerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleTrigger() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/agents/channel-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId }),
        });
        const data = (await res.json()) as {
          taskId?: number;
          status?: string;
          message?: string;
          error?: string;
        };

        if (!res.ok || data.error) {
          setError(data.error ?? "Agent failed. Please try again.");
          return;
        }

        if (data.status === "processing") {
          toast.success("Mapping started", {
            description: "AI is analyzing products in the background. Refresh the page in a moment to see proposals.",
            duration: 6000,
          });
        } else if (data.message) {
          toast.info(data.message);
        } else if (data.taskId) {
          toast.success("Mapping proposals ready", {
            description: "Review the AI recommendations above.",
          });
          router.refresh();
        }
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <span className="text-destructive text-xs">{error}</span>}
      <Button
        variant="outline"
        size="sm"
        onClick={handleTrigger}
        disabled={pending}
        title="Use AI to automatically match products between SeplorX and this channel"
      >
        <Bot className="h-3 w-3 mr-1.5" />
        {pending ? "Analyzing…" : "Auto-Map (AI)"}
      </Button>
    </div>
  );
}
