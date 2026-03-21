"use client";

import * as React from "react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PRESETS = [
  { label: "Today", getRange: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: "Yesterday", getRange: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
  { label: "Last 7 Days", getRange: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
  { label: "Last 30 Days", getRange: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
  { label: "This Month", getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Last Month", getRange: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "Year to Date", getRange: () => ({ from: startOfYear(new Date()), to: endOfDay(new Date()) }) },
  { label: "All Time", getRange: () => ({ from: undefined, to: undefined }) },
];

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Read the active synced date from the URL to enforce strict synchronicity
  const [date, setDate] = React.useState<DateRange | undefined>(() => {
    if (fromParam === "all") return { from: undefined, to: undefined };

    if (!fromParam && !toParam) {
      return {
        from: startOfDay(subDays(new Date(), 30)),
        to: endOfDay(new Date()),
      };
    }
    
    return {
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    };
  });
  
  const [isOpen, setIsOpen] = React.useState(false);

  // Re-sync State when external navigation (like pop-state) occurs
  React.useEffect(() => {
    if (fromParam === "all") return setDate({ from: undefined, to: undefined });
    if (!fromParam && !toParam) return setDate({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) });
    setDate({
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    });
  }, [fromParam, toParam]);

  const handleApply = (newDate: DateRange | undefined) => {
    setDate(newDate);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1"); 

    if (!newDate?.from) {
      params.set("from", "all");
      params.delete("to");
    } else {
      params.set("from", newDate.from.toISOString());
      if (newDate.to) {
        params.set("to", newDate.to.toISOString());
      } else {
        params.delete("to");
      }
    }
    router.push(`${pathname}?${params.toString()}`);
    setIsOpen(false);
  };

  return (
    <div className="grid gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[260px] justify-start text-left font-normal border-gray-300",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, yyyy")} -{" "}
                  {format(date.to, "LLL dd, yyyy")}
                </>
              ) : (
                format(date.from, "LLL dd, yyyy")
              )
            ) : (
              <span>All Time</span>
            )}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 flex items-stretch border-gray-200" align="start">
          <div className="flex flex-col gap-1 border-r border-gray-100 bg-gray-50 px-3 py-4 w-44">
            <span className="text-xs font-semibold text-gray-500 uppercase px-3 pb-2 tracking-wider">Presets</span>
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                className="justify-start text-sm hover:bg-white hover:shadow-sm h-8"
                onClick={() => setDate(preset.getRange())}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="px-2 py-4 bg-white flex flex-col justify-between">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
              captionLayout="dropdown"
              fromYear={2015}
              toYear={new Date().getFullYear() + 1}
              classNames={{
                dropdowns: "flex justify-center gap-1.5",
                vhidden: "hidden", 
              }}
            />
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t px-2">
              <Button variant="outline" size="sm" onClick={() => {
                // Cancel explicitly resets internal state to strictly mirror the URL again!
                if (fromParam === "all") return setDate({ from: undefined, to: undefined });
                if (!fromParam && !toParam) return setDate({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) });
                setDate({
                  from: fromParam ? new Date(fromParam) : undefined,
                  to: toParam ? new Date(toParam) : undefined,
                })
                setIsOpen(false);
              }}>
                Cancel
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleApply(date)}>
                Apply Date Range
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
