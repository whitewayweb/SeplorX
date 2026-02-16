import { z } from "zod";

export const CreateVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required"),
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

export const UpdateVendorSchema = CreateVendorSchema.extend({
  id: z.coerce.number().int().positive("Invalid vendor ID"),
});

export const VendorIdSchema = z.object({
  id: z.coerce.number().int().positive("Invalid vendor ID"),
});
