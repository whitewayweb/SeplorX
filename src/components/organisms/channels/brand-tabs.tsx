"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

interface BrandTabsProps {
    brands: string[];
}

const ALL_VALUE = "";

/**
 * URL-driven brand tab bar.
 *
 * - Reads/writes the `brand` search-param.
 * - "All" tab shown first; one tab per brand thereafter.
 * - Resets pagination to page 1 whenever the selection changes.
 * - Hidden when the channel has no brand data at all.
 */
export function BrandTabs({ brands }: BrandTabsProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    if (brands.length === 0) return null;

    const currentBrand = searchParams.get("brand") ?? ALL_VALUE;

    const handleSelect = (value: string) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams);
            if (value && value !== ALL_VALUE) {
                params.set("brand", value);
            } else {
                params.delete("brand");
            }
            params.delete("page"); // reset to page 1 when filter changes
            router.replace(`${pathname}?${params.toString()}`);
        });
    };

    const tabs = [{ label: "All", value: ALL_VALUE }, ...brands.map((b) => ({ label: b, value: b }))];

    return (
        <div
            className={cn(
                "flex items-center gap-1 flex-wrap border-b border-border pb-0",
                isPending && "opacity-60 pointer-events-none"
            )}
            role="tablist"
            aria-label="Filter by brand"
        >
            {tabs.map(({ label, value }) => {
                const isActive = value === currentBrand;
                return (
                    <button
                        key={value || "__all__"}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => handleSelect(value)}
                        className={cn(
                            "relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t-sm",
                            isActive
                                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary after:rounded-t-full"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
