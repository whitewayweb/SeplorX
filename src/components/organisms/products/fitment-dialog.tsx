"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, ChevronsUpDown, Plus, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

import type { FitmentRule } from "@/data/fitment";
import { addFitmentRule, updateFitmentRule } from "@/app/(dashboard)/products/fitment/actions";

const formSchema = z.object({
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  yearStart: z.string().optional(),
  yearEnd: z.string().optional(),
  position: z.enum(["Front", "Rear", "Both4Pc"]),
  series: z.string().min(1, "Series is required"),
});

type FormValues = z.infer<typeof formSchema>;

const SERIES_OPTIONS = ["A", "B", "C", "D", "E"] as const;

export function FitmentDialog({ 
  rule, 
  makes = [], 
  rules = [] 
}: { 
  rule?: FitmentRule;
  makes?: string[];
  rules?: FitmentRule[];
}) {
  const isEdit = !!rule;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1990 + 2 }, (_, i) =>
    (currentYear + 1 - i).toString()
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      make: rule?.make ?? "",
      model: rule?.model ?? "",
      yearStart: rule?.yearStart?.toString() ?? "none",
      yearEnd: rule?.yearEnd?.toString() ?? "none",
      position: rule?.position ?? "Front",
      series: rule?.series ?? "",
    },
  });

  const selectedMake = useWatch({ control: form.control, name: "make" }) as string;
  const modelOptions = selectedMake 
    ? Array.from(new Set(rules.filter(r => r.make === selectedMake).map(r => r.model))).sort()
    : [];

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        make: values.make,
        model: values.model,
        yearStart: values.yearStart !== "none" ? parseInt(values.yearStart || "") || undefined : undefined,
        yearEnd: values.yearEnd !== "none" ? parseInt(values.yearEnd || "") || undefined : undefined,
        position: values.position,
        series: values.series,
      };

      const result = isEdit
        ? await updateFitmentRule({ ...payload, id: rule!.id })
        : await addFitmentRule(payload);

      if (result.success) {
        setOpen(false);
        if (!isEdit) form.reset();
      }
    });
  }

  // Helper for Combobox allowing custom input if search doesn't match
  const [makeSearch, setMakeSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [makeOpen, setMakeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const handleCreateMake = () => {
    if (makeSearch) {
      form.setValue("make", makeSearch, { shouldValidate: true });
      form.setValue("model", ""); // reset model
      setMakeOpen(false);
    }
  };

  const handleCreateModel = () => {
    if (modelSearch) {
      form.setValue("model", modelSearch, { shouldValidate: true });
      setModelOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{isEdit ? "Edit Fitment Rule" : "Add Fitment Rule"}</DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Update the car-to-series mapping details."
                  : "Create a new mapping between a car model and a buffer series."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              {/* Make (Searchable Combobox) */}
              <FormField
                control={form.control}
                name="make"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Make</FormLabel>
                    <Popover open={makeOpen} onOpenChange={setMakeOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value || "Select make..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Search make..." 
                            value={makeSearch}
                            onValueChange={setMakeSearch}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                className="w-full justify-start font-normal text-sm" 
                                onClick={handleCreateMake}
                              >
                                Use &quot;{makeSearch}&quot;
                              </Button>
                            </CommandEmpty>
                            <CommandGroup>
                              {makes.map((m) => (
                                <CommandItem
                                  value={m}
                                  key={m}
                                  onSelect={() => {
                                    form.setValue("make", m, { shouldValidate: true });
                                    form.setValue("model", "");
                                    setMakeOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      m === field.value ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {m}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Model (Searchable Combobox) */}
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Model</FormLabel>
                    <Popover open={modelOpen} onOpenChange={setModelOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={!selectedMake}
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value || (selectedMake ? "Select model..." : "Select make auto.")}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Search model..." 
                            value={modelSearch}
                            onValueChange={setModelSearch}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                className="w-full justify-start font-normal text-sm" 
                                onClick={handleCreateModel}
                              >
                                Use &quot;{modelSearch}&quot;
                              </Button>
                            </CommandEmpty>
                            <CommandGroup>
                              {modelOptions.map((m) => (
                                <CommandItem
                                  value={m}
                                  key={m}
                                  onSelect={() => {
                                    form.setValue("model", m, { shouldValidate: true });
                                    setModelOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      m === field.value ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {m}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Years */}
              <div className="flex flex-col space-y-2 col-span-1 md:col-span-2">
                <FormLabel>Years (Start - End)</FormLabel>
                <div className="flex items-center gap-3 w-full">
                  <FormField
                    control={form.control}
                    name="yearStart"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="font-normal text-muted-foreground">
                              <SelectValue placeholder="Start Year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Any Year</SelectItem>
                            {years.map((y) => (
                              <SelectItem key={`start-${y}`} value={y}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <span className="text-muted-foreground font-medium">–</span>
                  <FormField
                    control={form.control}
                    name="yearEnd"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="font-normal text-muted-foreground">
                              <SelectValue placeholder="End Year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Any Year</SelectItem>
                            {years.map((y) => (
                              <SelectItem key={`end-${y}`} value={y}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Position */}
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Position</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="font-normal">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Front">Front</SelectItem>
                        <SelectItem value="Rear">Rear</SelectItem>
                        <SelectItem value="Both4Pc">Both (4pc Set)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Series */}
              <FormField
                control={form.control}
                name="series"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Series</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="font-normal text-muted-foreground">
                          <SelectValue placeholder="Buffer Series" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SERIES_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>Series {s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Rule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
