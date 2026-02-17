"use server";

import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CreateCompanySchema,
  UpdateCompanySchema,
  CompanyIdSchema,
} from "@/lib/validations/companies";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;
void CURRENT_USER_ID; // reserved for future createdBy tracking

export async function createCompany(_prevState: unknown, formData: FormData) {
  const parsed = CreateCompanySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    gstNumber: formData.get("gstNumber"),
    address: formData.get("address"),
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await db.insert(companies).values(parsed.data);
  } catch (err) {
    console.error("createCompany error:", err);
    return { error: "Failed to create company. Please try again." };
  }

  revalidatePath("/companies");
  return { success: true };
}

export async function updateCompany(_prevState: unknown, formData: FormData) {
  const parsed = UpdateCompanySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    type: formData.get("type"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    gstNumber: formData.get("gstNumber"),
    address: formData.get("address"),
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      error: "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, ...data } = parsed.data;

  try {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Company not found." };
    }

    await db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id));
  } catch (err) {
    console.error("updateCompany error:", err);
    return { error: "Failed to update company. Please try again." };
  }

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { success: true };
}

export async function toggleCompanyActive(_prevState: unknown, formData: FormData) {
  const parsed = CompanyIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid company ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: companies.id, isActive: companies.isActive })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Company not found." };
    }

    await db
      .update(companies)
      .set({ isActive: !existing[0].isActive, updatedAt: new Date() })
      .where(eq(companies.id, id));
  } catch (err) {
    console.error("toggleCompanyActive error:", err);
    return { error: "Failed to update company status. Please try again." };
  }

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { success: true };
}

export async function deleteCompany(_prevState: unknown, formData: FormData) {
  const parsed = CompanyIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid company ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Company not found." };
    }

    await db.delete(companies).where(eq(companies.id, id));
  } catch (err) {
    console.error("deleteCompany error:", err);
    // Handle FK constraint — company may have invoices
    const pgError = err as { code?: string };
    if (pgError.code === "23503") {
      return { error: "Cannot delete company with existing invoices. Deactivate instead." };
    }
    return { error: "Failed to delete company. Please try again." };
  }

  revalidatePath("/companies");
  return { success: true };
}
