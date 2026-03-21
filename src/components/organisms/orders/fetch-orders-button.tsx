"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fetchChannelOrdersAction } from "@/app/(dashboard)/orders/actions";
import { useRouter } from "next/navigation";

export function FetchOrdersButton({
  channelId,
  channelName,
}: {
  channelId: number;
  channelName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleFetch() {
    startTransition(async () => {
      const result = await fetchChannelOrdersAction(channelId);
      if (result.success) {
        router.refresh();
      }
    });
  }

  return (
    <Button
      onClick={handleFetch}
      disabled={isPending}
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Fetching..." : `Fetch ${channelName} Orders`}
    </Button>
  );
}
