"use client";

import { useState, useActionState } from "react";
import Image from "next/image";
import { Check, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createChannel } from "@/app/channels/actions";
import { channelRegistry } from "@/lib/channels/registry";
import type { ChannelType, ChannelDefinition } from "@/lib/channels/types";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Select Channel",
  2: "Channel Name",
  3: "Default Preference",
  4: "Connect",
};

function StepIndicator({
  step,
  currentStep,
  label,
}: {
  step: Step;
  currentStep: Step;
  label: string;
}) {
  const done = currentStep > step;
  const active = currentStep === step;
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
          done && "bg-primary border-primary text-primary-foreground",
          active && "border-primary text-primary",
          !done && !active && "text-muted-foreground border-muted-foreground/40",
        )}
      >
        {done ? <Check className="h-3 w-3" /> : step}
      </div>
      <span
        className={cn(
          "text-sm",
          active ? "font-medium" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function ChannelCard({
  definition,
  selected,
  onSelect,
}: {
  definition: ChannelDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={definition.available ? onSelect : undefined}
      className={cn(
        "relative flex flex-col items-center gap-3 rounded-lg border p-4 text-center transition-colors",
        definition.available
          ? "hover:border-primary cursor-pointer"
          : "cursor-not-allowed opacity-50",
        selected && "border-primary bg-primary/5",
      )}
    >
      {definition.icon ? (
        <Image
          src={definition.icon}
          alt={definition.name}
          width={40}
          height={40}
          className="shrink-0"
        />
      ) : (
        <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-md">
          <Store className="text-muted-foreground h-5 w-5" />
        </div>
      )}
      <div>
        <p className="text-sm font-medium">{definition.name}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {definition.description}
        </p>
      </div>
      {!definition.available && (
        <span className="bg-muted text-muted-foreground absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
          Soon
        </span>
      )}
      {selected && (
        <div className="bg-primary text-primary-foreground absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full">
          <Check className="h-3 w-3" />
        </div>
      )}
    </button>
  );
}

interface WooCommerceStepProps {
  name: string;
  pickupLocation: string;
  storeUrl: string;
  onStoreUrlChange: (v: string) => void;
  onBack: () => void;
}

function WooCommerceConnectStep({
  name,
  pickupLocation,
  storeUrl,
  onStoreUrlChange,
  onBack,
}: WooCommerceStepProps) {
  const [state, action, pending] = useActionState(createChannel, null);
  const [urlError, setUrlError] = useState("");

  async function handleConnect() {
    if (!storeUrl) {
      setUrlError("Store URL is required");
      return;
    }
    setUrlError("");

    const formData = new FormData();
    formData.set("channelType", "woocommerce");
    formData.set("name", name);
    formData.set("storeUrl", storeUrl);
    formData.set("defaultPickupLocation", pickupLocation);

    // We use startTransition via useActionState — call the action directly
    action(formData);
  }

  // Once action succeeds we have channelId — redirect to WooCommerce authorize URL
  if (state?.success && state.channelId) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(storeUrl);
    } catch {
      return; // invalid URL — shouldn't reach here post-validation
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return; // reject non-http(s) protocols
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const callbackUrl = `${appUrl}/api/channels/woocommerce/callback`;
    const returnUrl = `${appUrl}/channels?connected=1`;
    const params = new URLSearchParams({
      app_name: "SeplorX",
      scope: "read_write",
      user_id: String(state.channelId),
      return_url: returnUrl,
      callback_url: callbackUrl,
    });
    const authorizeUrl = `${parsedUrl.origin}/wc-auth/v1/authorize?${params}`;
    window.location.assign(authorizeUrl);
  }

  const fieldErrors = state?.fieldErrors;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-sm">
          Enter your WooCommerce store URL. You&apos;ll be redirected to your
          WordPress admin to approve the connection.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="storeUrl">Store URL</Label>
        <Input
          id="storeUrl"
          type="url"
          placeholder="https://yourstore.com"
          value={storeUrl}
          onChange={(e) => {
            onStoreUrlChange(e.target.value);
            setUrlError("");
          }}
        />
        {(urlError || fieldErrors?.storeUrl?.[0]) && (
          <p className="text-destructive text-xs">
            {urlError || fieldErrors?.storeUrl?.[0]}
          </p>
        )}
      </div>

      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={handleConnect} disabled={pending}>
          {pending ? "Connecting…" : "Integrate in 1-Click"}
        </Button>
      </div>
    </div>
  );
}

export function AddChannelWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [selectedType, setSelectedType] = useState<ChannelType | null>(null);
  const [channelName, setChannelName] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [nameError, setNameError] = useState("");

  function reset() {
    setStep(1);
    setSelectedType(null);
    setChannelName("");
    setPickupLocation("");
    setStoreUrl("");
    setNameError("");
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function handleSelectChannel(type: ChannelType) {
    setSelectedType(type);
    setStep(2);
  }

  function handleNameNext() {
    if (!channelName.trim()) {
      setNameError("Channel name is required");
      return;
    }
    setNameError("");
    setStep(3);
  }

  const popularChannels = channelRegistry.filter((c) => c.popular);
  const otherChannels = channelRegistry.filter((c) => !c.popular);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>New Channel</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <div className="flex min-h-[480px]">
          {/* Left sidebar */}
          <div className="bg-muted/40 flex w-52 shrink-0 flex-col gap-1 rounded-l-lg border-r p-5">
            <p className="mb-4 text-sm font-semibold">Steps to connect</p>
            <div className="flex flex-col gap-3">
              {([1, 2, 3, 4] as Step[]).map((s) => (
                <StepIndicator
                  key={s}
                  step={s}
                  currentStep={step}
                  label={STEP_LABELS[s]}
                />
              ))}
            </div>

            {selectedType === "woocommerce" && step >= 2 && (
              <div className="mt-6 rounded-md border bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Image
                    src="/channels/woocommerce.svg"
                    alt="WooCommerce"
                    width={20}
                    height={20}
                  />
                  <span className="text-xs font-semibold">WooCommerce</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Sync your orders with WooCommerce
                </p>
              </div>
            )}
          </div>

          {/* Main content */}
          <div className="flex flex-1 flex-col p-6">
            <DialogHeader className="mb-6">
              <DialogTitle>
                {step === 1 && "Add Channel"}
                {step === 2 && "Channel Name"}
                {step === 3 && "Default Preference"}
                {step === 4 && "Connect WooCommerce"}
              </DialogTitle>
            </DialogHeader>

            {/* Step 1: Select Channel */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Choose the channel you want to connect.
                </p>
                {popularChannels.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Popular Channels
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {popularChannels.map((def) => (
                        <ChannelCard
                          key={def.id}
                          definition={def}
                          selected={selectedType === def.id}
                          onSelect={() => handleSelectChannel(def.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {otherChannels.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Other
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {otherChannels.map((def) => (
                        <ChannelCard
                          key={def.id}
                          definition={def}
                          selected={selectedType === def.id}
                          onSelect={() => handleSelectChannel(def.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Channel Name */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Give this channel a name to identify it.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="channelName">Channel Name</Label>
                  <Input
                    id="channelName"
                    placeholder="e.g. hiyaautomotive.com"
                    value={channelName}
                    onChange={(e) => {
                      setChannelName(e.target.value);
                      setNameError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
                    autoFocus
                  />
                  {nameError && (
                    <p className="text-destructive text-xs">{nameError}</p>
                  )}
                </div>
                <div className="flex justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                  <Button type="button" onClick={handleNameNext}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Default Preference */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Set the default pickup location for orders from this channel.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="pickupLocation">
                    Default Pickup Location
                  </Label>
                  <Input
                    id="pickupLocation"
                    placeholder="e.g. Main Warehouse"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                  >
                    Back
                  </Button>
                  <Button type="button" onClick={() => setStep(4)}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Connect (WooCommerce only for now) */}
            {step === 4 && selectedType === "woocommerce" && (
              <WooCommerceConnectStep
                name={channelName}
                pickupLocation={pickupLocation}
                storeUrl={storeUrl}
                onStoreUrlChange={setStoreUrl}
                onBack={() => setStep(3)}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
