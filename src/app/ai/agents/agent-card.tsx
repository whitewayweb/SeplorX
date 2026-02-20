"use client";

import { useTransition } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Bot } from "lucide-react";
import { toggleAgent } from "./actions";

export function AgentCard({ agent }: { agent: { id: string; name: string; description: string; isActive: boolean } }) {
  const [isPending, startTransition] = useTransition();

  function onToggle() {
    startTransition(() => {
      toggleAgent(agent.id, !agent.isActive);
    });
  }

  return (
    <Card className="flex flex-col relative">
      <CardHeader className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 pr-12">
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <CardDescription className="mt-1 line-relaxed">
                {agent.description}
              </CardDescription>
            </div>
          </div>
          <div className="absolute right-6 top-6 flex flex-col items-end gap-1">
            <Switch
              checked={agent.isActive}
              onCheckedChange={onToggle}
              disabled={isPending}
              className="data-[state=checked]:bg-green-600"
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
