"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { installApp, configureApp, uninstallApp } from "@/app/apps/actions";
import type { AppWithStatus } from "@/lib/apps";

/** Must match the sentinel in actions.ts and page.tsx */
const MASKED_SENTINEL = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

interface AppConfigDialogProps {
  app: AppWithStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppConfigDialog({ app, open, onOpenChange }: AppConfigDialogProps) {
  if (app.status === "not_installed") {
    return (
      <InstallDialog app={app} open={open} onOpenChange={onOpenChange} />
    );
  }

  return (
    <ConfigureDialog app={app} open={open} onOpenChange={onOpenChange} />
  );
}

function InstallDialog({ app, open, onOpenChange }: AppConfigDialogProps) {
  const [state, action, pending] = useActionState(installApp, null);

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install {app.name}</DialogTitle>
          <DialogDescription>
            {app.description}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will add {app.name} to your integrations. You can configure it after installation.
        </p>
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <form action={action}>
            <input type="hidden" name="appId" value={app.id} />
            <Button type="submit" disabled={pending}>
              {pending ? "Installing..." : "Install"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A password input that shows a masked placeholder when a value exists.
 * On focus, clears the mask so the user can type a new value.
 * On blur, if left empty, restores the mask to preserve the existing secret.
 */
function SecretInput({
  fieldKey,
  hasExistingValue,
  placeholder,
  required,
}: {
  fieldKey: string;
  hasExistingValue: boolean;
  placeholder?: string;
  required: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Input
      ref={inputRef}
      id={fieldKey}
      name={fieldKey}
      type="password"
      placeholder={hasExistingValue ? "Leave blank to keep current" : placeholder}
      defaultValue={hasExistingValue ? MASKED_SENTINEL : ""}
      required={required && !hasExistingValue}
      onFocus={() => {
        if (inputRef.current?.value === MASKED_SENTINEL) {
          inputRef.current.value = "";
        }
      }}
      onBlur={() => {
        if (hasExistingValue && inputRef.current?.value === "") {
          inputRef.current.value = MASKED_SENTINEL;
        }
      }}
    />
  );
}

function ConfigureDialog({ app, open, onOpenChange }: AppConfigDialogProps) {
  const [configState, configAction, configPending] = useActionState(configureApp, null);
  const [uninstallState, uninstallAction, uninstallPending] = useActionState(uninstallApp, null);

  useEffect(() => {
    if (configState?.success || uninstallState?.success) {
      onOpenChange(false);
    }
  }, [configState, uninstallState, onOpenChange]);

  const existingConfig = app.config ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure {app.name}</DialogTitle>
          <DialogDescription>
            Enter your API credentials for {app.name}.
          </DialogDescription>
        </DialogHeader>

        <form action={configAction} className="space-y-4">
          <input type="hidden" name="appId" value={app.id} />

          {app.configFields.map((field) => {
            const existingValue = existingConfig[field.key] ?? "";
            const hasExistingValue = field.type === "password" && existingValue === MASKED_SENTINEL;

            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>

                {field.type === "password" ? (
                  <SecretInput
                    fieldKey={field.key}
                    hasExistingValue={hasExistingValue}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                ) : (
                  <Input
                    id={field.key}
                    name={field.key}
                    type={field.type}
                    placeholder={field.placeholder}
                    defaultValue={existingValue}
                    required={field.required}
                  />
                )}

                {configState?.fieldErrors?.[field.key] && (
                  <p className="text-sm text-destructive">
                    {configState.fieldErrors[field.key]?.[0]}
                  </p>
                )}
              </div>
            );
          })}

          {configState?.error && !configState.fieldErrors && (
            <p className="text-sm text-destructive">{configState.error}</p>
          )}
          {uninstallState?.error && (
            <p className="text-sm text-destructive">{uninstallState.error}</p>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <form action={uninstallAction}>
              <input type="hidden" name="appId" value={app.id} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={uninstallPending}
              >
                {uninstallPending ? "Uninstalling..." : "Uninstall"}
              </Button>
            </form>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={configPending}>
                {configPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
