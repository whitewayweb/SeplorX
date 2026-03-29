/**
 * Fitment Chart Data — extracted from Hiya Automotive compatibility charts.
 *
 * Structure: FITMENT_CHART[make][model] = { front: series | null, rear: series | null }
 *
 * Series values: "A", "B", "C", "D", "E" (buffer size/type)
 * null = buffer not applicable or data unavailable for that position.
 */

type ChartEntry = { front: string | null; rear: string | null };

export const FITMENT_CHART: Record<string, Record<string, ChartEntry>> = {
  Mercedes: {
    "A 200": { front: "A", rear: "A" },
    "A 180": { front: "A", rear: "B" },
    "B 108": { front: "A", rear: "B" },
    "B 200": { front: "A", rear: "A" },
    "B 250": { front: "A", rear: "B" },
    "C 220": { front: "A", rear: "A" },
    "C 200": { front: "B", rear: "B" },
    "C 250": { front: "A", rear: "A" },
    "E 220": { front: "A", rear: "D" },
    "E 250": { front: "A", rear: "A" },
    "CLA 200": { front: "A", rear: "A" },
    "ML 250": { front: "D", rear: "C" },
    "GLA 200": { front: "A", rear: "B" },
    "SLK 350": { front: "A", rear: null },
    "G-Class": { front: "A", rear: "D" },
    "C-Class": { front: "A", rear: "D" },
    "E-Class": { front: "A", rear: "D" },
    "M-Class": { front: "A", rear: "D" },
    "GLA Class": { front: "D", rear: null },
  },
  Audi: {
    "Q-5": { front: null, rear: "C" },
    "Q-3": { front: "B", rear: "C" },
    "A-3": { front: "A", rear: "C" },
    "A-4": { front: "B", rear: "C" },
    "A-6": { front: "A", rear: "C" },
    "A 8L": { front: "A", rear: "C" },
    "Q-7": { front: null, rear: "C" },
    "TT Couple": { front: "B", rear: "C" },
  },
  Volvo: {
    "XC-90": { front: "A", rear: "C" },
    "S-80": { front: null, rear: "C" },
    "S-60": { front: "C", rear: "B" },
    "V 40": { front: "C", rear: "C" },
    "XC 60": { front: "A", rear: "C" },
  },
  Jaguar: {
    "XF Sport": { front: "E", rear: "E" },
    "XJL": { front: "E", rear: "E" },
  },
  BMW: {
    "X-1": { front: "A", rear: "D" },
    "420 D": { front: "A", rear: "D" },
    "320 D": { front: "A", rear: "D" },
    "530 D": { front: "C", rear: "C" },
    "520 D": { front: "C", rear: "C" },
    "Z4": { front: "A", rear: "B" },
    "X-5": { front: "C", rear: "D" },
    "X-3": { front: "B", rear: "C" },
    "350 D": { front: null, rear: "C" },
  },
  Kia: {
    Seltos: { front: "B", rear: "C" },
    Carens: { front: "C", rear: "C" },
    Carnival: { front: "A", rear: "B" },
    Sonet: { front: "B", rear: "C" },
    EV6: { front: null, rear: null },
  },
  Lexus: {
    Lexus: { front: "B", rear: "C" },
  },
  Renault: {
    Duster: { front: "B", rear: "C" },
    Fluence: { front: "A", rear: "D" },
    Kwid: { front: "B", rear: "C" },
    Capture: { front: null, rear: null },
    Scala: { front: "C", rear: "B" },
    Koleos: { front: "A", rear: "B" },
    Lodgy: { front: "B", rear: "B" },
    Pulse: { front: "C", rear: "A" },
    Kiger: { front: "B", rear: "C" },
    Triber: { front: "B", rear: "C" },
  },
  Datsun: {
    "Datsun Go": { front: "C", rear: "A" },
    "Datsun Go Plus": { front: "B", rear: "C" },
    Teana: { front: "A", rear: "C" },
    "Datsun Cross": { front: "C", rear: "A" },
  },
  Skoda: {
    Yeti: { front: "B", rear: "C" },
    Rapid: { front: "B", rear: "C" },
    Octavia: { front: "B", rear: "C" },
    Superb: { front: "B", rear: "C" },
    Kodiaq: { front: "B", rear: "C" },
    Fabia: { front: "C", rear: "C" },
    Laura: { front: "B", rear: "C" },
    Kushaq: { front: "B", rear: "C" },
    "Rapid TSI": { front: "B", rear: "C" },
    Slavia: { front: "B", rear: "C" },
  },
  "MG Motors": {
    Hector: { front: "B", rear: "C" },
  },
  Jeep: {
    Compass: { front: "B", rear: "C" },
    Wrangler: { front: "C", rear: "B" },
    "Wrangler Sport": { front: "B", rear: "A" },
    Renegade: { front: "A", rear: "E" },
  },
  "Land Rover": {
    "Discovery Sport": { front: "C", rear: "C" },
    Evoque: { front: null, rear: null },
    Velar: { front: null, rear: null },
  },
  Nissan: {
    Micra: { front: "B", rear: "C" },
    Sunny: { front: "C", rear: "B" },
    Terrano: { front: "B", rear: "C" },
    Kicks: { front: "C", rear: "A" },
    "Ready Go": { front: "C", rear: "A" },
    Evalia: { front: "B", rear: "C" },
    "X-Trail": { front: "A", rear: "B" },
    "Datsun Go": { front: "C", rear: "A" },
  },
  "Maruti Suzuki": {
    Alto: { front: "C", rear: "C" },
    "New Alto 800": { front: "C", rear: "C" },
    Eeco: { front: "D", rear: "C" },
    Omni: { front: null, rear: null },
    "WagonR New": { front: "B", rear: "C" },
    "WagonR Old": { front: null, rear: "C" },
    Ignis: { front: "B", rear: "C" },
    "A Star": { front: "B", rear: "C" },
    Celerio: { front: "B", rear: "C" },
    "New Swift": { front: "B", rear: "C" },
    Dzire: { front: "B", rear: "C" },
    "S-Cross": { front: "B", rear: "B" },
    Ertiga: { front: "B", rear: "B" },
    Ciaz: { front: null, rear: null },
    "Vitara Breza": { front: "B", rear: "C" },
    "Celerio-X": { front: "B", rear: "C" },
    "XL 6": { front: "B", rear: "B" },
    "S. Presso": { front: "C", rear: "D" },
    "Baleno Delta": { front: "B", rear: "C" },
    "Baleno Old": { front: "B", rear: "C" },
    Estilo: { front: "C", rear: "C" },
    SX4: { front: "B", rear: "C" },
    "800": { front: "D", rear: "C" },
    "Baleno Facelift": { front: "A", rear: "C" },
    "Baleno New": { front: "B", rear: "C" },
    Breeza: { front: null, rear: "B" },
    Esteem: { front: "B", rear: "C" },
    Ritz: { front: "B", rear: "C" },
    Versa: { front: "D", rear: "C" },
    "WagonR EV": { front: null, rear: "C" },
    Zen: { front: "D", rear: "C" },
  },
  Tata: {
    Zest: { front: "A", rear: "B" },
    Bolt: { front: null, rear: "B" },
    Nano: { front: "D", rear: "B" },
    "GenX Nano": { front: "D", rear: "B" },
    Tiago: { front: "D", rear: "C" },
    Nexon: { front: "B", rear: "C" },
    Xenon: { front: "C", rear: null },
    Tigor: { front: "A", rear: "B" },
    Hexa: { front: "D", rear: null },
    Aria: { front: "D", rear: null },
    Safari: { front: "B", rear: "C" },
    Harrier: { front: "A", rear: "C" },
    Indica: { front: "B", rear: "C" },
    Vista: { front: "A", rear: "B" },
    Manza: { front: "B", rear: "C" },
    Altroz: { front: "A", rear: "B" },
    "Altroz EV": { front: "A", rear: "B" },
    Indigo: { front: "B", rear: "A" },
    "Nexon EV": { front: null, rear: "B" },
    Punch: { front: "A", rear: "B" },
    "Safari Storm": { front: "D", rear: "B" },
    Sumo: { front: "D", rear: "C" },
    "Tiago NRG": { front: "A", rear: "B" },
    "Tigor EV": { front: "A", rear: "B" },
  },
};

// ─── Derived dropdown options ────────────────────────────────────────────────

/** All known car makes, sorted alphabetically. */
export const MAKES = Object.keys(FITMENT_CHART).sort();

/** Models for a given make, sorted alphabetically. */
export function getModelsForMake(make: string): string[] {
  return Object.keys(FITMENT_CHART[make] ?? {}).sort();
}

/** Buffer series letters used in the chart. */
export const SERIES_OPTIONS = ["A", "B", "C", "D", "E"] as const;

// ─── Seed helper ─────────────────────────────────────────────────────────────

export type SeedRule = {
  make: string;
  model: string;
  position: "Front" | "Rear";
  series: string;
};

/**
 * Flatten the chart into individual FitmentRules for seeding.
 * Skips entries where the series is null (not applicable).
 */
export function flattenChartToRules(): SeedRule[] {
  const rules: SeedRule[] = [];
  for (const [make, models] of Object.entries(FITMENT_CHART)) {
    for (const [model, entry] of Object.entries(models)) {
      if (entry.front) {
        rules.push({ make, model, position: "Front", series: entry.front });
      }
      if (entry.rear) {
        rules.push({ make, model, position: "Rear", series: entry.rear });
      }
    }
  }
  return rules;
}
