import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────────────────────
// Amazon Category Template Registry — file-system driven
// ────────────────────────────────────────────────────────────────────────────
//
// HOW IT WORKS
// ─────────────
// Templates are discovered automatically by scanning `category_product_upload_templates/`.
// The FILENAME (without extension) is treated as the SP-API product-type key.
//
//   AUTO_PART.xlsm   →  amazonProductType = "AUTO_PART"
//   LUGGAGE.xlsm     →  amazonProductType = "LUGGAGE"
//
// The `amazonProductType` stored in channelProducts.rawData (fetched from the
// Catalog API at sync time) is matched directly against the discovered file names.
//
// ADDING A NEW CATEGORY
// ──────────────────────
//   1. Download the category flat-file template from Amazon Seller Central.
//   2. Rename it to match the SP-API product-type key:  <PRODUCT_TYPE>.xlsm
//   3. Drop it in:  src/lib/channels/amazon/category_product_upload_templates/
//   Done — no code changes required.
//
// TEMPLATE SHEET CONVENTIONS (Amazon standard, applies to all templates)
//   - Sheet name:   "Template"
//   - Data start:   row 4  (rows 1–3 are metadata/headers)
//   - Feed type:    POST_FLAT_FILE_LISTINGS_DATA
// ────────────────────────────────────────────────────────────────────────────

export interface CategoryTemplateEntry {
  /** Human-readable label derived from the product type (e.g. "Auto Part") */
  label: string;
  /** SP-API product-type key, equals the filename stem (e.g. "AUTO_PART") */
  amazonProductType: string;
  /** Absolute path to the .xlsm file */
  templateFile: string;
  /** SP-API feed type — constant for all Amazon flat-file uploads */
  feedType: string;
  /** Sheet name inside the workbook — Amazon convention */
  sheetName: string;
  /** Row where product data starts — Amazon convention */
  dataStartRow: number;
}

// ── Auto-discovery ────────────────────────────────────────────────────────────

const TEMPLATES_DIR = path.resolve(
  process.cwd(),
  "src/lib/channels/amazon/category_product_upload_templates",
);

/** Convert "AUTO_PART" → "Auto Part" */
function productTypeToLabel(productType: string): string {
  return productType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ── Module-level cache (populated once per process) ───────────────────────────
let cachedRegistry: Map<string, CategoryTemplateEntry> | null = null;

function buildRegistry(): Map<string, CategoryTemplateEntry> {
  const registry = new Map<string, CategoryTemplateEntry>();

  if (!fs.existsSync(TEMPLATES_DIR)) {
    logger.warn("[Registry] Directory does not exist:", TEMPLATES_DIR);
    return registry;
  }

  for (const file of fs.readdirSync(TEMPLATES_DIR)) {
    if (!file.endsWith(".xlsm")) continue;

    const productType = path.basename(file, ".xlsm").toUpperCase();
    registry.set(productType, {
      label: productTypeToLabel(productType),
      amazonProductType: productType,
      templateFile: path.join(TEMPLATES_DIR, file),
      feedType: "POST_FLAT_FILE_LISTINGS_DATA",
      sheetName: "Template",
      dataStartRow: 4,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    logger.info("[Registry] Loaded entries:", Array.from(registry.keys()));
  }

  return registry;
}

function getRegistry(): Map<string, CategoryTemplateEntry> {
  if (!cachedRegistry) {
    cachedRegistry = buildRegistry();
  }
  return cachedRegistry;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a template entry by SP-API product-type key (case-insensitive).
 * Returns `null` when no matching .xlsm file exists in the templates directory.
 */
export function getTemplateForProductType(amazonProductType: string): CategoryTemplateEntry | null {
  return getRegistry().get(amazonProductType.trim().toUpperCase()) ?? null;
}

/** Get the absolute file path for a template entry. */
export function getTemplatePath(entry: CategoryTemplateEntry): string {
  return entry.templateFile; // already absolute from auto-discovery
}
