"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function TableSearch({ placeholder = "Search..." }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQuery = searchParams.get("q") || "";
  const [localQuery, setLocalQuery] = useState(currentQuery);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalQuery(currentQuery);
  }, [currentQuery]);

  const handleSearch = (value: string) => {
    setLocalQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams);
        if (value) {
          params.set("q", value);
        } else {
          params.delete("q");
        }
        params.delete("page"); // Reset to page 1 on new search
        router.replace(`${pathname}?${params.toString()}`);
      });
    }, 400); // 400ms debounce
  };

  return (
    <div className="relative w-full max-w-sm">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <Search className={`h-4 w-4 ${isPending ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
      </div>
      <Input
        type="search"
        placeholder={placeholder}
        value={localQuery}
        onChange={(e) => handleSearch(e.target.value)}
        className="pl-9 h-10 bg-white"
      />
    </div>
  );
}
