import { z } from "zod";

const companyTypes = ["supplier", "customer", "both"] as const;

export const CreateCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  type: z.enum(companyTypes, { message: "Invalid company type" }),
  contactPerson: z.string().trim().optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  gstNumber: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
  pincode: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const UpdateCompanySchema = CreateCompanySchema.extend({
  id: z.coerce.number().int().positive("Invalid company ID"),
});

export const CompanyIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid company ID"),
});
