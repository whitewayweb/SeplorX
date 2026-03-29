"use server";

import { getFitmentRegistry, saveFitmentRegistry, type FitmentRule } from "@/data/fitment";
import { flattenChartToRules } from "@/lib/fitment-constants";
import { revalidatePath } from "next/cache";

/**
 * Adds a new fitment rule.
 * Reads current state from DB (not client) to avoid stale-data overwrites.
 */
export async function addFitmentRule(rule: Omit<FitmentRule, "id">) {
  try {
    const currentRules = await getFitmentRegistry();
    const newRule: FitmentRule = {
      ...rule,
      id: Math.random().toString(36).substring(2, 9),
    };
    await saveFitmentRegistry([...currentRules, newRule]);
    revalidatePath("/products/fitment");
    return { success: true };
  } catch (error) {
    console.error("[addFitmentRule]", error);
    return { success: false, error: "Failed to add fitment rule" };
  }
}

/**
 * Updates an existing fitment rule by ID.
 * Reads current state from DB (not client) to avoid stale-data overwrites.
 */
export async function updateFitmentRule(rule: FitmentRule) {
  try {
    const currentRules = await getFitmentRegistry();
    const updatedRules = currentRules.map((r) => (r.id === rule.id ? rule : r));
    await saveFitmentRegistry(updatedRules);
    revalidatePath("/products/fitment");
    return { success: true };
  } catch (error) {
    console.error("[updateFitmentRule]", error);
    return { success: false, error: "Failed to update fitment rule" };
  }
}

/**
 * Deletes a fitment rule by ID.
 * Reads current state from DB (not client) to avoid stale-data overwrites.
 */
export async function deleteFitmentRule(ruleId: string) {
  try {
    const currentRules = await getFitmentRegistry();
    const updatedRules = currentRules.filter((r) => r.id !== ruleId);
    await saveFitmentRegistry(updatedRules);
    revalidatePath("/products/fitment");
    return { success: true };
  } catch (error) {
    console.error("[deleteFitmentRule]", error);
    return { success: false, error: "Failed to delete fitment rule" };
  }
}

/**
 * Seeds the fitment registry from the Hiya Automotive chart data.
 * Replaces all existing rules with the chart data.
 */
/** @public */
export async function seedFitmentRegistry() {
  try {
    const chartRules = flattenChartToRules();
    const rules: FitmentRule[] = chartRules.map((r) => ({
      ...r,
      id: Math.random().toString(36).substring(2, 9),
    }));
    await saveFitmentRegistry(rules);
    revalidatePath("/products/fitment");
    return { success: true, count: rules.length };
  } catch (error) {
    console.error("[seedFitmentRegistry]", error);
    return { success: false, error: "Failed to seed fitment registry" };
  }
}
