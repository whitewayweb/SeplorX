"use client";

import { useActionState, useEffect, useRef, startTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/atoms/password-input";
import { updateChannel, getChannelConfig } from "@/app/(dashboard)/channels/actions";
import { getChannelById } from "@/lib/channels/registry";
import type { ChannelType } from "@/lib/channels/types";
import type { ChannelInstance } from "@/lib/channels/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditChannelDialogProps {
  channel: ChannelInstance | null;
  onOpenChange: (open: boolean) => void;
}

export function EditChannelDialog({ channel, onOpenChange }: EditChannelDialogProps) {
  const [state, action, pending] = useActionState(updateChannel, null);

  const [configState, fetchConfigAction, fetchingConfig] = useActionState(
    async (_state: Record<string, string>, channelId: number) => {
      const res = await getChannelConfig(channelId);
      return res.success && res.config ? res.config : {};
    },
    {}
  );

  const channelDef = channel ? getChannelById(channel.channelType as ChannelType) : null;

  // Track which channel ID we've already fetched config for to prevent double-firing.
  // useActionState returns a new fetchConfigAction reference each render, so we
  // cannot put it in the dependency array — that would cause an infinite loop.
  const fetchedForId = useRef<number | null>(null);

  useEffect(() => {
    if (channel && fetchedForId.current !== channel.id) {
      fetchedForId.current = channel.id;
      startTransition(() => {
        fetchConfigAction(channel.id);
      });
    }
    if (!channel) {
      fetchedForId.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
    }
  }, [state?.success, onOpenChange]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      action(formData);
    });
  };

  return (
    <Dialog open={!!channel} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Channel</DialogTitle>
        </DialogHeader>
        <form key={channel?.id || "empty"} onSubmit={handleSubmit} className="py-4">
          <input type="hidden" name="id" value={channel?.id || ""} />

          <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(state?.fieldErrors?.name)}>
            <FieldLabel htmlFor="edit-name">Channel Name</FieldLabel>
            <Input
              id="edit-name"
              name="name"
              defaultValue={channel?.name || ""}
              placeholder="e.g. My Awesome Store"
              required
              aria-invalid={Boolean(state?.fieldErrors?.name)}
            />
            <FieldError>{state?.fieldErrors?.name?.[0]}</FieldError>
          </Field>

          <Field data-invalid={Boolean(state?.fieldErrors?.defaultPickupLocation)}>
            <FieldLabel htmlFor="edit-pickup">Default Pickup Location</FieldLabel>
            <Input
              id="edit-pickup"
              name="defaultPickupLocation"
              defaultValue={channel?.defaultPickupLocation || ""}
              placeholder="e.g. Main Warehouse"
              aria-invalid={Boolean(state?.fieldErrors?.defaultPickupLocation)}
            />
            <FieldError>{state?.fieldErrors?.defaultPickupLocation?.[0]}</FieldError>
          </Field>

          {!fetchingConfig && channelDef?.configFields?.map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`config-${field.key}`}>
                {field.label}
              </FieldLabel>
              {field.type === "select" && field.options ? (
                <Select
                  name={field.key}
                  defaultValue={configState[field.key] ?? ""}
                >
                  <SelectTrigger id={`config-${field.key}`}>
                    <SelectValue placeholder={field.placeholder ?? "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "password" ? (
                <PasswordInput
                  id={`config-${field.key}`}
                  name={field.key}
                  placeholder="Leave blank to keep unchanged"
                  defaultValue={configState[field.key] ?? ""}
                />
              ) : (
                <Input
                  id={`config-${field.key}`}
                  name={field.key}
                  type={field.type === "url" ? "url" : "text"}
                  placeholder={field.placeholder}
                  defaultValue={configState[field.key] ?? ""}
                />
              )}
            </Field>
          ))}

          {state?.error && <FieldError>{state.error}</FieldError>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
