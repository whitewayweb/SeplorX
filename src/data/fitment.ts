import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type FitmentRule = {
  id: string;
  make: string;
  model: string;
  yearStart?: number;
  yearEnd?: number;
  position: "Front" | "Rear" | "Both4Pc";
  series: string; // "A", "B", "C", "D", "E"
};

const FITMENT_KEY = "fitment:registry";

export async function getFitmentRegistry(): Promise<FitmentRule[]> {
  const result = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, FITMENT_KEY))
    .limit(1);

  if (!result.length || !Array.isArray(result[0].value)) return [];
  return result[0].value as FitmentRule[];
}

export async function saveFitmentRegistry(rules: FitmentRule[]) {
  await db
    .insert(settings)
    .values({ key: FITMENT_KEY, value: rules })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: rules, updatedAt: new Date() },
    });
}
