"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { syncOrderFinancesAction } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncFinancesButton({
  channelId,
  orderId,
  variant = "outline",
  size = "sm",
}: {
  channelId: number;
  orderId?: number;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSync() {
    startTransition(async () => {
      const result = await syncOrderFinancesAction(channelId, orderId);
      if (result.success) {
        toast.success("Finance sync completed", {
          description: `${result.checked} checked, ${result.synced} synced, ${result.noData} no data, ${result.failed} failed.`,
        });
        router.refresh();
      } else {
        toast.error("Finance sync failed", { description: result.error });
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={handleSync}
      disabled={isPending}
      variant={variant}
      size={size}
      className={cn("gap-2", variant === "ghost" && "h-8 px-2")}
    >
      <ReceiptText className={cn("h-4 w-4", isPending && "animate-pulse")} />
      {isPending ? "Syncing..." : "Sync finances"}
    </Button>
  );
}
