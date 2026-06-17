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

/**
 * Fuzzy-match a make/model/position against the database Fitment Registry.
 * Returns the resolved series for the given position.
 * Returns null if no match found.
 *
 * Uses case-insensitive substring matching to handle LLM extraction variance.
 */
export async function lookupFitmentSeries(
  make: string,
  model: string,
  position: "front" | "rear" | "both",
): Promise<{ series: string; seriesRear?: string; matchedMake: string; matchedModel: string } | null> {
  const makeNorm = normalizeFitmentToken(make);
  const modelNorm = normalizeFitmentToken(model);

  // 1. Fetch Dynamic Registry from Database
  const dbRules = await getFitmentRegistry();

  if (dbRules.length > 0) {
    // A. Find best match for Make (case insensitive, space/dash agnostic)
    const matchingMakeRules = dbRules.filter((r) => {
      const dbMakeNorm = normalizeFitmentToken(r.make);
      return dbMakeNorm === makeNorm || dbMakeNorm.includes(makeNorm) || makeNorm.includes(dbMakeNorm);
    });

    if (matchingMakeRules.length > 0) {
      const matchedMake = matchingMakeRules[0].make;

      // B. Find best match for Model
      const matchingModelRules = matchingMakeRules.filter((r) => {
        const dbModelNorm = normalizeFitmentToken(r.model);
        return dbModelNorm === modelNorm || dbModelNorm.includes(modelNorm) || modelNorm.includes(dbModelNorm);
      });

      if (matchingModelRules.length > 0) {
        const matchedModel = matchingModelRules[0].model;

        // C. Resolve position ("front" | "rear" | "both")
        if (position === "both") {
          const matchFront = matchingModelRules.find(r => r.position === "Front" || r.position === "Both4Pc");
          const matchRear = matchingModelRules.find(r => r.position === "Rear" || r.position === "Both4Pc");
          
          if (matchFront?.series && matchRear?.series) {
            return { series: matchFront.series, seriesRear: matchRear.series, matchedMake, matchedModel };
          }
          // For a bundle, both series must be available.
          return null;
        } else {
          const targetPosition = position.charAt(0).toUpperCase() + position.slice(1);
          const match = matchingModelRules.find(r => r.position === targetPosition || r.position === "Both4Pc");
          
          if (match?.series) {
            return { series: match.series, matchedMake, matchedModel };
          }
        }
      }
    }
  }

  // Fallback removed — Agent now strictly follows the DB registry.
  return null;
}

function normalizeFitmentToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function createPendingFitmentRuleFromExtraction(
  make: string,
  model: string,
  position: "front" | "rear" | "both",
) {
  // Apply aliases before they even enter the DB
  let finalMake = make.trim().toUpperCase();
  let finalModel = model.trim().toUpperCase();

  const makeAliases: Record<string, string> = {
    'VW': 'VOLKSWAGEN',
    'LR': 'LAND ROVER',
    'LANDROVER': 'LAND ROVER',
    'LROVER': 'LAND ROVER',
    'LAND': 'LAND ROVER',
    'MARUTISU': 'MARUTI',
    'MARUTI SUZUKI': 'MARUTI',
  };

  const modelAliases: Record<string, string> = {
    'T ROC': 'T-ROC',
    'DISCVRY': 'DISCOVERY',
    'ROVER DISCOVERY': 'DISCOVERY',
    'STINGGRAY': 'STINGRAY',
    'QUATTROPO': 'QUATTROPORTE',
    'QUATT': 'QUATTROPORTE',
    'COUNTRYMEN': 'COUNTRYMAN',
    'DEFNDR': 'DEFENDER',
    'E 6': 'E6',
    'SPRK': 'SPARK',
    'TRAILBLA': 'TRAILBLAZER',
    'TBZR': 'TRAILBLAZER',
    'ABRTH 595': 'ABARTH 595',
    'GKH XPLR': 'GURKHA',
    'ESPORT': 'ECO SPORT',
    'MOBILO': 'MOBILIO',
    'SOANTA N': 'SONATA',
    'BREEZA': 'BREZZA',
    'VITARA BREZA': 'BREZZA',
    'JIMMY': 'JIMNY',
    'SUZUKIJIMNY': 'JIMNY',
    'WAGON EV': 'WAGONR EV',
    'EC W210': 'E CL W210',
    'EC W212': 'E CL W212',
    'EC W213': 'E CL W213',
    'WINDSAR': 'WINDSOR',
    'CP CONVERTIBL': 'COOPER CONVERTIBLE',
    'XTRIAL': 'X-TRAIL',
  };

  if (makeAliases[finalMake]) {
    finalMake = makeAliases[finalMake];
  }
  if (modelAliases[finalModel]) {
    finalModel = modelAliases[finalModel];
  }

  if (position === "both") {
    // Ensure both front and rear exist in the registry for user assignment
    const front = await ensurePendingFitmentRule({
      make: finalMake,
      model: finalModel,
      position: "Front",
    });
    await ensurePendingFitmentRule({
      make: finalMake,
      model: finalModel,
      position: "Rear",
    });
    return front; // return just one for logging
  }

  const registryPosition = position.charAt(0).toUpperCase() + position.slice(1) as "Front" | "Rear";

  return ensurePendingFitmentRule({
    make: finalMake,
    model: finalModel,
    position: registryPosition,
  });
}

