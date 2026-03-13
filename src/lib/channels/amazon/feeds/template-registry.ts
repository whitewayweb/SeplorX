import * as path from "node:path";

// ────────────────────────────────────────────────────────────────────────────
// Amazon Category Template Registry
// ────────────────────────────────────────────────────────────────────────────
// Maps SeplorX product categories to their tested Amazon .xlsm template files.
// The template files live in `category_product_upload_templates/` relative to
// this module. Each entry also declares the SP-API feed type for submission.
//
// To add a new category:
//   1. Place the tested .xlsm template in `category_product_upload_templates/`
//   2. Add an entry to CATEGORY_TEMPLATES below
//   3. (Optional) Add column mappings to COLUMN_MAPS if the sheet layout differs
// ────────────────────────────────────────────────────────────────────────────

export interface CategoryTemplateEntry {
  /** SeplorX category key (lowercase, matches products.category) */
  category: string;
  /** Human-readable label */
  label: string;
  /** Filename of the .xlsm template inside category_product_upload_templates/ */
  templateFile: string;
  /** SP-API feed type to use when submitting this template */
  feedType: string;
  /** Name of the sheet inside the .xlsm workbook that holds the data rows */
  sheetName: string;
  /** 1-indexed row where data starts (row 1–3 are typically headers in Amazon templates) */
  dataStartRow: number;
}

/**
 * Single source of truth: category → Amazon template mapping.
 * Keys are normalized lowercase to match product.category values.
 */
export const CATEGORY_TEMPLATES: CategoryTemplateEntry[] = [
  {
    category: "auto part",
    label: "Auto Part",
    templateFile: "AUTO_PART_TEMPLATE.xlsm",
    feedType: "POST_FLAT_FILE_INVLOADER_DATA",
    sheetName: "Template",
    dataStartRow: 4,
  },
  // Future categories go here, e.g.:
  // {
  //   category: "luggage",
  //   label: "Luggage",
  //   templateFile: "LUGGAGE_TEMPLATE.xlsm",
  //   feedType: "POST_FLAT_FILE_INVLOADER_DATA",
  //   sheetName: "Template",
  //   dataStartRow: 4,
  // },
];

const TEMPLATES_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "category_product_upload_templates",
);

/** Lookup a template entry by category (case-insensitive). */
export function getTemplateForCategory(category: string): CategoryTemplateEntry | null {
  const normalized = category.trim().toLowerCase();
  return CATEGORY_TEMPLATES.find((t) => t.category === normalized) ?? null;
}

/** Get the absolute file path for a template entry. */
export function getTemplatePath(entry: CategoryTemplateEntry): string {
  return path.join(TEMPLATES_DIR, entry.templateFile);
}

