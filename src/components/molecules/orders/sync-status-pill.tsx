"use client";

import { formatDistanceToNow } from "date-fns";
import { FetchOrdersButton } from "@/components/organisms/orders/fetch-orders-button";
import { ClearOrdersButton } from "@/components/organisms/orders/clear-orders-button";


interface SyncStatusPillProps {
  channelId: number;
  channelName: string;
  lastSyncAt?: Date | null;
  color?: string;
  showClear?: boolean;
}

export function SyncStatusPill({
  channelId,
  channelName,
  lastSyncAt,
  color = "#64748b", // slate-500 default
  showClear = false,
}: SyncStatusPillProps) {
  // Generate a background color with 10% opacity for the tint effect
  const backgroundColor = `${color}1a`; // 1a is ~10% alpha in hex
  const borderColor = `${color}33`;     // 33 is ~20% alpha in hex

  return (
    <div 
      className="flex items-center gap-3 pl-4 pr-1 py-1 rounded-full border transition-all hover:brightness-95"
      style={{ 
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        color: color 
      }}
    >
      <div className="flex flex-col">
        <span className="text-xs font-bold leading-tight" style={{ color: color }}>
          {channelName}
        </span>
        {lastSyncAt ? (
          <span className="text-[10px] opacity-70 font-medium">
            Synced {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-[10px] opacity-60 font-medium italic">Never synced</span>
        )}
      </div>

      <div className="flex items-center gap-0.5 border-l border-current/20 pl-2">
        <FetchOrdersButton
          channelId={channelId}
          channelName={channelName}
          variant="ghost"
        />
        {showClear && (
          <ClearOrdersButton channelId={channelId} variant="ghost" />
        )}
      </div>
    </div>
  );
}

