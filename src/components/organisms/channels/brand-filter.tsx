"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface BrandFilterProps {
    brands: string[];
}

const ALL_VALUE = "__all__";

/**
 * A URL-driven brand-name dropdown filter.
 *
 * - Reads/writes the `brand` search-param (same pattern as TableSearch with `q`).
 * - Resets pagination to page 1 whenever the selection changes.
 * - Hidden automatically when the channel has no brand data.
 */
export function BrandFilter({ brands }: BrandFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [, startTransition] = useTransition();

    // Always respect whatever is already in the URL, even if brands list is empty
    const currentBrand = searchParams.get("brand") ?? "";

    if (brands.length === 0) return null;

    const handleChange = (value: string) => {
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

    return (
        <Select value={currentBrand || ALL_VALUE} onValueChange={handleChange}>
            <SelectTrigger className="h-10 bg-white min-w-[180px] max-w-[260px]">
                <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL_VALUE}>All brands</SelectItem>
                {brands.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                        {brand}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
