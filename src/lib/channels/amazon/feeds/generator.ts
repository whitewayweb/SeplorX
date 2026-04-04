import * as fs from "node:fs";
import XlsxPopulate from "xlsx-populate";
import { getTemplatePath, type CategoryTemplateEntry } from "./template-registry";

// ────────────────────────────────────────────────────────────────────────────
// Amazon Category Template Generator
// ────────────────────────────────────────────────────────────────────────────
// Generates a populated .xlsm file for a batch of products in a given category.
// The authentic Amazon template is COPIED into memory, data rows are injected,
// and the resulting buffer is returned — the original sample file is never modified.
// ────────────────────────────────────────────────────────────────────────────

/** Minimal product data needed to populate an Amazon template row. */
export interface TemplateProductRow {
  /** Amazon SKU (seller-sku) */
  sku: string;
  /** Product name / title */
  name: string;
  /** Selling price */
  price?: string | number | null;
  /** Stock quantity */
  quantity?: number | null;
  /** The amazon product type (must match a registered template) */
  category: string;
  /** Additional raw fields from rawPayload to map to template columns */
  extraFields?: Record<string, string | number | null | undefined>;
}

/**
 * Column mapping: maps a known product field to the column header
 * found in row 3 of the Amazon template sheet.
 *
 * This is intentionally minimal. Future categories can extend this
 * by adding category-specific column maps to the registry.
 */
const DEFAULT_COLUMN_MAP: Record<string, string> = {
  sku: "item_sku",
  name: "item_name",
  price: "standard_price",
  quantity: "quantity",
};

/**
 * Generate a populated .xlsm workbook buffer for a set of products.
 *
 * @param entry    - Pre-resolved `CategoryTemplateEntry` from the registry.
 * @param products - Products to insert into the template.
 * @returns The modified .xlsm file as a Uint8Array buffer.
 */
export async function generateCategoryTemplate(
  entry: CategoryTemplateEntry,
  products: TemplateProductRow[],
): Promise<{ buffer: Uint8Array }> {
  if (products.length === 0) {
    throw new Error("No products provided for template generation.");
  }

  const templatePath = getTemplatePath(entry);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  // ── Load a COPY of the template into memory (never touch the original) ──
  const templateBuffer = fs.readFileSync(templatePath);
  const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);

  const sheet = workbook.sheet(entry.sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${entry.sheetName}" not found in template "${entry.templateFile}".`);
  }

  // ── Read header row (row 3 typically) to build column index ─────────────
  const headerRowIndex = entry.dataStartRow - 1; // headers are 1 row above data
  const headerRow = sheet.row(headerRowIndex);

  // Scan up to 200 columns (Amazon templates can be very wide)
  const columnIndex = new Map<string, number>();
  for (let col = 1; col <= 200; col++) {
    const cellValue = headerRow.cell(col).value();
    if (cellValue && typeof cellValue === "string") {
      // Normalise: trim, collapse inner whitespace, lowercase — handles minor
      // header variations across marketplace/template versions.
      const normalised = cellValue.trim().replace(/\s+/g, " ").toLowerCase();
      columnIndex.set(normalised, col);
    }
  }

  // ── Write product data rows ─────────────────────────────────────────────
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const rowNum = entry.dataStartRow + i;

    // Map standard fields
    for (const [productField, templateHeader] of Object.entries(DEFAULT_COLUMN_MAP)) {
      const col = columnIndex.get(templateHeader.toLowerCase());
      if (col === undefined) continue;

      const value = product[productField as keyof TemplateProductRow];
      if (value !== undefined && value !== null && value !== "") {
        sheet.row(rowNum).cell(col).value(value as string | number);
      }
    }

    // Set update_delete to "Update" (standard for existing products)
    const updateDeleteCol = columnIndex.get("update_delete");
    if (updateDeleteCol) {
      sheet.row(rowNum).cell(updateDeleteCol).value("Update");
    }

    // Map any extra fields from rawPayload
    if (product.extraFields) {
      for (const [header, value] of Object.entries(product.extraFields)) {
        const col = columnIndex.get(header.toLowerCase());
        if (col !== undefined && value !== undefined && value !== null) {
          sheet.row(rowNum).cell(col).value(value);
        }
      }
    }
  }

  // ── Output the modified workbook as a buffer ────────────────────────────
  const outputBuffer = await workbook.outputAsync() as Uint8Array;
  return { buffer: outputBuffer };
}
