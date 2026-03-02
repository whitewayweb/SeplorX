"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clearChannelProducts } from "@/app/channels/actions";

interface ClearProductsButtonProps {
  channelId: number;
}

export function ClearProductsButton({ channelId }: ClearProductsButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleClear() {
    startTransition(async () => {
      const result = await clearChannelProducts(channelId);
      if (result.error) {
        toast.error("Failed to clear products", { description: result.error });
      } else {
        toast.success("Products cleared", {
          description: "All synced products for this channel have been removed.",
        });
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="gap-2"
        disabled={pending}
      >
        <Trash2 className="h-4 w-4" />
        {pending ? "Clearing..." : "Clear Products"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all synced products for this channel from the database.
              You can fetch them again later using the &quot;Fetch Products&quot; button.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                handleClear();
              }}
              disabled={pending}
            >
              {pending ? "Deleting..." : "Delete Products"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
