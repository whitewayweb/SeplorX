"use server";

import { db } from "@/db";
import { vendors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CreateVendorSchema,
  UpdateVendorSchema,
  VendorIdSchema,
} from "@/lib/validations/vendors";

// TODO: replace with auth() when auth is re-added
const CURRENT_USER_ID = 1;
void CURRENT_USER_ID; // reserved for future createdBy tracking

export async function createVendor(_prevState: unknown, formData: FormData) {
  const parsed = CreateVendorSchema.safeParse({
    name: formData.get("name"),
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
    await db.insert(vendors).values(parsed.data);
  } catch (err) {
    console.error("createVendor error:", err);
    return { error: "Failed to create vendor. Please try again." };
  }

  revalidatePath("/vendors");
  return { success: true };
}

export async function updateVendor(_prevState: unknown, formData: FormData) {
  const parsed = UpdateVendorSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
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
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Vendor not found." };
    }

    await db
      .update(vendors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(vendors.id, id));
  } catch (err) {
    console.error("updateVendor error:", err);
    return { error: "Failed to update vendor. Please try again." };
  }

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  return { success: true };
}

export async function toggleVendorActive(_prevState: unknown, formData: FormData) {
  const parsed = VendorIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid vendor ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: vendors.id, isActive: vendors.isActive })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Vendor not found." };
    }

    await db
      .update(vendors)
      .set({ isActive: !existing[0].isActive, updatedAt: new Date() })
      .where(eq(vendors.id, id));
  } catch (err) {
    console.error("toggleVendorActive error:", err);
    return { error: "Failed to update vendor status. Please try again." };
  }

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  return { success: true };
}

export async function deleteVendor(_prevState: unknown, formData: FormData) {
  const parsed = VendorIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { error: "Invalid vendor ID." };
  }

  const { id } = parsed.data;

  try {
    const existing = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { error: "Vendor not found." };
    }

    await db.delete(vendors).where(eq(vendors.id, id));
  } catch (err) {
    console.error("deleteVendor error:", err);
    // Handle FK constraint — vendor may have invoices
    const pgError = err as { code?: string };
    if (pgError.code === "23503") {
      return { error: "Cannot delete vendor with existing invoices. Deactivate instead." };
    }
    return { error: "Failed to delete vendor. Please try again." };
  }

  revalidatePath("/vendors");
  return { success: true };
}
