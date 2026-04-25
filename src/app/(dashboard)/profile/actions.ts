"use server";

import { z } from "zod";
import { auth, getAuthenticatedUserId, getAuthenticatedSession } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const UpdateNameSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
});

const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string()
        .min(12, "New password must be at least 12 characters")
        .regex(/[A-Z]/, "Password must include at least one uppercase letter")
        .regex(/[a-z]/, "Password must include at least one lowercase letter")
        .regex(/[0-9]/, "Password must include at least one number")
        .regex(/[^a-zA-Z0-9]/, "Password must include at least one special character"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
});

export async function updateProfileName(_prevState: unknown, formData: FormData) {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return { error: "Not authenticated." };
    }

    const parsed = UpdateNameSchema.safeParse({
        name: formData.get("name"),
    });

    if (!parsed.success) {
        return {
            error: "Validation failed.",
            fieldErrors: parsed.error.flatten().fieldErrors,
        };
    }

    try {
        await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, userId));
        revalidatePath("/profile");
        return { success: true };
    } catch (err) {
        logger.error("[updateProfileName]", { userId, error: String(err) });
        return { error: "Failed to update profile name." };
    }
}

export async function updateProfilePassword(_prevState: unknown, formData: FormData) {
    const session = await getAuthenticatedSession();
    if (!session) {
        return { error: "Not authenticated." };
    }

    const parsed = ChangePasswordSchema.safeParse({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        const firstError = Object.values(fieldErrors).flat()[0];
        return { error: firstError || "Validation failed.", fieldErrors };
    }

    try {
        await auth.api.changePassword({
            headers: await headers(),
            body: {
                currentPassword: parsed.data.currentPassword,
                newPassword: parsed.data.newPassword,
                revokeOtherSessions: true,
            },
        });
    } catch (err) {
        const message = String(err);
        if (message.includes("INVALID_PASSWORD") || message.includes("incorrect")) {
            return { error: "Current password is incorrect." };
        }
        logger.error("[updateProfilePassword]", { userId: session.user.id, error: message });
        return { error: "Failed to update password." };
    }

    revalidatePath("/profile");
    return { success: true };
}
