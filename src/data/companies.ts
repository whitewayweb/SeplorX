import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export async function getCompaniesList() {
  return await db
    .select({
      id: companies.id,
      name: companies.name,
      type: companies.type,
      contactPerson: companies.contactPerson,
      email: companies.email,
      phone: companies.phone,
      gstNumber: companies.gstNumber,
      address: companies.address,
      city: companies.city,
      state: companies.state,
      pincode: companies.pincode,
      notes: companies.notes,
      isActive: companies.isActive,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .orderBy(desc(companies.createdAt));
}

export async function getCompanyById(companyId: number) {
  const result = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
    
  return result[0];
}

export async function getActiveCompaniesForDropdown() {
  return await db
    .select({
      id: companies.id,
      name: companies.name,
    })
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(companies.name);
}

export async function getActiveSupplierCompanies() {
  return await db
    .select({
      id: companies.id,
      name: companies.name,
      gstNumber: companies.gstNumber,
    })
    .from(companies)
    .where(
      and(
        eq(companies.isActive, true),
        sql`${companies.type} IN ('supplier', 'both')`
      )
    )
    .orderBy(companies.name);
}
