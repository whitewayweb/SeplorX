"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

const UpdateNameSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
});

const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
});

export async function updateProfileName(_prevState: unknown, formData: FormData) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
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
        await auth.api.updateUser({
            headers: await headers(),
            body: { name: parsed.data.name },
        });
    } catch (err) {
        console.error("[updateProfileName]", { userId: session.user.id, error: String(err) });
        return { error: "Failed to update profile name." };
    }

    revalidatePath("/profile");
    return { success: true };
}

export async function updateProfilePassword(_prevState: unknown, formData: FormData) {
    const session = await auth.api.getSession({ headers: await headers() });
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
        console.error("[updateProfilePassword]", { userId: session.user.id, error: message });
        return { error: "Failed to update password." };
    }

    revalidatePath("/profile");
    return { success: true };
}
