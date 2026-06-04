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
  series: string; // "A", "B", "C", "D", "E"; empty means pending admin review
};

const FITMENT_KEY = "fitment:registry";

export async function getFitmentRegistry(): Promise<FitmentRule[]> {
  const result = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, FITMENT_KEY))
    .limit(1);

  if (!result.length || !Array.isArray(result[0].value)) return [];
  const rules = result[0].value as FitmentRule[];
  return rules.map(rule => ({
    ...rule,
    make: rule.make ? rule.make.trim().toUpperCase() : "",
    model: rule.model ? rule.model.trim().toUpperCase() : "",
  }));
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

export async function ensurePendingFitmentRule(rule: Omit<FitmentRule, "id" | "series">) {
  const currentRules = await getFitmentRegistry();
  const existing = currentRules.find((currentRule) =>
    isSameFitmentRule(currentRule, rule)
  );

  if (existing) return existing;

  const pendingRule: FitmentRule = {
    ...rule,
    id: Math.random().toString(36).substring(2, 9),
    series: "",
  };

  await saveFitmentRegistry([...currentRules, pendingRule]);
  return pendingRule;
}

function isSameFitmentRule(
  left: Pick<FitmentRule, "make" | "model" | "position" | "yearStart" | "yearEnd">,
  right: Pick<FitmentRule, "make" | "model" | "position" | "yearStart" | "yearEnd">,
) {
  return (
    normalizeFitmentValue(left.make) === normalizeFitmentValue(right.make) &&
    normalizeFitmentValue(left.model) === normalizeFitmentValue(right.model) &&
    left.position === right.position &&
    left.yearStart === right.yearStart &&
    left.yearEnd === right.yearEnd
  );
}

function normalizeFitmentValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
