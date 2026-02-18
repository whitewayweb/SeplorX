"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deletePayment } from "@/app/invoices/actions";
import { Trash2 } from "lucide-react";

interface DeletePaymentButtonProps {
  paymentId: number;
}

export function DeletePaymentButton({ paymentId }: DeletePaymentButtonProps) {
  const [state, action, pending] = useActionState(deletePayment, null);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={paymentId} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title="Delete payment"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      {state?.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}
