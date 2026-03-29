"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DownloadCloud, Loader2 } from "lucide-react";
import { seedFitmentRegistry } from "@/app/(dashboard)/products/fitment/actions";
import { toast } from "sonner";

export function FitmentSeedButton() {
  const [isPending, startTransition] = useTransition();

  const handleSeed = () => {
    startTransition(async () => {
      const res = await seedFitmentRegistry();
      if (res?.success) {
        toast.success(`Loaded ${res.count} automotive defaults from the Hiya chart.`, {
          description: "All existing rules were overwritten.",
        });
      } else {
        toast.error("Failed to seed defaults");
      }
    });
  };

  return (
    <Button
      variant="secondary"
      onClick={handleSeed}
      disabled={isPending}
      className="gap-2"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <DownloadCloud className="h-4 w-4" />
      )}
      Seed Defaults
    </Button>
  );
}
