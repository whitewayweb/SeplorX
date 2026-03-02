"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateChannel, getChannelConfig } from "@/app/channels/actions";
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
  const [name, setName] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);

  const channelDef = channel ? getChannelById(channel.channelType as ChannelType) : null;

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setPickupLocation(channel.defaultPickupLocation || "");

      // Load config fields asynchronously
      setLoadingConfig(true);
      getChannelConfig(channel.id)
        .then((res) => {
          if (res.success && res.config) {
            setConfig(res.config);
          }
        })
        .finally(() => setLoadingConfig(false));
    } else {
      setConfig({});
    }
  }, [channel]);

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
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <input type="hidden" name="id" value={channel?.id || ""} />

          <div className="space-y-2">
            <Label htmlFor="edit-name">Channel Name</Label>
            <Input
              id="edit-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Awesome Store"
              required
            />
            {state?.fieldErrors?.name && (
              <p className="text-destructive text-xs">{state.fieldErrors.name[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-pickup">Default Pickup Location</Label>
            <Input
              id="edit-pickup"
              name="defaultPickupLocation"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              placeholder="e.g. Main Warehouse"
            />
            {state?.fieldErrors?.defaultPickupLocation && (
              <p className="text-destructive text-xs">{state.fieldErrors.defaultPickupLocation[0]}</p>
            )}
          </div>

          {!loadingConfig && channelDef?.configFields?.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`config-${field.key}`}>
                {field.label}
              </Label>
              {field.type === "select" && field.options ? (
                <Select
                  name={field.key}
                  value={config[field.key] ?? ""}
                  onValueChange={(value) => setConfig((prev) => ({ ...prev, [field.key]: value }))}
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
              ) : (
                <Input
                  id={`config-${field.key}`}
                  name={field.key}
                  type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                  placeholder={field.type === "password" ? "Leave blank to keep unchanged" : field.placeholder}
                  value={config[field.key] ?? ""}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          {state?.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
