"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppCategory, AppWithStatus } from "@/lib/apps";
import { AppGrid } from "./app-grid";

interface CategoryTabsProps {
  categories: AppCategory[];
  categoryLabels: Record<string, string>;
  apps: AppWithStatus[];
}

export function CategoryTabs({ categories, categoryLabels, apps }: CategoryTabsProps) {
  return (
    <Tabs defaultValue={categories[0]}>
      <TabsList>
        {categories.map((cat) => (
          <TabsTrigger key={cat} value={cat}>
            {categoryLabels[cat]}
          </TabsTrigger>
        ))}
      </TabsList>
      {categories.map((cat) => (
        <TabsContent key={cat} value={cat}>
          <AppGrid apps={apps.filter((a) => a.category === cat)} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
