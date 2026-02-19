"use client";

import { useTransition } from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, CheckCircle2, XCircle } from "lucide-react";
import { toggleAgent } from "./actions";

export function AgentCard({ agent }: { agent: { id: string; name: string; description: string; isActive: boolean } }) {
  const [isPending, startTransition] = useTransition();

  function onToggle() {
    startTransition(() => {
      toggleAgent(agent.id, !agent.isActive);
    });
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{agent.name}</CardTitle>
            <CardDescription className="mt-1 line-relaxed">
              {agent.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="flex items-center justify-between border-t bg-muted/20 py-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {agent.isActive ? (
            <span className="flex items-center text-green-600">
              <CheckCircle2 className="mr-1.5 size-4" /> Enabled
            </span>
          ) : (
            <span className="flex items-center text-muted-foreground">
              <XCircle className="mr-1.5 size-4" /> Disabled
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant={agent.isActive ? "outline" : "default"}
          onClick={onToggle}
          disabled={isPending}
        >
          {isPending ? "Updating..." : (agent.isActive ? "Disable" : "Enable")}
        </Button>
      </CardFooter>
    </Card>
  );
}
