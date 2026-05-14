"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fetchChannelOrdersAction } from "@/app/(dashboard)/orders/actions";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function FetchOrdersButton({
  channelId,
  channelName,
  variant = "default",
}: {
  channelId: number;
  channelName: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleFetch() {
    startTransition(async () => {
      const result = await fetchChannelOrdersAction(channelId);
      if (result.success) {
        const financeText =
          "financeReconciliation" in result && result.financeReconciliation
            ? ` Finance: ${result.financeReconciliation.checked} checked, ${result.financeReconciliation.synced} synced, ${result.financeReconciliation.noData} no data, ${result.financeReconciliation.failed} failed.`
            : "";

        if ("amazonShippedReconciliation" in result && result.amazonShippedReconciliation) {
          const reconciliation = result.amazonShippedReconciliation;
          toast.success("Orders fetched", {
            description: `Amazon shipped check: ${reconciliation.checked} checked, ${reconciliation.delivered} delivered, ${reconciliation.unchanged} unchanged, ${reconciliation.failed} failed.${financeText}`,
          });
        } else {
          toast.success("Orders fetched", {
            description: `Order sync completed.${financeText}`,
          });
        }
        router.refresh();
      } else {
        toast.error("Fetch failed", { description: result.error });
      }
    });
  }

  const buttonLabel = variant === "ghost" ? "Fetch" : `Fetch ${channelName} Orders`;

  return (
    <Button
      onClick={handleFetch}
      disabled={isPending}
      variant={variant}
      className={cn("gap-2", variant === "ghost" && "h-8 px-2 text-inherit hover:bg-current/10")}
    >
      <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
      {isPending ? "Fetching..." : buttonLabel}
    </Button>
  );
}
